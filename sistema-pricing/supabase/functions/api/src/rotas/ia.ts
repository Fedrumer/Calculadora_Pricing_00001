import { ErroMotor, type PedidoCotacao, type Resultado, type ResultadoPublico, calcular, resultadoPublico } from '@pricing/motor';
import { z } from 'zod';
import { type Requisicao, type Rota, validar } from '../app.ts';
import { ehExterno, hoje } from '../contexto.ts';
import { ErroHttp, invalido } from '../erros.ts';
import { mascararTexto } from '../ia.ts';
import { carregarRegras } from '../regras.ts';
import { esquemaPedido, obterCotacao } from './cotacoes.ts';

const REGRAS_DE_CONDUTA = `Você é o assistente de análise de um sistema de cotação. Responda em português do Brasil, em texto simples, direto e curto.
Você nunca define preço nem aprova exceção: quem calcula é o motor do sistema e quem aprova são as pessoas com alçada.
Use somente os números fornecidos; não invente valores. Se faltar informação, diga o que falta.`;

async function chamar(
  r: Requisicao,
  tipo: 'explicar' | 'sugerir' | 'ler' | 'vigiar',
  pedido: { sistema: string; dados: unknown; maxTokens?: number; esquema?: Record<string, unknown> },
  cotacaoId: string | null = null,
) {
  const { tx, ator, deps } = r;
  const [org] = await tx<{ ligado: boolean | null }[]>`select (config #>> '{modulos,ia}')::boolean as ligado from public.organizacoes where id = ${ator.orgId}`;
  if (org?.ligado === false) throw new ErroHttp(503, 'IA_DESLIGADA', 'O módulo de IA está desligado nesta instalação.');
  const inicio = performance.now();
  // o registro da chamada sobrevive mesmo se a IA falhar (fora da transação do pedido)
  const registrar = (saida: unknown, erro: string | null, tokens?: { e?: number; s?: number }) =>
    deps.sql`insert into public.chamadas_ia (org_id, usuario_id, tipo, cotacao_id, modelo, entrada_mascarada, saida, tokens_entrada, tokens_saida, duracao_ms, erro)
             values (${ator.orgId}, ${ator.id}, ${tipo}, ${cotacaoId}, ${deps.ia.modelo}, ${deps.sql.json(pedido.dados as never)}, ${saida === null ? null : deps.sql.json(saida as never)},
                     ${tokens?.e ?? null}, ${tokens?.s ?? null}, ${Math.round(performance.now() - inicio)}, ${erro})`.catch(() => undefined);
  try {
    const resposta = await deps.ia.gerar({ sistema: pedido.sistema, mensagem: JSON.stringify(pedido.dados), maxTokens: pedido.maxTokens, esquema: pedido.esquema });
    await registrar({ texto: resposta.texto }, null, { e: resposta.tokensEntrada, s: resposta.tokensSaida });
    return resposta.texto;
  } catch (e) {
    await registrar(null, e instanceof Error ? e.message : 'erro');
    throw e;
  }
}

function lerJson<T>(texto: string, esquema: z.ZodType<T>): T {
  const bruto = texto.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return esquema.parse(JSON.parse(bruto));
  } catch {
    throw new ErroHttp(502, 'IA_RESPOSTA_INVALIDA', 'O assistente devolveu uma resposta fora do formato esperado.');
  }
}

async function versaoAtual(r: Requisicao, cotacaoId: string) {
  const c = await obterCotacao(r, cotacaoId, 'ler');
  const [v] = await r.tx<{ entrada: PedidoCotacao; resultado: Resultado; resultado_publico: ResultadoPublico }[]>`
    select entrada, resultado, resultado_publico from public.cotacao_versoes where id = ${c.versao_atual_id}`;
  if (!v) throw invalido('A cotação não tem versão calculada.');
  // o canal só recebe explicação sobre o que ele próprio pode ver
  return { cotacao: c, entrada: v.entrada, resultado: ehExterno(r.ator) ? v.resultado_publico : v.resultado };
}

const QUEM_USA = ['vendedor', 'canal', 'gestor_pricing', 'aprovador', 'admin', 'leitura', 'suporte'] as const;

