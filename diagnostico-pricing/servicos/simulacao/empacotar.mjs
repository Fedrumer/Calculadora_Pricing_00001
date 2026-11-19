// Gera supabase/functions/simular/index.js: o núcleo e o ponto de entrada num arquivo só, para publicar a
// Edge Function pelo conector ou pela CLI sem depender de importação externa.
import { build } from 'esbuild';
await build({
  entryPoints: ['src/deno.ts'], bundle: true, format: 'esm', platform: 'neutral', target: 'es2022',
  outfile: '../../supabase/functions/simular/index.js', legalComments: 'none', minify: true,
  banner: { js: '// Gerado por servicos/simulacao/empacotar.mjs. Não edite: altere o pacote e empacote de novo.' },
});
console.log('supabase/functions/simular/index.js gerado');
