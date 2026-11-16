import type { Ator, Deps, Identidade, Papel, ServicoAuth } from './contexto.ts';
import { iguais, sha256 } from './cripto.ts';
import { ErroHttp, naoAutenticado, proibido } from './erros.ts';

export async function autenticarUsuario(deps: Deps, token: string, ip: string | null): Promise<Ator> {
  const identidade = await deps.auth.verificar(token);
  if (!identidade) throw naoAutenticado();
  const ator = await carregarAtor(deps, identidade, ip);
  if (!ator) throw proibido('Usuário sem acesso ativo nesta instalação.', 'USUARIO_INATIVO');
  return ator;
}

export async function carregarAtor(deps: Deps, identidade: Identidade, ip: string | null): Promise<Ator | null> {
  const [usuario] = await deps.sql<{ id: string; org_id: string; nome: string; status: string; limite_alcada: number | null }[]>`
    select id, org_id, nome, status, limite_alcada from public.usuarios where id = ${identidade.usuarioId}`;
  if (!usuario || usuario.status !== 'ativo') return null;
  const papeis = await deps.sql<{ papel: Papel; unidade_id: string | null; canal_id: string | null; exige_mfa: boolean }[]>`
    select up.papel, up.unidade_id, up.canal_id, p.exige_mfa
    from public.usuario_papel up
    join public.papeis p on p.org_id = up.org_id and p.codigo = up.papel
    where up.usuario_id = ${usuario.id} and p.ativo and (up.valido_ate is null or up.valido_ate > now())`;
  if (papeis.length === 0) return null;
  return {
    tipo: 'usuario',
    id: usuario.id,
    orgId: usuario.org_id,
    nome: usuario.nome,
    papeis: papeis.map((p) => ({ papel: p.papel, unidadeId: p.unidade_id, canalId: p.canal_id, exigeMfa: p.exige_mfa })),
    aal: identidade.aal,
    limiteAlcada: usuario.limite_alcada,
    ip,
  };
}

export async function autenticarChave(deps: Deps, chave: string, ip: string | null): Promise<Ator> {
  const hash = await sha256(chave);
  const [k] = await deps.sql<
    { id: string; org_id: string; canal_id: string | null; nome: string; escopos: string[]; limite_por_minuto: number }[]
  >`
    update public.chaves_api set ultimo_uso = now()
    where hash = ${hash} and revogada_em is null and (expira_em is null or expira_em > now())
    returning id, org_id, canal_id, nome, escopos, limite_por_minuto`;
  if (!k) throw naoAutenticado('Chave de API inválida, expirada ou revogada.');
  return {
    tipo: 'chave_api',
    id: null,
    orgId: k.org_id,
    nome: k.nome,
    papeis: [],
    aal: 'aal1',
    limiteAlcada: null,
    chave: { id: k.id, canalId: k.canal_id, escopos: k.escopos, limitePorMinuto: k.limite_por_minuto },
    ip,
  };
}

export async function autenticarAutomacao(deps: Deps, req: Request, ip: string | null): Promise<Ator> {
  const segredo = deps.config.segredoAutomacao;
  const enviado = req.headers.get('x-automacao-segredo') ?? '';
  if (!segredo || segredo.length < 24 || !iguais(await sha256(enviado), await sha256(segredo))) {
    throw naoAutenticado('Credencial de automação inválida.');
  }
  const [org] = await deps.sql<{ id: string }[]>`select id from public.organizacoes order by criado_em limit 1`;
  if (!org) throw new ErroHttp(503, 'SEM_ORGANIZACAO', 'Instalação ainda sem organização.');
  return { tipo: 'automacao', id: null, orgId: org.id, nome: 'n8n', papeis: [], aal: 'aal1', limiteAlcada: null, ip };
}

/**
 * Serviço de autenticação do Supabase (GoTrue). A validação do token é feita
 * pelo próprio serviço; o nível de garantia (aal) vem das declarações do token.
 */
export function authSupabase(url: string, chaveServico: string, buscar: typeof fetch = fetch): ServicoAuth {
  const base = `${url.replace(/\/$/, '')}/auth/v1`;
  const admin = { apikey: chaveServico, authorization: `Bearer ${chaveServico}`, 'content-type': 'application/json' };
  return {
    async verificar(token) {
      const r = await buscar(`${base}/user`, { headers: { apikey: chaveServico, authorization: `Bearer ${token}` } });
      if (!r.ok) return null;
      const usuario = (await r.json()) as { id?: string };
      if (!usuario.id) return null;
      let aal: 'aal1' | 'aal2' = 'aal1';
      try {
        const carga = token.split('.')[1] ?? '';
        const declaracoes = JSON.parse(atob(carga.replace(/-/g, '+').replace(/_/g, '/'))) as { aal?: string; sub?: string };
        if (declaracoes.sub === usuario.id && declaracoes.aal === 'aal2') aal = 'aal2';
      } catch {
        aal = 'aal1';
      }
      return { usuarioId: usuario.id, aal };
    },
    async criarUsuario({ email, senha, nome }) {
      const r = await buscar(`${base}/admin/users`, {
        method: 'POST',
        headers: admin,
        body: JSON.stringify({ email, password: senha, email_confirm: true, user_metadata: { nome } }),
      });
      const corpo = (await r.json().catch(() => ({}))) as { id?: string; msg?: string; message?: string; error_code?: string };
      if (!r.ok || !corpo.id) {
        if (r.status === 422 && /password/i.test(corpo.msg ?? corpo.message ?? '')) {
          throw new ErroHttp(422, 'SENHA_FRACA', 'A senha não atende à política de segurança.');
        }
        throw new ErroHttp(r.status === 422 ? 409 : 502, 'FALHA_AO_CRIAR_USUARIO', corpo.msg ?? corpo.message ?? 'Não foi possível criar o usuário.');
      }
      return { id: corpo.id };
    },
    async definirBloqueio(usuarioId, bloqueado) {
      const r = await buscar(`${base}/admin/users/${usuarioId}`, {
        method: 'PUT',
        headers: admin,
        body: JSON.stringify({ ban_duration: bloqueado ? '876000h' : 'none' }),
      });
      if (!r.ok) throw new ErroHttp(502, 'FALHA_NO_BLOQUEIO', 'Não foi possível atualizar o acesso no serviço de autenticação.');
    },
  };
}
