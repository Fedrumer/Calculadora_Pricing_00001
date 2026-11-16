// Aritmética decimal em ponto fixo (BigInt, 10 casas). Nenhum valor monetário
// passa por ponto flutuante durante o cálculo; a conversão para number acontece
// só na saída, depois do arredondamento definido na política.

export type Dec = bigint;
export type ModoArredondamento = 'meio_para_cima' | 'meio_par' | 'para_cima' | 'para_baixo';

const CASAS = 10;
const ESCALA = 10n ** BigInt(CASAS);

export const ZERO: Dec = 0n;
export const UM: Dec = ESCALA;
export const CEM: Dec = 100n * ESCALA;

export function dec(v: number | string | bigint): Dec {
  if (typeof v === 'bigint') return v * ESCALA;
  let s = typeof v === 'number' ? numeroParaTexto(v) : v.trim().replace(',', '.');
  if (!/^[+-]?\d*(\.\d*)?$/.test(s) || s === '' || s === '.' || s === '-' || s === '+') {
    throw new RangeError(`Valor decimal inválido: ${String(v)}`);
  }
  const negativo = s.startsWith('-');
  s = s.replace(/^[+-]/, '');
  const [inteiro = '0', fracao = ''] = s.split('.');
  const fr = (fracao + '0'.repeat(CASAS)).slice(0, CASAS);
  const valor = BigInt(inteiro || '0') * ESCALA + BigInt(fr || '0');
  return negativo ? -valor : valor;
}

function numeroParaTexto(v: number): string {
  if (!Number.isFinite(v)) throw new RangeError(`Valor numérico inválido: ${v}`);
  return v.toFixed(CASAS);
}

function divArredondada(numerador: bigint, denominador: bigint): bigint {
  if (denominador === 0n) throw new RangeError('Divisão por zero');
  const negativo = numerador < 0n !== denominador < 0n;
  const n = numerador < 0n ? -numerador : numerador;
  const d = denominador < 0n ? -denominador : denominador;
  const q = (n * 2n + d) / (d * 2n);
  return negativo ? -q : q;
}

export const somar = (a: Dec, b: Dec): Dec => a + b;
export const subtrair = (a: Dec, b: Dec): Dec => a - b;
export const multiplicar = (a: Dec, b: Dec): Dec => divArredondada(a * b, ESCALA);
export const dividir = (a: Dec, b: Dec): Dec => divArredondada(a * ESCALA, b);
/** Aplica um percentual (ex.: 12.5 significa 12,5%) sobre um valor. */
export const percentualDe = (valor: Dec, pct: Dec): Dec => divArredondada(valor * pct, CEM);

export function arredondar(v: Dec, casas: number, modo: ModoArredondamento = 'meio_para_cima'): Dec {
  if (casas < 0 || casas > CASAS) throw new RangeError(`Casas decimais fora do intervalo: ${casas}`);
  const passo = 10n ** BigInt(CASAS - casas);
  const negativo = v < 0n;
  const abs = negativo ? -v : v;
  let q = abs / passo;
  const resto = abs % passo;
  if (resto !== 0n) {
    const dobro = resto * 2n;
    if (modo === 'para_cima') q += 1n;
    else if (modo === 'meio_para_cima') {
      if (dobro >= passo) q += 1n;
    } else if (modo === 'meio_par') {
      if (dobro > passo || (dobro === passo && q % 2n === 1n)) q += 1n;
    }
  }
  const r = q * passo;
  return negativo ? -r : r;
}

export function paraNumero(v: Dec): number {
  return Number(paraTexto(v));
}

export function paraTexto(v: Dec, casas?: number): string {
  const negativo = v < 0n;
  const abs = negativo ? -v : v;
  const inteiro = abs / ESCALA;
  let fracao = (abs % ESCALA).toString().padStart(CASAS, '0');
  if (casas === undefined) fracao = fracao.replace(/0+$/, '');
  else fracao = fracao.slice(0, casas);
  const texto = fracao.length > 0 ? `${inteiro}.${fracao}` : `${inteiro}`;
  return negativo && abs !== 0n ? `-${texto}` : texto;
}
