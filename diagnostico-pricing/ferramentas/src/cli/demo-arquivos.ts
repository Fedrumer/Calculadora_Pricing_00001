// Grava os seis arquivos da empresa fictícia, no formato em que um cliente os enviaria.
//   pnpm demo:arquivos -- ./pasta
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { RAIZ } from '../banco.ts';
import { type Demo, NOMES_ARQUIVO, gerarDemo, paraCsv } from '../demo.ts';

const destino = resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? join(RAIZ, '.local/arquivos-demo'));
mkdirSync(destino, { recursive: true });
const demo = gerarDemo();
for (const bloco of Object.keys(demo) as (keyof Demo)[]) {
  writeFileSync(join(destino, NOMES_ARQUIVO[bloco]), paraCsv(bloco, demo[bloco]));
  console.log(`${NOMES_ARQUIVO[bloco].padEnd(26)} ${demo[bloco].length} linhas`);
}
console.log(`\nArquivos em ${destino}`);
