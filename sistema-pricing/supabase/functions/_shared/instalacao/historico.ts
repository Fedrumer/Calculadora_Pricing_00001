import { type ConjuntoRegras, ErroMotor, type PedidoCotacao, calcular, resultadoPublico } from '../motor/src/index.ts';
import { carregarRegras } from '../../api/src/regras.ts';
import type { ConfigCliente, Sql } from './instalar.ts';

/** Gerador pseudoaleatório com semente: a demonstração sai sempre igual. */
function semente(s: number) {
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOMES = ['Transportes Boa Viagem', 'Padaria Estrela do Sul', 'Clínica Vida Plena', 'Condomínio Jardim das Acácias', 'Mercado Bom Preço', 'Escola Pequeno Sábio', 'Construtora Pedra Firme', 'Oficina Roda Livre', 'Farmácia Saúde Já', 'Pet Shop Amigo Fiel', 'Locadora Via Rápida', 'Hotel Recanto das Águas', 'Papelaria Ponto Final', 'Academia Corpo Ativo', 'Imobiliária Novo Lar', 'Restaurante Sabor Caseiro', 'Auto Peças Motor Forte', 'Lavanderia Roupa Nova', 'Floricultura Bem-me-quer', 'Gráfica Cor Viva'];
const SUFIXOS = ['Ltda', 'ME', 'S.A.', 'EPP', 'e Filhos', 'Comércio', 'Serviços'];
/** Motivos de perda (A3): categoria e peso; "outro" leva texto. */
const PERDAS: [string, number][] = [['preco_concorrente', 46], ['desistiu', 16], ['sem_resposta', 14], ['escopo', 10], ['prazo', 9], ['outro', 5]];
const NOME_PERDA: Record<string, string> = {
  preco_concorrente: 'Preço acima do concorrente', prazo: 'Prazo ou disponibilidade', escopo: 'Produto não atende',
  desistiu: 'Cliente desistiu da compra', sem_resposta: 'Sem resposta do cliente', outro: 'Outro',
};
const TEXTOS_OUTRO = ['Cliente fechou com fornecedor do próprio grupo.', 'Mudança de diretoria no cliente adiou a decisão.', 'Cliente preferiu contratar em outro formato.'];
const MOTIVOS = ['Cliente apresentou proposta concorrente mais baixa.', 'Renovação de contrato com volume garantido por dois anos.', 'Cliente estratégico da região; abre portas para o grupo.', 'Fechamento de meta do trimestre com pagamento antecipado.', 'Pacote com outros produtos já contratados.'];

export interface OpcoesDemo {
  hoje?: Date;
  dias?: number;
  semente?: number;
  /** Gera só os dias desta janela (dias atrás, inclusive), para dividir a carga em partes. */
  janela?: { de: number; ate: number };
  /** Reajuste aplicado na tabela publicada no meio do histórico (%). */
  reajustePct?: number;
}

/**
 * Dados 100% sintéticos da demonstração: 12 meses de cotações com descontos,
 * exceções e perdas plausíveis. Cada preço sai do motor de verdade, com as
 * regras vigentes na data. É carga histórica: grava direto, com datas
 * retroativas e origem "carga". Nenhum dado de cliente real entra aqui.
 */
export async function gerarHistorico(sql: Sql, orgId: string, config: ConfigCliente, o: OpcoesDemo = {}) {
  const rnd = semente(o.semente ?? 20261116);
  const hoje = o.hoje ?? new Date();
  const dias = o.dias ?? 365;
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const diaAtras = (n: number, hora = 9 + Math.floor(rnd() * 9), min = Math.floor(rnd() * 60)) => {
    const d = new Date(hoje);
    d.setUTCDate(d.getUTCDate() - n);
    d.setUTCHours(hora + 3, min, Math.floor(rnd() * 60), 0);
    return d;
  };
  const escolher = <T>(lista: T[]): T => lista[Math.floor(rnd() * lista.length)]!;
  const pesado = <T>(lista: [T, number][]): T => {
    let alvo = rnd() * lista.reduce((s, [, p]) => s + p, 0);
    for (const [v, p] of lista) if ((alvo -= p) <= 0) return v;
    return lista[0]![0];
  };

  const extra = config.demo ?? {};

  // Tabela reajustada no meio do histórico: mostra versões e vigências. Na operadora de
  // turismo o reajuste fica desligado, para o pacote de hoje bater com a Nota nº 02.
  const reajustePct = o.reajustePct ?? extra.reajustePct ?? 6;
  const viradaDias = Math.floor(dias * 0.37);
  const virada = reajustePct > 0 ? iso(diaAtras(viradaDias, 0, 0)) : '9999-12-31';
  const [t1] = await sql<{ id: string }[]>`select id from public.tabelas_preco where org_id = ${orgId} and versao = 1`;
  const jaTem = await sql`select 1 from public.tabelas_preco where org_id = ${orgId} and versao = 2`;
  const reajustarAgora = reajustePct > 0 && jaTem.length === 0 && virada > config.tabela.vigenciaInicio;
  if (reajustarAgora) {
    const fator = 1 + reajustePct / 100;
    await sql.begin(async (tx) => {
      await tx`select set_config('app.ator_tipo', 'sistema', true), set_config('app.contexto', ${JSON.stringify({ origem: 'carga da demonstração' })}, true)`;
      const [t2] = await tx<{ id: string }[]>`
        insert into public.tabelas_preco (org_id, nome, versao, moeda, origem, observacao)
        select org_id, ${`${config.tabela.nome} (reajuste)`}, 2, moeda, 'copia', 'Reajuste anual' from public.tabelas_preco where id = ${t1!.id} returning id`;
      await tx`insert into public.itens_tabela (org_id, tabela_id, produto_id, componente_id, dimensoes, preco_base)
               select org_id, ${t2!.id}, produto_id, componente_id, dimensoes, round(preco_base * ${fator}, 2) from public.itens_tabela where tabela_id = ${t1!.id}`;
      await tx`insert into public.fatores (org_id, tabela_id, codigo, nome, dimensao, valor, tipo, ajuste, produto_id, grupo)
               select org_id, ${t2!.id}, codigo, nome, dimensao, valor, tipo, ajuste, produto_id, grupo from public.fatores where tabela_id = ${t1!.id}`;
      await tx`update public.tabelas_preco set vigencia_fim = ${virada}::date - 1 where id = ${t1!.id}`;
      await tx`update public.tabelas_preco set status = 'publicada', vigencia_inicio = ${virada}::date, publicado_em = ${virada}::date where id = ${t2!.id}`;
    });
  }

  // Trajetória sintética do câmbio de referência: uma publicação no início de cada mês,
  // em torno do centro configurado, terminando exatamente no centro no mês corrente.
  // A série é a mesma em todas as partes da carga (semente própria, por moeda).
  for (const [moedaCodigo, t] of Object.entries(extra.trajetoriaCambio ?? {})) {
    const inicial = (config.cambios ?? []).find((c) => c.moeda === moedaCodigo)?.vigenteDe ?? config.tabela.vigenciaInicio;
    const meses: string[] = [];
    const cursor = new Date(`${inicial.slice(0, 7)}-01T12:00:00Z`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    const mesAtual = iso(hoje).slice(0, 7);
    while (iso(cursor).slice(0, 7) <= mesAtual) {
      meses.push(iso(cursor).slice(0, 10));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    const r2 = semente([...moedaCodigo].reduce((s, ch) => s * 31 + ch.charCodeAt(0), 7));
    let desvio = 0;
    const serie = meses.map((m, i) => {
      desvio = Math.max(-1, Math.min(1, desvio * 0.6 + (r2() - 0.5) * 1.2));
      const taxa = i === meses.length - 1 ? t.centro : t.centro + desvio * t.amplitude;
      return { vigenteDe: m, taxa: Math.round(taxa * 10000) / 10000 };
    });
    for (const s of serie) {
      await sql`insert into public.cambios_referencia (org_id, moeda, taxa, vigente_de, origem, observacao)
                values (${orgId}, ${moedaCodigo}, ${s.taxa}, ${s.vigenteDe}::date, 'politica', 'Série sintética da demonstração')
                on conflict (org_id, moeda, vigente_de) do nothing`;
    }
  }

  // Com a tabela reajustada, os casos de referência são recalculados para a regra
  // vigente hoje (em cliente real, o gestor refaz a conta à mão e atualiza o caso).
  if (reajustarAgora) {
    const dataHoje = iso(hoje);
    const vigentes = await carregarRegras(sql, orgId, dataHoje);
    const casos = await sql<{ id: string; pedido: PedidoCotacao }[]>`select id, pedido from public.casos_referencia where org_id = ${orgId}`;
    for (const c of casos) {
      const pedido = { ...c.pedido, data: dataHoje };
      const r = calcular(pedido, vigentes.regras);
      await sql`update public.casos_referencia set pedido = ${sql.json(pedido as never)},
        esperado = ${sql.json({ precoBase: r.precoBase, precoFinal: r.precoFinal, comissaoValor: r.comissaoValor, margemValor: r.margemValor, margemPct: r.margemPct, veredito: r.veredito.status, nivelAlcada: r.veredito.nivelAlcada, ...(r.comissaoVendedor ? { comissaoVendedor: r.comissaoVendedor.valor } : {}) } as never)}
        where id = ${c.id}`;
    }
  }

  const perfilDe = new Map((config.usuarios ?? []).map((u) => [u.email.toLowerCase(), u.demo?.perfilDesconto ?? 'medio']));
  const usuarios = await sql<{ id: string; email: string; nome: string; limite_alcada: number | null; papel: string; canal: string | null; unidade_id: string | null }[]>`
    select u.id, u.email, u.nome, u.limite_alcada, up.papel, k.codigo as canal, up.unidade_id
    from public.usuarios u join public.usuario_papel up on up.usuario_id = u.id left join public.canais k on k.id = up.canal_id
    where u.org_id = ${orgId} and u.status = 'ativo'`;
  const vendedores = usuarios.filter((u) => u.papel === 'vendedor' || u.papel === 'canal');
  const aprovadores = usuarios.filter((u) => u.limite_alcada !== null);
  if (vendedores.length === 0) throw new Error('A demonstração precisa de ao menos um vendedor ou usuário de canal.');
  const canais = config.canais.map((c) => c.codigo);
  const cacheRegras = new Map<string, Awaited<ReturnType<typeof carregarRegras>>>();
  // por mês: a tabela e o câmbio de referência podem mudar de um mês para outro
  const regrasEm = async (data: string) => {
    const chave = `${data < virada ? 'antes' : 'depois'}-${data.slice(0, 7)}`;
    if (!cacheRegras.has(chave)) cacheRegras.set(chave, await carregarRegras(sql, orgId, data));
    return cacheRegras.get(chave)!;
  };

  function pedidoAleatorio(regras: ConjuntoRegras, dono: (typeof vendedores)[number], data: string): PedidoCotacao {
    const produto = pesado(regras.produtos.filter((p) => p.ativo).map((p, i) => [p, [5, 3, 2, 1][i] ?? 1] as [typeof p, number]));
    const dimensoes: Record<string, string | number> = {};
    for (const codigo of new Set([...produto.dimensoes, ...produto.multiplicadores])) {
      const d = regras.dimensoes.find((x) => x.codigo === codigo)!;
      if (d.tipo === 'categoria') dimensoes[codigo] = pesado(d.valores!.map((v, i) => [v.codigo, Math.max(6 - i * 1.5, 1)] as [string, number]));
      else {
        const lista = extra.multiplicadores?.[codigo];
        if (lista?.length) dimensoes[codigo] = escolher(lista);
        else {
          const f = pesado(d.faixas!.map((x, i) => [x, [6, 3, 1][i] ?? 1] as [typeof x, number]));
          const teto = f.max ?? f.min * 3;
          dimensoes[codigo] = Math.round(f.min + rnd() * (Math.min(teto, f.min + 60) - f.min));
          if (codigo === 'meses') dimensoes[codigo] = escolher([6, 12, 12, 12, 24]);
        }
      }
    }
    const opcionais = produto.componentes.filter((c) => !c.obrigatorio && c.ativo && rnd() < 0.3).map((c) => c.codigo);
    const canal = dono.papel === 'canal' ? dono.canal : rnd() < (extra.probabilidadeCanal ?? 0.35) ? escolher(canais) : null;
    // faixas de desconto a partir da política: zero, até o livre, até a 1ª alçada, até o máximo e acima dele
    const { descontoLivrePct: livre, descontoMaximoPct: maximo } = regras.politica.limites;
    const alcada1 = Math.min(...regras.politica.alcadas.map((a) => a.descontoAtePct), maximo);
    const meio = (de: number, ate: number) => () => Math.max(de + 0.5, Math.round((de + rnd() * (ate - de)) * 2) / 2);
    const pesos = { baixo: [55, 33, 8, 3, 1], medio: [38, 34, 16, 8, 4], alto: [12, 24, 32, 22, 10] }[perfilDe.get(dono.email.toLowerCase()) ?? 'medio'];
    const descontoPct = pesado<() => number>([
      [() => 0, pesos[0]!],
      [() => Math.round(rnd() * livre * 2) / 2, pesos[1]!],
      [meio(livre, alcada1), pesos[2]!],
      [meio(alcada1, maximo), pesos[3]!],
      [meio(maximo, maximo + 4), pesos[4]!],
    ])();
    return { produto: produto.codigo, ...(opcionais.length ? { componentes: opcionais } : {}), dimensoes, descontoPct, canal, data };
  }

  const cot: Record<string, unknown>[] = [];
  const ver: Record<string, unknown>[] = [];
  const apr: Record<string, unknown>[] = [];
  const eventos: Record<string, unknown>[] = [];
  let numero = Number((await sql<{ v: number }[]>`select coalesce(max(numero), 0) as v from public.cotacoes where org_id = ${orgId}`)[0]!.v);
  const evento = (quando: Date, ator: string | null, acao: string, id: string, resumo: string) =>
    eventos.push({ org_id: orgId, ocorrido_em: quando, ator_id: ator, ator_tipo: ator ? 'usuario' : 'sistema', acao, tabela: 'cotacoes', registro_id: id, contexto: sql.json({ resumo, origem: 'carga da demonstração' }) });
  const horasDepois = (d: Date, h: number) => new Date(d.getTime() + h * 3600000);

  const inicioJanela = Math.min(o.janela?.de ?? dias, dias);
  const fimJanela = Math.max(o.janela?.ate ?? 0, 0);
  // a semente varia com a janela para as partes não repetirem os mesmos sorteios
  for (let i = 0; i < (dias - inicioJanela) % 97; i++) rnd();
  for (let n = inicioJanela; n >= fimJanela; n--) {
    const dia = diaAtras(n, 12, 0);
    const fimDeSemana = [0, 6].includes(dia.getUTCDay());
    const sazonal = extra.sazonalidade?.[String(dia.getUTCMonth() + 1)] ?? 1;
    const base = fimDeSemana ? (rnd() < 0.2 ? 1 : 0) : 1 + Math.floor(rnd() * 4) + (n < 120 ? 1 : 0);
    const quantas = Math.floor(base * sazonal + rnd() * (sazonal - 1));
    for (let k = 0; k < quantas; k++) {
      const criada = diaAtras(n);
      if (criada > hoje) continue;
      const data = iso(criada);
      const dono = escolher(vendedores);
      const carregadas = await regrasEm(data);
      const pedido = pedidoAleatorio(carregadas.regras, dono, data);
      let r;
      try {
        r = calcular(pedido, carregadas.regras);
      } catch (e) {
        if (e instanceof ErroMotor) continue;
        throw e;
      }
      const id = crypto.randomUUID();
      const versaoId = crypto.randomUUID();
      numero += 1;
      const validadeDias = carregadas.regras.politica.validadeDias;
      let status = 'rascunho';
      let emitida: Date | null = null;
      let encerrada: Date | null = null;
      let motivoPerda: string | null = null;
      let categoriaPerda: string | null = null;
      let precoConcorrente: number | null = null;
      evento(criada, dono.id, 'cotacao.criada', id, `Cotação ${numero} criada (versão 1).`);

      const desfecho = (chanceAceite: number) => {
        const validade = new Date(emitida!.getTime() + validadeDias * 86400000);
        const sorte = rnd();
        const quando = horasDepois(emitida!, 6 + rnd() * 24 * Math.min(validadeDias - 1, 9));
        if (quando > hoje) return; // ainda em aberto
        if (sorte < chanceAceite) {
          status = 'aceita';
          encerrada = quando;
          evento(quando, dono.id, 'cotacao.aceita', id, 'Cliente final fechou.');
        } else if (sorte < chanceAceite + 0.3) {
          status = 'perdida';
          encerrada = quando;
          categoriaPerda = pesado(PERDAS);
          motivoPerda = categoriaPerda === 'outro' ? escolher(TEXTOS_OUTRO) : null;
          // em parte das perdas por preço o vendedor sabe o preço do concorrente (entre 3% e 14% abaixo)
          if (categoriaPerda === 'preco_concorrente' && rnd() < 0.6) precoConcorrente = Math.round(r.precoFinal * (0.86 + rnd() * 0.11) * 100) / 100;
          evento(quando, dono.id, 'cotacao.perdida', id, `Cotação perdida: ${NOME_PERDA[categoriaPerda]}${motivoPerda ? ` (${motivoPerda})` : ''}.`);
        } else if (validade < hoje) {
          status = 'expirada';
          encerrada = validade;
          evento(validade, null, 'cotacao.expirada', id, 'Validade vencida sem desfecho.');
        }
      };
      // desconto maior converte mais: é o que o painel deixa ver
      const chance = 0.42 + Math.min(r.descontoPct, 15) * 0.012 - (pedido.canal ? 0.03 : 0);

      if (r.veredito.status === 'dentro') {
        emitida = horasDepois(criada, 0.02 + rnd() * 0.05);
        status = 'emitida';
        evento(emitida, dono.id, 'cotacao.emitida', id, `Proposta ${numero} emitida (versão 1).`);
        desfecho(chance);
      } else if (r.veredito.status === 'exige_aprovacao') {
        const nivel = r.veredito.nivelAlcada!;
        const pedida = horasDepois(criada, 0.05);
        const prazo = horasDepois(pedida, carregadas.regras.politica.prazoAprovacaoHoras);
        const aprovador = escolher(aprovadores.filter((a) => (a.limite_alcada ?? 0) >= nivel && a.id !== dono.id));
        const motivo = escolher(MOTIVOS);
        evento(pedida, dono.id, 'cotacao.excecao_pedida', id, `Exceção pedida para a versão 1 (alçada nível ${nivel}): ${motivo}`);
        const decidida = horasDepois(pedida, 0.5 + rnd() * (rnd() < 0.15 ? 40 : 14));
        const base = { id: crypto.randomUUID(), org_id: orgId, cotacao_id: id, versao_id: versaoId, solicitante_id: dono.id, motivo, nivel_alcada: nivel, prazo, criado_em: pedida };
        if (decidida > hoje || !aprovador) {
          status = 'em_aprovacao';
          apr.push({ ...base, status: 'pendente', aprovador_id: null, decisao_motivo: null, decidido_em: null });
        } else if (rnd() < (nivel === 1 ? 0.82 : 0.6)) {
          apr.push({ ...base, status: 'aprovada', aprovador_id: aprovador.id, decisao_motivo: null, decidido_em: decidida });
          evento(decidida, aprovador.id, 'cotacao.excecao_aprovada', id, `Exceção aprovada por ${aprovador.nome}.`);
          emitida = horasDepois(decidida, 0.2 + rnd() * 3);
          status = emitida > hoje ? 'aprovada' : 'emitida';
          if (status === 'emitida') {
            evento(emitida, dono.id, 'cotacao.emitida', id, `Proposta ${numero} emitida (versão 1).`);
            desfecho(chance + 0.08);
          } else emitida = null;
        } else {
          status = 'recusada';
          apr.push({ ...base, status: 'recusada', aprovador_id: aprovador.id, decisao_motivo: 'Margem insuficiente para esta condição.', decidido_em: decidida });
          evento(decidida, aprovador.id, 'cotacao.excecao_recusada', id, `Exceção recusada por ${aprovador.nome}: Margem insuficiente para esta condição.`);
        }
      } else if (rnd() < 0.7 && n > 2) {
        status = 'cancelada';
        encerrada = horasDepois(criada, 1 + rnd() * 20);
        evento(encerrada, dono.id, 'cotacao.cancelada', id, 'Cotação cancelada antes da emissão.');
      }

      cot.push({
        id, org_id: orgId, numero, cliente_nome: `${escolher(NOMES)} ${escolher(SUFIXOS)}`, cliente_email: null,
        canal_id: pedido.canal ? carregadas.canais.find((c) => c.codigo === pedido.canal)!.id : null, unidade_id: dono.unidade_id, dono_id: dono.id,
        produto_id: carregadas.produtoIds[pedido.produto]!, status, versao_atual: 1, versao_atual_id: versaoId,
        validade: emitida ? iso(new Date((emitida as Date).getTime() + validadeDias * 86400000)) : null,
        emitida_em: emitida, encerrada_em: encerrada, desfecho_motivo: motivoPerda, desfecho_categoria: categoriaPerda, concorrente_preco: precoConcorrente, origem: 'carga', criado_em: criada, atualizado_em: encerrada ?? emitida ?? criada,
      });
      ver.push({
        id: versaoId, org_id: orgId, cotacao_id: id, versao: 1, entrada: sql.json(pedido as never), resultado: sql.json(r as never), resultado_publico: sql.json(resultadoPublico(r) as never),
        tabela_id: carregadas.tabelaId, politica_id: carregadas.politicaId, motor_versao: r.versoes.motor, moeda: r.moeda, preco_base: r.precoBase, preco_final: r.precoFinal,
        desconto_pct: r.descontoPct, comissao_pct: r.comissaoPct, comissao_valor: r.comissaoValor, margem_valor: r.margemValor, margem_pct: r.margemPct,
        veredito: r.veredito.status, nivel_alcada: r.veredito.nivelAlcada, criado_por: dono.id, criado_em: criada,
      });
    }
  }

  await sql.begin(async (tx) => {
    // carga histórica: gatilhos e chaves ficam suspensos só nesta transação
    await tx`set local session_replication_role = replica`;
    const lote = async (tabela: string, linhas: Record<string, unknown>[]) => {
      for (let i = 0; i < linhas.length; i += 400) await tx`insert into ${tx(tabela)} ${tx(linhas.slice(i, i + 400) as never)}`;
    };
    await lote('cotacoes', cot.map(({ versao_atual_id: _v, ...c }) => c));
    await lote('cotacao_versoes', ver);
    for (let i = 0; i < cot.length; i += 400) {
      const fatia = cot.slice(i, i + 400);
      await tx`update public.cotacoes c set versao_atual_id = v.id from public.cotacao_versoes v where v.cotacao_id = c.id and c.id in ${tx(fatia.map((c) => c.id as string))}`;
    }
    await lote('aprovacoes', apr);
    await lote('eventos_auditoria', eventos);
    await tx`insert into public.contadores (org_id, nome, valor) values (${orgId}, 'cotacao', ${numero})
             on conflict (org_id, nome) do update set valor = excluded.valor`;
  });

  return { cotacoes: cot.length, aprovacoes: apr.length, eventos: eventos.length, tabelaReajustadaEm: virada };
}