export const rotasIA: Rota[] = [
  {
    // Explicar: traduz o detalhamento em linguagem comercial e aponta o que derrubou a margem.
    metodo: 'POST',
    caminho: '/ia/explicar',
    auth: 'usuario',
    papeis: [...QUEM_USA],
    async handler(r) {
      const d = validar(z.object({ cotacaoId: z.string().uuid() }), r.corpo);
      const v = await versaoAtual(r, d.cotacaoId);
      const texto = await chamar(
        r,
        'explicar',
        {
          sistema: `${REGRAS_DE_CONDUTA}\nExplique em até 6 frases como o preço foi formado e por que o veredito de política foi este. Quando houver dados de margem, aponte a etapa que mais pesou. Não cite identificadores internos.`,
          dados: { pedido: v.entrada, resultado: v.resultado },
          maxTokens: 1500,
        },
        v.cotacao.id,
      );
      return { corpo: { explicacao: texto } };
    },
  },
  {
    // Sugerir: contrapropostas dentro da política; cada uma é recalculada pelo motor antes de aparecer.
    metodo: 'POST',
    caminho: '/ia/sugerir',
    auth: 'usuario',
    papeis: ['vendedor', 'gestor_pricing', 'aprovador', 'suporte'],
    async handler(r) {
      const d = validar(z.object({ cotacaoId: z.string().uuid() }), r.corpo);
      const v = await versaoAtual(r, d.cotacaoId);
      const data = hoje(r.deps);
      const { regras } = await carregarRegras(r.tx, r.ator.orgId, data);
      const produto = regras.produtos.find((p) => p.codigo === v.entrada.produto);
      const texto = await chamar(
        r,
        'sugerir',
        {
          sistema: `${REGRAS_DE_CONDUTA}\nProponha até 3 contrapropostas que tenham mais chance de ficar dentro da política (menos desconto, outra vigência ou volume, incluir ou retirar componente opcional). Altere apenas campos existentes no pedido e use apenas valores listados nas dimensões. Responda SOMENTE com JSON: {"sugestoes":[{"titulo":string,"justificativa":string,"pedido":{...pedido completo...}}]}`,
          dados: {
            pedidoAtual: v.entrada,
            resultadoAtual: { precoFinal: v.resultado.precoFinal, descontoPct: v.resultado.descontoPct, veredito: v.resultado.veredito },
            limites: { descontoLivrePct: regras.politica.limites.descontoLivrePct, descontoMaximoPct: regras.politica.limites.descontoMaximoPct },
            produto,
            dimensoes: regras.dimensoes.filter((x) => produto?.dimensoes.includes(x.codigo) || produto?.multiplicadores.includes(x.codigo)),
          },
          maxTokens: 3000,
        },
        v.cotacao.id,
      );
      const lidas = lerJson(texto, z.object({ sugestoes: z.array(z.object({ titulo: z.string().max(200), justificativa: z.string().max(800), pedido: esquemaPedido })).max(5) }));
      const sugestoes = [];
      for (const s of lidas.sugestoes) {
        try {
          // o canal e o produto não mudam; o preço é sempre o do motor
          const pedido: PedidoCotacao = { ...s.pedido, produto: v.entrada.produto, canal: v.entrada.canal ?? null, comissaoPct: v.entrada.comissaoPct ?? undefined, descontoPct: s.pedido.descontoPct ?? 0, data };
          const resultado = calcular(pedido, regras, { extensoes: r.deps.extensoes });
          sugestoes.push({ titulo: s.titulo, justificativa: s.justificativa, pedido, resultado: ehExterno(r.ator) ? resultadoPublico(resultado) : resultado });
        } catch (e) {
          if (!(e instanceof ErroMotor)) throw e;
        }
      }
      return { corpo: { sugestoes: sugestoes.sort((a, b) => Number(b.resultado.veredito.status === 'dentro') - Number(a.resultado.veredito.status === 'dentro')) } };
    },
  },
  {
    // Ler: transforma um pedido recebido por e-mail em rascunho para o vendedor revisar.
    metodo: 'POST',
    caminho: '/ia/ler',
    auth: 'usuario',
    papeis: ['vendedor', 'gestor_pricing', 'suporte'],
    async handler(r) {
      const d = validar(z.object({ texto: z.string().trim().min(20).max(8000) }), r.corpo);
      const data = hoje(r.deps);
      const { regras } = await carregarRegras(r.tx, r.ator.orgId, data);
      const texto = await chamar(r, 'ler', {
        sistema: `${REGRAS_DE_CONDUTA}\nLeia o pedido de cotação e monte um rascunho. Use apenas produtos, componentes e valores de dimensão do catálogo. Não proponha desconto. O texto já vem com dados pessoais mascarados; não tente reconstituí-los. Responda SOMENTE com JSON: {"pedido":{"produto":string,"componentes":string[],"dimensoes":{...}},"duvidas":string[]}`,
        dados: {
          email: mascararTexto(d.texto),
          catalogo: { produtos: regras.produtos.filter((p) => p.ativo), dimensoes: regras.dimensoes },
        },
        maxTokens: 2000,
      });
      const lido = lerJson(texto, z.object({ pedido: esquemaPedido.pick({ produto: true, componentes: true, dimensoes: true }), duvidas: z.array(z.string().max(300)).max(10).default([]) }));
      let previa = null;
      const duvidas = [...(lido.duvidas ?? [])];
      try {
        const resultado = calcular({ ...lido.pedido, descontoPct: 0, data }, regras, { extensoes: r.deps.extensoes });
        previa = { precoFinal: resultado.precoFinal, moeda: resultado.moeda, veredito: resultado.veredito.status };
      } catch (e) {
        if (!(e instanceof ErroMotor)) throw e;
        duvidas.push(e.message);
      }
      // nada é gravado: o vendedor revisa o rascunho e decide se cria a cotação
      return { corpo: { rascunho: lido.pedido, duvidas, previa } };
    },
  },
  {
    // Vigiar: aponta padrões anômalos de desconto por vendedor ou canal.
    metodo: 'POST',
    caminho: '/ia/vigiar',
    auth: 'usuario',
    papeis: ['gestor_pricing', 'admin', 'leitura', 'aprovador'],
    async handler(r) {
      const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
      const d = validar(z.object({ inicio: dataIso, fim: dataIso }), r.corpo);
      return { corpo: await vigiar(r, d.inicio, d.fim) };
    },
  },
];

