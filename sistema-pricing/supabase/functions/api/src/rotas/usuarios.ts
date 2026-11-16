import { z } from 'zod';
import { type Requisicao, type Rota, validar } from '../app.ts';
import { type Papel, canaisDoAtor, temPapel } from '../contexto.ts';
import { sha256, tokenAleatorio } from '../cripto.ts';
import { ErroHttp, conflito, invalido, naoEncontrado, proibido } from '../erros.ts';

const PAPEIS = ['admin', 'gestor_pricing', 'aprovador', 'vendedor', 'canal', 'leitura', 'suporte'] as const;

const esquemaVinculo = z.object({
  papel: z.enum(PAPEIS),
  unidade: z.string().max(60).nullish(),
  canal: z.string().max(60).nullish(),
  validoAte: z.string().datetime().nullish(),
});

const esquemaConvite = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  nome: z.string().trim().min(2).max(120).optional(),
  papel: z.enum(PAPEIS),
  unidade: z.string().max(60).nullish(),
  canal: z.string().max(60).nullish(),
  limiteAlcada: z.number().int().min(1).max(9).nullish(),
});

const senhaForte = z
  .string()
  .min(12, 'A senha precisa de pelo menos 12 caracteres.')
  .max(128)
  .refine((s) => /[a-z]/.test(s) && /[A-Z]/.test(s) && /\d/.test(s), 'Use letras maiúsculas, minúsculas e números.');

async function resolverEscopo(r: Requisicao, papel: Papel, unidade?: string | null, canal?: string | null) {
  const { tx, ator } = r;
  let unidadeId: string | null = null;
  let canalId: string | null = null;
  if (unidade) {
    const [u] = await tx<{ id: string }[]>`select id from public.unidades where org_id = ${ator.orgId} and codigo = ${unidade} and ativo`;
    if (!u) throw invalido(`Unidade "${unidade}" não existe.`);
    unidadeId = u.id;
  }
  if (papel === 'canal') {
    if (!canal) throw invalido('O perfil de canal exige o canal.');
    const [c] = await tx<{ id: string }[]>`select id from public.canais where org_id = ${ator.orgId} and codigo = ${canal} and ativo`;
    if (!c) throw invalido(`Canal "${canal}" não existe.`);
    canalId = c.id;
  } else if (canal) throw invalido('Só o perfil de canal tem escopo de canal.');
  const [p] = await tx<{ ativo: boolean }[]>`select ativo from public.papeis where org_id = ${ator.orgId} and codigo = ${papel}`;
  if (!p?.ativo) throw invalido(`O perfil "${papel}" não está ativo nesta instalação.`);
  return { unidadeId, canalId };
}

async function prazoConviteHoras(r: Requisicao, orgId: string): Promise<number> {
  const [o] = await r.tx<{ horas: number | null }[]>`select (config #>> '{prazos,conviteHoras}')::int as horas from public.organizacoes where id = ${orgId}`;
  return o?.horas ?? 72;
}

