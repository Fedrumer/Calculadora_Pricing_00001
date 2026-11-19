import type { Estatisticas } from './tipos.ts';

/** Quantil amostral com interpolação linear entre vizinhos, como o percentile_cont do Postgres. */
export function quantilAmostral(ordenado: ArrayLike<number>, p: number): number {
  const n = ordenado.length;
  if (!n) return NaN;
  const i = (n - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return ordenado[lo]! + (ordenado[hi]! - ordenado[lo]!) * (i - lo);
}

/** "em 76 de cada 100 cenários" */
export const frequenciaNatural = (p: number) => `em ${Math.round(p * 100)} de cada 100 cenários`;

export function estatisticas(valores: Float64Array, meta?: number | null, faixas = 20): Estatisticas {
  const n = valores.length;
  const s = Float64Array.from(valores).sort();
  let soma = 0, pos = 0, neg = 0, naMeta = 0;
  for (let i = 0; i < n; i++) {
    const v = valores[i]!;
    soma += v;
    if (v > 0) pos++;
    if (v < 0) neg++;
    if (meta != null && v >= meta) naMeta++;
  }
  const min = s[0]!, max = s[n - 1]!;
  const largura = (max - min) / faixas || 1;
  const contagem = new Array<number>(faixas).fill(0);
  for (let i = 0; i < n; i++) contagem[Math.min(faixas - 1, Math.floor((valores[i]! - min) / largura))]!++;
  return {
    media: soma / n,
    p10: quantilAmostral(s, 0.1),
    p50: quantilAmostral(s, 0.5),
    p90: quantilAmostral(s, 0.9),
    minimo: min,
    maximo: max,
    prob_positivo: pos / n,
    prob_prejuizo: neg / n,
    prob_meta: meta == null ? null : naMeta / n,
    histograma: contagem.map((c, i) => ({ de: min + i * largura, ate: min + (i + 1) * largura, n: c })),
    frase: frequenciaNatural(pos / n),
  };
}

/** Correlação de postos de Spearman (sem tratamento de empates; para conferência). */
export function spearman(x: ArrayLike<number>, y: ArrayLike<number>): number {
  const postos = (v: ArrayLike<number>) => {
    const idx = Array.from({ length: v.length }, (_, i) => i).sort((a, b) => v[a]! - v[b]!);
    const r = new Float64Array(v.length);
    idx.forEach((k, i) => { r[k] = i; });
    return r;
  };
  const rx = postos(x), ry = postos(y), n = x.length;
  const m = (n - 1) / 2;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = rx[i]! - m, b = ry[i]! - m; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxy / Math.sqrt(sxx * syy);
}
