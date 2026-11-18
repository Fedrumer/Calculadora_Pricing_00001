// Grava os arquivos das empresas fictícias, no formato em que um cliente os enviaria.
//   pnpm demo:arquivos -- ./pasta              (distribuidora)
//   pnpm demo:arquivos -- ./pasta --turismo    (operadora de turismo)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { RAIZ } from '../banco.ts';
import { type Demo, NOMES_ARQUIVO, gerarDemo, paraCsv } from '../demo.ts';
import { type DemoTurismo, NOMES_ARQUIVO_TURISMO, gerarDemoTurismo, paraCsvTurismo } from '../demo-turismo.ts';

const turismo = process.argv.includes('--turismo');
const destino = resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? join(RAIZ, turismo ? '.local/arquivos-demo-turismo' : '.local/arquivos-demo'));
mkdirSync(destino, { recursive: true });
if (turismo) {
  const demo = gerarDemoTurismo();
  for (const bloco of Object.keys(demo) as (keyof DemoTurismo)[]) {
    writeFileSync(join(destino, NOMES_ARQUIVO_TURISMO[bloco]), paraCsvTurismo(bloco, demo[bloco]));
    console.log(`${NOMES_ARQUIVO_TURISMO[bloco].padEnd(26)} ${demo[bloco].length} linhas`);
  }
} else {
  const demo = gerarDemo();
  for (const bloco of Object.keys(demo) as (keyof Demo)[]) {
    writeFileSync(join(destino, NOMES_ARQUIVO[bloco]), paraCsv(bloco, demo[bloco]));
    console.log(`${NOMES_ARQUIVO[bloco].padEnd(26)} ${demo[bloco].length} linhas`);
  }
}
console.log(`\nArquivos em ${destino}`);
