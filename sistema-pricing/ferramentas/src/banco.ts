import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

export const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const MIGRACOES = join(RAIZ, 'supabase/migrations');
const COMPAT = join(RAIZ, 'ferramentas/local/compat-supabase.sql');

export type Sql = postgres.Sql<Record<string, unknown>>;

export function conectar(url: string, max = 4): Sql {
  return postgres(url, {
    max,
    onnotice: () => undefined,
    prepare: false,
    // numeric e bigint chegam como número (os valores do sistema cabem com folga em um double)
      types: {
        numeric: { to: 0, from: [1700], serialize: (v: unknown) => String(v), parse: (v: string) => Number(v) },
        bigint: { to: 0, from: [20], serialize: (v: unknown) => String(v), parse: (v: string) => Number(v) },
      },
  }) as unknown as Sql;
}

export function listarMigracoes(): string[] {
  return readdirSync(MIGRACOES).filter((f) => f.endsWith('.sql')).sort();
}

/** Aplica as migrações em ordem. Em Postgres comum, aplica antes a camada de compatibilidade. */
export async function aplicarMigracoes(sql: Sql, opcoes: { compat?: boolean } = {}): Promise<void> {
  if (opcoes.compat ?? true) await sql.unsafe(readFileSync(COMPAT, 'utf8'));
  for (const arquivo of listarMigracoes()) {
    try {
      await sql.unsafe(readFileSync(join(MIGRACOES, arquivo), 'utf8'));
    } catch (e) {
      throw new Error(`Falha na migração ${arquivo}: ${(e as Error).message}`);
    }
  }
}

/** Recria um banco do zero (testes e ambiente local). A URL precisa ser de superusuário. */
export async function recriarBanco(urlBanco: string): Promise<void> {
  const alvo = new URL(urlBanco);
  const nome = alvo.pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(nome)) throw new Error(`Nome de banco inválido: ${nome}`);
  if (!/(teste|test|dev|local|demo|restauracao)/.test(nome)) {
    throw new Error(`Por segurança, só recrio bancos cujo nome indique teste, dev, local, demo ou restauracao (recebi "${nome}").`);
  }
  const admin = new URL(urlBanco);
  admin.pathname = '/postgres';
  const raiz = conectar(admin.toString(), 1);
  try {
    await raiz.unsafe(`drop database if exists ${nome} with (force)`);
    await raiz.unsafe(`create database ${nome}`);
  } finally {
    await raiz.end();
  }
  const sql = conectar(urlBanco, 1);
  try {
    await aplicarMigracoes(sql);
  } finally {
    await sql.end();
  }
}
