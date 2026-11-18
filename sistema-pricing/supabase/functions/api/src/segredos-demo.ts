import postgres from 'postgres';
import { tokenAleatorio } from './cripto.ts';

type Ambiente = (nome: string) => string | undefined;

// SEGREDO_PSEUDONIMO (A10) entra na lista só na demonstração: fica neste banco, fechado por RLS
// e sem permissão para anon e authenticated, e nunca é enviado no pacote.
const GERADOS = ['SEGREDO_HASH', 'CHAVE_CIFRA_DOCUMENTOS', 'SEGREDO_AUTOMACAO', 'DEMO_SENHA', 'SEGREDO_PSEUDONIMO'] as const;

/**
 * Só no ambiente de demonstração: os segredos que não foram definidos na função
 * são gerados uma vez e guardados no próprio banco, para a demonstração subir sem
 * configuração manual. Em produção e homologação isto não é usado: os segredos
 * vêm do cofre da função, e a chave de cifra nunca fica no mesmo banco dos dados.
 */
export async function ambienteDeDemonstracao(env: Ambiente): Promise<Ambiente> {
  if (env('AMBIENTE') !== 'demonstracao') return env;
  if (GERADOS.every((n) => env(n))) return env;
  const url = env('SUPABASE_DB_URL');
  if (!url) return env;
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => undefined });
  try {
    await sql.unsafe(`
      create table if not exists app.segredos_demo (nome text primary key, valor text not null, criado_em timestamptz not null default now());
      alter table app.segredos_demo enable row level security;
      revoke all on app.segredos_demo from public, anon, authenticated;
    `);
    for (const nome of GERADOS) {
      if (env(nome)) continue;
      // DEMO_SENHA precisa cumprir a política de senha (maiúscula, minúscula e número)
      const valor = nome === 'DEMO_SENHA' ? `Demo-${tokenAleatorio(9)}-7a` : tokenAleatorio(36);
      await sql`insert into app.segredos_demo (nome, valor) values (${nome}, ${valor}) on conflict (nome) do nothing`;
    }
    const linhas = await sql<{ nome: string; valor: string }[]>`select nome, valor from app.segredos_demo`;
    const guardados = new Map(linhas.map((l) => [l.nome, l.valor]));
    return (nome) => env(nome) ?? guardados.get(nome);
  } finally {
    await sql.end();
  }
}
