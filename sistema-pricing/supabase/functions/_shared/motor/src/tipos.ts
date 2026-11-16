// Contratos do motor. O motor não conhece "região" ou "faixa etária": ele recebe
// as dimensões, os produtos, a tabela e a política que cada cliente cadastrou.

import type { ModoArredondamento } from './decimal.ts';

export type ValorDimensao = string | number;

export interface DefinicaoDimensao {
  codigo: string;
  nome: string;
  /** categoria: lista fechada de valores. faixa: número enquadrado em intervalos. */
  tipo: 'categoria' | 'faixa';
  valores?: { codigo: string; nome: string }[];
  /** Intervalos fechados [min, max]; max nulo significa "sem teto". */
  faixas?: { codigo: string; nome?: string; min: number; max: number | null }[];
}

export interface Componente {
  codigo: string;
  nome: string;
  obrigatorio: boolean;
  ativo: boolean;
}

export interface Produto {
  codigo: string;
  nome: string;
  ativo: boolean;
  /** Dimensões que o pedido precisa informar para este produto. */
  dimensoes: string[];
  /** Dimensões numéricas cujo valor bruto multiplica o preço (dias, quantidade, vidas). */
  multiplicadores: string[];
  componentes: Componente[];
}

export interface ItemTabela {
  produto: string;
  componente: string | null;
  /** Combinação de dimensões; chave ausente ou "*" vale para qualquer valor. */
  dimensoes: Record<string, string>;
  precoBase: number | string;
}

export interface Fator {
  codigo: string;
  nome: string;
  dimensao: string;
  /** Código da categoria/faixa, ou "*". */
  valor: string;
  tipo: 'percentual' | 'valor';
  /** +10 = acréscimo de 10% (ou de 10 unidades monetárias); negativo reduz. */
  ajuste: number | string;
  produto?: string | null;
  grupo?: string | null;
}

export interface TabelaPreco {
  id: string;
  versao: number;
  moeda: string;
  itens: ItemTabela[];
  fatores: Fator[];
}

export interface Campanha {
  codigo: string;
  nome: string;
  inicio: string;
  fim: string;
  tipo: 'percentual' | 'valor';
  valor: number | string;
  produtos?: string[] | null;
  canais?: string[] | null;
  condicoes?: Record<string, string[]> | null;
  acumulaComDesconto: boolean;
  acumulaComOutras: boolean;
}

/** Sobre o que um percentual incide. */
export interface BaseIncidencia {
  /** "preco" = preço corrente; ou o id de uma etapa anterior (preço logo após ela). */
  de: string;
  /** Ids de etapas de dedução ou códigos de parâmetro de custo a subtrair da base. */
  menos?: string[];
}

export interface ParametroCusto {
  codigo: string;
  nome: string;
  categoria: 'imposto' | 'cobranca' | 'custo_variavel';
  tipo: 'percentual' | 'valor_fixo' | 'valor_por_unidade';
  valor: number | string;
  produto?: string | null;
  base?: BaseIncidencia | null;
}

interface EtapaBase {
  id: string;
  nome?: string;
}

export type Etapa = EtapaBase &
  (
    | { tipo: 'preco_base' }
    | { tipo: 'fatores'; composicao: 'multiplicativa' | 'aditiva'; grupo?: string }
    | { tipo: 'campanha' }
    | { tipo: 'desconto' }
    | { tipo: 'comissao'; base: BaseIncidencia; modo: 'deduz_da_margem' | 'acrescenta_ao_preco' }
    | { tipo: 'impostos'; base: BaseIncidencia }
    | { tipo: 'custos'; base: BaseIncidencia }
    | { tipo: 'arredondamento' }
    | { tipo: 'extensao'; funcao: string; parametros?: Record<string, unknown> }
  );

export interface Alcada {
  nivel: number;
  nome: string;
  descontoAtePct: number;
  /** Piso de margem que este nível pode liberar; ausente = margem mínima da política. */
  margemMinimaPct?: number;
  permiteComissaoForaTabela?: boolean;
}