export async function vigiar(r: Requisicao, inicio: string, fim: string) {
  const linhas = await r.tx<{ tipo: string; id: string; nome: string; cotacoes: number; desconto_medio: number; desconto_maximo: number; com_excecao: number; margem_pct: number | null }[]>`
    with base as (
      select c.dono_id, c.canal_id, v.desconto_pct, v.veredito, v.preco_final, v.margem_valor
      from public.cotacoes c join public.cotacao_versoes v on v.id = c.versao_atual_id
      where c.org_id = ${r.ator.orgId} and c.criado_em >= ${inicio}::date and c.criado_em < ${fim}::date + 1
        and c.status in ('emitida', 'aceita', 'perdida', 'expirada', 'aprovada', 'em_aprovacao')
    )
    select 'vendedor' as tipo, u.id::text as id, u.nome, count(*)::int as cotacoes, round(avg(b.desconto_pct), 2)::float as desconto_medio,
           max(b.desconto_pct)::float as desconto_maximo, (count(*) filter (where b.veredito = 'exige_aprovacao'))::int as com_excecao,
           round(sum(b.margem_valor) / nullif(sum(b.preco_final), 0) * 100, 2)::float as margem_pct
    from base b join public.usuarios u on u.id = b.dono_id group by u.id, u.nome
    union all
    select 'canal', k.id::text, k.nome, count(*)::int, round(avg(b.desconto_pct), 2)::float, max(b.desconto_pct)::float,
           (count(*) filter (where b.veredito = 'exige_aprovacao'))::int,
           round(sum(b.margem_valor) / nullif(sum(b.preco_final), 0) * 100, 2)::float
    from base b join public.canais k on k.id = b.canal_id group by k.id, k.nome`;
  if (linhas.length === 0) return { analise: 'Não há cotações no período.', dados: [] };
  // nomes de pessoas não saem do sistema: a IA recebe apelidos
  const apelidos = new Map<string, string>();
  const dados = linhas.map((l, i) => {
    const apelido = l.tipo === 'vendedor' ? `Vendedor ${i + 1}` : l.nome;
    apelidos.set(apelido, l.nome);
    return { tipo: l.tipo, quem: apelido, cotacoes: l.cotacoes, descontoMedioPct: l.desconto_medio, descontoMaximoPct: l.desconto_maximo, comExcecao: l.com_excecao, margemPct: l.margem_pct };
  });
  let analise = await chamar(r, 'vigiar', {
    sistema: `${REGRAS_DE_CONDUTA}\nCompare vendedores e canais entre si e aponte, em até 5 itens, quem destoa do grupo em desconto médio, desconto máximo, parcela de exceções ou margem. Diga se a amostra é pequena demais para concluir. Não acuse ninguém: descreva o padrão e sugira o que conferir.`,
    dados: { periodo: { inicio, fim }, linhas: dados },
    maxTokens: 2000,
  });
  for (const [apelido, nome] of [...apelidos].sort((a, b) => b[0].length - a[0].length)) if (apelido !== nome) analise = analise.replaceAll(apelido, nome);
  return { analise, dados: linhas };
}
