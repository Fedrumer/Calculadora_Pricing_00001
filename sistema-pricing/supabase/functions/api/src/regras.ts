import type { Campanha, ConjuntoRegras, DefinicaoDimensao, Fator, ItemTabela, ParametroCusto, Politica, Produto } from '@pricing/motor';
import type { Db } from './contexto.ts';
import { ErroHttp } from './erros.ts';

export interface RegrasCarregadas {
  regras: ConjuntoRegras;
  tabelaId: string;
  politicaId: string;
  /** código do canal -> id, e o inverso, para traduzir o pedido */
  canais: { id: string; codigo: string; nome: string; ativo: boolean }[];
  produtoIds: Record<string, string>;
}

export interface OpcoesRegras {
  /** Usa esta tabela (rascunho, por exemplo) em vez da vigente na data. */
  tabelaId?: string;
  politicaId?: string;
}

/** Monta o conjunto de regras que o motor recebe, a partir do banco. */
export async function carregarRegras(db: Db, orgId: string, data: string, opcoes: OpcoesRegras = {}): Promise<RegrasCarregadas> {
  const [vig] = await db<{ tabela: string | null; politica: string | null }[]>`
    select app.tabela_vigente(${orgId}, ${data}::date) as tabela, app.politica_vigente(${orgId}, ${data}::date) as politica`;
  const tabelaId = opcoes.tabelaId ?? vig?.tabela;
  const politicaId = opcoes.politicaId ?? vig?.politica;
  if (!tabelaId) throw new ErroHttp(409, 'SEM_TABELA_VIGENTE', `Não há tabela de preço publicada vigente em ${data}.`);
  if (!politicaId) throw new ErroHttp(409, 'SEM_POLITICA_VIGENTE', `Não há política comercial publicada vigente em ${data}.`);

  const [tabela] = await db<{ id: string; versao: number; moeda: string }[]>`
    select id, versao, moeda from public.tabelas_preco where id = ${tabelaId} and org_id = ${orgId}`;
  const [politica] = await db<{ id: string; versao: number; regras: Omit<Politica, 'id' | 'versao'> }[]>`
    select id, versao, regras from public.politicas where id = ${politicaId} and org_id = ${orgId}`;
  if (!tabela || !politica) throw new ErroHttp(404, 'REGRA_NAO_ENCONTRADA', 'Tabela ou política não encontrada.');

  const [dimensoes, produtos, componentes, itens, fatores, custos, campanhas, canais] = await Promise.all([
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
    db<{ codigo: string; nome: string; categoria: ParametroCusto['categoria']; tipo: ParametroCusto['tipo']; valor: string; produto_id: string | null; base: ParametroCusto['base'] }[]>`
      select codigo, nome, categoria, tipo, valor, produto_id, base from public.parametros_custo where politica_id = ${politicaId} order by codigo`,
    db<{ codigo: string; nome: string; inicio: string; fim: string; tipo: 'percentual' | 'valor'; valor: string; produtos: string[] | null; canais: string[] | null; condicoes: Campanha['condicoes']; acumula_com_desconto: boolean; acumula_com_outras: boolean }[]>`
      select codigo, nome, inicio::text, fim::text, tipo, valor, produtos, canais, condicoes, acumula_com_desconto, acumula_com_outras
      from public.campanhas where org_id = ${orgId} and ativo order by codigo`,
    db<{ id: string; codigo: string; nome: string; ativo: boolean }[]>`
      select id, codigo, nome, ativo from public.canais where org_id = ${orgId}`,
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
    })),
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

  return {
    regras,
    tabelaId: tabela.id,
    politicaId: politica.id,
    canais: [...canais],
    produtoIds: Object.fromEntries(produtos.map((p) => [p.codigo, p.id])),
  };
}
