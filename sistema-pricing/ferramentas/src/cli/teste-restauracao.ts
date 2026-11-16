// Teste de restauração trimestral: restaura a cópia externa em um banco temporário
// e confere por contagem de registros e por recálculo de uma amostra de cotações.
//   COPIA_ARQUIVO=/mnt/copias/banco-....sql.gz.enc COPIA_SENHA=... RESTAURACAO_DB_URL=postgresql://.../pricing_restauracao
//   SUPABASE_DB_URL=... (origem, para comparar contagens e registrar o resultado)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { arg, exigir, recalcularAmostra } from '../apoio.ts';
import { RAIZ, conectar } from '../banco.ts';
import { testeRestauracao } from '../copia.ts';

const origem = process.env.SUPABASE_DB_URL;
const r = await testeRestauracao({
  arquivo: exigir('COPIA_ARQUIVO'),
  senha: exigir('COPIA_SENHA'),
  urlBancoTemporario: exigir('RESTAURACAO_DB_URL'),
  urlBancoOrigem: origem,
  recalcular: (sql) => recalcularAmostra(sql),
  async preparar(url) {
    const s = conectar(url, 1);
    // banco temporário vazio: recebe os papéis e esquemas que o Supabase já traria
    await s.unsafe('drop schema if exists app cascade; create schema if not exists public;');
    if (arg('sem-compat') === undefined) await s.unsafe(readFileSync(join(RAIZ, 'ferramentas/local/compat-supabase.sql'), 'utf8'));
    await s.unsafe('create extension if not exists btree_gist with schema extensions');
    await s.unsafe('drop schema public cascade'); // a cópia traz o esquema public inteiro
    await s.end();
  },
});
console.log(JSON.stringify(r, null, 2));
if (origem && arg('registrar') !== undefined) {
  const sql = conectar(origem, 1);
  await sql`insert into public.registros_backup (org_id, tipo, status, duracao_segundos, destino, detalhes)
            select id, 'teste_restauracao', ${r.ok ? 'ok' : 'falha'}, ${r.duracaoSegundos}, ${process.env.COPIA_ARQUIVO ?? null}, ${sql.json({ contagens: r.contagens, amostra: r.amostra, tabelasDivergentes: r.tabelasDivergentes } as never)}
            from public.organizacoes order by criado_em limit 1`;
  await sql.end();
}
if (!r.ok) process.exitCode = 1;
