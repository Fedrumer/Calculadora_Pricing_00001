export const moeda = (v: number | null | undefined, m = 'BRL') =>
  v === null || v === undefined ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: m, maximumFractionDigits: 0 }).format(v);

/** Moeda abreviada para gráficos e indicadores: R$ 13,1 mi, R$ 84 mil. */
export const moedaCurta = (v: number | null | undefined) => {
  if (v === null || v === undefined) return '—';
  const a = Math.abs(v);
  const n = (x: number, casas: number) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(x);
  if (a >= 1e6) return `R$ ${n(v / 1e6, a >= 1e7 ? 1 : 2)} mi`;
  if (a >= 1e3) return `R$ ${n(v / 1e3, a >= 1e5 ? 0 : 1)} mil`;
  return `R$ ${n(v, 0)}`;
};

export const numero = (v: number | null | undefined, casas = 0) =>
  v === null || v === undefined ? '—' : new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(v);

export const pct = (v: number | null | undefined, casas = 1) => (v === null || v === undefined ? '—' : `${numero(v, casas)}%`);

export const data = (v: string | Date | null | undefined) => {
  if (!v) return '—';
  const texto = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00` : v;
  return new Intl.DateTimeFormat('pt-BR').format(new Date(texto));
};

export const dataHora = (v: string | Date | null | undefined) =>
  v ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(v)) : '—';

export const ROTULO_STATUS: Record<string, string> = { rascunho: 'Rascunho', validado: 'Dados validados', calculado: 'Calculado', publicado: 'Publicado' };
export const ROTULO_PERFIL: Record<string, string> = { consultor: 'Consultor', cliente_editor: 'Cliente (envia dados)', cliente_leitor: 'Cliente (leitura)' };
export const ROTULO_DIMENSAO: Record<string, string> = {
  realizacao: 'Realização de preço', margem: 'Margem', dispersao: 'Dispersão', cambio: 'Câmbio', capacidade: 'Capacidade', canal: 'Canal', governanca: 'Governança', geral: 'Nota geral',
};
export const ROTULO_SEGMENTO: Record<string, string> = {
  distribuicao: 'Distribuição', industria: 'Indústria', varejo_b2b: 'Varejo B2B', operadora: 'Operadora de turismo', consolidadora: 'Consolidadora', mga: 'MGA',
};
export const SEGMENTOS_TURISMO = ['operadora', 'consolidadora'];
export const ROTULO_CENARIO: Record<string, string> = { conservador: 'Conservador', base: 'Base', agressivo: 'Agressivo' };
export const ROTULO_BLOCO: Record<string, string> = {
  transacoes: 'Transações', custos: 'Custos', produtos: 'Cadastro de produtos', contas: 'Cadastro de clientes',
  custos_servir: 'Custos de servir', descontos_fora_fatura: 'Descontos fora da fatura', bloqueios: 'Bloqueios', capacidade: 'Capacidade',
};
export const ROTULO_RECORTE: Record<string, string> = { canal: 'Canal', segmento: 'Segmento', categoria: 'Categoria', regiao: 'Região', vendedor: 'Vendedor', produto: 'Produto', conta: 'Conta', fornecedor: 'Fornecedor' };
export const ROTULO_PREMISSA: Record<string, { rotulo: string; dica: string }> = {
  percentil_piso: { rotulo: 'Piso da banda (percentil)', dica: 'Percentil do preço por conta que define o piso' },
  fechamento: { rotulo: 'Fechamento da distância', dica: 'Parcela da distância até o piso que o ajuste fecha (0 a 1)' },
  elasticidade: { rotulo: 'Elasticidade', dica: 'Negativa: -1 significa perder 1% de volume a cada 1% de aumento' },
  captura: { rotulo: 'Taxa de captura', dica: 'Parcela do ajuste que a equipe comercial implementa (0 a 1)' },
  margem_alvo_pct: { rotulo: 'Margem-alvo (%)', dica: 'Produtos com pocket margin abaixo deste valor recebem o reajuste' },
  aumento_pct: { rotulo: 'Aumento (%)', dica: 'Reajuste aplicado aos produtos abaixo da margem-alvo' },
};
