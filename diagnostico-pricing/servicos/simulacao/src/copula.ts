import { normalAcumulada, normalInversa } from './normal.ts';
import type { Correlacao } from './tipos.ts';

/** Correlação de postos desejada (ρs) para a correlação das normais: r = 2 sen(π ρs ÷ 6). */
export const rhoNormal = (rhoSpearman: number) => 2 * Math.sin((Math.PI * rhoSpearman) / 6);

/** Decomposição de Cholesky; devolve null se a matriz não for positiva definida. */
export function cholesky(m: number[][]): number[][] | null {
  const n = m.length;
  const l = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = m[i]![j]!;
      for (let k = 0; k < j; k++) s -= l[i]![k]! * l[j]![k]!;
      if (i === j) {
        if (s <= 1e-12) return null;
        l[i]![i] = Math.sqrt(s);
      } else l[i]![j] = s / l[j]![j]!;
    }
  }
  return l;
}

export class MatrizIncoerente extends Error {
  constructor(public par: [string, string]) {
    super(`As correlações não formam uma matriz coerente (positiva definida). O par que torna o conjunto incoerente é ${par[0]} e ${par[1]}.`);
  }
}

const identidade = (n: number): number[][] => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));

/**
 * Monta o fator de Cholesky das premissas na ordem dada. Com todas as correlações nulas devolve null
 * (sorteio independente, idêntico à simulação sem correlação). Se a matriz não for positiva definida,
 * recusa e aponta o par incoerente; não corrige sozinho.
 */
export function fatorCorrelacao(chaves: string[], correlacoes: Correlacao[]): number[][] | null {
  const idx = new Map(chaves.map((c, i) => [c, i]));
  const validas = correlacoes.filter((c) => c.rho !== 0);
  for (const c of validas) {
    if (!idx.has(c.a) || !idx.has(c.b)) throw new Error(`Correlação com premissa desconhecida: ${c.a} e ${c.b}.`);
    if (c.a === c.b) throw new Error(`Correlação de ${c.a} com ela mesma.`);
    if (!(c.rho >= -0.95 && c.rho <= 0.95)) throw new Error(`Correlação de ${c.a} e ${c.b} fora de −0,95 a 0,95.`);
  }
  if (!validas.length) return null;
  const n = chaves.length;
  const m = identidade(n);
  for (const c of validas) {
    const i = idx.get(c.a)!, j = idx.get(c.b)!;
    m[i]![j] = m[j]![i] = rhoNormal(c.rho);
  }
  const l = cholesky(m);
  if (l) return l;
  // Incoerente. Primeiro procura um trio de premissas com as três correlações informadas que não fecha e aponta
  // o par informado por último nesse trio; sem trio assim, o par que, somado aos anteriores, quebra a matriz.
  const posicao = new Map(validas.map((c, k) => [[idx.get(c.a)!, idx.get(c.b)!].sort((x, y) => x - y).join(','), k]));
  const par = (i: number, j: number) => posicao.get([i, j].sort((x, y) => x - y).join(','));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
    const pares = [par(i, j), par(j, k), par(i, k)];
    if (pares.some((p) => p === undefined)) continue;
    const sub = [[1, m[i]![j]!, m[i]![k]!], [m[j]![i]!, 1, m[j]![k]!], [m[k]![i]!, m[k]![j]!, 1]];
    if (!cholesky(sub)) {
      const ultimo = validas[Math.max(...(pares as number[]))]!;
      throw new MatrizIncoerente([ultimo.a, ultimo.b]);
    }
  }
  const parcial = identidade(n);
  for (const c of validas) {
    const i = idx.get(c.a)!, j = idx.get(c.b)!;
    parcial[i]![j] = parcial[j]![i] = rhoNormal(c.rho);
    if (!cholesky(parcial)) throw new MatrizIncoerente([c.a, c.b]);
  }
  throw new MatrizIncoerente([validas.at(-1)!.a, validas.at(-1)!.b]);
}

/** Transforma, no lugar, as uniformes independentes de um sorteio em uniformes correlacionadas. */
export function correlacionar(u: Float64Array, inicio: number, k: number, l: number[][], z: Float64Array) {
  for (let i = 0; i < k; i++) z[i] = normalInversa(u[inicio + i]!);
  for (let i = 0; i < k; i++) {
    let s = 0;
    const li = l[i]!;
    for (let j = 0; j <= i; j++) s += li[j]! * z[j]!;
    u[inicio + i] = Math.min(1 - 1e-12, Math.max(1e-12, normalAcumulada(s)));
  }
}
