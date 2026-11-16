export const moeda = (v: number | null | undefined, m = 'BRL') =>
  v === null || v === undefined ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: m }).format(v);

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

export const hojeIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

export const ROTULO_STATUS: Record<string, string> = {
  rascunho: 'Rascunho',
  em_aprovacao: 'Em aprovação',
  recusada: 'Recusada',
  aprovada: 'Aprovada',
  emitida: 'Emitida',
  aceita: 'Aceita',
  perdida: 'Perdida',
  expirada: 'Expirada',
  cancelada: 'Cancelada',
  publicada: 'Publicada',
  arquivada: 'Arquivada',
  pendente: 'Pendente',
  ativo: 'Ativo',
  suspenso: 'Suspenso',
  desativado: 'Desativado',
};

export const ROTULO_PAPEL: Record<string, string> = {
  admin: 'Administrador',
  gestor_pricing: 'Gestor de pricing',
  aprovador: 'Aprovador',
  vendedor: 'Vendedor',
  canal: 'Usuário de canal',
  leitura: 'Leitura',
  suporte: 'Suporte da consultoria',
};

export const mesCurto = (aaaaMm: string) => {
  const [a, m] = aaaaMm.split('-');
  return `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(m) - 1]}/${a!.slice(2)}`;
};
