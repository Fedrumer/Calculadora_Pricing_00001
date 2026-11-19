import { validarRegras } from '@pricing/motor';
import { z } from 'zod';
import { type Requisicao, type Rota, validar } from '../app.ts';
import { hoje } from '../contexto.ts';
import { conflito, invalido, naoEncontrado } from '../erros.ts';
import { carregarRegras } from '../regras.ts';

// A9: piloto com grupo de controle. Só o gestor de pricing (com segundo fator) cria,
// ativa e encerra. Ativado, o piloto é imutável e a regra alternativa fica
// congelada com status "piloto": imutável, mas fora da escolha da regra vigente.

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD.');
const uuid = z.string().uuid();
const esquema = z
  .object({
    nome: z.string().trim().min(3).max(120),
    notaReferencia: z.string().trim().max(120).nullish(),
    inicio: dataIso,
    fim: dataIso,
    tabelaId: uuid.nullish(),
    politicaId: uuid.nullish(),
    criterio: z.enum(['unidade', 'canal', 'vendedor']),
    tratamento: z.array(uuid).min(1).max(200),
    controle: z.array(uuid).min(1).max(200),
  })
  .refine((d) => d.fim >= d.inicio, { message: 'O fim não pode ser antes do início.', path: ['fim'] })
  .refine((d) => d.tabelaId || d.politicaId, { message: 'Informe a tabela, a política alternativa ou as duas.', path: ['tabelaId'] })
  .refine((d) => !d.tratamento.some((t) => d.controle.includes(t)), { message: 'Um membro não pode estar no tratamento e no controle.', path: ['controle'] });

interface LinhaPiloto {
  id: string;
  status: string;
  inicio: string;
  fim: string;
  tabela_id: string | null;
  politica_id: string | null;
  criterio: string;
}

async function obter(r: Requisicao, id: string): Promise<LinhaPiloto> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw naoEncontrado('Piloto não encontrado.');
  const [p] = await r.tx<LinhaPiloto[]>`
    select id, status, inicio::text, fim::text, tabela_id, politica_id, criterio from public.pilotos
    where id = ${id} and org_id = ${r.ator.orgId} for update`;
  if (!p) throw naoEncontrado('Piloto não encontrado.');
  return p;
}

/** Confere que regra alternativa e membros existem nesta organização. */
async function conferir(r: Requisicao, d: z.infer<typeof esquema>) {
  const { tx, ator } = r;
  for (const [id, tabela, nome] of [
    [d.tabelaId, tx`public.tabelas_preco`, 'Tabela'],
    [d.politicaId, tx`public.politicas`, 'Política'],
  ] as const) {
    if (!id) continue;
    const [x] = await tx<{ status: string }[]>`select status from ${tabela} where id = ${id} and org_id = ${ator.orgId}`;
    if (!x) throw invalido(`${nome} alternativa não encontrada.`);
    if (x.status === 'arquivada') throw invalido(`${nome} alternativa está arquivada.`);
  }
  const membros = [...d.tratamento, ...d.controle];
  const fonte =
    d.criterio === 'vendedor'
      ? tx`select id from public.usuarios where org_id = ${ator.orgId} and id in ${tx(membros)}`
      : d.criterio === 'canal'
        ? tx`select id from public.canais where org_id = ${ator.orgId} and id in ${tx(membros)}`
        : tx`select id from public.unidades where org_id = ${ator.orgId} and id in ${tx(membros)}`;
  const achados = new Set((await fonte).map((x) => x.id as string));
  const faltam = membros.filter((m) => !achados.has(m));
  if (faltam.length) throw invalido(`Há ${faltam.length} membro(s) que não são ${d.criterio === 'vendedor' ? 'usuários' : d.criterio === 'canal' ? 'canais' : 'unidades'} desta organização.`);
}

