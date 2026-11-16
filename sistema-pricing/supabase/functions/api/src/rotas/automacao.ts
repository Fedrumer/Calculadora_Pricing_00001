import { z } from 'zod';
import { type Rota, validar } from '../app.ts';
import { hoje } from '../contexto.ts';
import { invalido } from '../erros.ts';
import { vigiar } from './ia.ts';
import { lerCsvTabela } from './regras.ts';

// Rotas do n8n. Ele usa uma credencial própria (segredo de automação) e só
// alcança o que está aqui: avisa, importa, relata e copia; nunca calcula preço.
export const rotasAutomacao: Rota[] = [
  {
    // Expiração diária de cotações vencidas.
    metodo: 'POST',
    caminho: '/automacao/expirar-cotacoes',
    auth: 'automacao',
    async handler(r) {
      const vencidas = await r.tx<{ id: string; numero: number }[]>`
        update public.cotacoes set status = 'expirada'
        where org_id = ${r.ator.orgId} and status = 'emitida' and validade < ${hoje(r.deps)}::date
        returning id, numero`;
      for (const c of vencidas) {
        await r.auditar('cotacao.expirada', 'cotacoes', c.id, { resumo: 'Validade vencida sem desfecho.' });
      }
      return { corpo: { expiradas: vencidas.length, numeros: vencidas.map((c) => c.numero) } };
    },
  },
  {
    // Aviso de aprovação pendente, com lembrete e escalonamento se passar do prazo.
    metodo: 'POST',
    caminho: '/automacao/lembretes-aprovacao',
    auth: 'automacao',
    async handler(r) {
      const { tx, ator, deps } = r;
      const pendentes = await tx<{ id: string; cotacao_id: string; numero: number; nivel_alcada: number; prazo: Date; criado_em: Date; lembrado_em: Date | null; escalonado_em: Date | null; solicitante: string | null }[]>`
        select a.id, a.cotacao_id, c.numero, a.nivel_alcada, a.prazo, a.criado_em, a.lembrado_em, a.escalonado_em, u.nome as solicitante
        from public.aprovacoes a join public.cotacoes c on c.id = a.cotacao_id left join public.usuarios u on u.id = a.solicitante_id
        where a.org_id = ${ator.orgId} and a.status = 'pendente' and a.prazo < now()
        order by a.prazo`;
      const aprovadores = await tx<{ id: string; nome: string; email: string; limite_alcada: number; substituto_email: string | null; ausente: boolean }[]>`
        select u.id, u.nome, u.email, u.limite_alcada, s.email as substituto_email, coalesce(u.ausente_ate >= ${hoje(deps)}::date, false) as ausente
        from public.usuarios u left join public.usuarios s on s.id = u.substituto_id and s.status = 'ativo'
        where u.org_id = ${ator.orgId} and u.status = 'ativo' and u.limite_alcada is not null
          and exists (select 1 from public.usuario_papel up where up.usuario_id = u.id and up.papel in ('aprovador', 'gestor_pricing'))`;
      const destinatarios = (nivelMinimo: number) => [
        ...new Set(aprovadores.filter((a) => a.limite_alcada >= nivelMinimo).map((a) => (a.ausente && a.substituto_email ? a.substituto_email : a.email))),
      ];
      const avisos = [];
      for (const p of pendentes) {
        const atrasoMs = deps.agora().getTime() - new Date(p.prazo).getTime();
        const prazoMs = new Date(p.prazo).getTime() - new Date(p.criado_em).getTime();
        if (!p.lembrado_em) {
          await tx`update public.aprovacoes set lembrado_em = now() where id = ${p.id}`;
          avisos.push({ tipo: 'lembrete', aprovacaoId: p.id, cotacaoId: p.cotacao_id, numero: p.numero, nivelAlcada: p.nivel_alcada, solicitante: p.solicitante, para: destinatarios(p.nivel_alcada) });
        } else if (!p.escalonado_em && atrasoMs > prazoMs) {
          // passou o dobro do prazo: sobe um nível
          await tx`update public.aprovacoes set escalonado_em = now() where id = ${p.id}`;
          const acima = destinatarios(p.nivel_alcada + 1);
          avisos.push({ tipo: 'escalonamento', aprovacaoId: p.id, cotacaoId: p.cotacao_id, numero: p.numero, nivelAlcada: p.nivel_alcada, solicitante: p.solicitante, para: acima.length > 0 ? acima : destinatarios(p.nivel_alcada) });
        }
      }
      return { corpo: { atrasadas: pendentes.length, avisos } };
    },
  },
  {
    // Conta sem acesso pelo prazo configurado (padrão: 90 dias) é suspensa automaticamente.
    metodo: 'POST',
    caminho: '/automacao/inatividade',
    auth: 'automacao',
    async handler(r) {
      const { tx, ator, deps } = r;
      const [org] = await tx<{ dias: number | null }[]>`select (config #>> '{prazos,inatividadeDias}')::int as dias from public.organizacoes where id = ${ator.orgId}`;
      const dias = org?.dias ?? 90;
      const suspensos = await tx<{ id: string; nome: string; email: string }[]>`
        update public.usuarios u set status = 'suspenso', motivo_status = ${`Sem acesso há mais de ${dias} dias`}, status_alterado_em = now()
        where u.org_id = ${ator.orgId} and u.status = 'ativo' and coalesce(u.ultimo_acesso, u.criado_em) < now() - make_interval(days => ${dias})
          and (select count(*) from public.usuario_papel up join public.usuarios x on x.id = up.usuario_id
               where up.org_id = u.org_id and up.papel = 'admin' and x.status = 'ativo' and x.id <> u.id) > 0
        returning u.id, u.nome, u.email`;
      for (const u of suspensos) {
        await deps.auth.definirBloqueio(u.id, true);
        await r.auditar('usuario.suspenso_por_inatividade', 'usuarios', u.id, { novo: { dias } });
      }
      return { corpo: { dias, suspensos } };
    },
  },
  {
    // Revisão trimestral: lista de usuários ativos, com último acesso, para o administrador confirmar ou desativar.
    metodo: 'GET',
    caminho: '/automacao/revisao-acessos',
    auth: 'automacao',
    async handler(r) {
      const usuarios = await r.tx`
        select u.nome, u.email, u.status, u.ultimo_acesso, u.criado_em,
               (select jsonb_agg(jsonb_build_object('papel', up.papel, 'validoAte', up.valido_ate)) from public.usuario_papel up where up.usuario_id = u.id) as papeis
        from public.usuarios u where u.org_id = ${r.ator.orgId} and u.status <> 'desativado' order by u.nome`;
      const admins = await r.tx<{ email: string }[]>`
        select u.email from public.usuarios u join public.usuario_papel up on up.usuario_id = u.id
        where u.org_id = ${r.ator.orgId} and up.papel = 'admin' and u.status = 'ativo'`;
      return { corpo: { para: admins.map((a) => a.email), usuarios } };
    },
  },
  {
    // Caixa de saída: eventos que o n8n ainda não entregou.
    metodo: 'GET',
    caminho: '/automacao/eventos',
    auth: 'automacao',
    async handler(r) {
      const limite = Math.min(Number(r.url.searchParams.get('limite') ?? 100) || 100, 500);
      const eventos = await r.tx<{ id: number; tipo: string; carga: Record<string, any>; criado_em: Date; tentativas: number }[]>`
        select id, tipo, carga, criado_em, tentativas from public.eventos_saida
        where org_id = ${r.ator.orgId} and processado_em is null and tentativas < 10 order by id limit ${limite}`;
      // quem deve ser avisado de cada evento é resolvido aqui: o n8n só entrega
      const pessoas = await r.tx<{ id: string; email: string; limite_alcada: number | null; aprova: boolean; gestor: boolean }[]>`
        select u.id, u.email, u.limite_alcada,
               exists (select 1 from public.usuario_papel up where up.usuario_id = u.id and up.papel in ('aprovador', 'gestor_pricing')) as aprova,
               exists (select 1 from public.usuario_papel up where up.usuario_id = u.id and up.papel in ('gestor_pricing', 'admin')) as gestor
        from public.usuarios u where u.org_id = ${r.ator.orgId} and u.status = 'ativo'`;
      const para = (e: { tipo: string; carga: Record<string, any> }): string[] => {
        if (e.tipo === 'convite.criado') return [e.carga.email];
        if (e.tipo === 'aprovacao.pendente') return pessoas.filter((p) => p.aprova && (p.limite_alcada ?? 0) >= Number(e.carga.nivelAlcada)).map((p) => p.email);
        if (e.tipo === 'aprovacao.decidida') return pessoas.filter((p) => p.id === e.carga.solicitanteId).map((p) => p.email);
        if (e.tipo === 'regra.publicada') return pessoas.filter((p) => p.gestor).map((p) => p.email);
        return [];
      };
      return { corpo: { urlAplicacao: r.deps.config.urlAplicacao, eventos: eventos.map((e) => ({ ...e, para: para(e) })) } };
    },
  },
  {
    metodo: 'POST',
    caminho: '/automacao/eventos/confirmar',
    auth: 'automacao',
    async handler(r) {
      const d = validar(z.object({ ids: z.array(z.number().int().positive()).min(1).max(500), erro: z.string().max(500).optional() }), r.corpo);
      if (d.erro) {
        await r.tx`update public.eventos_saida set tentativas = tentativas + 1, ultimo_erro = ${d.erro} where org_id = ${r.ator.orgId} and id in ${r.tx(d.ids)}`;
      } else {
        await r.tx`update public.eventos_saida set processado_em = now() where org_id = ${r.ator.orgId} and id in ${r.tx(d.ids)}`;
      }
      return { corpo: { confirmados: d.ids.length } };
    },
  },
  {
    // Importação de tabela de preço por planilha: valida e carrega em rascunho.
    // Quem publica é sempre uma pessoa, pela tela, depois de simular o impacto.
    metodo: 'POST',
    caminho: '/automacao/importar-tabela',
    auth: 'automacao',
    async handler(r) {
      const { tx, ator } = r;
      const d = validar(z.object({ csv: z.string().min(10).max(1_500_000), nome: z.string().trim().min(2).max(120).optional() }), r.corpo);
      const { itens, erros } = lerCsvTabela(d.csv);
      if (erros.length > 0) throw invalido('A planilha tem linhas inválidas; nada foi carregado.', erros.slice(0, 100), 'PLANILHA_INVALIDA');
      const produtos = new Map((await tx<{ id: string; codigo: string }[]>`select id, codigo from public.produtos where org_id = ${ator.orgId}`).map((p) => [p.codigo, p.id]));
      const componentes = new Map((await tx<{ id: string; produto_id: string; codigo: string }[]>`select id, produto_id, codigo from public.componentes where org_id = ${ator.orgId}`).map((c) => [`${c.produto_id}/${c.codigo}`, c.id]));
      const problemas: string[] = [];
      const linhas = itens.map((i, n) => {
        const produtoId = produtos.get(i.produto);
        const componenteId = i.componente ? componentes.get(`${produtoId}/${i.componente}`) : null;
        if (!produtoId) problemas.push(`Linha ${n + 2}: produto "${i.produto}" não existe.`);
        else if (i.componente && !componenteId) problemas.push(`Linha ${n + 2}: componente "${i.componente}" não existe.`);
        return { org_id: ator.orgId, produto_id: produtoId ?? '', componente_id: componenteId ?? null, dimensoes: tx.json(i.dimensoes), preco_base: i.precoBase };
      });
      if (problemas.length > 0) throw invalido('A planilha tem linhas inválidas; nada foi carregado.', problemas.slice(0, 100), 'PLANILHA_INVALIDA');
      const [vigente] = await tx<{ id: string | null }[]>`select app.tabela_vigente(${ator.orgId}, ${hoje(r.deps)}::date) as id`;
      const [nova] = await tx<{ id: string; versao: number }[]>`
        insert into public.tabelas_preco (org_id, nome, versao, origem)
        select ${ator.orgId}, ${d.nome ?? 'Tabela importada'}, coalesce(max(versao), 0) + 1, 'planilha' from public.tabelas_preco where org_id = ${ator.orgId}
        returning id, versao`;
      for (let i = 0; i < linhas.length; i += 500) await tx`insert into public.itens_tabela ${tx(linhas.slice(i, i + 500).map((l) => ({ ...l, tabela_id: nova!.id })) as never)}`;
      if (vigente?.id) {
        await tx`insert into public.fatores (org_id, tabela_id, codigo, nome, dimensao, valor, tipo, ajuste, produto_id, grupo)
                 select org_id, ${nova!.id}, codigo, nome, dimensao, valor, tipo, ajuste, produto_id, grupo from public.fatores where tabela_id = ${vigente.id}`;
      }
      await r.auditar('regra.planilha_importada', 'tabelas_preco', nova!.id, { novo: { itens: linhas.length, versao: nova!.versao } });
      await r.emitir('regra.rascunho_importado', { id: nova!.id, versao: nova!.versao, itens: linhas.length });
      return { status: 201, corpo: { id: nova!.id, versao: nova!.versao, status: 'rascunho', importados: linhas.length } };
    },
  },
  {
    // Registro de cópia externa e de teste de restauração (backup não testado não conta).
    metodo: 'POST',
    caminho: '/automacao/registro-backup',
    auth: 'automacao',
    async handler(r) {
      const d = validar(
        z.object({
          tipo: z.enum(['copia_externa', 'teste_restauracao', 'reposicao_demo']),
          status: z.enum(['ok', 'falha']),
          duracaoSegundos: z.number().min(0).optional(),
          tamanhoBytes: z.number().int().min(0).optional(),
          destino: z.string().max(500).optional(),
          detalhes: z.record(z.unknown()).default({}),
        }),
        r.corpo,
      );
      const [b] = await r.tx<{ id: number }[]>`
        insert into public.registros_backup (org_id, tipo, status, duracao_segundos, tamanho_bytes, destino, detalhes)
        values (${r.ator.orgId}, ${d.tipo}, ${d.status}, ${d.duracaoSegundos ?? null}, ${d.tamanhoBytes ?? null}, ${d.destino ?? null}, ${r.tx.json(d.detalhes as never)})
        returning id`;
      return { status: 201, corpo: { id: b!.id } };
    },
  },
  {
    // Verificação de saúde e alertas de negócio: backup, fila de aprovação, erros, pico de bloqueios.
    metodo: 'GET',
    caminho: '/automacao/saude',
    auth: 'automacao',
    async handler(r) {
      const [s] = await r.tx<{ aprovacoes_atrasadas: number; horas_desde_copia: number | null; ultima_copia_ok: boolean | null; erros_ultima_hora: number; chamadas_ultima_hora: number; eventos_parados: number; tabela_vigente: string | null; politica_vigente: string | null }[]>`
        select
          (select count(*)::int from public.aprovacoes where org_id = ${r.ator.orgId} and status = 'pendente' and prazo < now()) as aprovacoes_atrasadas,
          (select round(extract(epoch from (now() - max(iniciado_em))) / 3600)::int from public.registros_backup where org_id = ${r.ator.orgId} and tipo = 'copia_externa' and status = 'ok') as horas_desde_copia,
          (select status = 'ok' from public.registros_backup where org_id = ${r.ator.orgId} and tipo = 'copia_externa' order by iniciado_em desc limit 1) as ultima_copia_ok,
          (select count(*)::int from public.metricas_api where criado_em > now() - interval '1 hour' and status >= 500) as erros_ultima_hora,
          (select count(*)::int from public.metricas_api where criado_em > now() - interval '1 hour') as chamadas_ultima_hora,
          (select count(*)::int from public.eventos_saida where org_id = ${r.ator.orgId} and processado_em is null and criado_em < now() - interval '1 hour') as eventos_parados,
          app.tabela_vigente(${r.ator.orgId}, ${hoje(r.deps)}::date)::text as tabela_vigente,
          app.politica_vigente(${r.ator.orgId}, ${hoje(r.deps)}::date)::text as politica_vigente`;
      const [bloq] = await r.tx<{ hoje: number; media: number }[]>`
        select (count(*) filter (where v.criado_em > now() - interval '1 day'))::int as hoje,
               round((count(*) filter (where v.criado_em <= now() - interval '1 day'))::numeric / 14, 1)::float as media
        from public.cotacao_versoes v where v.org_id = ${r.ator.orgId} and v.veredito = 'bloqueado' and v.criado_em > now() - interval '15 days'`;
      const alertas: string[] = [];
      if (!s?.tabela_vigente || !s?.politica_vigente) alertas.push('Não há tabela ou política vigente: ninguém consegue cotar.');
      if ((s?.aprovacoes_atrasadas ?? 0) > 0) alertas.push(`${s!.aprovacoes_atrasadas} aprovações fora do prazo.`);
      if (s?.ultima_copia_ok === false) alertas.push('A última cópia externa falhou.');
      if (s?.horas_desde_copia === null || (s?.horas_desde_copia ?? 0) > 30) alertas.push('Não há cópia externa bem-sucedida nas últimas 30 horas.');
      if ((s?.erros_ultima_hora ?? 0) >= 5) alertas.push(`${s!.erros_ultima_hora} erros internos na última hora.`);
      if ((s?.eventos_parados ?? 0) > 0) alertas.push(`${s!.eventos_parados} avisos parados na caixa de saída há mais de uma hora.`);
      if ((bloq?.hoje ?? 0) >= 5 && (bloq?.hoje ?? 0) > 3 * Math.max(bloq?.media ?? 0, 1)) alertas.push(`Pico de cotações bloqueadas: ${bloq!.hoje} nas últimas 24 horas (média diária de ${bloq!.media}).`);
      return { corpo: { ok: alertas.length === 0, alertas, indicadores: { ...s, bloqueadasUltimoDia: bloq?.hoje ?? 0 } } };
    },
  },
  {
    // Relatório mensal de margem, desconto e conversão, comparado à linha de base do diagnóstico.
    metodo: 'GET',
    caminho: '/automacao/relatorio-mensal',
    auth: 'automacao',
    async handler(r) {
      const mes = validar(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês no formato AAAA-MM.'), r.url.searchParams.get('mes') ?? hoje(r.deps).slice(0, 7));
      const inicio = `${mes}-01`;
      const [x] = await r.tx<{ indicadores: unknown; fim: string; linha_de_base: unknown; organizacao: string }[]>`
        select app.indicadores(${r.ator.orgId}, ${inicio}::date, (${inicio}::date + interval '1 month - 1 day')::date) as indicadores,
               (${inicio}::date + interval '1 month - 1 day')::date::text as fim,
               o.config -> 'linhaDeBase' as linha_de_base, o.nome as organizacao
        from public.organizacoes o where o.id = ${r.ator.orgId}`;
      let anomalias: unknown = null;
      if (r.deps.ia.disponivel && r.url.searchParams.get('ia') !== 'nao') {
        try {
          anomalias = (await vigiar(r, inicio, x!.fim)).analise;
        } catch {
          anomalias = null; // a IA fica fora do caminho crítico do relatório
        }
      }
      const admins = await r.tx<{ email: string }[]>`
        select distinct u.email from public.usuarios u join public.usuario_papel up on up.usuario_id = u.id
        where u.org_id = ${r.ator.orgId} and up.papel in ('admin', 'gestor_pricing') and u.status = 'ativo'`;
      return { corpo: { organizacao: x!.organizacao, mes, indicadores: x!.indicadores, linhaDeBase: x!.linha_de_base ?? null, anomalias, para: admins.map((a) => a.email) } };
    },
  },
  {
    // Rotina de retenção: anonimiza o dado pessoal de cotações perdidas ou expiradas ao fim do prazo.
    metodo: 'POST',
    caminho: '/automacao/retencao',
    auth: 'automacao',
    async handler(r) {
      const { tx, ator } = r;
      const [org] = await tx<{ meses: number | null }[]>`select (config #>> '{retencao,cotacoesPerdidasMeses}')::int as meses from public.organizacoes where id = ${ator.orgId}`;
      const meses = org?.meses ?? 24;
      const alvo = await tx<{ id: string }[]>`
        select id from public.cotacoes
        where org_id = ${ator.orgId} and status in ('perdida', 'expirada', 'cancelada') and anonimizada_em is null
          and coalesce(encerrada_em, atualizado_em) < now() - make_interval(months => ${meses})
        limit 2000`;
      if (alvo.length > 0) {
        const ids = alvo.map((a) => a.id);
        await tx`delete from public.cotacao_dados_pessoais where cotacao_id in ${tx(ids)}`;
        // expirada não é status final: marca a anonimização junto, que o gatilho aceita
        await tx`update public.cotacoes set cliente_nome = 'Titular anonimizado', cliente_email = null, anonimizada_em = now() where id in ${tx(ids)}`;
        await r.auditar('retencao.anonimizacao', 'cotacoes', ator.orgId, { contexto: { meses, cotacoes: ids.length } });
      }
      await tx`delete from public.limites_requisicao where janela < now() - interval '1 day'`;
      await tx`delete from public.idempotencia where criado_em < now() - interval '7 days'`;
      await tx`delete from public.metricas_api where criado_em < now() - interval '90 days'`;
      return { corpo: { meses, anonimizadas: alvo.length } };
    },
  },
];
