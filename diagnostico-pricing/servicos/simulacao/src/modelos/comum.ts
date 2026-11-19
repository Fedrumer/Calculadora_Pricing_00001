import type { Capacidade, Opcao, Valores } from '../tipos.ts';

export type FormaElasticidade = 'constante' | 'linear';

/**
 * Fator de volume para uma variação de preço Δp ÷ p.
 *   constante: q' = q × (p' ÷ p)^ε, padrão das Notas
 *   linear:    q' = q × (1 + ε × Δp ÷ p), igual a motor.simular (sem volume negativo)
 */
export function fatorVolume(forma: FormaElasticidade, elasticidade: number, variacao: number): number {
  return forma === 'constante' ? Math.pow(1 + variacao, elasticidade) : Math.max(0, 1 + elasticidade * variacao);
}

/** Valor numérico: parâmetro da opção, depois premissa sorteada, depois padrão. */
export function num(valores: Valores, opcao: Opcao, chave: string, padrao?: number): number {
  const v = (opcao.parametros?.[chave] as number | undefined) ?? valores[chave] ?? padrao;
  if (typeof v !== 'number' || Number.isNaN(v)) throw new Error(`Premissa ausente ou não numérica: ${chave}`);
  return v;
}

export function txt(valores: Valores, opcao: Opcao, chave: string, padrao: string): string {
  const v = (opcao.parametros?.[chave] as string | undefined) ?? valores[chave] ?? padrao;
  return String(v);
}

export interface EfeitoCapacidade { volume: number; custoExtra: number; faltou: boolean; perdido: number }

/**
 * Capacidade dentro do sorteio (13.4). O limite em vendas é capacidade por mês ÷ uso por venda.
 * Acima dele, com custo da unidade extra informado, a venda acontece e o custo é cobrado;
 * sem esse custo, o volume acima da capacidade não é vendido.
 */
export function aplicarCapacidade(cap: Capacidade | null | undefined, volume: number): EfeitoCapacidade {
  if (!cap) return { volume, custoExtra: 0, faltou: false, perdido: 0 };
  const limite = cap.capacidade_mes / cap.uso_por_venda;
  if (volume <= limite) return { volume, custoExtra: 0, faltou: false, perdido: 0 };
  const excesso = volume - limite;
  if (cap.custo_unidade_extra != null) return { volume, custoExtra: excesso * cap.uso_por_venda * cap.custo_unidade_extra, faltou: true, perdido: 0 };
  return { volume: limite, custoExtra: 0, faltou: true, perdido: excesso };
}

/** Capacidade livre em vendas, dado o volume atual. */
export const capacidadeLivre = (cap: Capacidade, volumeAtual: number) => cap.capacidade_mes / cap.uso_por_venda - volumeAtual;

/**
 * Equilíbrio (seção 5): variação de volume que mantém a contribuição depois de mudar o preço em p com margem m,
 * −p ÷ (m + p). Margem de 30% e desconto de 5% dão +20%.
 */
export const equilibrioPreco = (margem: number, variacao: number) => -variacao / (margem + variacao);

/** Vendas a mais para pagar um custo fixo novo: custo fixo adicional ÷ margem de contribuição unitária. */
export const equilibrioCustoFixo = (custoFixo: number, margemUnitaria: number) => custoFixo / margemUnitaria;

/** Aviso de 13.4: o volume de equilíbrio passa da capacidade livre. */
export function avisoEquilibrioCapacidade(volumeAdicionalEquilibrio: number, cap: Capacidade | null | undefined, volumeAtual: number): string | null {
  if (!cap) return null;
  const livre = capacidadeLivre(cap, volumeAtual);
  if (volumeAdicionalEquilibrio <= livre) return null;
  return `O equilíbrio pede ${Math.ceil(volumeAdicionalEquilibrio)} vendas a mais, acima da capacidade livre de ${Math.floor(livre)} (${cap.recurso}): a decisão não se paga mesmo que a venda venha.`;
}
