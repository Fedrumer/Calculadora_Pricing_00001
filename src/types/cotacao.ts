export type FormaPagamentoId = 'TRANSFER' | 'CARD_1X' | 'CARD_2X' | 'CARD_3X'
export type DestinoId = 'WORLD' | 'NORTH_AMERICA' | 'EUROPE' | 'DOMESTIC'
export type FaixaEtariaId = 'ate_75' | 'de_76_a_85'

export interface Produto {
  id: string
  nome: string
  categoria?: string
  tags?: string[]
  ordem_exibicao?: number
  tipo_cobranca?: 'dia' | 'anual'
  precos_base_por_forma_pagamento: Record<FormaPagamentoId, number>
  destinos: Record<DestinoId, { agravo_percentual: number }>
  faixas_etarias: Record<FaixaEtariaId, { fator_multiplicador: number | null }>
}

export interface CalculoInput {
  produtos: Produto[]
  forma_pagamento?: FormaPagamentoId
  comissao: number // 0 to 0.99
  viajantes_por_faixa: Record<FaixaEtariaId, number>
  data_inicio?: Date
  data_fim?: Date
  destino?: DestinoId
  filtro_tag?: string
  filtro_nome?: string
}

export interface FaixaBreakdown {
  preco_unitario: number
  preco_total: number
  quantidade: number
}

export interface ProdutoCalculado {
  id: string
  nome: string
  breakdown: Record<FaixaEtariaId, FaixaBreakdown>
  preco_total_produto: number
}

export interface CotacaoState {
  produtos_calculados: ProdutoCalculado[]
  fatura_total: number
  preco_unitario_total: number
  tipo_preco: 'NET' | 'BRUTO'
  moeda: 'USD'
  erros: string[]
  carregando: boolean
}
