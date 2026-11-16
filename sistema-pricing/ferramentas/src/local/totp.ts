import { createHmac, randomBytes } from 'node:crypto';

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function segredoBase32(bytes = 20): string {
  let bits = '';
  for (const b of randomBytes(bytes)) bits += b.toString(2).padStart(8, '0');
  return (bits.match(/.{5}/g) ?? []).map((g) => ALFABETO[parseInt(g, 2)]).join('');
}

function deBase32(texto: string): Buffer {
  let bits = '';
  for (const c of texto.replace(/=+$/, '').toUpperCase()) bits += ALFABETO.indexOf(c).toString(2).padStart(5, '0');
  return Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
}

/** Código TOTP (RFC 6238, SHA-1, 6 dígitos, 30 s). */
export function totp(segredo: string, quando = Date.now(), deslocamento = 0): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(Math.floor(quando / 30000) + deslocamento));
  const h = createHmac('sha1', deBase32(segredo)).update(contador).digest();
  const o = h[h.length - 1]! & 0xf;
  const n = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(n % 1_000_000).padStart(6, '0');
}

export const totpConfere = (segredo: string, codigo: string) => [-1, 0, 1].some((d) => totp(segredo, Date.now(), d) === codigo);
