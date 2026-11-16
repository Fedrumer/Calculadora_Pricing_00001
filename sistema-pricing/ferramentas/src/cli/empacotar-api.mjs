// Empacota a API em um único arquivo para publicar como Edge Function quando a
// CLI do Supabase não está à mão (por exemplo, pelo painel ou por um conector).
//   node ferramentas/src/cli/empacotar-api.mjs [saida.js]
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../../../supabase/functions/', import.meta.url));
const NPM = { postgres: 'npm:postgres@3.4.7', zod: 'npm:zod@3.25.76', 'pdf-lib': 'npm:pdf-lib@1.17.1', fflate: 'npm:fflate@0.8.2', '@anthropic-ai/sdk': 'npm:@anthropic-ai/sdk@1.8.0' };
const saida = process.argv[2] ?? fileURLToPath(new URL('../../../.local/api.empacotada.js', import.meta.url));
await build({
  entryPoints: [`${raiz}api/index.ts`],
  outfile: saida,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  plugins: [
    {
      name: 'dependencias',
      setup(b) {
        b.onResolve({ filter: /^[^./]/ }, (a) => {
          if (NPM[a.path]) return { path: NPM[a.path], external: true };
          if (a.path === '@pricing/motor') return { path: `${raiz}_shared/motor/src/index.ts` };
          return { path: a.path, external: true };
        });
      },
    },
  ],
});
console.log(saida);