export const rotasPilotos: Rota[] = [
  {
    metodo: 'POST',
    caminho: '/pilotos',
    auth: 'usuario',
    papeis: ['gestor_pricing'],
    async handler(r) {
      const d = validar(esquema, r.corpo);
      await conferir(r, d);
      const [p] = await r.tx<{ id: string }[]>`
        insert into public.pilotos (org_id, nome, nota_referencia, inicio, fim, tabela_id, politica_id, criterio, tratamento, controle, criado_por)
        values (${r.ator.orgId}, ${d.nome}, ${d.notaReferencia ?? null}, ${d.inicio}::date, ${d.fim}::date, ${d.tabelaId ?? null}, ${d.politicaId ?? null},
                ${d.criterio}, ${r.tx.array(d.tratamento)}::uuid[], ${r.tx.array(d.controle)}::uuid[], ${r.ator.id})
        returning id`;
      return { status: 201, corpo: { id: p!.id, status: 'rascunho' } };
    },
  },
  {
    metodo: 'PUT',
    caminho: '/pilotos/:id',
    auth: 'usuario',
    papeis: ['gestor_pricing'],
    async handler(r) {
      const p = await obter(r, r.params.id!);
      if (p.status !== 'rascunho') throw conflito('Só um piloto em rascunho pode ser alterado.', 'STATUS_INVALIDO');
      const d = validar(esquema, r.corpo);
      await conferir(r, d);
      await r.tx`
        update public.pilotos set nome = ${d.nome}, nota_referencia = ${d.notaReferencia ?? null}, inicio = ${d.inicio}::date, fim = ${d.fim}::date,
          tabela_id = ${d.tabelaId ?? null}, politica_id = ${d.politicaId ?? null}, criterio = ${d.criterio},
          tratamento = ${r.tx.array(d.tratamento)}::uuid[], controle = ${r.tx.array(d.controle)}::uuid[]
        where id = ${p.id}`;
      return { corpo: { id: p.id, status: 'rascunho' } };
    },
  },
  {
    metodo: 'DELETE',
    caminho: '/pilotos/:id',
    auth: 'usuario',
    papeis: ['gestor_pricing'],
    async handler(r) {
      const p = await obter(r, r.params.id!);
      if (p.status !== 'rascunho') throw conflito('Piloto ativado não pode ser excluído; encerre-o.', 'STATUS_INVALIDO');
      await r.tx`delete from public.pilotos where id = ${p.id}`;
      await r.auditar('piloto.excluido', 'pilotos', p.id, { resumo: 'Rascunho de piloto excluído.' });
      return { corpo: { id: p.id, excluido: true } };
    },
  },
  {
    metodo: 'POST',
    caminho: '/pilotos/:id/ativar',
    auth: 'usuario',
    papeis: ['gestor_pricing'],
    async handler(r) {
      const { tx, ator } = r;
      const p = await obter(r, r.params.id!);
      if (p.status !== 'rascunho') throw conflito('Só um piloto em rascunho pode ser ativado.', 'STATUS_INVALIDO');
      const dia = hoje(r.deps);
      if (p.fim < dia) throw invalido('O período do piloto já terminou.', undefined, 'PERIODO_ENCERRADO');

      // a regra alternativa precisa calcular sem erro antes de valer para o tratamento
      const regras = (await carregarRegras(tx, ator.orgId, p.inicio < dia ? dia : p.inicio, { ...(p.tabela_id ? { tabelaId: p.tabela_id } : {}), ...(p.politica_id ? { politicaId: p.politica_id } : {}) })).regras;
      const validacao = validarRegras(regras);
      if (validacao.erros.length > 0) throw invalido('A regra alternativa tem erros e não pode entrar em piloto.', validacao.erros, 'REGRAS_INVALIDAS');

      // congela as alternativas em rascunho: imutáveis e fora da escolha da regra vigente
      for (const [id, tabela] of [
        [p.tabela_id, tx`public.tabelas_preco`],
        [p.politica_id, tx`public.politicas`],
      ] as const) {
        if (!id) continue;
        await tx`update ${tabela} set status = 'piloto', vigencia_inicio = ${p.inicio}::date, vigencia_fim = ${p.fim}::date,
                   publicado_por = ${ator.id}, publicado_em = now()
                 where id = ${id} and status = 'rascunho'`;
      }
      try {
        await tx.savepoint(async (sp) => {
          await sp`update public.pilotos set status = 'ativo', ativado_por = ${ator.id}, ativado_em = now() where id = ${p.id}`;
        });
      } catch (e) {
        if ((e as { code?: string }).code === '23505') {
          throw conflito(`Algum ${p.criterio === 'vendedor' ? 'vendedor' : p.criterio} deste piloto já está em outro piloto ativo.`, 'MEMBRO_EM_OUTRO_PILOTO');
        }
        throw e;
      }
      await r.emitir('piloto.ativado', { pilotoId: p.id, inicio: p.inicio, fim: p.fim });
      return { corpo: { id: p.id, status: 'ativo' } };
    },
  },
  {
    metodo: 'POST',
    caminho: '/pilotos/:id/encerrar',
    auth: 'usuario',
    papeis: ['gestor_pricing'],
    async handler(r) {
      const d = validar(z.object({ motivo: z.string().trim().min(5, 'Explique por que o piloto termina.').max(500) }), r.corpo);
      const p = await obter(r, r.params.id!);
      if (p.status !== 'ativo') throw conflito('Só um piloto ativo pode ser encerrado.', 'STATUS_INVALIDO');
      await r.tx`update public.pilotos set status = 'encerrado', encerrado_por = ${r.ator.id}, encerrado_em = now(), motivo_encerramento = ${d.motivo} where id = ${p.id}`;
      await r.emitir('piloto.encerrado', { pilotoId: p.id });
      return { corpo: { id: p.id, status: 'encerrado' } };
    },
  },
];
