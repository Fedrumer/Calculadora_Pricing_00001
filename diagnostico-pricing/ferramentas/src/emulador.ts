// Emulador local do Supabase, para desenvolver e testar sem Docker.
//
// Cobre só o que esta aplicação usa: login por e-mail e senha e chamadas de função
// (rpc) executadas no banco com o papel e o JWT de quem chama, ou seja, com o RLS de verdade.
// Em produção nada disto roda: quem atende é o projeto Supabase.

import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import { ErroRpc, atender as atenderSimulacao } from '@diagnostico/simulacao';
import type { Sql } from './banco.ts';

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const IDENT = /^[a-z_][a-z0-9_]*$/;

export function assinarJwt(segredo: string, carga: Record<string, unknown>): string {
  const corpo = `${b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64u(JSON.stringify(carga))}`;
  return `${corpo}.${createHmac('sha256', segredo).update(corpo).digest('base64url')}`;
}

function lerJwt(segredo: string, token: string): Record<string, any> | null {
  const [c, p, a] = token.split('.');
  if (!c || !p || !a) return null;
  const esperado = createHmac('sha256', segredo).update(`${c}.${p}`).digest();
  const recebido = Buffer.from(a, 'base64url');
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return null;
  const carga = JSON.parse(Buffer.from(p, 'base64url').toString());
  return carga.exp && carga.exp < Date.now() / 1000 ? null : carga;
}

const hashSenha = (senha: string, sal = randomBytes(16).toString('hex')) => `scrypt$${sal}$${scryptSync(senha, sal, 32).toString('hex')}`;
function senhaConfere(senha: string, guardada: string | null): boolean {
  const [tipo, sal, hash] = (guardada ?? '').split('$');
  if (tipo !== 'scrypt' || !sal || !hash) return false;
  return timingSafeEqual(scryptSync(senha, sal, 32), Buffer.from(hash, 'hex'));
}

/** Executa uma função de public como um usuário (ou como visitante), dentro de uma transação. */
export async function chamar<T = any>(sql: Sql, claims: Record<string, unknown> | null, funcao: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!IDENT.test(funcao) || Object.keys(args).some((k) => !IDENT.test(k))) throw new Error('nome inválido');
  const papel = claims?.role === 'authenticated' ? 'authenticated' : 'anon';
  const nomes = Object.keys(args);
  let saida: unknown = null;
  await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify(claims ?? { role: 'anon' })}, true)`;
    await tx.unsafe(`set local role ${papel}`);
    const valores = nomes.map((k) => args[k]);
    const linhas = await tx.unsafe(`select public.${funcao}(${nomes.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, valores as never[]);
    saida = linhas[0]?.r ?? null;
  });
  return saida as T;
}

/** Como chamar, mas com o erro no formato do serviço (403 para perfil sem permissão). */
export async function chamarComErro(sql: Sql, claims: Record<string, unknown>, funcao: string, args: Record<string, unknown>) {
  try {
    return await chamar(sql, claims, funcao, args);
  } catch (e) {
    const pg = e as { code?: string; message?: string };
    throw new ErroRpc(pg.code === '42501' ? 403 : 400, pg.message ?? 'erro');
  }
}

export async function criarUsuarioAuth(sql: Sql, email: string, senha: string, nome: string): Promise<string> {
  const [u] = await sql<{ id: string }[]>`
    insert into auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data)
    values (${email.toLowerCase()}, ${hashSenha(senha)}, now(), ${sql.json({ nome })}) returning id`;
  return u!.id;
}

