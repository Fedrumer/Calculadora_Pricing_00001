import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ, type Sql, conectar, recriarBanco } from '../../../../ferramentas/src/banco.ts';
import { type ConfigCliente, instalar } from '../../../../ferramentas/src/instalar.ts';
import { extensoes } from '../../_shared/extensoes/index.ts';
import { criarApp } from '../src/app.ts';
import { armazenamentoMemoria } from '../src/armazenamento.ts';
import type { Deps, ServicoAuth, ServicoIA } from '../src/contexto.ts';
import { iaIndisponivel } from '../src/ia.ts';
import { rotas } from '../src/rotas/index.ts';

export const URL_TESTE = process.env.TEST_DATABASE_URL ?? 'postgresql://pricing:pricing@127.0.0.1:5432/pricing_teste';
export const SEGREDO_AUTOMACAO = 'segredo-de-automacao-para-testes-0001';
export const SEGREDO_PSEUDONIMO = 'segredo-de-pseudonimo-para-testes-0123456789';

export function lerConfig(arquivo: string): ConfigCliente {
  return JSON.parse(readFileSync(join(RAIZ, 'config/clientes', arquivo), 'utf8')) as ConfigCliente;
}

/** Autenticação de teste: token "t:<id do usuário>:<aal>" e usuários gravados direto em auth.users. */
function authDeTeste(sql: Sql): ServicoAuth {
  return {
    async verificar(token) {
      const [prefixo, usuarioId, aal] = token.split(':');
      if (prefixo !== 't' || !usuarioId) return null;
      const [u] = await sql<{ id: string; bloqueado: boolean }[]>`select id, coalesce(banned_until > now(), false) as bloqueado from auth.users where id = ${usuarioId}`;
      if (!u || u.bloqueado) return null;
      return { usuarioId, aal: aal === 'aal2' ? 'aal2' : 'aal1' };
    },
    async criarUsuario({ email }) {
      const [u] = await sql<{ id: string }[]>`insert into auth.users (email, email_confirmed_at) values (${email}, now()) returning id`;
      return { id: u!.id };
    },
    async definirBloqueio(usuarioId, bloqueado) {
      await sql`update auth.users set banned_until = ${bloqueado ? sql`now() + interval '100 years'` : null} where id = ${usuarioId}`;
    },
  };
}

export interface Ambiente {
  sql: Sql;
  deps: Deps;
  orgId: string;
  usuarios: Map<string, string>;
  canais: Map<string, string>;
  arquivos: Map<string, { conteudo: Uint8Array; tipo: string }>;
  relogio: { agora: Date | null };
  chamar: (
    metodo: string,
    caminho: string,
    o?: { como?: string; aal?: 'aal1' | 'aal2'; corpo?: unknown; cabecalhos?: Record<string, string> },
  ) => Promise<{ status: number; corpo: any }>;
  fechar: () => Promise<void>;
}

/** Banco novo, organização de demonstração instalada e a API montada em processo. */
export async function criarAmbiente(o: { config?: string; semMfa?: boolean; ia?: ServicoIA } = {}): Promise<Ambiente> {
  await recriarBanco(URL_TESTE);
  const sql = conectar(URL_TESTE, 5);
  const auth = authDeTeste(sql);
  const config = lerConfig(o.config ?? 'demo-assistencia.json');
  const instalado = await instalar(sql, config, {
    semMfa: o.semMfa,
    criarUsuarioAuth: async ({ email, nome }) => (await auth.criarUsuario({ email, nome, senha: 'x' })).id,
  });
  const memoria = armazenamentoMemoria();
  const relogio: { agora: Date | null } = { agora: null };
  const deps: Deps = {
    sql,
    auth,
    armazenamento: memoria,
    ia: o.ia ?? iaIndisponivel(),
    config: {
      ambiente: 'local',
      urlAplicacao: 'http://localhost:3000',
      origensPermitidas: ['http://localhost:3000'],
      segredoHash: 'segredo-de-hash-para-testes-com-32-caracteres',
      chaveCifra: 'chave-de-cifra-para-testes-com-32-caracteres!',
      segredoAutomacao: SEGREDO_AUTOMACAO,
      segredoPseudonimo: SEGREDO_PSEUDONIMO,
      n8nWebhookUrl: null,
      fusoHorario: 'America/Sao_Paulo',
    },
    extensoes,
    agora: () => relogio.agora ?? new Date(),
    buscar: fetch,
  };
  const app = criarApp(deps, rotas);
  // perfis com segundo fator obrigatório entram com sessão aal2, salvo quando o teste pede aal1
  const exigem = new Set(o.semMfa ? [] : ['admin', 'gestor_pricing', 'aprovador', 'leitura', 'suporte']);
  const aalPadrao = new Map<string, 'aal1' | 'aal2'>();
  for (const u of config.usuarios ?? []) aalPadrao.set(u.email, u.papeis.some((p) => exigem.has(p.papel)) ? 'aal2' : 'aal1');

  return {
    sql,
    deps,
    orgId: instalado.orgId,
    usuarios: instalado.usuarios,
    canais: instalado.canais,
    arquivos: memoria.arquivos,
    relogio,
    async chamar(metodo, caminho, op = {}) {
      const cabecalhos: Record<string, string> = { 'content-type': 'application/json', ...(op.cabecalhos ?? {}) };
      if (op.como) {
        const id = instalado.usuarios.get(op.como) ?? op.como;
        cabecalhos.authorization = `Bearer t:${id}:${op.aal ?? aalPadrao.get(op.como) ?? 'aal1'}`;
      }
      const resposta = await app.fetch(
        new Request(`http://api.local/functions/v1/api${caminho}`, {
          method: metodo,
          headers: cabecalhos,
          body: op.corpo === undefined ? undefined : JSON.stringify(op.corpo),
        }),
      );
      const texto = await resposta.text();
      return { status: resposta.status, corpo: texto ? JSON.parse(texto) : null };
    },
    async fechar() {
      await sql.end();
    },
  };
}

export const PESSOAS = {
  admin: 'admin@aurora.demo',
  pricing: 'pricing@aurora.demo',
  diretoria: 'diretoria@aurora.demo',
  gestor: 'gestor@aurora.demo',
  vendedor: 'vendedor@aurora.demo',
  vendedorSul: 'vendedor.sul@aurora.demo',
  canal: 'canal@corretora-alfa.demo',
  canalBeta: 'canal@agencia-beta.demo',
  financeiro: 'financeiro@aurora.demo',
  suporte: 'suporte@consultoria.demo',
} as const;

export const pedidoAuto = (extra: Record<string, unknown> = {}) => ({
  produto: 'AUTO24',
  dimensoes: { plano: 'completo', regiao: 'sudeste', idade_veiculo: 8, unidades: 1, meses: 12 },
  ...extra,
});

export const cliente = { nome: 'Cliente de Teste Ltda', email: 'compras@cliente.teste', documento: '123.456.789-09' };
