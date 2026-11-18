import { VERSAO_MOTOR } from '@pricing/motor';
import { z } from 'zod';
import { type Rota, validar } from '../app.ts';
import { decifrar, hmac, mascararDocumento, sha256, soDigitos, tokenAleatorio } from '../cripto.ts';
import { conflito, invalido, naoEncontrado } from '../erros.ts';

const codigo = z.string().trim().min(1).max(60).regex(/^[\w.+-]+$/);

// Integrações, configurações, catálogo e LGPD: telas de administração ------------
export const rotasAdministracao: Rota[] = [
  {
    metodo: 'GET',
    caminho: '/saude',
    auth: 'publica',
    async handler(r) {
      const [b] = await r.tx<{ ok: number }[]>`select 1 as ok`;
      return { corpo: { ok: b?.ok === 1, motor: VERSAO_MOTOR, ambiente: r.deps.config.ambiente, ia: r.deps.ia.disponivel } };
    },
  },
  {
    metodo: 'POST',
    caminho: '/integracoes/chaves',
    auth: 'usuario',
    papeis: ['admin'],
    async handler(r) {
      const { tx, ator } = r;
      const d = validar(z.object({ nome: z.string().trim().min(3).max(80), canal: codigo, validadeDias: z.number().int().min(1).max(730).default(365), limitePorMinuto: z.number().int().min(1).max(600).default(60) }), r.corpo);
      const [c] = await tx<{ id: string }[]>`select id from public.canais where org_id = ${ator.orgId} and codigo = ${d.canal} and ativo`;
      if (!c) throw invalido(`Canal "${d.canal}" não existe.`);
      const chave = `pk_${tokenAleatorio(30)}`;
      const [k] = await tx<{ id: string; expira_em: Date }[]>`
        insert into public.chaves_api (org_id, canal_id, nome, prefixo, hash, limite_por_minuto, expira_em, criado_por)
        values (${ator.orgId}, ${c.id}, ${d.nome}, ${chave.slice(0, 10)}, ${await sha256(chave)}, ${d.limitePorMinuto}, now() + make_interval(days => ${d.validadeDias}), ${ator.id})
        returning id, expira_em`;
      await r.auditar('integracao.chave_criada', 'chaves_api', k!.id, { novo: { nome: d.nome, canal: d.canal } });
      // a chave só aparece nesta resposta: no banco fica apenas o hash
      return { status: 201, corpo: { id: k!.id, nome: d.nome, chave, expiraEm: k!.expira_em } };
    },
  },
  {
    metodo: 'POST',
    caminho: '/integracoes/chaves/:id/revogar',
    auth: 'usuario',
    papeis: ['admin'],
    async handler(r) {
      const [k] = await r.tx<{ id: string }[]>`update public.chaves_api set revogada_em = now() where id = ${r.params.id!} and org_id = ${r.ator.orgId} and revogada_em is null returning id`;
      if (!k) throw naoEncontrado('Chave ativa não encontrada.');
      await r.auditar('integracao.chave_revogada', 'chaves_api', k.id);
      return { corpo: { id: k.id, revogada: true } };
    },
  },
  {
    metodo: 'POST',
    caminho: '/integracoes/webhooks',
    auth: 'usuario',
    papeis: ['admin'],
    async handler(r) {
      const d = validar(z.object({ nome: z.string().trim().min(3).max(80), url: z.string().url().startsWith('https://', 'O endereço precisa ser HTTPS.').max(500), eventos: z.array(z.string().max(60)).max(30).default([]), ativo: z.boolean().default(true) }), r.corpo);
      const [w] = await r.tx<{ id: string }[]>`
        insert into public.webhooks (org_id, nome, url, eventos, ativo, criado_por)
        values (${r.ator.orgId}, ${d.nome}, ${d.url}, ${d.eventos}, ${d.ativo}, ${r.ator.id}) returning id`;
      return { status: 201, corpo: { id: w!.id } };
    },
  },
  {
    metodo: 'PUT',
    caminho: '/organizacao/config',
    auth: 'usuario',
    papeis: ['admin'],
    async handler(r) {
      const cor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor no formato #RRGGBB.');
      const d = validar(
        z.object({
          identidade: z.object({ nomeFantasia: z.string().trim().min(2).max(80), corPrimaria: cor, corDestaque: cor, rodapeProposta: z.string().max(400) }).partial().optional(),
          prazos: z.object({ conviteHoras: z.number().int().min(1).max(720), inatividadeDias: z.number().int().min(7).max(730) }).partial().optional(),
          modulos: z.object({ portalCanal: z.boolean(), api: z.boolean(), ia: z.boolean(), sso: z.boolean(), conviteCanal: z.boolean() }).partial().optional(),
          retencao: z.object({ cotacoesAceitasAnos: z.number().int().min(1).max(30), cotacoesPerdidasMeses: z.number().int().min(1).max(360), auditoriaAnos: z.number().int().min(1).max(30) }).partial().optional(),
          motivosPerda: z
            .array(z.object({ codigo: z.string().regex(/^[a-z0-9_]{1,40}$/), nome: z.string().trim().min(2).max(80), pedeTexto: z.boolean(), pedeConcorrente: z.boolean(), ativo: z.boolean() }))
            .min(1)
            .max(30)
            .refine((l) => new Set(l.map((m) => m.codigo)).size === l.length, 'Códigos repetidos.')
            .refine((l) => l.some((m) => m.ativo), 'Pelo menos um motivo ativo.')
            .optional(),
        }),
        r.corpo,
      );
      const [o] = await r.tx<{ config: Record<string, Record<string, unknown>> }[]>`select config from public.organizacoes where id = ${r.ator.orgId} for update`;
      const config = { ...(o?.config ?? {}) };
      for (const [secao, valores] of Object.entries(d)) {
        // listas substituem; seções de objeto mesclam
        config[secao] = Array.isArray(valores) ? (valores as never) : { ...(config[secao] ?? {}), ...valores };
      }
      await r.tx`update public.organizacoes set config = ${r.tx.json(config as never)} where id = ${r.ator.orgId}`;
      return { corpo: { config } };
    },
  },
  {
    metodo: 'PUT',
    caminho: '/catalogo/canais',
    auth: 'usuario',
    papeis: ['admin'],
    async handler(r) {
      const d = validar(z.object({ codigo, nome: z.string().trim().min(2).max(120), tipo: z.string().trim().max(40).default('parceiro'), ativo: z.boolean().default(true), permiteConvite: z.boolean().default(false) }), r.corpo);
      const [c] = await r.tx<{ id: string }[]>`
        insert into public.canais (org_id, codigo, nome, tipo, ativo, permite_convite)
        values (${r.ator.orgId}, ${d.codigo}, ${d.nome}, ${d.tipo}, ${d.ativo}, ${d.permiteConvite})
        on conflict (org_id, codigo) do update set nome = excluded.nome, tipo = excluded.tipo, ativo = excluded.ativo, permite_convite = excluded.permite_convite
        returning id`;
      return { corpo: { id: c!.id, codigo: d.codigo } };
    },
  },
  {
    metodo: 'PUT',
    caminho: '/catalogo/unidades',
    auth: 'usuario',
    papeis: ['admin'],
    async handler(r) {
      const d = validar(z.object({ codigo, nome: z.string().trim().min(2).max(120), ativo: z.boolean().default(true) }), r.corpo);
      const [u] = await r.tx<{ id: string }[]>`
        insert into public.unidades (org_id, codigo, nome, ativo) values (${r.ator.orgId}, ${d.codigo}, ${d.nome}, ${d.ativo})
        on conflict (org_id, codigo) do update set nome = excluded.nome, ativo = excluded.ativo returning id`;
      return { corpo: { id: u!.id, codigo: d.codigo } };
    },
  },
  {
    metodo: 'PUT',
    caminho: '/catalogo/campanhas',
    auth: 'usuario',
    papeis: ['gestor_pricing'],
    async handler(r) {
      const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
      const d = validar(
        z.object({
          codigo, nome: z.string().trim().min(2).max(120), inicio: data, fim: data, tipo: z.enum(['percentual', 'valor']), valor: z.number().positive().finite(),
          produtos: z.array(codigo).max(100).nullish(), canais: z.array(codigo).max(100).nullish(), condicoes: z.record(z.array(z.string().max(60)).max(50)).nullish(),
          acumulaComDesconto: z.boolean().default(false), acumulaComOutras: z.boolean().default(false), ativo: z.boolean().default(true),
        }).refine((x) => x.fim >= x.inicio, { message: 'O fim não pode ser antes do início.', path: ['fim'] })
          .refine((x) => x.tipo !== 'percentual' || x.valor < 100, { message: 'Percentual deve ser menor que 100.', path: ['valor'] }),
        r.corpo,
      );
      const [c] = await r.tx<{ id: string }[]>`
        insert into public.campanhas (org_id, codigo, nome, inicio, fim, tipo, valor, produtos, canais, condicoes, acumula_com_desconto, acumula_com_outras, ativo)
        values (${r.ator.orgId}, ${d.codigo}, ${d.nome}, ${d.inicio}::date, ${d.fim}::date, ${d.tipo}, ${d.valor}, ${d.produtos ?? null}, ${d.canais ?? null},
                ${d.condicoes ? r.tx.json(d.condicoes) : null}, ${d.acumulaComDesconto}, ${d.acumulaComOutras}, ${d.ativo})
        on conflict (org_id, codigo) do update set nome = excluded.nome, inicio = excluded.inicio, fim = excluded.fim, tipo = excluded.tipo, valor = excluded.valor,
          produtos = excluded.produtos, canais = excluded.canais, condicoes = excluded.condicoes,
          acumula_com_desconto = excluded.acumula_com_desconto, acumula_com_outras = excluded.acumula_com_outras, ativo = excluded.ativo
        returning id`;
      return { corpo: { id: c!.id, codigo: d.codigo } };
    },
  },
  {
    metodo: 'PUT',
    caminho: '/catalogo/produtos',
    auth: 'usuario',
    papeis: ['gestor_pricing'],
    async handler(r) {
      const { tx, ator } = r;
      const d = validar(
        z.object({
          codigo, nome: z.string().trim().min(2).max(120), descricao: z.string().max(500).default(''), ativo: z.boolean().default(true),
          dimensoes: z.array(codigo).max(20), multiplicadores: z.array(codigo).max(5).default([]),
          componentes: z.array(z.object({ codigo, nome: z.string().trim().min(1).max(120), obrigatorio: z.boolean().default(false), ativo: z.boolean().default(true) })).max(50).default([]),
        }),
        r.corpo,
      );
      const conhecidas = new Set((await tx<{ codigo: string }[]>`select codigo from public.dimensoes where org_id = ${ator.orgId}`).map((x) => x.codigo));
      for (const dim of [...d.dimensoes, ...d.multiplicadores]) if (!conhecidas.has(dim)) throw invalido(`Dimensão "${dim}" não existe.`);
      const [p] = await tx<{ id: string }[]>`
        insert into public.produtos (org_id, codigo, nome, descricao, ativo, dimensoes, multiplicadores)
        values (${ator.orgId}, ${d.codigo}, ${d.nome}, ${d.descricao}, ${d.ativo}, ${d.dimensoes}, ${d.multiplicadores})
        on conflict (org_id, codigo) do update set nome = excluded.nome, descricao = excluded.descricao, ativo = excluded.ativo,
          dimensoes = excluded.dimensoes, multiplicadores = excluded.multiplicadores
        returning id`;
      for (const [i, c] of d.componentes.entries()) {
        await tx`insert into public.componentes (org_id, produto_id, codigo, nome, obrigatorio, ativo, ordem)
                 values (${ator.orgId}, ${p!.id}, ${c.codigo}, ${c.nome}, ${c.obrigatorio}, ${c.ativo}, ${i})
                 on conflict (produto_id, codigo) do update set nome = excluded.nome, obrigatorio = excluded.obrigatorio, ativo = excluded.ativo, ordem = excluded.ordem`;
      }
      return { corpo: { id: p!.id, codigo: d.codigo } };
    },
  },
  {
    metodo: 'PUT',
    caminho: '/catalogo/dimensoes',
    auth: 'usuario',
    papeis: ['gestor_pricing'],
    async handler(r) {
      const d = validar(
        z.object({
          codigo, nome: z.string().trim().min(2).max(120), tipo: z.enum(['categoria', 'faixa']),
          valores: z.array(z.object({ codigo: z.string().min(1).max(60), nome: z.string().min(1).max(120) })).max(200).default([]),
          faixas: z.array(z.object({ codigo: z.string().min(1).max(60), nome: z.string().max(120).optional(), min: z.number().min(0), max: z.number().nullable() })).max(100).default([]),
        }).refine((x) => (x.tipo === 'categoria' ? x.valores.length > 0 : x.faixas.length > 0), { message: 'Informe os valores ou as faixas.' }),
        r.corpo,
      );
      const [x] = await r.tx<{ id: string }[]>`
        insert into public.dimensoes (org_id, codigo, nome, tipo, valores, faixas)
        values (${r.ator.orgId}, ${d.codigo}, ${d.nome}, ${d.tipo}, ${r.tx.json(d.valores)}, ${r.tx.json(d.faixas as never)})
        on conflict (org_id, codigo) do update set nome = excluded.nome, tipo = excluded.tipo, valores = excluded.valores, faixas = excluded.faixas
        returning id`;
      return { corpo: { id: x!.id, codigo: d.codigo } };
    },
  },

  // LGPD: direitos do titular -----------------------------------------------------
  {
    metodo: 'POST',
    caminho: '/lgpd/localizar',
    auth: 'usuario',
    papeis: ['admin'],
    async handler(r) {
      const { tx, ator, deps } = r;
      const d = validar(z.object({ documento: z.string().max(30).optional(), email: z.string().email().optional(), nome: z.string().trim().min(3).max(160).optional() }).refine((x) => x.documento || x.email || x.nome, { message: 'Informe documento, e-mail ou nome.' }), r.corpo);
      const hash = d.documento ? await hmac(deps.config.segredoHash, soDigitos(d.documento)) : null;
      const linhas = await tx<{ id: string; numero: number; cliente_nome: string; cliente_email: string | null; status: string; criado_em: Date; documento_cifrado: string | null; anonimizada_em: Date | null }[]>`
        select c.id, c.numero, c.cliente_nome, c.cliente_email, c.status, c.criado_em, p.documento_cifrado, c.anonimizada_em
        from public.cotacoes c left join public.cotacao_dados_pessoais p on p.cotacao_id = c.id
        where c.org_id = ${ator.orgId}
          and ((${hash}::text is not null and p.documento_hash = ${hash})
            or (${d.email ?? null}::text is not null and lower(c.cliente_email) = lower(${d.email ?? null}))
            or (${d.nome ?? null}::text is not null and c.cliente_nome ilike ${d.nome ? `%${d.nome}%` : null}))
        order by c.criado_em desc limit 500`;
      const cotacoes = [];
      for (const l of linhas) {
        cotacoes.push({
          id: l.id, numero: l.numero, clienteNome: l.cliente_nome, clienteEmail: l.cliente_email, status: l.status, criadoEm: l.criado_em, anonimizadaEm: l.anonimizada_em,
          documento: l.documento_cifrado ? mascararDocumento(await decifrar(deps.config.chaveCifra, l.documento_cifrado)) : null,
        });
      }
      await r.auditar('lgpd.localizacao', 'cotacoes', ator.orgId, { contexto: { criterios: Object.keys(d), encontrados: cotacoes.length } });
      return { corpo: { total: cotacoes.length, cotacoes } };
    },
  },
  {
    metodo: 'POST',
    caminho: '/lgpd/anonimizar',
    auth: 'usuario',
    papeis: ['admin'],
    async handler(r) {
      const { tx, ator } = r;
      const d = validar(z.object({ cotacaoIds: z.array(z.string().uuid()).min(1).max(500), motivo: z.string().trim().min(5).max(300) }), r.corpo);
      const abertas = await tx<{ numero: number }[]>`
        select numero from public.cotacoes where org_id = ${ator.orgId} and id in ${tx(d.cotacaoIds)} and status in ('rascunho', 'em_aprovacao', 'recusada', 'aprovada', 'emitida')`;
      if (abertas.length > 0) throw conflito(`Há cotações em aberto (${abertas.map((a) => a.numero).join(', ')}); encerre-as antes de anonimizar.`, 'COTACOES_EM_ABERTO');
      // valores são mantidos para análise; só o dado pessoal sai
      const feitas = await tx<{ id: string }[]>`
        update public.cotacoes set cliente_nome = 'Titular anonimizado', cliente_email = null, anonimizada_em = now()
        where org_id = ${ator.orgId} and id in ${tx(d.cotacaoIds)} and anonimizada_em is null returning id`;
      await tx`delete from public.cotacao_dados_pessoais where org_id = ${ator.orgId} and cotacao_id in ${tx(d.cotacaoIds)}`;
      await r.auditar('lgpd.anonimizacao', 'cotacoes', ator.orgId, { contexto: { motivo: d.motivo, cotacoes: feitas.length } });
      return { corpo: { anonimizadas: feitas.length } };
    },
  },
];
