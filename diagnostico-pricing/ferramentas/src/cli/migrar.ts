// Recria um banco local (de teste) com todas as migrações. Útil para conferir uma migração nova.
//   pnpm migrar -- postgresql://pricing:pricing@127.0.0.1:5432/diagnostico_dev
import { recriarBanco } from '../banco.ts';

const url = process.argv.slice(2).find((a) => a.startsWith('postgres')) ?? 'postgresql://pricing:pricing@127.0.0.1:5432/diagnostico_dev';
await recriarBanco(url);
console.log(`Migrações aplicadas em ${new URL(url).pathname.slice(1)}.`);
