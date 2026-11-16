import postgres from 'postgres';
import { extensoes } from '../../_shared/extensoes/index.ts';
import { criarApp } from './app.ts';
import { armazenamentoSupabase } from './armazenamento.ts';
import { authSupabase } from './auth.ts';
import type { Configuracao, Deps, Sql } from './contexto.ts';
import { iaAnthropic } from './ia.ts';
import { rotas } from './rotas/index.ts';

type Ambiente = (nome: string) => string | undefined;

function obrigatoria(env: Ambiente, nome: string): string {
  const valor = env(nome);
  if (!valor) throw new Error(`Variável de ambiente obrigatória ausente: ${nome}`);
  return valor;
}

/** Monta a API a partir das variáveis de ambiente (segredos da função). */
export function montarApi(env: Ambiente, sobrescrever: Partial<Deps> = {}) {
  const urlSupabase = obrigatoria(env, 'SUPABASE_URL');
  const chaveServico = obrigatoria(env, 'SUPABASE_SERVICE_ROLE_KEY');
  const urlAplicacao = env('URL_APLICACAO') ?? 'http://localhost:3000';
  const ambiente = (env('AMBIENTE') ?? 'local') as Configuracao['ambiente'];
  const segredoHash = obrigatoria(env, 'SEGREDO_HASH');
  const chaveCifra = obrigatoria(env, 'CHAVE_CIFRA_DOCUMENTOS');
  if (segredoHash.length < 32 || chaveCifra.length < 32) throw new Error('SEGREDO_HASH e CHAVE_CIFRA_DOCUMENTOS precisam de pelo menos 32 caracteres.');

  const config: Configuracao = {
    ambiente,
    urlAplicacao,
    origensPermitidas: [urlAplicacao, ...(env('ORIGENS_PERMITIDAS') ?? '').split(',')].map((o) => o.trim().replace(/\/$/, '')).filter(Boolean),
    segredoHash,
    chaveCifra,
    segredoAutomacao: env('SEGREDO_AUTOMACAO') ?? null,
    n8nWebhookUrl: env('N8N_WEBHOOK_URL') ?? null,
    fusoHorario: env('FUSO_HORARIO') ?? 'America/Sao_Paulo',
  };
  const sql: Sql =
    sobrescrever.sql ??
    (postgres(obrigatoria(env, 'SUPABASE_DB_URL'), {
      max: Number(env('DB_CONEXOES') ?? 3),
      idle_timeout: 20,
      prepare: false, // compatível com o pooler em modo transação
      onnotice: () => undefined,
      // numeric e bigint chegam como número (os valores do sistema cabem com folga em um double)
      types: {
        numeric: { to: 0, from: [1700], serialize: (v: unknown) => String(v), parse: (v: string) => Number(v) },
        bigint: { to: 0, from: [20], serialize: (v: unknown) => String(v), parse: (v: string) => Number(v) },
      },
    }) as unknown as Sql);
  const deps: Deps = {
    sql,
    auth: authSupabase(urlSupabase, chaveServico),
    armazenamento: armazenamentoSupabase(urlSupabase, chaveServico),
    ia: iaAnthropic(env('ANTHROPIC_API_KEY')),
    config,
    extensoes,
    agora: () => new Date(),
    buscar: fetch,
    ...sobrescrever,
  };
  return { app: criarApp(deps, rotas), deps };
}
