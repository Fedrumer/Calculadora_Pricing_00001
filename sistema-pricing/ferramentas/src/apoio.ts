import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { type PedidoCotacao, calcular } from '@pricing/motor';
import { extensoes } from '../../supabase/functions/_shared/extensoes/index.ts';
import { carregarRegras } from '../../supabase/functions/api/src/regras.ts';
import { RAIZ, type Sql } from './banco.ts';
import type { ConfigCliente } from './instalar.ts';

export function lerConfig(arquivo: string): ConfigCliente {
  const caminho = isAbsolute(arquivo) ? arquivo : arquivo.includes('/') ? join(process.cwd(), arquivo) : join(RAIZ, 'config/clientes', arquivo);
  return JSON.parse(readFileSync(caminho, 'utf8')) as ConfigCliente;
}

export function arg(nome: string, padrao?: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  if (i >= 0) return process.argv[i + 1] && !process.argv[i + 1]!.startsWith('--') ? process.argv[i + 1] : 'sim';
  return padrao;
}

export function exigir(nome: string): string {
  const v = process.env[nome];
  if (!v) {
    console.error(`Defina a variável de ambiente ${nome}.`);
    process.exit(2);
  }
  return v;
}

/** Recalcula uma amostra de versões de cotação com as regras gravadas nelas e compara com o preço guardado. */
export async function recalcularAmostra(sql: Sql, tamanho = 60): Promise<{ conferidas: number; divergentes: number }> {
  const versoes = await sql<{ org_id: string; entrada: PedidoCotacao; preco_final: number; tabela_id: string; politica_id: string }[]>`
    select org_id, entrada, preco_final, tabela_id, politica_id from public.cotacao_versoes order by criado_em desc limit ${tamanho}`;
  const cache = new Map<string, Awaited<ReturnType<typeof carregarRegras>>>();
  let divergentes = 0;
  for (const v of versoes) {
    const chave = `${v.tabela_id}/${v.politica_id}`;
    if (!cache.has(chave)) cache.set(chave, await carregarRegras(sql, v.org_id, v.entrada.data, { tabelaId: v.tabela_id, politicaId: v.politica_id }));
    try {
      if (calcular(v.entrada, cache.get(chave)!.regras, { extensoes }).precoFinal !== Number(v.preco_final)) divergentes += 1;
    } catch {
      divergentes += 1;
    }
  }
  return { conferidas: versoes.length, divergentes };
}

/** Apaga os dados da organização (reposição da demonstração). Nunca use em produção. */
export async function limparTudo(sql: Sql, emailsAuth: string[]): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`set local session_replication_role = replica`;
    const tabelas = await tx<{ tablename: string }[]>`select tablename from pg_tables where schemaname = 'public'`;
    await tx.unsafe(`truncate ${tabelas.map((t) => `public."${t.tablename}"`).join(', ')} restart identity cascade`);
    if (emailsAuth.length) await tx`delete from auth.users where lower(email) in ${tx(emailsAuth.map((e) => e.toLowerCase()))}`;
  });
}
