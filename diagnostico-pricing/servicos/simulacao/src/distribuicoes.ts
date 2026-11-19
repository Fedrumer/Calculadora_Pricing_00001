import { normalInversa } from './normal.ts';
import type { Distribuicao, Premissa } from './tipos.ts';

/** Valor da premissa para a uniforme u. Discretas devolvem o rótulo escolhido. */
export function quantil(d: Distribuicao, u: number): number | string {
  switch (d.tipo) {
    case 'fixa': return d.valor;
    case 'quantis': return quantilPorQuantis(d.p10, d.p50, d.p90, d.minimo, d.maximo, u);
    case 'triangular': {
      const { minimo: a, moda: m, maximo: b } = d;
      if (b === a) return a;
      const f = (m - a) / (b - a);
      return u < f ? a + Math.sqrt(u * (b - a) * (m - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - m));
    }
    case 'lognormal': return d.media * Math.exp(d.sigma * normalInversa(u) - (d.sigma * d.sigma) / 2);
    case 'discreta': {
      let acc = 0;
      for (const o of d.opcoes) { acc += o.prob; if (u < acc) return o.valor; }
      return d.opcoes.at(-1)?.valor ?? '';
    }
    case 'reacao': {
      if (u >= d.chance) return 'ignorar';
      const total = Object.values(d.tipos).reduce((s, x) => s + x, 0) || 1;
      let acc = 0;
      const v = u / d.chance;
      const tipos = Object.entries(d.tipos);
      for (const [t, peso] of tipos) { acc += peso / total; if (v < acc) return t; }
      return tipos.at(-1)?.[0] ?? 'ignorar';
    }
  }
}

/**
 * Função quantil linear por partes entre (0; mínimo), (0,1; P10), (0,5; P50), (0,9; P90) e (1; máximo).
 * Sem mínimo ou máximo, a reta vizinha continua com a mesma inclinação.
 */
export function quantilPorQuantis(p10: number, p50: number, p90: number, minimo: number | null | undefined, maximo: number | null | undefined, u: number): number {
  const min = minimo ?? p10 - (p50 - p10) * 0.25;
  const max = maximo ?? p90 + (p90 - p50) * 0.25;
  if (u <= 0.1) return min + (p10 - min) * (u / 0.1);
  if (u <= 0.5) return p10 + (p50 - p10) * ((u - 0.1) / 0.4);
  if (u <= 0.9) return p50 + (p90 - p50) * ((u - 0.5) / 0.4);
  return p90 + (max - p90) * ((u - 0.9) / 0.1);
}

export function valorPremissa(p: Premissa, u: number): number | string {
  const v = quantil(p.distribuicao, u);
  if (typeof v !== 'number') return v;
  const lo = p.limites?.minimo, hi = p.limites?.maximo;
  return Math.min(hi ?? Infinity, Math.max(lo ?? -Infinity, v));
}

export const eDiscreta = (p: Premissa) => p.distribuicao.tipo === 'discreta' || p.distribuicao.tipo === 'reacao';
export const eFixa = (p: Premissa) => p.distribuicao.tipo === 'fixa';

/** Confere a ordem dos quantis; devolve a mensagem do problema ou null. */
export function conferirPremissa(p: Premissa): string | null {
  const d = p.distribuicao;
  if (d.tipo === 'quantis' && !(d.p10 <= d.p50 && d.p50 <= d.p90)) return `${p.chave}: P10, P50 e P90 fora de ordem`;
  if (d.tipo === 'quantis' && ((d.minimo != null && d.minimo > d.p10) || (d.maximo != null && d.maximo < d.p90))) return `${p.chave}: mínimo e máximo precisam cercar P10 e P90`;
  if (d.tipo === 'triangular' && !(d.minimo <= d.moda && d.moda <= d.maximo)) return `${p.chave}: mínimo, provável e máximo fora de ordem`;
  if (d.tipo === 'lognormal' && !(d.media > 0 && d.sigma >= 0)) return `${p.chave}: média e volatilidade precisam ser positivas`;
  if (d.tipo === 'reacao' && !(d.chance >= 0 && d.chance <= 1)) return `${p.chave}: a chance de reação vai de 0 a 1`;
  if (d.tipo === 'discreta' && Math.abs(d.opcoes.reduce((s, o) => s + o.prob, 0) - 1) > 1e-9) return `${p.chave}: as probabilidades precisam somar 1`;
  return null;
}
