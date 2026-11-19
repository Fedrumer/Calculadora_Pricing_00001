// Tipos reajuste e desconto: muda o preço em Δ, o volume reage pela elasticidade (forma constante ou linear),
// pode haver volume adicional sorteado (por exemplo, de um serviço novo) e a capacidade limita a venda.
// Custos proporcionais ao preço (comissão, impostos) caem junto com o preço, então a margem nova é calculada direto.
import type { Capacidade, Modelo } from '../tipos.ts';
import { type FormaElasticidade, aplicarCapacidade, fatorVolume, num } from './comum.ts';

export interface DadosPreco {
  volume: number;
  preco: number;
  /** Custo por unidade que não depende do preço. */
  custo_unitario: number;
  /** Parcela do preço que é custo (comissão e impostos), de 0 a 1. */
  custos_proporcionais_pct?: number;
  custo_fixo_adicional?: number;
  capacidade?: Capacidade | null;
  forma_elasticidade?: FormaElasticidade;
}

export const margemUnitaria = (d: DadosPreco, variacao: number) => d.preco * (1 + variacao) * (1 - (d.custos_proporcionais_pct ?? 0)) - d.custo_unitario;

/** Volume que mantém a margem total depois da mudança de preço, com a estrutura de custo do cliente. */
export function equilibrioVolume(d: DadosPreco, variacao: number): number | null {
  const nova = margemUnitaria(d, variacao);
  if (nova <= 0) return null;
  return (margemUnitaria(d, 0) * d.volume + (d.custo_fixo_adicional ?? 0)) / nova / d.volume - 1;
}

export function modeloPreco(d: DadosPreco): Modelo {
  const forma = d.forma_elasticidade ?? 'constante';
  const base = margemUnitaria(d, 0) * d.volume;
  return {
    codigo: 'preco',
    avaliar(v, o) {
      const dp = num(v, o, 'variacao_preco', 0);
      const e = dp === 0 ? 0 : num(v, o, 'elasticidade');
      const adicional = num(v, o, 'volume_adicional_pct', 0);
      const desejado = d.volume * fatorVolume(forma, e, dp) * (1 + adicional);
      const cap = aplicarCapacidade(d.capacidade, desejado);
      const margem = cap.volume * margemUnitaria(d, dp) - cap.custoExtra - (d.custo_fixo_adicional ?? 0) - base;
      return { margem, faturamento: cap.volume * d.preco * (1 + dp) - d.volume * d.preco, volume: cap.volume - d.volume, faltouCapacidade: cap.faltou, volumePerdido: cap.perdido };
    },
  };
}
