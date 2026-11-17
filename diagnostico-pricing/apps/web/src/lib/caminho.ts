/** Prefixo quando a aplicação é servida em uma subpasta (GitHub Pages). */
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** Navegação com recarga completa, respeitando o prefixo. */
export function irPara(caminho: string) {
  window.location.href = `${BASE}${caminho}`;
}
