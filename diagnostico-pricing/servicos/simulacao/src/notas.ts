// Premissas das Notas de Decisão de demonstração nº 01 e nº 02, como nas Notas originais.
// São os casos de aceite do P2 e do P3: o sistema refaz cada Nota com estas premissas.
// As Notas originais usavam distribuições triangulares (mínimo, provável, máximo) e a volatilidade do câmbio;
// aqui elas entram com o mesmo formato, para os números baterem.
import type { DadosBloqueio } from './modelos/bloqueio-cambio.ts';
import type { DadosServicoAdicional } from './modelos/servico-adicional.ts';
import type { Correlacao, Criterio, Opcao, Premissa } from './tipos.ts';

export interface DefinicaoNota<D> {
  modelo: 'servico_adicional' | 'bloqueio_cambio';
  dados: D;
  premissas: Premissa[];
  correlacoes: Correlacao[];
  opcoes: Opcao[];
  criterio: Criterio;
  /** Premissa varrida por padrão (reação da concorrência) e seus valores. */
  varredura: { alvo: string; rotulo: string; valores: number[] };
}

const passos = (de: number, ate: number, passo: number) => Array.from({ length: Math.round((ate - de) / passo) + 1 }, (_, i) => Math.round((de + i * passo) * 1e6) / 1e6);

/** Nota nº 01: entrega em 24 horas na linha de iluminação técnica da distribuidora de exemplo. */
export function notaEntrega24h(o: { chanceReacao?: number; correlacao?: boolean } = {}): DefinicaoNota<DadosServicoAdicional> {
  return {
    modelo: 'servico_adicional',
    dados: {
      pedidos_mes: 1500, ticket: 600, custo_variavel: 396, custo_fixo: 22000, forma_elasticidade: 'constante',
      capacidade: { recurso: 'separação de pedidos', unidade: 'pedidos', capacidade_mes: 1650, uso_por_venda: 1, custo_unidade_extra: 25 },
    },
    premissas: [
      { chave: 'custo_entrega', rotulo: 'Custo por entrega expressa', distribuicao: { tipo: 'triangular', minimo: 10, moda: 14, maximo: 20 }, origem: 'informada', fonte: 'Cotação de transportadora' },
      { chave: 'elasticidade', rotulo: 'Elasticidade', distribuicao: { tipo: 'triangular', minimo: -2.0, moda: -1.2, maximo: -0.6 }, limites: { maximo: 0 }, origem: 'estimado', fonte: 'Reajustes anteriores' },
      { chave: 'pedidos_a_mais_embutido', rotulo: 'Pedidos a mais com o serviço embutido', distribuicao: { tipo: 'triangular', minimo: 0, moda: 0.08, maximo: 0.152 }, origem: 'informada' },
      { chave: 'pedidos_a_mais_taxa', rotulo: 'Pedidos a mais com a taxa opcional', distribuicao: { tipo: 'triangular', minimo: 0, moda: 0.04, maximo: 0.08 }, origem: 'informada' },
      { chave: 'adesao', rotulo: 'Adesão à taxa opcional', distribuicao: { tipo: 'triangular', minimo: 0.15, moda: 0.3, maximo: 0.45 }, limites: { minimo: 0, maximo: 1 }, origem: 'informada' },
      { chave: 'reacao', rotulo: 'chance de reação do concorrente', distribuicao: { tipo: 'reacao', chance: o.chanceReacao ?? 0, tipos: { copiar: 0.6, contra_atacar: 0.4 } }, origem: 'informada' },
      { chave: 'queda_pedidos_contra_ataque', rotulo: 'Queda de pedidos com entrega grátis no concorrente', distribuicao: { tipo: 'triangular', minimo: -0.06, moda: -0.03, maximo: 0 }, origem: 'informada' },
      { chave: 'reducao_adesao_contra_ataque', rotulo: 'Queda da adesão com entrega grátis no concorrente', distribuicao: { tipo: 'fixa', valor: 0.3 }, origem: 'informada' },
    ],
    correlacoes: o.correlacao ? [{ a: 'adesao', b: 'pedidos_a_mais_taxa', rho: 0.5, origem: 'informada', fonte: 'Valor inicial do plano v3 (13.1), a conferir com a Nota original' }] : [],
    opcoes: [
      { codigo: 'embutir', descricao: 'Embutir com reajuste de 3%', parametros: { forma: 'embutir', reajuste: 0.03 } },
      { codigo: 'taxa', descricao: 'Taxa opcional de R$ 45', parametros: { forma: 'taxa', taxa: 45 } },
    ],
    criterio: { regra: 'max_prob_ganho' },
    varredura: { alvo: 'reacao.chance', rotulo: 'a chance de reação do concorrente', valores: passos(0, 0.6, 0.05) },
  };
}

export const DADOS_BLOQUEIO_LISBOA: DadosBloqueio = {
  preco: 9900, comissao_pct: 0.12, impostos_pct: 0.06, custo_operacional: 150, custo_moeda: 1210,
  liberacao_pct: 0.15, multa_pct: 0.5, custo_fixo: 25000,
};

/** Nota nº 02: tamanho do bloqueio do pacote Lisboa de julho e travar ou não o câmbio. */
export function notaBloqueioLisboa(o: { chanceReacao?: number; aberto?: boolean } = {}): DefinicaoNota<DadosBloqueio> {
  const travado = 6.1 * 1.015;
  const lugares = passos(60, 180, 10);
  const opcoes: Opcao[] = lugares.map((n) => ({ codigo: `travado_${n}`, descricao: `${n} lugares, câmbio travado`, parametros: { lugares: n, cambio: 'travado', cambio_travado: travado } }));
  if (o.aberto !== false) opcoes.push(...lugares.map((n) => ({ codigo: `aberto_${n}`, descricao: `${n} lugares, câmbio em aberto`, parametros: { lugares: n, cambio: 'aberto' } })));
  return {
    modelo: 'bloqueio_cambio',
    dados: DADOS_BLOQUEIO_LISBOA,
    premissas: [
      { chave: 'procura', rotulo: 'Procura pelo pacote', distribuicao: { tipo: 'triangular', minimo: 70, moda: 105, maximo: 160 }, origem: 'historico', fonte: 'Vendas de julho dos últimos 3 anos' },
      { chave: 'cambio_pagamento', rotulo: 'Câmbio no pagamento', distribuicao: { tipo: 'lognormal', media: 6.1, sigma: 0.14 * Math.sqrt(0.25) }, origem: 'referencia', fonte: 'Volatilidade de 14% ao ano em 3 meses' },
      { chave: 'reacao', rotulo: 'a chance de reação de concorrente', distribuicao: { tipo: 'reacao', chance: o.chanceReacao ?? 0, tipos: { lancar_pacote: 1 } }, origem: 'informada' },
      { chave: 'perda_reacao', rotulo: 'Procura perdida se o concorrente reagir', distribuicao: { tipo: 'triangular', minimo: 0, moda: 0.15, maximo: 0.3 }, origem: 'informada' },
    ],
    correlacoes: [],
    opcoes,
    criterio: { regra: 'max_p50_com_risco', limite_risco: 0.1 },
    varredura: { alvo: 'reacao.chance', rotulo: 'a chance de reação de concorrente', valores: passos(0, 0.6, 0.05) },
  };
}
