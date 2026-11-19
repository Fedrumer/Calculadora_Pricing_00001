import { z } from 'zod';
import { type Requisicao, type Rota, validar } from '../app.ts';
import { hoje } from '../contexto.ts';

// A8: alertas de negócio para o gestor (nível Essencial da mensalidade).
// - Margem: as aceitas do mês abaixo da meta da política, ou o desconto médio do
//   mês acima da linha de base do diagnóstico. Chamado uma vez por dia (fluxo 03).
// - Câmbio: a PTAX de fechamento do Banco Central, gravada pelo fluxo 09, acima do
//   câmbio de referência mais a folga mínima, ou cotações aceitas que ficam sem
//   margem a ela. A PTAX nunca muda preço: quem publica câmbio de referência é o gestor.
// Cada alerta sai uma vez por dia: o último aviso fica na caixa de saída (eventos_saida).

interface Alerta {
  tipo: string;
  chave: string;
  mensagem: string;
  dados: Record<string, unknown>;
}

const fmt = (v: number, casas = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

/** Emite só os alertas que ainda não saíram hoje; devolve os novos e os repetidos. */
async function emitirUmaVezPorDia(r: Requisicao, alertas: Alerta[]) {
  const dia = hoje(r.deps);
  const novos: Alerta[] = [];
  const repetidos: string[] = [];
  for (const a of alertas) {
    const [ja] = await r.tx<{ id: number }[]>`
      select id from public.eventos_saida
      where org_id = ${r.ator.orgId} and tipo = ${`alerta.${a.tipo}`} and carga ->> 'chave' = ${a.chave}
        and (criado_em at time zone ${r.deps.config.fusoHorario})::date = ${dia}::date
      limit 1`;
    if (ja) {
      repetidos.push(a.chave);
      continue;
    }
    await r.emitir(`alerta.${a.tipo}`, { chave: a.chave, mensagem: a.mensagem, ...a.dados });
    novos.push(a);
  }
  return { novos, repetidos };
}

async function gestores(r: Requisicao): Promise<string[]> {
  const l = await r.tx<{ email: string }[]>`
    select distinct u.email from public.usuarios u join public.usuario_papel up on up.usuario_id = u.id
    where u.org_id = ${r.ator.orgId} and up.papel = 'gestor_pricing' and u.status = 'ativo' order by 1`;
  return l.map((x) => x.email);
}

async function politicaVigente(r: Requisicao, data: string) {
  const [p] = await r.tx<{ regras: { limites?: { margemMetaPct?: number; folgaCambialMinimaPct?: number } } | null }[]>`
    select p.regras from public.politicas p where p.id = app.politica_vigente(${r.ator.orgId}, ${data}::date)`;
  return p?.regras ?? null;
}

/** Moedas dos custos da política vigente: são as que o fluxo 09 busca na PTAX. */
async function moedasEmUso(r: Requisicao, data: string): Promise<string[]> {
  const l = await r.tx<{ moeda: string }[]>`
    select distinct moeda from public.parametros_custo
    where politica_id = app.politica_vigente(${r.ator.orgId}, ${data}::date) and moeda is not null order by 1`;
  return l.map((x) => x.moeda);
}

/** Avalia o câmbio de mercado mais recente de cada moeda contra a referência e as aceitas dos últimos 90 dias. */
export async function avaliarCambioMercado(r: Requisicao, data: string): Promise<Alerta[]> {
  const politica = await politicaVigente(r, data);
  const folga = Number(politica?.limites?.folgaCambialMinimaPct ?? 0);
  const linhas = await r.tx<{ moeda: string; data: string; taxa_venda: string; referencia: string | null; vigente_de: string | null }[]>`
    with ultima as (
      select distinct on (moeda) moeda, data::text, taxa_venda from public.cambios_mercado
      where org_id = ${r.ator.orgId} and data <= ${data}::date order by moeda, data desc, criado_em desc
    )
    select u.moeda, u.data, u.taxa_venda, ref.taxa as referencia, ref.vigente_de::text as vigente_de
    from ultima u left join app.cambios_vigentes(${r.ator.orgId}, ${data}::date) ref on ref.moeda = u.moeda`;
  const alertas: Alerta[] = [];
  for (const l of linhas) {
    const ptax = Number(l.taxa_venda);
    if (l.referencia !== null) {
      const ref = Number(l.referencia);
      const limite = ref * (1 + folga / 100);
      if (ptax > limite) {
        alertas.push({
          tipo: 'ptax_acima_da_referencia',
          chave: `${l.moeda}:${l.data}`,
          mensagem: `PTAX de ${l.moeda} em ${l.data}: R$ ${fmt(ptax, 4)}, acima do câmbio de referência (R$ ${fmt(ref, 4)}) mais a folga mínima de ${fmt(folga, 1)}% (R$ ${fmt(limite, 4)}). Avalie publicar um novo câmbio de referência.`,
          dados: { moeda: l.moeda, data: l.data, ptax, referencia: ref, folgaMinimaPct: folga, limite: Math.round(limite * 10000) / 10000 },
        });
      }
    }
    // aceitas dos últimos 90 dias cujo câmbio que zera a margem fica abaixo da PTAX
    const [s] = await r.tx<{ n: number; valor: string | null }[]>`
      select count(*)::int as n, sum((x ->> 'valorMoeda')::numeric) as valor
      from public.cotacoes c
      join public.cotacao_versoes v on v.id = c.versao_atual_id
      cross join lateral jsonb_array_elements(coalesce(v.resultado -> 'exposicaoCambial', '[]'::jsonb)) x
      where c.org_id = ${r.ator.orgId} and c.status = 'aceita' and c.criado_em >= ${data}::date - 90
        and x ->> 'moeda' = ${l.moeda} and (x ->> 'cambioEquilibrio')::numeric < ${ptax}`;
    if (s && s.n > 0) {
      alertas.push({
        tipo: 'aceitas_sem_margem_na_ptax',
        chave: `${l.moeda}:${l.data}`,
        mensagem: `${s.n} ${s.n === 1 ? 'cotação aceita' : 'cotações aceitas'} dos últimos 90 dias ${s.n === 1 ? 'fica' : 'ficam'} sem margem à PTAX de ${l.moeda} de R$ ${fmt(ptax, 4)} (${l.data}), com ${l.moeda} ${fmt(Number(s.valor ?? 0))} em custos ainda a pagar ao câmbio do dia.`,
        dados: { moeda: l.moeda, data: l.data, ptax, cotacoes: s.n, valorMoeda: Number(s.valor ?? 0) },
      });
    }
  }
  return alertas;
}

const cotacaoMercado = z.object({
  moeda: z.string().regex(/^[A-Z]{3}$/),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  boletim: z.string().trim().min(1).max(40).default('fechamento'),
  taxaCompra: z.number().positive().finite().nullish(),
  taxaVenda: z.number().positive().finite(),
});

export const rotasAlertas: Rota[] = [
  {
    // Rotina diária (fluxo 03): margem e desconto do mês corrente.
    metodo: 'POST',
    caminho: '/automacao/alertas-negocio',
    auth: 'automacao',
    async handler(r) {
      const dia = hoje(r.deps);
      const inicio = `${dia.slice(0, 7)}-01`;
      const [x] = await r.tx<{ resumo: { aceitas: number; emitidas: number; margemPct: number | null; descontoMedioPct: number | null }; base: { descontoMedioPct?: number; margemPct?: number } | null }[]>`
        select app.indicadores(${r.ator.orgId}, ${inicio}::date, ${dia}::date) -> 'resumo' as resumo,
               o.config -> 'linhaDeBase' as base
        from public.organizacoes o where o.id = ${r.ator.orgId}`;
      const resumo = x!.resumo;
      const politica = await politicaVigente(r, dia);
      const meta = politica?.limites?.margemMetaPct;
      const alertas: Alerta[] = [];
      const mes = dia.slice(0, 7);
      if (meta !== undefined && resumo.aceitas > 0 && resumo.margemPct !== null && Number(resumo.margemPct) < Number(meta)) {
        alertas.push({
          tipo: 'margem_abaixo_da_meta',
          chave: mes,
          mensagem: `A margem das ${resumo.aceitas} cotações aceitas em ${mes} está em ${fmt(Number(resumo.margemPct), 1)}%, abaixo da meta da política (${fmt(Number(meta), 1)}%).`,
          dados: { mes, margemPct: Number(resumo.margemPct), metaPct: Number(meta), aceitas: resumo.aceitas },
        });
      }
      const base = x!.base?.descontoMedioPct;
      if (base !== undefined && base !== null && resumo.emitidas > 0 && resumo.descontoMedioPct !== null && Number(resumo.descontoMedioPct) > Number(base)) {
        alertas.push({
          tipo: 'desconto_acima_da_base',
          chave: mes,
          mensagem: `O desconto médio das ${resumo.emitidas} cotações emitidas em ${mes} está em ${fmt(Number(resumo.descontoMedioPct), 1)}%, acima da linha de base do diagnóstico (${fmt(Number(base), 1)}%).`,
          dados: { mes, descontoMedioPct: Number(resumo.descontoMedioPct), linhaDeBasePct: Number(base), emitidas: resumo.emitidas },
        });
      }
      const { novos, repetidos } = await emitirUmaVezPorDia(r, alertas);
      return { corpo: { data: dia, alertas: novos, repetidosHoje: repetidos.length, para: novos.length ? await gestores(r) : [] } };
    },
  },
  {
    // Fluxo 09: quais moedas buscar na PTAX e a última gravada de cada uma.
    metodo: 'GET',
    caminho: '/automacao/cambios-mercado',
    auth: 'automacao',
    async handler(r) {
      const dia = hoje(r.deps);
      const ultimas = await r.tx`
        select distinct on (moeda) moeda, data::text as data, taxa_venda as "taxaVenda" from public.cambios_mercado
        where org_id = ${r.ator.orgId} order by moeda, data desc, criado_em desc`;
      return { corpo: { data: dia, moedas: await moedasEmUso(r, dia), ultimas } };
    },
  },
  {
    // Fluxo 09: grava a PTAX de fechamento e devolve os alertas de câmbio do dia.
    metodo: 'POST',
    caminho: '/automacao/cambios-mercado',
    auth: 'automacao',
    async handler(r) {
      const d = validar(z.object({ cotacoes: z.array(cotacaoMercado).min(1).max(50) }), r.corpo);
      let gravadas = 0;
      for (const c of d.cotacoes) {
        const l = await r.tx`
          insert into public.cambios_mercado (org_id, moeda, data, boletim, taxa_compra, taxa_venda, origem)
          values (${r.ator.orgId}, ${c.moeda}, ${c.data}::date, ${c.boletim}, ${c.taxaCompra ?? null}, ${c.taxaVenda}, 'ptax')
          on conflict (org_id, moeda, data, boletim) do nothing returning id`;
        gravadas += l.length;
      }
      const dia = hoje(r.deps);
      const { novos, repetidos } = await emitirUmaVezPorDia(r, await avaliarCambioMercado(r, dia));
      return { corpo: { gravadas, alertas: novos, repetidosHoje: repetidos.length, para: novos.length ? await gestores(r) : [] } };
    },
  },
];