export const rotasUsuarios: Rota[] = [
  {
    // Ninguém se cadastra sozinho: todo usuário entra por convite, já com papel e escopo.
    metodo: 'POST',
    caminho: '/usuarios/convites',
    auth: 'usuario',
    papeis: ['admin', 'canal'],
    async handler(r) {
      const { tx, ator, deps } = r;
      const d = validar(esquemaConvite, r.corpo);
      const admin = temPapel(ator, 'admin');
      if (!admin) {
        // responsável de canal: só convida para o próprio canal, e só se habilitado
        if (d.papel !== 'canal' || !d.canal) throw proibido('Você só pode convidar usuários do seu próprio canal.');
        const [c] = await tx<{ id: string; permite_convite: boolean }[]>`select id, permite_convite from public.canais where org_id = ${ator.orgId} and codigo = ${d.canal}`;
        const [org] = await tx<{ ok: boolean | null }[]>`select (config #>> '{modulos,conviteCanal}')::boolean as ok from public.organizacoes where id = ${ator.orgId}`;
        if (!c || !canaisDoAtor(ator).includes(c.id)) throw proibido('O escopo nunca ultrapassa o seu canal.');
        if (!c.permite_convite || !org?.ok) throw proibido('O administrador não habilitou convites para este canal.');
      }
      if (d.limiteAlcada && !['aprovador', 'gestor_pricing'].includes(d.papel)) throw invalido('Limite de alçada só se aplica a aprovador e gestor de pricing.');
      const { unidadeId, canalId } = await resolverEscopo(r, d.papel, d.unidade, d.canal);
      const [existente] = await tx<{ id: string; status: string }[]>`select id, status from public.usuarios where org_id = ${ator.orgId} and lower(email) = ${d.email}`;
      if (existente) throw conflito('Já existe um usuário com este e-mail; altere os papéis dele em vez de convidar de novo.', 'USUARIO_JA_EXISTE');
      await tx`update public.convites set cancelado_em = now() where org_id = ${ator.orgId} and lower(email) = ${d.email} and aceito_em is null and cancelado_em is null`;

      const token = tokenAleatorio(32);
      const horas = await prazoConviteHoras(r, ator.orgId);
      const [c] = await tx<{ id: string; expira_em: Date }[]>`
        insert into public.convites (org_id, email, nome, papel, unidade_id, canal_id, limite_alcada, token_hash, expira_em, convidado_por)
        values (${ator.orgId}, ${d.email}, ${d.nome ?? null}, ${d.papel}, ${unidadeId}, ${canalId}, ${d.limiteAlcada ?? null},
                ${await sha256(token)}, now() + make_interval(hours => ${horas}), ${ator.id})
        returning id, expira_em`;
      const link = `${deps.config.urlAplicacao.replace(/\/$/, '')}/convite?token=${token}`;
      await r.auditar('usuario.convidado', 'convites', c!.id, { novo: { email: d.email, papel: d.papel, unidade: d.unidade ?? null, canal: d.canal ?? null, limiteAlcada: d.limiteAlcada ?? null } });
      await r.emitir('convite.criado', { conviteId: c!.id, email: d.email, nome: d.nome ?? null, papel: d.papel, link, expiraEm: c!.expira_em, convidadoPor: ator.nome });
      // o link só aparece nesta resposta: no banco fica apenas o hash do token
      return { status: 201, corpo: { id: c!.id, email: d.email, papel: d.papel, expiraEm: c!.expira_em, link } };
    },
  },
  {
    metodo: 'POST',
    caminho: '/usuarios/convites/:id/cancelar',
    auth: 'usuario',
    papeis: ['admin', 'canal'],
    async handler(r) {
      const [c] = await r.tx<{ id: string }[]>`
        update public.convites set cancelado_em = now()
        where id = ${r.params.id!} and org_id = ${r.ator.orgId} and aceito_em is null and cancelado_em is null
          and (${temPapel(r.ator, 'admin')} or convidado_por = ${r.ator.id})
        returning id`;
      if (!c) throw naoEncontrado('Convite pendente não encontrado.');
      await r.auditar('usuario.convite_cancelado', 'convites', c.id);
      return { corpo: { id: c.id, situacao: 'cancelado' } };
    },
  },
  {
    metodo: 'GET',
    caminho: '/convites/:token',
    auth: 'publica',
    async handler(r) {
      const [c] = await r.tx<{ email: string; nome: string | null; papel: string; papel_nome: string; exige_mfa: boolean; organizacao: string; expira_em: Date }[]>`
        select c.email, c.nome, c.papel, p.nome as papel_nome, p.exige_mfa, o.nome as organizacao, c.expira_em
        from public.convites c
        join public.papeis p on p.org_id = c.org_id and p.codigo = c.papel
        join public.organizacoes o on o.id = c.org_id
        where c.token_hash = ${await sha256(r.params.token!)} and c.aceito_em is null and c.cancelado_em is null and c.expira_em > now()`;
      if (!c) throw new ErroHttp(404, 'CONVITE_INVALIDO', 'Este convite não existe, já foi usado ou expirou. Peça um novo ao administrador.');
      return { corpo: { email: c.email, nome: c.nome, papel: c.papel_nome, exigeSegundoFator: c.exige_mfa, organizacao: c.organizacao, expiraEm: c.expira_em } };
    },
  },
  {
    metodo: 'POST',
    caminho: '/convites/aceitar',
    auth: 'publica',
    async handler(r) {
      const { tx, deps } = r;
      const d = validar(
        z.object({ token: z.string().min(20).max(200), nome: z.string().trim().min(2).max(120), senha: senhaForte, aceiteTermos: z.literal(true, { errorMap: () => ({ message: 'É preciso aceitar os termos de uso e de confidencialidade.' }) }) }),
        r.corpo,
      );
      const [c] = await tx<{ id: string; org_id: string; email: string; papel: Papel; unidade_id: string | null; canal_id: string | null; limite_alcada: number | null; convidado_por: string | null }[]>`
        select id, org_id, email, papel, unidade_id, canal_id, limite_alcada, convidado_por from public.convites
        where token_hash = ${await sha256(d.token)} and aceito_em is null and cancelado_em is null and expira_em > now()
        for update`;
      if (!c) throw new ErroHttp(404, 'CONVITE_INVALIDO', 'Este convite não existe, já foi usado ou expirou. Peça um novo ao administrador.');
      const [papel] = await tx<{ exige_mfa: boolean }[]>`select exige_mfa from public.papeis where org_id = ${c.org_id} and codigo = ${c.papel}`;

      const criado = await deps.auth.criarUsuario({ email: c.email, senha: d.senha, nome: d.nome });
      await tx`select set_config('app.ator_id', ${criado.id}, true), set_config('app.ator_tipo', 'usuario', true)`;
      await tx`insert into public.usuarios (id, org_id, nome, email, limite_alcada, aceite_termos_em)
               values (${criado.id}, ${c.org_id}, ${d.nome}, ${c.email}, ${c.limite_alcada}, now())`;
      await tx`insert into public.usuario_papel (org_id, usuario_id, papel, unidade_id, canal_id, valido_ate, criado_por)
               values (${c.org_id}, ${criado.id}, ${c.papel}, ${c.unidade_id}, ${c.canal_id},
                       ${c.papel === 'suporte' ? tx`now() + interval '90 days'` : null}, ${c.convidado_por})`;
      await tx`update public.convites set aceito_em = now(), aceito_por = ${criado.id} where id = ${c.id}`;
      await tx`select app.registrar_evento(${c.org_id}, 'usuario.convite_aceito', 'usuarios', ${criado.id}, null,
                 ${tx.json({ email: c.email, papel: c.papel, convidadoPor: c.convidado_por, aceiteTermos: true })}, '{}'::jsonb)`;
      return { status: 201, corpo: { email: c.email, exigeSegundoFator: papel?.exige_mfa ?? false } };
    },
  },
  {
    metodo: 'PATCH',
    caminho: '/usuarios/:id',
    auth: 'usuario',
    papeis: ['admin'],
    async handler(r) {
      const { tx, ator, deps } = r;
      const d = validar(
        z.object({
          nome: z.string().trim().min(2).max(120).optional(),
          status: z.enum(['ativo', 'suspenso', 'desativado']).optional(),
          motivo: z.string().trim().max(300).optional(),
          limiteAlcada: z.number().int().min(1).max(9).nullable().optional(),
          substitutoId: z.string().uuid().nullable().optional(),
          ausenteAte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
          papeis: z.array(esquemaVinculo).min(1).max(20).optional(),
          transferirPara: z.string().uuid().optional(),
        }),
        r.corpo,
      );
      const [u] = await tx<{ id: string; status: string; nome: string }[]>`select id, status, nome from public.usuarios where id = ${r.params.id!} and org_id = ${ator.orgId} for update`;
      if (!u) throw naoEncontrado('Usuário não encontrado.');
      if (u.id === ator.id && (d.status || d.papeis)) throw proibido('Você não altera o próprio acesso; peça a outro administrador.', 'PROPRIO_ACESSO');

      if (d.papeis) {
        const novos = [];
        for (const v of d.papeis) novos.push({ ...v, ...(await resolverEscopo(r, v.papel, v.unidade, v.canal)) });
        const antes = await tx`select papel, unidade_id, canal_id, valido_ate from public.usuario_papel where usuario_id = ${u.id}`;
        await tx`delete from public.usuario_papel where usuario_id = ${u.id}`;
        for (const v of novos) {
          await tx`insert into public.usuario_papel (org_id, usuario_id, papel, unidade_id, canal_id, valido_ate, criado_por)
                   values (${ator.orgId}, ${u.id}, ${v.papel}, ${v.unidadeId}, ${v.canalId}, ${v.validoAte ?? null}, ${ator.id})`;
        }
        await r.auditar('usuario.papeis_alterados', 'usuarios', u.id, { anterior: antes, novo: novos.map((v) => ({ papel: v.papel, unidade: v.unidade ?? null, canal: v.canal ?? null, validoAte: v.validoAte ?? null })) });
        const [admins] = await tx<{ n: number }[]>`
          select count(*)::int as n from public.usuario_papel up join public.usuarios x on x.id = up.usuario_id
          where up.org_id = ${ator.orgId} and up.papel = 'admin' and x.status = 'ativo'`;
        if ((admins?.n ?? 0) === 0) throw conflito('A instalação precisa de pelo menos um administrador ativo.', 'SEM_ADMINISTRADOR');
      }

      if (d.status && d.status !== u.status) {
        if (d.status !== 'ativo') {
          // desativar, não excluir: as cotações em aberto passam a um responsável indicado
          const [abertas] = await tx<{ n: number }[]>`
            select count(*)::int as n from public.cotacoes where dono_id = ${u.id} and status in ('rascunho', 'em_aprovacao', 'recusada', 'aprovada', 'emitida')`;
          if ((abertas?.n ?? 0) > 0 && d.status === 'desativado') {
            if (!d.transferirPara) throw conflito(`Este usuário tem ${abertas!.n} cotações em aberto; indique quem as assume.`, 'TRANSFERENCIA_NECESSARIA', { cotacoesEmAberto: abertas!.n });
            const [novo] = await tx<{ id: string }[]>`select id from public.usuarios where id = ${d.transferirPara} and org_id = ${ator.orgId} and status = 'ativo' and id <> ${u.id}`;
            if (!novo) throw invalido('O responsável indicado não é um usuário ativo.');
            await tx`update public.cotacoes set dono_id = ${novo.id} where dono_id = ${u.id} and status in ('rascunho', 'em_aprovacao', 'recusada', 'aprovada', 'emitida')`;
          }
          const [admins] = await tx<{ n: number }[]>`
            select count(*)::int as n from public.usuario_papel up join public.usuarios x on x.id = up.usuario_id
            where up.org_id = ${ator.orgId} and up.papel = 'admin' and x.status = 'ativo' and x.id <> ${u.id}`;
          if ((admins?.n ?? 0) === 0) throw conflito('A instalação precisa de pelo menos um administrador ativo.', 'SEM_ADMINISTRADOR');
        }
        await tx`update public.usuarios set status = ${d.status}, motivo_status = ${d.motivo ?? null}, status_alterado_em = now() where id = ${u.id}`;
        // o acesso cai na hora: o login é bloqueado no serviço de autenticação
        await deps.auth.definirBloqueio(u.id, d.status !== 'ativo');
        await r.auditar(`usuario.${d.status === 'ativo' ? 'reativado' : d.status}`, 'usuarios', u.id, { anterior: { status: u.status }, novo: { status: d.status, motivo: d.motivo ?? null, transferidoPara: d.transferirPara ?? null } });
      }

      if (d.substitutoId) {
        const [s] = await tx<{ id: string }[]>`select id from public.usuarios where id = ${d.substitutoId} and org_id = ${ator.orgId} and status = 'ativo' and id <> ${u.id}`;
        if (!s) throw invalido('O substituto precisa ser outro usuário ativo.');
      }
      await tx`update public.usuarios set
          nome = coalesce(${d.nome ?? null}, nome),
          limite_alcada = ${d.limiteAlcada === undefined ? tx`limite_alcada` : d.limiteAlcada},
          substituto_id = ${d.substitutoId === undefined ? tx`substituto_id` : d.substitutoId},
          ausente_ate = ${d.ausenteAte === undefined ? tx`ausente_ate` : d.ausenteAte}
        where id = ${u.id}`;
      return { corpo: { id: u.id, atualizado: true } };
    },
  },
  {
    // Renovação do acesso com prazo (suporte da consultoria), pelo administrador do cliente.
    metodo: 'POST',
    caminho: '/usuarios/:id/renovar-acesso',
    auth: 'usuario',
    papeis: ['admin'],
    async handler(r) {
      const d = validar(z.object({ dias: z.number().int().min(1).max(180) }), r.corpo);
      const linhas = await r.tx<{ id: string }[]>`
        update public.usuario_papel set valido_ate = now() + make_interval(days => ${d.dias})
        where usuario_id = ${r.params.id!} and org_id = ${r.ator.orgId} and valido_ate is not null returning id`;
      if (linhas.length === 0) throw naoEncontrado('Este usuário não tem acesso com prazo.');
      await r.auditar('usuario.acesso_renovado', 'usuarios', r.params.id!, { novo: { dias: d.dias } });
      return { corpo: { id: r.params.id, renovadoPorDias: d.dias } };
    },
  },
];
