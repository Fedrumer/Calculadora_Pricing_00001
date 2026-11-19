// Gerador de números com semente: xoshiro128** (Blackman e Vigna), semeado por splitmix32.
// Fixado no código: mudar o gerador muda todos os resultados gravados, então muda a versão do serviço.

function splitmix32(semente: number): () => number {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}

const rotl = (x: number, k: number) => ((x << k) | (x >>> (32 - k))) >>> 0;

/** Devolve uma função que sorteia uniformes em (0, 1), nunca 0 nem 1. */
export function xoshiro128ss(semente: number): () => number {
  const sm = splitmix32(semente);
  let a = sm(), b = sm(), c = sm(), d = sm();
  if ((a | b | c | d) === 0) a = 1;
  return () => {
    const r = Math.imul(rotl(Math.imul(b, 5) >>> 0, 7), 9) >>> 0;
    const t = (b << 9) >>> 0;
    c ^= a; d ^= b; b ^= c; a ^= d; c ^= t; d = rotl(d, 11);
    a >>>= 0; b >>>= 0; c >>>= 0;
    return (r + 0.5) / 4294967296;
  };
}