export interface Politica {
  id: string;
  versao: number;
  etapas: Etapa[];
  arredondamento: { casas: number; modo: ModoArredondamento };
  limites: {
    descontoLivrePct: number;
    descontoMaximoPct: number;
    margemMinimaPct: number;
    margemMetaPct: number;
  };
  alcadas: Alcada[];
  comissoes: { canal: string; produto?: string | null; pct: number }[];
  validadeDias: number;
  prazoAprovacaoHoras: number;
}

export interface ConjuntoRegras {
  dimensoes: DefinicaoDimensao[];
  produtos: Produto[];
  tabela: TabelaPreco;
  politica: Politica;
  custos: ParametroCusto[];
  campanhas: Campanha[];
}

export interface PedidoCotacao {
  produto: string;
  /** Componentes opcionais escolhidos; os obrigatórios entram sempre. */
  componentes?: string[];
  dimensoes: Record<string, ValorDimensao>;
  descontoPct?: number;
  canal?: string | null;
  /** Comissão negociada; ausente = comissão da tabela do canal. */
  comissaoPct?: number | null;
  /** Data de referência (AAAA-MM-DD). O motor não lê o relógio. */
  data: string;
}

export interface LinhaDetalhe {
  etapa: string;
  tipo: string;
  descricao: string;
  base?: number;
  percentual?: number;
  valor: number;
  precoApos: number;
  /** true = só perfis internos enxergam (custos, impostos, margem). */
  interno: boolean;
}

export interface MotivoVeredito {
  codigo:
    | 'DESCONTO_ACIMA_DO_LIVRE'
    | 'DESCONTO_ACIMA_DO_MAXIMO'
    | 'MARGEM_ABAIXO_DA_META'
    | 'MARGEM_ABAIXO_DO_MINIMO'
    | 'COMISSAO_FORA_DA_TABELA'
    | 'SEM_ALCADA_SUFICIENTE'
    | 'FORA_DA_POLITICA';
  mensagem: string;
  limite?: number;
  valor?: number;
  interno: boolean;
}

export interface Veredito {
  status: 'dentro' | 'exige_aprovacao' | 'bloqueado';
  /** Semáforo de política, pronto para a tela. */
  cor: 'verde' | 'amarelo' | 'vermelho';
  nivelAlcada: number | null;
  nomeAlcada: string | null;
  motivos: MotivoVeredito[];
}

export interface Resultado {
  moeda: string;
  precoBase: number;
  precoFinal: number;
  multiplicador: number;
  componentes: string[];
  dimensoesResolvidas: Record<string, string>;
  descontoPct: number;
  descontoValor: number;
  campanhas: string[];
  campanhaValor: number;
  canal: string | null;
  comissaoPct: number;
  comissaoTabelaPct: number;
  comissaoValor: number;
  comissaoForaTabela: boolean;
  impostosValor: number;
  custosValor: number;
  receitaLiquida: number;
  margemValor: number;
  margemPct: number;
  veredito: Veredito;
  detalhamento: LinhaDetalhe[];
  versoes: { motor: string; tabela: { id: string; versao: number }; politica: { id: string; versao: number } };
  avisos: string[];
}

/** Projeção do resultado para perfis externos (canal): sem custo, imposto ou margem. */
export type ResultadoPublico = Omit<
  Resultado,
  'impostosValor' | 'custosValor' | 'receitaLiquida' | 'margemValor' | 'margemPct'
>;

/** Contexto entregue a uma função de extensão. Só leitura e aritmética pura. */
export interface ContextoExtensao {
  pedido: PedidoCotacao;
  regras: ConjuntoRegras;
  preco: number;
  multiplicador: number;
  dimensoesResolvidas: Record<string, string>;
  parametros: Record<string, unknown>;
}

export interface RetornoExtensao {
  /** Novo preço corrente (opcional). */
  preco?: number | string;
  /** Valor a deduzir da margem, registrado sob o id da etapa (opcional). */
  deducao?: number | string;
  descricao?: string;
  interno?: boolean;
}

export type FuncaoExtensao = (ctx: ContextoExtensao) => RetornoExtensao;

export interface OpcoesCalculo {
  extensoes?: Record<string, FuncaoExtensao>;
}