export async function iniciarEmulador(o: { sql: Sql; porta: number; segredoJwt?: string }) {
  const { sql } = o;
  const segredo = o.segredoJwt ?? 'segredo-jwt-do-ambiente-local-com-mais-de-32-caracteres';
  const base = `http://127.0.0.1:${o.porta}`;
  const anon = assinarJwt(segredo, { role: 'anon', iss: 'local' });
  await sql.unsafe('create table if not exists auth.sessoes_local (refresh text primary key, user_id uuid not null, criado_em timestamptz default now())');

  async function usuarioPublico(id: string) {
    const [u] = await sql<{ id: string; email: string; created_at: Date; raw_user_meta_data: unknown }[]>`select id, email, created_at, raw_user_meta_data from auth.users where id = ${id}`;
    if (!u) return null;
    return { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, created_at: u.created_at, app_metadata: { provider: 'email' }, user_metadata: u.raw_user_meta_data ?? {}, factors: [] };
  }

  async function novaSessao(userId: string) {
    const agora = Math.floor(Date.now() / 1000);
    const usuario = await usuarioPublico(userId);
    const refresh = randomBytes(24).toString('base64url');
    await sql`insert into auth.sessoes_local (refresh, user_id) values (${refresh}, ${userId})`;
    const access = assinarJwt(segredo, { sub: userId, role: 'authenticated', aud: 'authenticated', email: usuario!.email, aal: 'aal1', session_id: randomUUID(), iat: agora, exp: agora + 3600 });
    return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: agora + 3600, refresh_token: refresh, user: usuario };
  }

  type Saida = { status: number; corpo?: unknown };
  const erro = (status: number, msg: string, extra: Record<string, unknown> = {}): Saida => ({ status, corpo: { code: status, msg, message: msg, error_description: msg, ...extra } });

  async function auth(metodo: string, caminho: string, url: URL, corpo: any, token: string): Promise<Saida> {
    if (caminho === '/token' && metodo === 'POST') {
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        const [s] = await sql<{ user_id: string }[]>`delete from auth.sessoes_local where refresh = ${corpo?.refresh_token ?? ''} returning user_id`;
        if (!s) return erro(400, 'Invalid Refresh Token', { error_code: 'refresh_token_not_found' });
        return { status: 200, corpo: await novaSessao(s.user_id) };
      }
      const [u] = await sql<{ id: string; encrypted_password: string | null }[]>`select id, encrypted_password from auth.users where lower(email) = ${String(corpo?.email ?? '').toLowerCase()}`;
      if (!u || !senhaConfere(String(corpo?.password ?? ''), u.encrypted_password)) return erro(400, 'Invalid login credentials', { error_code: 'invalid_credentials' });
      return { status: 200, corpo: await novaSessao(u.id) };
    }
    if (caminho === '/logout' && metodo === 'POST') return { status: 204 };
    const claims = token ? lerJwt(segredo, token) : null;
    if (caminho === '/user' && metodo === 'GET' && claims?.role === 'authenticated') return { status: 200, corpo: await usuarioPublico(claims.sub) };
    return erro(404, `auth: rota não emulada (${metodo} ${caminho})`);
  }

  async function rest(metodo: string, caminho: string, corpo: any, token: string): Promise<Saida> {
    const rpc = /^\/rpc\/([a-z_][a-z0-9_]*)$/.exec(caminho);
    if (!rpc || metodo !== 'POST') return { status: 400, corpo: { code: 'EMULADOR', message: 'Emulador local: só chamadas de função (rpc) são atendidas.' } };
    try {
      return { status: 200, corpo: await chamar(sql, token ? lerJwt(segredo, token) : null, rpc[1]!, corpo ?? {}) };
    } catch (e) {
      const pg = e as { code?: string; message?: string };
      return { status: pg.code === '42501' ? 403 : 400, corpo: { code: pg.code ?? 'ERRO', message: pg.message ?? 'erro', details: null, hint: null } };
    }
  }

  // Edge Function `simular`: o mesmo código da função publicada, com as chamadas rpc no JWT de quem pediu.
  async function funcaoSimular(corpo: unknown, token: string): Promise<Saida> {
    const claims = token ? lerJwt(segredo, token) : null;
    if (claims?.role !== 'authenticated') return erro(401, 'Sessão ausente ou expirada.');
    return atenderSimulacao(corpo, { rpc: (f, a) => chamarComErro(sql, claims, f, a), agora: () => performance.now() });
  }

  const servidor = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const cors = {
      'access-control-allow-origin': req.headers.origin ?? '*',
      'access-control-allow-headers': req.headers['access-control-request-headers'] ?? '*',
      'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      vary: 'Origin',
    };
    if (req.method === 'OPTIONS') return void res.writeHead(204, cors).end();
    const partes: Buffer[] = [];
    for await (const p of req) partes.push(p as Buffer);
    const dados = Buffer.concat(partes);
    const url = new URL(req.url ?? '/', base);
    const metodo = req.method ?? 'GET';
    const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    try {
      const corpo = dados.length ? JSON.parse(dados.toString()) : undefined;
      let s: Saida;
      if (url.pathname.startsWith('/auth/v1')) s = await auth(metodo, url.pathname.slice(8), url, corpo, token);
      else if (url.pathname.startsWith('/rest/v1')) s = await rest(metodo, url.pathname.slice(8), corpo, token);
      else if (url.pathname === '/functions/v1/simular' && metodo === 'POST') s = await funcaoSimular(corpo, token);
      else s = { status: 404, corpo: { message: 'rota não emulada' } };
      res.writeHead(s.status, { ...cors, 'content-type': 'application/json; charset=utf-8' }).end(s.corpo === undefined ? '' : JSON.stringify(s.corpo));
    } catch (e) {
      console.error('[emulador]', metodo, url.pathname, e);
      res.writeHead(500, { ...cors, 'content-type': 'application/json' }).end(JSON.stringify({ message: 'erro no emulador' }));
    }
  });
  await new Promise<void>((ok) => servidor.listen(o.porta, '127.0.0.1', ok));
  return { url: base, anon, fechar: () => new Promise<void>((ok) => servidor.close(() => ok())) };
}
