import type { CambioReferencia, Campanha, ConjuntoRegras, DefinicaoDimensao, Fator, ItemTabela, ParametroCusto, Politica, Produto } from '@pricing/motor';
import type { Db } from './contexto.ts';
import { ErroHttp } from './erros.ts';

export interface RegrasCarregadas {
  regras: ConjuntoRegras;
  tabelaId: string;
  politicaId: string;
  /** código do canal -> id, e o inverso, para traduzir o pedido */
  canais: { id: string; codigo: string; nome: string; ativo: boolean }[];
  produtoIds: Record<string, string>;
  /** A9: piloto em que a cotação cai, com o braço; nulo fora de piloto. */
  piloto: { id: string; braco: 'tratamento' | 'controle' } | null;
}

/** Quem está cotando: decide se a cotação cai em um piloto ativo (A9). */
export interface ContextoCotacao {
  vendedorId?: string | null;
  canalId?: string | null;
  canalCodigo?: string | null;
  unidadeId?: string | null;
}

export interface OpcoesRegras {
  /** Usa esta tabela (rascunho, por exemplo) em vez da vigente na data. */
  tabelaId?: string;
  politicaId?: string;
  /** Substitui o câmbio de referência de uma moeda (simulação de impacto antes de publicar). */
  cambio?: { moeda: string; taxa: number };
  /** Contexto da cotação, para resolver o piloto (A9). Sem ele, vale a regra vigente para todos. */
  contexto?: ContextoCotacao;
}

/**
 * Piloto ativo na data em que a cotação cai, pelo vendedor, canal ou unidade.
 * Se mais de um critério casar (em pilotos diferentes), vale o mais específico:
 * vendedor, depois canal, depois unidade.
 */
export async function resolverPiloto(db: Db, orgId: string, data: string, ctx: ContextoCotacao) {
  let canalId = ctx.canalId ?? null;
  if (!canalId && ctx.canalCodigo) {
    const [c] = await db<{ id: string }[]>`select id from public.canais where org_id = ${orgId} and codigo = ${ctx.canalCodigo}`;
    canalId = c?.id ?? null;
  }
  const candidatos = [
    ['vendedor', ctx.vendedorId ?? null],
    ['canal', canalId],
    ['unidade', ctx.unidadeId ?? null],
  ].filter((x): x is [string, string] => !!x[1]);
  for (const [criterio, membro] of candidatos) {
    const [p] = await db<{ id: string; braco: 'tratamento' | 'controle'; tabela_id: string | null; politica_id: string | null }[]>`
      select p.id, m.braco, p.tabela_id, p.politica_id
      from public.piloto_membros m join public.pilotos p on p.id = m.piloto_id
      where m.org_id = ${orgId} and m.ativo and m.criterio = ${criterio} and m.membro_id = ${membro}
        and p.status = 'ativo' and ${data}::date between p.inicio and p.fim
      limit 1`;
    if (p) return p;
  }
  return null;
}

