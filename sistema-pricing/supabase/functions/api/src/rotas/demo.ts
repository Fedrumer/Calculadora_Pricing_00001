import { z } from 'zod';
import { gerarHistorico } from '../../../_shared/instalacao/historico.ts';
import { instalar } from '../../../_shared/instalacao/instalar.ts';
import { type Rota, validar } from '../app.ts';
import { CONFIGS_DEMO } from '../demo-configs.ts';
import { ErroHttp, conflito } from '../erros.ts';

/**
 * Reposição do ambiente de demonstração, em etapas (cada chamada cabe no limite
 * de processamento de uma função): limpar, instalar e gerar o histórico por
 * janelas de dias. Só existe quando AMBIENTE=demonstracao e exige a credencial
 * de automação. A organização instalada precisa ser a da própria demonstração.
 */
export const rotasDemo: Rota[] = [
  {
    metodo: 'POST',
    caminho: '/demo/repor',
    auth: 'publica',
    async handler(r) {
      const { tx, deps } = r;
      if (deps.config.ambiente !== 'demonstracao') throw new ErroHttp(404, 'ROTA_DESCONHECIDA', 'Rota não encontrada.');
      const enviado = r.req.headers.get('x-automacao-segredo') ?? '';
      if (!deps.config.segredoAutomacao || enviado !== deps.config.segredoAutomacao) throw new ErroHttp(401, 'NAO_AUTENTICADO', 'Credencial de automação inválida.');
      const d = validar(
        z.discriminatedUnion('etapa', [
          z.object({ etapa: z.literal('limpar'), config: z.string().default('assistencia') }),
          z.object({ etapa: z.literal('instalar'), config: z.string().default('assistencia'), senha: z.string().min(12) }),
          z.object({ etapa: z.literal('historico'), config: z.string().default('assistencia'), de: z.number().int().min(0).max(365), ate: z.number().int().min(0).max(365) }),
        ]),
        r.corpo,
      );
      const config = CONFIGS_DEMO[d.config];
      if (!config) throw new ErroHttp(422, 'ENTRADA_INVALIDA', `Configuração "${d.config}" não existe.`);
      const orgs = await tx<{ id: string; slug: string }[]>`select id, slug from public.organizacoes`;
      if (orgs.some((o) => !Object.values(CONFIGS_DEMO).some((c) => c.organizacao.slug === o.slug))) {
        throw conflito('Recusado: esta instalação tem uma organização que não é da demonstração.', 'NAO_E_DEMONSTRACAO');
      }

      if (d.etapa === 'limpar') {
        const emails = Object.values(CONFIGS_DEMO).flatMap((c) => (c.usuarios ?? []).map((u) => u.email.toLowerCase()));
        await tx`set local session_replication_role = replica`;
        const tabelas = await tx<{ tablename: string }[]>`select tablename from pg_tables where schemaname = 'public'`;
        await tx.unsafe(`truncate ${tabelas.map((t) => `public."${t.tablename}"`).join(', ')} restart identity cascade`);
        await tx`set local session_replication_role = origin`;
        const apagados = await tx`delete from auth.users where lower(email) in ${tx(emails)} returning id`;
        return { corpo: { etapa: 'limpar', tabelas: tabelas.length, usuariosRemovidos: apagados.length } };
      }

      if (d.etapa === 'instalar') {
        if (orgs.length > 0) throw conflito('Já existe uma organização instalada; rode a etapa "limpar" antes.', 'JA_INSTALADA');
        const criados: string[] = [];
        const resultado = await instalar(deps.sql, config, {
          criarUsuarioAuth: async ({ email, nome }) => {
            const u = await deps.auth.criarUsuario({ email, nome, senha: d.senha });
            criados.push(u.id);
            return u.id;
          },
        });
        return { status: 201, corpo: { etapa: 'instalar', organizacao: config.organizacao.nome, usuarios: criados.length, casosReferencia: resultado.casosReferencia } };
      }

      const org = orgs.find((o) => o.slug === config.organizacao.slug);
      if (!org) throw conflito('Instale a organização antes de gerar o histórico.', 'NAO_INSTALADA');
      const h = await gerarHistorico(deps.sql, org.id, config, { janela: { de: d.de, ate: d.ate } });
      return { corpo: { etapa: 'historico', ...h } };
    },
  },
];
