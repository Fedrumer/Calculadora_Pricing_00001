// Tipos de entrada e saída do serviço de simulação.

/** Distribuição de uma premissa. Toda distribuição é lida pela sua função quantil, a partir de uma uniforme. */
export type Distribuicao =
  | { tipo: 'fixa'; valor: number }
  /** P10, P50 e P90, interpolados linearmente; fora deles, reta até mínimo e máximo (ou extensão da inclinação vizinha). */
  | { tipo: 'quantis'; p10: number; p50: number; p90: number; minimo?: number | null; maximo?: number | null }
  /** Mínimo, mais provável e máximo, como nas Notas originais. */
  | { tipo: 'triangular'; minimo: number; moda: number; maximo: number }
  /** Câmbio e preços: média preservada, x = média × exp(σ z − σ²/2). */
  | { tipo: 'lognormal'; media: number; sigma: number }
  /** Valores com probabilidade; a uniforme escolhe pela probabilidade acumulada, na ordem dada. */
  | { tipo: 'discreta'; opcoes: { valor: string; prob: number }[] }
  /** Reação da concorrência: "ignorar" com 1 − chance; cada tipo de reação com chance × peso. */
  | { tipo: 'reacao'; chance: number; tipos: Record<string, number> };

export interface Premissa {
  chave: string;
  distribuicao: Distribuicao;
  /** Limites do valor sorteado (elasticidade até 0, captura e fechamento entre 0 e 1). */
  limites?: { minimo?: number; maximo?: number };
  origem?: 'historico' | 'informada' | 'medido' | 'estimado' | 'pesquisa' | 'referencia' | string;
  fonte?: string;
  rotulo?: string;
}

/** Correlação de postos (Spearman) entre duas premissas, de −0,95 a 0,95. */
export interface Correlacao { a: string; b: string; rho: number; origem?: string; fonte?: string }

export type Valores = Record<string, number | string>;

export type Medida = 'margem' | 'faturamento' | 'volume';

/** O que um modelo devolve para um sorteio e uma opção. */
export interface Saida {
  margem: number;
  faturamento?: number;
  volume?: number;
  /** Ganho por alavanca, quando o modelo tem alavancas em cascata (soma = margem). */
  contribuicoes?: Record<string, number>;
  faltouCapacidade?: boolean;
  volumePerdido?: number;
}

export interface Opcao {
  codigo: string;
  descricao?: string;
  parametros?: Record<string, unknown>;
  e_manter?: boolean;
  /** Meta de margem ou faturamento no horizonte da Nota. */
  meta?: { medida: Medida; valor: number };
}

export type Regra = 'max_media' | 'max_p50' | 'max_prob_ganho' | 'max_p50_com_risco';
export interface Criterio { regra: Regra; limite_risco?: number }

/** Bloco `capacidade`: recurso, unidade, capacidade por mês, uso por venda e custo da unidade extra. */
export interface Capacidade {
  recurso: string;
  unidade?: string;
  capacidade_mes: number;
  uso_por_venda: number;
  custo_unidade_extra?: number | null;
}

export interface Modelo {
  codigo: string;
  /** Avalia uma opção em um sorteio. Precisa ser determinístico: mesmos valores, mesma saída. */
  avaliar(valores: Valores, opcao: Opcao): Saida;
  /** Ordem das alavancas, quando houver contribuições. */
  alavancas?: string[];
}

export interface Estatisticas {
  media: number;
  p10: number;
  p50: number;
  p90: number;
  minimo: number;
  maximo: number;
  prob_positivo: number;
  prob_prejuizo: number;
  prob_meta: number | null;
  histograma: { de: number; ate: number; n: number }[];
  frase: string;
}

export interface ResultadoOpcao {
  codigo: string;
  descricao?: string;
  e_manter?: boolean;
  medidas: Partial<Record<Medida, Estatisticas>>;
  contribuicoes: { alavanca: string; media: number }[];
  prob_falta_capacidade: number;
  volume_perdido_medio: number;
}

export interface LinhaSensibilidade { opcao: string; premissa: string; resultado_no_p10: number; resultado_no_p90: number; amplitude: number; ordem: number }

export interface Escolha {
  regra: Regra;
  limite_risco: number;
  opcao: string | null;
  /** O que cada regra escolheria. */
  por_regra: Record<Regra, string | null>;
}

export interface ResultadoSimulacao {
  versao_servico: string;
  semente: number;
  sorteios: number;
  opcoes: ResultadoOpcao[];
  escolha: Escolha;
  sensibilidade: LinhaSensibilidade[];
  duracao_ms?: number;
}
