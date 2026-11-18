// Emulador local do Supabase, para desenvolver e testar sem Docker.
//
// Cobre só o que esta aplicação usa: autenticação por senha com segundo fator
// (TOTP), leitura pelo banco com RLS de verdade (um subconjunto da sintaxe do
// PostgREST), chamadas de função, arquivos com link assinado e a API de negócio
// em processo. Em produção nada disto roda: quem atende é o Supabase do cliente.

import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { montarApi } from '../../../supabase/functions/api/src/montar.ts';
import { RAIZ, type Sql } from '../banco.ts';
import { segredoBase32, totpConfere } from './totp.ts';

export interface OpcoesEmulador {
  sql: Sql;
  urlBanco: string;
  porta: number;
  urlAplicacao: string;
  segredoJwt?: string;
  ambiente?: string;
  chaveAnthropic?: string;
}

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

export async function iniciarEmulador(o: OpcoesEmulador) {
  const { sql } = o;
  const segredo = o.segredoJwt ?? 'segredo-jwt-do-ambiente-local-com-mais-de-32-caracteres';
  const base = `http://127.0.0.1:${o.porta}`;
  const anon = assinarJwt(segredo, { role: 'anon', iss: 'local' });
  const servico = assinarJwt(segredo, { role: 'service_role', iss: 'local' });
  const pasta = join(RAIZ, '.local/storage');

  await sql.unsafe(`
    create table if not exists auth.fatores_local (id uuid primary key default gen_random_uuid(), user_id uuid not null, segredo text not null, nome text, status text not null default 'unverified', criado_em timestamptz default now());
    create table if not exists auth.sessoes_local (refresh text primary key, user_id uuid not null, aal text not null default 'aal1', criado_em timestamptz default now());
  `);

  const { app, deps } = montarApi(
    (nome) =>
      ({
        SUPABASE_URL: base,
        SUPABASE_SERVICE_ROLE_KEY: servico,
        SUPABASE_DB_URL: o.urlBanco,
        URL_APLICACAO: o.urlAplicacao,
        AMBIENTE: o.ambiente ?? 'local',
        SEGREDO_HASH: 'segredo-de-hash-do-ambiente-local-0123456789',
        CHAVE_CIFRA_DOCUMENTOS: 'chave-de-cifra-do-ambiente-local-0123456789',
        SEGREDO_AUTOMACAO: 'segredo-de-automacao-do-ambiente-local',
        SEGREDO_PSEUDONIMO: 'segredo-de-pseudonimo-do-ambiente-local-0123456789',
        ANTHROPIC_API_KEY: o.chaveAnthropic,
      })[nome],
    { sql },
  );

  async function usuarioPublico(id: string) {
    const [u] = await sql<{ id: string; email: string; created_at: Date; raw_user_meta_data: unknown }[]>`select id, email, created_at, raw_user_meta_data from auth.users where id = ${id}`;
    if (!u) return null;
    const fatores = await sql<{ id: string; nome: string | null; status: string; criado_em: Date }[]>`select id, nome, status, criado_em from auth.fatores_local where user_id = ${id} order by criado_em`;
    return {
      id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, created_at: u.created_at, app_metadata: { provider: 'email' }, user_metadata: u.raw_user_meta_data ?? {},
      factors: fatores.map((f) => ({ id: f.id, friendly_name: f.nome, factor_type: 'totp', status: f.status, created_at: f.criado_em, updated_at: f.criado_em })),
    };
  }

  async function novaSessao(userId: string, aal: 'aal1' | 'aal2') {
    const agora = Math.floor(Date.now() / 1000);
    const usuario = await usuarioPublico(userId);
    const refresh = randomBytes(24).toString('base64url');
    await sql`insert into auth.sessoes_local (refresh, user_id, aal) values (${refresh}, ${userId}, ${aal})`;
    await sql`update auth.users set last_sign_in_at = now() where id = ${userId}`;
    const access = assinarJwt(segredo, {
      sub: userId, role: 'authenticated', aud: 'authenticated', email: usuario!.email, aal, session_id: randomUUID(), iat: agora, exp: agora + 3600,
      amr: [{ method: 'password', timestamp: agora }, ...(aal === 'aal2' ? [{ method: 'totp', timestamp: agora }] : [])],
    });
    return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: agora + 3600, refresh_token: refresh, user: usuario };
  }

  const erro = (status: number, msg: string, extra: Record<string, unknown> = {}) => ({ status, corpo: { code: status, msg, message: msg, error_description: msg, ...extra } });
  type Saida = { status: number; corpo?: unknown; bruto?: Buffer; tipo?: string };

  async function auth(metodo: string, caminho: string, url: URL, corpo: any, token: string): Promise<Saida> {
    const claims = token ? lerJwt(segredo, token) : null;
    const admin = claims?.role === 'service_role';
    const uid = claims?.role === 'authenticated' ? (claims.sub as string) : null;

    if (caminho === '/token' && metodo === 'POST') {
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        const [s] = await sql<{ user_id: string; aal: 'aal1' | 'aal2' }[]>`delete from auth.sessoes_local where refresh = ${corpo?.refresh_token ?? ''} returning user_id, aal`;
        if (!s) return erro(400, 'Invalid Refresh Token', { error_code: 'refresh_token_not_found' });
        return { status: 200, corpo: await novaSessao(s.user_id, s.aal) };
      }
      const [u] = await sql<{ id: string; encrypted_password: string | null; bloqueado: boolean }[]>`
        select id, encrypted_password, coalesce(banned_until > now(), false) as bloqueado from auth.users where lower(email) = ${String(corpo?.email ?? '').toLowerCase()}`;
      if (!u || !senhaConfere(String(corpo?.password ?? ''), u.encrypted_password)) return erro(400, 'Invalid login credentials', { error_code: 'invalid_credentials' });
      if (u.bloqueado) return erro(400, 'User is banned', { error_code: 'user_banned' });
      return { status: 200, corpo: await novaSessao(u.id, 'aal1') };
    }
    if (caminho === '/recover' && metodo === 'POST') return { status: 200, corpo: {} };
    if (caminho === '/logout' && metodo === 'POST') return { status: 204 };

    if (caminho === '/admin/users' && metodo === 'POST') {
      if (!admin) return erro(401, 'Não autorizado');
      const senha = String(corpo?.password ?? '');
      if (senha.length < 8) return erro(422, 'Password should be at least 8 characters', { error_code: 'weak_password' });
      const existe = await sql`select 1 from auth.users where lower(email) = ${String(corpo.email).toLowerCase()}`;
      if (existe.length) return erro(422, 'A user with this email address has already been registered', { error_code: 'email_exists' });
      const [u] = await sql<{ id: string }[]>`
        insert into auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data)
        values (${String(corpo.email).toLowerCase()}, ${hashSenha(senha)}, now(), ${sql.json(corpo.user_metadata ?? {})}) returning id`;
      return { status: 200, corpo: await usuarioPublico(u!.id) };
    }
    const adm = /^\/admin\/users\/([0-9a-f-]{36})$/.exec(caminho);
    if (adm && metodo === 'PUT') {
      if (!admin) return erro(401, 'Não autorizado');
      if (corpo?.ban_duration !== undefined) {
        const banir = corpo.ban_duration !== 'none';
        await sql`update auth.users set banned_until = ${banir ? sql`now() + interval '100 years'` : null} where id = ${adm[1]!}`;
        if (banir) await sql`delete from auth.sessoes_local where user_id = ${adm[1]!}`;
      }
      if (corpo?.password) await sql`update auth.users set encrypted_password = ${hashSenha(String(corpo.password))} where id = ${adm[1]!}`;
      return { status: 200, corpo: await usuarioPublico(adm[1]!) };
    }

    if (!uid) return erro(401, 'Sessão inválida', { error_code: 'bad_jwt' });
    const [vivo] = await sql<{ bloqueado: boolean }[]>`select coalesce(banned_until > now(), false) as bloqueado from auth.users where id = ${uid}`;
    if (!vivo || vivo.bloqueado) return erro(403, 'User is banned', { error_code: 'user_banned' });

    if (caminho === '/user' && metodo === 'GET') return { status: 200, corpo: await usuarioPublico(uid) };
    if (caminho === '/user' && metodo === 'PUT') {
      if (corpo?.password) {
        if (String(corpo.password).length < 8) return erro(422, 'Password should be at least 8 characters', { error_code: 'weak_password' });
        await sql`update auth.users set encrypted_password = ${hashSenha(String(corpo.password))} where id = ${uid}`;
      }
      return { status: 200, corpo: await usuarioPublico(uid) };
    }
    if (caminho === '/factors' && metodo === 'POST') {
      const chave = segredoBase32();
      const [f] = await sql<{ id: string }[]>`insert into auth.fatores_local (user_id, segredo, nome) values (${uid}, ${chave}, ${corpo?.friendly_name ?? null}) returning id`;
      const uri = `otpauth://totp/Pricing%20local:${encodeURIComponent(claims!.email)}?secret=${chave}&issuer=Pricing%20local`;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180"><rect width="180" height="180" fill="#f1f3f5"/><text x="90" y="80" font-size="11" text-anchor="middle" fill="#555">Ambiente local:</text><text x="90" y="98" font-size="11" text-anchor="middle" fill="#555">digite a chave abaixo</text><text x="90" y="116" font-size="11" text-anchor="middle" fill="#555">no aplicativo</text></svg>`;
      return { status: 200, corpo: { id: f!.id, type: 'totp', friendly_name: corpo?.friendly_name, totp: { qr_code: svg, secret: chave, uri } } };
    }
    const fat = /^\/factors\/([0-9a-f-]{36})(\/challenge|\/verify)?$/.exec(caminho);
    if (fat) {
      const [f] = await sql<{ id: string; segredo: string }[]>`select id, segredo from auth.fatores_local where id = ${fat[1]!} and user_id = ${uid}`;
      if (!f) return erro(404, 'Factor not found');
      if (!fat[2] && metodo === 'DELETE') {
        await sql`delete from auth.fatores_local where id = ${f.id}`;
        return { status: 200, corpo: { id: f.id } };
      }
      if (fat[2] === '/challenge') return { status: 200, corpo: { id: randomUUID(), type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 } };
      if (fat[2] === '/verify') {
        if (!totpConfere(f.segredo, String(corpo?.code ?? ''))) return erro(422, 'Invalid TOTP code entered', { error_code: 'mfa_verification_failed' });
        await sql`update auth.fatores_local set status = 'verified' where id = ${f.id}`;
        return { status: 200, corpo: await novaSessao(uid, 'aal2') };
      }
    }
    return erro(404, `auth: rota não emulada (${metodo} ${caminho})`);
  }

  const OPERADORES: Record<string, string> = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'like', ilike: 'ilike' };

  async function rest(metodo: string, caminho: string, url: URL, corpo: any, token: string, aceita: string): Promise<Saida> {
    const claims = token ? lerJwt(segredo, token) : null;
    const papel = claims?.role === 'authenticated' ? 'authenticated' : 'anon';
    const jwt = JSON.stringify(papel === 'authenticated' ? claims : { role: 'anon' });
    const naoSuportado = (m: string) => ({ status: 400, corpo: { code: 'EMULADOR', message: `Emulador local: ${m}` } });

    const executar = async (texto: string, valores: unknown[]) => {
      let linhas: Record<string, unknown>[] = [];
      try {
        await sql.begin(async (tx) => {
          await tx`select set_config('request.jwt.claims', ${jwt}, true)`;
          await tx.unsafe(`set local role ${papel}`);
          linhas = (await tx.unsafe(texto, valores as never[])) as Record<string, unknown>[];
        });
        return { linhas };
      } catch (e) {
        const pg = e as { code?: string; message?: string };
        return { falha: { status: pg.code === '42501' ? 403 : 400, corpo: { code: pg.code ?? 'ERRO', message: pg.message ?? 'erro', details: null, hint: null } } };
      }
    };

    const rpc = /^\/rpc\/([a-z_][a-z0-9_]*)$/.exec(caminho);
    if (rpc && metodo === 'POST') {
      const args = Object.entries(corpo ?? {});
      if (args.some(([k]) => !IDENT.test(k))) return naoSuportado('argumento inválido');
      const r = await executar(`select public.${rpc[1]}(${args.map(([k], i) => `${k} => $${i + 1}`).join(', ')}) as r`, args.map(([, v]) => v));
      if (r.falha) return r.falha;
      return { status: 200, corpo: r.linhas[0]?.r ?? null };
    }

    const rel = caminho.slice(1);
    if (metodo !== 'GET') return { status: 403, corpo: { code: '42501', message: `permission denied for table ${rel}` } };
    if (!IDENT.test(rel)) return naoSuportado('relação inválida');
    const select = url.searchParams.get('select') ?? '*';
    const colunas = select === '*' ? '*' : select.split(',').map((c) => c.trim());
    if (colunas !== '*' && colunas.some((c) => !IDENT.test(c))) return naoSuportado(`select "${select}" (só colunas simples, sem relações embutidas)`);

    const onde: string[] = [];
    const valores: unknown[] = [];
    for (const [chave, bruto] of url.searchParams) {
      if (['select', 'order', 'limit', 'offset'].includes(chave)) continue;
      if (!IDENT.test(chave)) return naoSuportado(`filtro "${chave}"`);
      const ponto = bruto.indexOf('.');
      const op = bruto.slice(0, ponto);
      const valor = bruto.slice(ponto + 1);
      // Literal sem tipo, como o PostgREST faz: o Postgres infere o tipo pela coluna
      // (booleano, data, uuid...). Aspas simples são dobradas; não há outra forma de escape.
      const literal = (v: string) => `'${v.replace(/\0/g, '').replace(/'/g, "''")}'`;
      if (op === 'in') {
        const lista = valor.replace(/^\(|\)$/g, '').split(',').map((v) => v.replace(/^"|"$/g, '')).filter((v) => v !== '');
        onde.push(lista.length ? `"${chave}" in (${lista.map(literal).join(', ')})` : 'false');
      } else if (op === 'is') {
        if (!['null', 'true', 'false'].includes(valor)) return naoSuportado(`is.${valor}`);
        onde.push(`"${chave}" is ${valor}`);
      } else if (OPERADORES[op]) {
        onde.push(op.endsWith('like') ? `"${chave}"::text ${OPERADORES[op]} ${literal(valor.replace(/\*/g, '%'))}` : `"${chave}" ${OPERADORES[op]} ${literal(valor)}`);
      } else return naoSuportado(`operador "${op}"`);
    }
    const ordem = (url.searchParams.get('order') ?? '').split(',').filter(Boolean).map((p) => {
      const [col, ...mods] = p.split('.');
      return IDENT.test(col ?? '') ? `"${col}" ${mods.includes('desc') ? 'desc' : 'asc'}${mods.includes('nullsfirst') ? ' nulls first' : mods.includes('nullslast') ? ' nulls last' : ''}` : null;
    });
    if (ordem.includes(null)) return naoSuportado('ordenação');
    const limite = Number(url.searchParams.get('limit') ?? 1000);
    const pulo = Number(url.searchParams.get('offset') ?? 0);
    const texto = `select ${colunas === '*' ? '*' : colunas.map((c) => `"${c}"`).join(', ')} from public."${rel}"${onde.length ? ` where ${onde.join(' and ')}` : ''}${ordem.length ? ` order by ${ordem.join(', ')}` : ''} limit ${Math.min(Math.max(limite, 0), 1000)} offset ${Math.max(pulo, 0)}`;
    const r = await executar(texto, valores);
    if (r.falha) return r.falha;
    if (aceita.includes('vnd.pgrst.object')) {
      if (r.linhas.length !== 1) return { status: 406, corpo: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${r.linhas.length} rows` } };
      return { status: 200, corpo: r.linhas[0] };
    }
    return { status: 200, corpo: r.linhas };
  }

  const TIPOS: Record<string, string> = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv', zip: 'application/zip' };
  function storage(metodo: string, caminho: string, url: URL, dados: Buffer, token: string): Saida {
    const claims = token ? lerJwt(segredo, token) : null;
    const assinar = (objeto: string, exp: number) => createHmac('sha256', segredo).update(`${objeto}:${exp}`).digest('base64url');
    const m = /^\/object\/(sign\/)?([a-z0-9_-]+)\/(.+)$/.exec(caminho);
    if (!m) return { status: 404, corpo: { message: 'storage: rota não emulada' } };
    const objeto = `${m[2]}/${decodeURIComponent(m[3]!)}`;
    if (objeto.includes('..')) return { status: 400, corpo: { message: 'caminho inválido' } };
    const arquivo = join(pasta, objeto);
    if (m[1] && metodo === 'GET') {
      const exp = Number(url.searchParams.get('exp'));
      if (exp < Date.now() / 1000 || url.searchParams.get('token') !== assinar(objeto, exp)) return { status: 400, corpo: { message: 'link expirado ou inválido' } };
      try {
        return { status: 200, bruto: readFileSync(arquivo), tipo: TIPOS[arquivo.split('.').pop() ?? ''] ?? 'application/octet-stream' };
      } catch {
        return { status: 404, corpo: { message: 'arquivo não encontrado' } };
      }
    }
    if (claims?.role !== 'service_role') return { status: 403, corpo: { message: 'new row violates row-level security policy' } };
    if (m[1] && metodo === 'POST') {
      const exp = Math.floor(Date.now() / 1000) + (JSON.parse(dados.toString() || '{}').expiresIn ?? 60);
      return { status: 200, corpo: { signedURL: `/object/sign/${m[2]}/${m[3]}?token=${assinar(objeto, exp)}&exp=${exp}` } };
    }
    if (!m[1] && metodo === 'GET') {
      try {
        return { status: 200, bruto: readFileSync(arquivo), tipo: TIPOS[arquivo.split('.').pop() ?? ''] ?? 'application/octet-stream' };
      } catch {
        return { status: 404, corpo: { message: 'arquivo não encontrado' } };
      }
    }
    if (metodo === 'POST' || metodo === 'PUT') {
      mkdirSync(dirname(arquivo), { recursive: true });
      writeFileSync(arquivo, dados);
      return { status: 200, corpo: { Key: objeto } };
    }
    return { status: 404, corpo: { message: 'storage: rota não emulada' } };
  }

  const servidor = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const cors = {
      'access-control-allow-origin': req.headers.origin ?? '*',
      'access-control-allow-headers': req.headers['access-control-request-headers'] ?? '*',
      'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'access-control-expose-headers': 'content-range, server-timing',
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
      if (url.pathname.startsWith('/functions/v1/api')) {
        const cab = new Headers();
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') cab.set(k, v);
        const r = await app.fetch(new Request(url, { method: metodo, headers: cab, body: ['GET', 'HEAD', 'DELETE'].includes(metodo) ? undefined : dados }));
        const saida: Record<string, string> = { ...cors };
        r.headers.forEach((v, k) => (saida[k] = v));
        return void res.writeHead(r.status, saida).end(Buffer.from(await r.arrayBuffer()));
      }
      let corpo: unknown = undefined;
      const ehStorage = url.pathname.startsWith('/storage/v1');
      if (!ehStorage && dados.length) corpo = JSON.parse(dados.toString());
      let s: Saida;
      if (url.pathname.startsWith('/auth/v1')) s = await auth(metodo, url.pathname.slice(8), url, corpo, token);
      else if (url.pathname.startsWith('/rest/v1')) s = await rest(metodo, url.pathname.slice(8), url, corpo, token, String(req.headers.accept ?? ''));
      else if (ehStorage) s = storage(metodo, url.pathname.slice(11), url, dados, token);
      else s = { status: 404, corpo: { message: 'rota não emulada' } };
      if (s.bruto) return void res.writeHead(s.status, { ...cors, 'content-type': s.tipo ?? 'application/octet-stream' }).end(s.bruto);
      res.writeHead(s.status, { ...cors, 'content-type': 'application/json; charset=utf-8' }).end(s.corpo === undefined ? '' : JSON.stringify(s.corpo));
    } catch (e) {
      console.error('[emulador]', metodo, url.pathname, e);
      res.writeHead(500, { ...cors, 'content-type': 'application/json' }).end(JSON.stringify({ message: 'erro no emulador' }));
    }
  });
  await new Promise<void>((ok) => servidor.listen(o.porta, '127.0.0.1', ok));

  return {
    url: base,
    anon,
    servico,
    deps,
    /** Cria o usuário de autenticação (usado pelo instalador da demonstração). */
    async criarUsuario(email: string, senha: string, nome: string): Promise<string> {
      const [u] = await sql<{ id: string }[]>`
        insert into auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data)
        values (${email.toLowerCase()}, ${hashSenha(senha)}, now(), ${sql.json({ nome })}) returning id`;
      return u!.id;
    },
    fechar: () => new Promise<void>((ok) => servidor.close(() => ok())),
  };
}
