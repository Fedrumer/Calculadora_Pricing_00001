// Criptografia com Web Crypto (igual em Deno e Node): hash de tokens e chaves,
// HMAC de documentos e cifra de coluna para dado pessoal.

const enc = new TextEncoder();
const dec = new TextDecoder();

const hex = (b: ArrayBuffer | Uint8Array) =>
  Array.from(b instanceof Uint8Array ? b : new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');

function b64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function deB64(texto: string): Uint8Array {
  return Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));
}

export async function sha256(texto: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(texto)));
}

export async function hmac(segredo: string, texto: string): Promise<string> {
  const chave = await crypto.subtle.importKey('raw', enc.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', chave, enc.encode(texto)));
}

/** Token aleatório seguro para URL (convite, chave de API). */
export function tokenAleatorio(bytes = 32): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return b64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function chaveAes(segredo: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest('SHA-256', enc.encode(segredo));
  return crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Cifra AES-256-GCM; devolve "v1.<iv>.<cifrado>" em base64. */
export async function cifrar(segredo: string, texto: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cifrado = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await chaveAes(segredo), enc.encode(texto));
  return `v1.${b64(iv)}.${b64(new Uint8Array(cifrado))}`;
}

export async function decifrar(segredo: string, pacote: string): Promise<string> {
  const [versao, iv, cifrado] = pacote.split('.');
  if (versao !== 'v1' || !iv || !cifrado) throw new Error('Formato de dado cifrado desconhecido.');
  const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(iv) as BufferSource }, await chaveAes(segredo), deB64(cifrado) as BufferSource);
  return dec.decode(claro);
}

export const soDigitos = (texto: string) => texto.replace(/\D/g, '');

/** Mascara documento para exibição e para envio à IA: ***.***.***-12 */
export function mascararDocumento(documento: string): string {
  const d = soDigitos(documento);
  return d.length <= 2 ? '**' : `${'*'.repeat(d.length - 2)}${d.slice(-2)}`;
}

/** Comparação em tempo constante. */
export function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
