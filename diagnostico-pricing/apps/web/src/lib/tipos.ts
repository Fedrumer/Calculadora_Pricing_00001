import type { Degrau } from '@/componentes/graficos';

export interface Metrica { codigo: string; dimensao: string; nome: string; unidade: string; descricao: string; limiar_bom: number | null; limiar_ruim: number | null; valor: number | null; detalhe: Record<string, any> | null }
export interface Pontuacao { dimensao: string; nota: number | null; parcial: boolean; detalhe: any }
export interface Achado { regra: string; dimensao: string; titulo: string; descricao: string; alavanca: string | null; alavanca_nome: string | null; valor_exposto: number | null; evidencia: Record<string, any> }
export interface Cenario {
  codigo: string;
  ganho_total_anual: number;
  alavancas: { alavanca: string; nome: string; ordem: number; ganho_anual: number; receita_afetada: number; itens: number }[];
  premissas: { alavanca: string; chave: string; valor: number; origem: 'padrao' | 'informada' }[];
}
export interface Recorte { valor: string; vazamento_pct: number; rec_lista: number; rec_faturada: number; rec_pocket: number; desconto_fatura_pct: number; transacoes: number; margem_pocket: number | null; margem_pocket_pct: number | null }
export interface Qualidade { bloco: string; obrigatorio: boolean; presente: boolean; linhas: number; nota: number | null }
export interface Validacao { bloco: string; regra: string; severidade: 'erro' | 'alerta'; ocorrencias: number; total: number | null; mensagem: string }

export interface Painel {
  diagnostico: { id: string; nome: string; status: string; periodo_inicio: string; periodo_fim: string; calculado_em: string | null; versao_catalogo: number | null; versao_publicada: number | null; publicado_em: string | null; precos_liquidos_de_impostos: boolean; segmento?: string | null; tipo?: string; cliente: { id: string; nome: string; setor: string; moeda: string } };
  base: { linhas: number; inicio: string; fim: string; dias: number; rec_lista: number; rec_faturada: number; rec_pocket: number } | null;
  pontuacoes: Pontuacao[];
  metricas: Metrica[];
  cascata: Degrau[];
  recortes: Record<string, Recorte[]>;
  achados: Achado[];
  cenarios: Cenario[];
  qualidade: Qualidade[];
  validacoes: Validacao[];
  publicacao?: { versao: number; publicado_em: string };
}

export interface DadosDiagnostico {
  diagnostico: { id: string; nome: string; status: string; periodo_inicio: string; periodo_fim: string; cliente: string; versao_publicada: number | null; segmento?: string | null };
  uploads: { id: string; bloco: string; arquivo: string; linhas: number; status: string; criado_em: string; mapeamento: Record<string, string> }[];
  qualidade: Qualidade[];
  validacoes: Validacao[];
}
