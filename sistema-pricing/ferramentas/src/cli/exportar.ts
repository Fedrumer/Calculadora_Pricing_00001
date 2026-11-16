// Exportação integral na saída do cliente: SQL completo e um CSV por tabela, em formato aberto.
//   SUPABASE_DB_URL=... pnpm --filter @pricing/ferramentas exportar -- --destino ./exportacao
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { arg, exigir } from '../apoio.ts';
import { conectar } from '../banco.ts';

const url = exigir('SUPABASE_DB_URL');
const destino = arg('destino', './exportacao')!;
mkdirSync(join(destino, 'csv'), { recursive: true });
writeFileSync(join(destino, 'banco-completo.sql'), execFileSync('pg_dump', ['--no-owner', '--no-privileges', '--schema', 'public', '--schema', 'app', '--dbname', url], { maxBuffer: 2 ** 31 - 1 }));

const sql = conectar(url, 1);
const tabelas = await sql<{ tablename: string }[]>`select tablename from pg_tables where schemaname = 'public' order by tablename`;
const resumo: Record<string, number> = {};
for (const { tablename } of tabelas) {
  const csv = execFileSync('psql', ['--dbname', url, '--command', `\\copy (select * from public."${tablename}") to stdout with (format csv, header true)`], { maxBuffer: 2 ** 31 - 1 });
  writeFileSync(join(destino, 'csv', `${tablename}.csv`), csv);
  resumo[tablename] = Math.max(csv.toString().split('\n').length - 2, 0);
}
writeFileSync(join(destino, 'LEIA-ME.txt'), `Exportação integral em ${new Date().toISOString()}\n\nbanco-completo.sql: estrutura e dados (Postgres padrão).\ncsv/: um arquivo por tabela.\n\nRegistros por tabela:\n${Object.entries(resumo).map(([t, n]) => `  ${t}: ${n}`).join('\n')}\n\nO documento de clientes finais está cifrado (cotacao_dados_pessoais); a chave de cifra pertence ao cliente.\n`);
await sql.end();
console.log(`Exportação concluída em ${destino}: ${tabelas.length} tabelas.`);
