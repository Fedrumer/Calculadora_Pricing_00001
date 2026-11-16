// Recria o banco local e aplica as migrações (Postgres comum, sem Docker).
import { recriarBanco } from '../banco.ts';

const url = process.env.DATABASE_URL ?? 'postgresql://pricing:pricing@127.0.0.1:5432/pricing_local';
await recriarBanco(url);
console.log(`Banco recriado e migrado: ${url.replace(/:[^:@/]+@/, ':***@')}`);