/** Monta o conjunto de regras que o motor recebe, a partir do banco. */
export async function carregarRegras(db: Db, orgId: string, data: string, opcoes: OpcoesRegras = {}): Promise<RegrasCarregadas> {
  const [vig] = await db<{ tabela: string | null; politica: string | null }[]>`
    select app.tabela_vigente(${orgId}, ${data}::date) as tabela, app.politica_vigente(${orgId}, ${data}::date) as politica`;
  // A9: o tratamento de um piloto cota com a regra alternativa; o controle, com a vigente
  const piloto = opcoes.contexto && !opcoes.tabelaId && !opcoes.politicaId ? await resolverPiloto(db, orgId, data, opcoes.contexto) : null;
  const alternativa = piloto?.braco === 'tratamento' ? piloto : null;
  const tabelaId = opcoes.tabelaId ?? alternativa?.tabela_id ?? vig?.tabela;
  const politicaId = opcoes.politicaId ?? alternativa?.politica_id ?? vig?.politica;
  if (!tabelaId) throw new ErroHttp(409, 'SEM_TABELA_VIGENTE', `Não há tabela de preço publicada vigente em ${data}.`);
  if (!politicaId) throw new ErroHttp(409, 'SEM_POLITICA_VIGENTE', `Não há política comercial publicada vigente em ${data}.`);

  const [tabela] = await db<{ id: string; versao: number; moeda: string }[]>`
    select id, versao, moeda from public.tabelas_preco where id = ${tabelaId} and org_id = ${orgId}`;
  const [politica] = await db<{ id: string; versao: number; regras: Omit<Politica, 'id' | 'versao'> }[]>`
    select id, versao, regras from public.politicas where id = ${politicaId} and org_id = ${orgId}`;
  if (!tabela || !politica) throw new ErroHttp(404, 'REGRA_NAO_ENCONTRADA', 'Tabela ou política não encontrada.');

  const [dimensoes, produtos, componentes, itens, fatores, custos, campanhas, canais, cambios] = await Promise.all([
    db<{ codigo: string; nome: string; tipo: 'categoria' | 'faixa'; valores: DefinicaoDimensao['valores']; faixas: DefinicaoDimensao['faixas'] }[]>`
      select codigo, nome, tipo, valores, faixas from public.dimensoes where org_id = ${orgId} order by ordem, codigo`,
    db<{ id: string; codigo: string; nome: string; ativo: boolean; dimensoes: string[]; multiplicadores: string[] }[]>`
      select id, codigo, nome, ativo, dimensoes, multiplicadores from public.produtos where org_id = ${orgId} order by ordem, codigo`,
    db<{ id: string; produto_id: string; codigo: string; nome: string; obrigatorio: boolean; ativo: boolean }[]>`
      select id, produto_id, codigo, nome, obrigatorio, ativo from public.componentes where org_id = ${orgId} order by ordem, codigo`,
    db<{ produto_id: string; componente_id: string | null; dimensoes: Record<string, string>; preco_base: string }[]>`
      select produto_id, componente_id, dimensoes, preco_base from public.itens_tabela where tabela_id = ${tabelaId}`,
    db<{ codigo: string; nome: string; dimensao: string; valor: string; tipo: 'percentual' | 'valor'; ajuste: string; produto_id: string | null; grupo: string | null }[]>`
      select codigo, nome, dimensao, valor, tipo, ajuste, produto_id, grupo from public.fatores where tabela_id = ${tabelaId} order by codigo`,
    db<{ codigo: string; nome: string; categoria: ParametroCusto['categoria']; tipo: ParametroCusto['tipo']; valor: string; produto_id: string | null; base: ParametroCusto['base']; moeda: string | null; condicoes: ParametroCusto['condicoes'] }[]>`
      select codigo, nome, categoria, tipo, valor, produto_id, base, moeda, condicoes from public.parametros_custo where politica_id = ${politicaId} order by codigo`,
    db<{ codigo: string; nome: string; inicio: string; fim: string; tipo: 'percentual' | 'valor'; valor: string; produtos: string[] | null; canais: string[] | null; condicoes: Campanha['condicoes']; acumula_com_desconto: boolean; acumula_com_outras: boolean }[]>`
      select codigo, nome, inicio::text, fim::text, tipo, valor, produtos, canais, condicoes, acumula_com_desconto, acumula_com_outras
      from public.campanhas where org_id = ${orgId} and ativo order by codigo`,
    db<{ id: string; codigo: string; nome: string; ativo: boolean }[]>`
      select id, codigo, nome, ativo from public.canais where org_id = ${orgId}`,
    // histórico até a data: o motor escolhe, para cada pedido, a taxa vigente na data dele
    // (uma cotação de hoje usa a de hoje; um caso de referência antigo, a da data do caso)
    db<{ moeda: string; taxa: string; vigente_de: string; origem: CambioReferencia['origem'] }[]>`
      select moeda, taxa, vigente_de::text, origem from public.cambios_referencia
      where org_id = ${orgId} and vigente_de <= ${data}::date order by moeda, vigente_de`,
  ]);

  const codigoProduto = new Map(produtos.map((p) => [p.id, p.codigo]));
  const codigoComponente = new Map(componentes.map((c) => [c.id, c.codigo]));

  const regras: ConjuntoRegras = {
    dimensoes: dimensoes.map((d) => ({
      codigo: d.codigo,
      nome: d.nome,
      tipo: d.tipo,
      ...(d.tipo === 'categoria' ? { valores: d.valores ?? [] } : { faixas: d.faixas ?? [] }),
    })),
    produtos: produtos.map(
      (p): Produto => ({
        codigo: p.codigo,
        nome: p.nome,
        ativo: p.ativo,
        dimensoes: p.dimensoes,
        multiplicadores: p.multiplicadores,
        componentes: componentes
          .filter((c) => c.produto_id === p.id)
          .map((c) => ({ codigo: c.codigo, nome: c.nome, obrigatorio: c.obrigatorio, ativo: c.ativo })),
      }),
    ),
    tabela: {
      id: tabela.id,
      versao: tabela.versao,
      moeda: tabela.moeda,
      itens: itens.map(
        (i): ItemTabela => ({
          produto: codigoProduto.get(i.produto_id) ?? '',
          componente: i.componente_id ? (codigoComponente.get(i.componente_id) ?? '') : null,
          dimensoes: i.dimensoes,
          precoBase: i.preco_base,
        }),
      ),
      fatores: fatores.map(
        (f): Fator => ({
          codigo: f.codigo,
          nome: f.nome,
          dimensao: f.dimensao,
          valor: f.valor,
          tipo: f.tipo,
          ajuste: f.ajuste,
          produto: f.produto_id ? (codigoProduto.get(f.produto_id) ?? null) : null,
          grupo: f.grupo,
        }),
      ),
    },
    politica: { ...politica.regras, id: politica.id, versao: politica.versao },
    custos: custos.map((c) => ({
      codigo: c.codigo,
      nome: c.nome,
      categoria: c.categoria,
      tipo: c.tipo,
      valor: c.valor,
      produto: c.produto_id ? (codigoProduto.get(c.produto_id) ?? null) : null,
      base: c.base ?? null,
      ...(c.moeda ? { moeda: c.moeda } : {}),
      ...(c.condicoes ? { condicoes: c.condicoes } : {}),
    })),
    cambios: cambios
      .filter((c) => !(opcoes.cambio && opcoes.cambio.moeda === c.moeda && c.vigente_de === data))
      .map((c): CambioReferencia => ({ moeda: c.moeda, taxa: c.taxa, vigenteDe: c.vigente_de, origem: c.origem })),
    campanhas: campanhas.map((c) => ({
      codigo: c.codigo,
      nome: c.nome,
      inicio: c.inicio,
      fim: c.fim,
      tipo: c.tipo,
      valor: c.valor,
      produtos: c.produtos,
      canais: c.canais,
      condicoes: c.condicoes,
      acumulaComDesconto: c.acumula_com_desconto,
      acumulaComOutras: c.acumula_com_outras,
    })),
  };

  // simulação: a taxa informada passa a valer na data das regras
  if (opcoes.cambio) regras.cambios!.push({ moeda: opcoes.cambio.moeda, taxa: opcoes.cambio.taxa, vigenteDe: data, origem: 'politica' });

  return {
    regras,
    tabelaId: tabela.id,
    politicaId: politica.id,
    canais: [...canais],
    produtoIds: Object.fromEntries(produtos.map((p) => [p.codigo, p.id])),
    piloto: piloto ? { id: piloto.id, braco: piloto.braco } : null,
  };
}
