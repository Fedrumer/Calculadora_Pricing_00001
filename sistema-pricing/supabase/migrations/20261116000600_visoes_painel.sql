-- Visões de projeção (sem colunas sensíveis) e funções de leitura do painel.
-- As visões rodam com o dono (não aplicam RLS das tabelas de base), por isso
-- cada uma traz o próprio filtro de organização, perfil e escopo.

-- Versões sem custo, imposto nem margem: é o que o usuário de canal lê.
create view public.v_cotacao_versoes as
select v.id, v.org_id, v.cotacao_id, v.versao, v.entrada, v.resultado_publico as resultado, v.moeda,
       v.preco_base, v.preco_final, v.desconto_pct, v.comissao_pct, v.comissao_valor,
       v.veredito, v.nivel_alcada, v.criado_por, v.criado_em
from public.cotacao_versoes v
join public.cotacoes c on c.id = v.cotacao_id
where v.org_id = (select app.org_id())
  and (select app.mfa_ok())
  and ((select app.interno()) or c.dono_id = (select auth.uid()));

-- Nomes para exibição (dono, aprovador), sem e-mail nem status.
create view public.v_pessoas as
select u.id, u.org_id, u.nome
from public.usuarios u
where u.org_id = (select app.org_id()) and (select app.mfa_ok());

-- Convites, sem o hash do token.
create view public.v_convites as
select c.id, c.org_id, c.email, c.nome, c.papel, c.unidade_id, c.canal_id, c.limite_alcada, c.expira_em,
       c.convidado_por, c.aceito_em, c.cancelado_em, c.criado_em,
       case when c.aceito_em is not null then 'aceito'
            when c.cancelado_em is not null then 'cancelado'
            when c.expira_em < now() then 'expirado'
            else 'pendente' end as situacao
from public.convites c
where c.org_id = (select app.org_id())
  and (select app.mfa_ok())
  and ((select app.tem_papel('admin', 'suporte', 'leitura')) or c.convidado_por = (select auth.uid()));

-- Chaves de API, sem o hash.
create view public.v_chaves_api as
select k.id, k.org_id, k.canal_id, k.nome, k.prefixo, k.escopos, k.limite_por_minuto, k.expira_em,
       k.revogada_em, k.ultimo_uso, k.criado_por, k.criado_em
from public.chaves_api k
where k.org_id = (select app.org_id()) and (select app.mfa_ok()) and (select app.tem_papel('admin', 'suporte'));

create view public.v_webhooks as
select w.id, w.org_id, w.nome, w.url, w.eventos, w.ativo, w.criado_em
from public.webhooks w
where w.org_id = (select app.org_id()) and (select app.mfa_ok()) and (select app.tem_papel('admin', 'suporte'));

-- Linha do tempo de uma cotação: eventos de negócio, sem valores de margem.
create view public.v_linha_do_tempo as
select e.id, e.org_id, e.registro_id::uuid as cotacao_id, e.ocorrido_em, e.acao, e.ator_tipo,
       u.nome as ator_nome, e.contexto ->> 'resumo' as resumo
from public.eventos_auditoria e
join public.cotacoes c on c.id::text = e.registro_id
left join public.usuarios u on u.id = e.ator_id
where e.tabela = 'cotacoes' and e.acao like 'cotacao.%'
  and e.org_id = (select app.org_id())
  and (select app.mfa_ok())
  and ((select app.interno()) or c.dono_id = (select auth.uid()));

grant select on public.v_cotacao_versoes, public.v_pessoas, public.v_convites, public.v_chaves_api,
  public.v_webhooks, public.v_linha_do_tempo to authenticated;

-- Regras vigentes em uma data --------------------------------------------------
create or replace function app.tabela_vigente(p_org uuid, p_data date) returns uuid
language sql stable security definer set search_path = '' as $$
  select t.id from public.tabelas_preco t
  where t.org_id = p_org and t.status = 'publicada'
    and p_data >= t.vigencia_inicio and (t.vigencia_fim is null or p_data <= t.vigencia_fim)
$$;

create or replace function app.politica_vigente(p_org uuid, p_data date) returns uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.politicas p
  where p.org_id = p_org and p.status = 'publicada'
    and p_data >= p.vigencia_inicio and (p.vigencia_fim is null or p_data <= p.vigencia_fim)
$$;
revoke execute on function app.tabela_vigente(uuid, date), app.politica_vigente(uuid, date) from public, anon, authenticated;
grant execute on function app.tabela_vigente(uuid, date), app.politica_vigente(uuid, date) to service_role;

-- Painel -----------------------------------------------------------------------
-- Margem, volume, conversão, desconto médio e aprovações pendentes, por
-- período, produto e canal. Só perfis internos.
-- O cálculo fica em app.indicadores (usado também pelo relatório mensal das
-- automações); a função pública só confere o perfil de quem chama.
create or replace function app.indicadores(
  v_org uuid, p_inicio date, p_fim date, p_produto uuid default null, p_canal uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb;
begin
  with base as (
    select c.id, c.status, c.canal_id, c.produto_id, c.criado_em, c.emitida_em, c.desfecho_motivo,
           v.preco_final, v.margem_valor, v.margem_pct, v.desconto_pct, v.veredito
    from public.cotacoes c
    join public.cotacao_versoes v on v.id = c.versao_atual_id
    where c.org_id = v_org
      and c.criado_em >= p_inicio and c.criado_em < p_fim + 1
      and (p_produto is null or c.produto_id = p_produto)
      and (p_canal is null or c.canal_id = p_canal)
  ),
  emitidas as (select * from base where status in ('emitida', 'aceita', 'perdida', 'expirada')),
  resumo as (
    select
      (select count(*) from base) as cotacoes,
      count(*) as emitidas,
      count(*) filter (where status = 'aceita') as aceitas,
      count(*) filter (where status = 'perdida') as perdidas,
      count(*) filter (where status = 'expirada') as expiradas,
      coalesce(sum(preco_final) filter (where status = 'aceita'), 0) as volume_aceito,
      coalesce(sum(margem_valor) filter (where status = 'aceita'), 0) as margem_aceita,
      coalesce(sum(preco_final), 0) as volume_emitido,
      coalesce(sum(margem_valor), 0) as margem_emitida,
      coalesce(round(avg(desconto_pct), 2), 0) as desconto_medio,
      count(*) filter (where veredito = 'exige_aprovacao') as com_excecao
    from emitidas
  ),
  por_mes as (
    select to_char(date_trunc('month', criado_em), 'YYYY-MM') as mes,
           count(*) as emitidas,
           count(*) filter (where status = 'aceita') as aceitas,
           coalesce(sum(preco_final) filter (where status = 'aceita'), 0) as volume,
           coalesce(sum(margem_valor) filter (where status = 'aceita'), 0) as margem,
           round(avg(desconto_pct), 2) as desconto_medio
    from emitidas group by 1
  ),
  por_canal as (
    select coalesce(k.nome, 'Venda direta') as canal,
           count(*) as emitidas,
           count(*) filter (where e.status = 'aceita') as aceitas,
           coalesce(sum(e.preco_final) filter (where e.status = 'aceita'), 0) as volume,
           coalesce(sum(e.margem_valor) filter (where e.status = 'aceita'), 0) as margem,
           round(avg(e.desconto_pct), 2) as desconto_medio
    from emitidas e left join public.canais k on k.id = e.canal_id group by 1
  ),
  por_produto as (
    select p.nome as produto,
           count(*) as emitidas,
           count(*) filter (where e.status = 'aceita') as aceitas,
           coalesce(sum(e.preco_final) filter (where e.status = 'aceita'), 0) as volume,
           coalesce(sum(e.margem_valor) filter (where e.status = 'aceita'), 0) as margem
    from emitidas e join public.produtos p on p.id = e.produto_id group by 1
  ),
  perdas as (
    select desfecho_motivo as motivo, count(*) as quantidade
    from emitidas where status = 'perdida' group by 1
  ),
  aprov as (
    select
      count(*) filter (where a.status = 'pendente') as pendentes,
      count(*) filter (where a.status = 'pendente' and a.prazo < now()) as atrasadas,
      round((avg(extract(epoch from (a.decidido_em - a.criado_em)) / 3600.0)
        filter (where a.decidido_em is not null and a.criado_em >= p_inicio and a.criado_em < p_fim + 1))::numeric, 1) as horas_decisao
    from public.aprovacoes a where a.org_id = v_org
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim),
    'resumo', (select jsonb_build_object(
        'cotacoes', r.cotacoes, 'emitidas', r.emitidas, 'aceitas', r.aceitas, 'perdidas', r.perdidas,
        'expiradas', r.expiradas,
        'volumeAceito', r.volume_aceito, 'margemAceita', r.margem_aceita,
        'margemPct', case when r.volume_aceito > 0 then round(r.margem_aceita / r.volume_aceito * 100, 2) else null end,
        'conversaoPct', case when r.aceitas + r.perdidas + r.expiradas > 0
            then round(r.aceitas::numeric / (r.aceitas + r.perdidas + r.expiradas) * 100, 1) else null end,
        'descontoMedioPct', r.desconto_medio,
        'excecaoPct', case when r.emitidas > 0 then round(r.com_excecao::numeric / r.emitidas * 100, 1) else null end
      ) from resumo r),
    'aprovacoes', (select jsonb_build_object('pendentes', a.pendentes, 'atrasadas', a.atrasadas, 'horasAteDecisao', a.horas_decisao) from aprov a),
    'porMes', coalesce((select jsonb_agg(jsonb_build_object(
        'mes', m.mes, 'emitidas', m.emitidas, 'aceitas', m.aceitas, 'volume', m.volume, 'margem', m.margem,
        'margemPct', case when m.volume > 0 then round(m.margem / m.volume * 100, 2) else null end,
        'descontoMedioPct', m.desconto_medio) order by m.mes) from por_mes m), '[]'::jsonb),
    'porCanal', coalesce((select jsonb_agg(jsonb_build_object(
        'canal', k.canal, 'emitidas', k.emitidas, 'aceitas', k.aceitas, 'volume', k.volume, 'margem', k.margem,
        'margemPct', case when k.volume > 0 then round(k.margem / k.volume * 100, 2) else null end,
        'descontoMedioPct', k.desconto_medio) order by k.volume desc) from por_canal k), '[]'::jsonb),
    'porProduto', coalesce((select jsonb_agg(jsonb_build_object(
        'produto', p.produto, 'emitidas', p.emitidas, 'aceitas', p.aceitas, 'volume', p.volume, 'margem', p.margem,
        'margemPct', case when p.volume > 0 then round(p.margem / p.volume * 100, 2) else null end) order by p.volume desc) from por_produto p), '[]'::jsonb),
    'motivosPerda', coalesce((select jsonb_agg(jsonb_build_object('motivo', x.motivo, 'quantidade', x.quantidade) order by x.quantidade desc) from perdas x), '[]'::jsonb)
  ) into v;
  return v;
end $$;

create or replace function public.painel_indicadores(
  p_inicio date, p_fim date, p_produto uuid default null, p_canal uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if app.org_id() is null or not app.interno() or not app.mfa_ok() then
    raise exception 'Sem permissão para o painel.' using errcode = '42501';
  end if;
  return app.indicadores(app.org_id(), p_inicio, p_fim, p_produto, p_canal);
end $$;
revoke execute on function app.indicadores(uuid, date, date, uuid, uuid) from public, anon, authenticated;
grant execute on function app.indicadores(uuid, date, date, uuid, uuid) to service_role;

-- Prova de eficiência: os números que a demonstração mede e exibe.
create or replace function public.prova_eficiencia() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid := app.org_id();
  v jsonb;
begin
  if v_org is null or not app.interno() or not app.mfa_ok() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'simulacao', (
      select jsonb_build_object(
        'chamadas', count(*),
        'p95Ms', round((percentile_cont(0.95) within group (order by duracao_ms))::numeric, 1),
        'medianaMs', round((percentile_cont(0.5) within group (order by duracao_ms))::numeric, 1))
      from public.metricas_api m
      where m.rota = 'POST /cotacoes/simular' and m.status = 200 and m.criado_em > now() - interval '30 days'
        and (m.org_id = v_org or m.org_id is null)),
    'tempoEmissao', (
      select jsonb_build_object(
        'cotacoes', count(*),
        'medianaSegundos', round((percentile_cont(0.5) within group (order by extract(epoch from (c.emitida_em - c.iniciada_em))))::numeric, 0))
      from public.cotacoes c
      join public.cotacao_versoes v on v.id = c.versao_atual_id
      where c.org_id = v_org and c.emitida_em is not null and c.iniciada_em is not null and v.veredito = 'dentro' and c.origem = 'web'
        and c.emitida_em > now() - interval '30 days'),
    'foraDaPoliticaSemAprovacao', (
      select count(*)
      from public.cotacoes c
      join public.cotacao_versoes v on v.id = c.versao_atual_id
      where c.org_id = v_org and c.status in ('emitida', 'aceita', 'perdida', 'expirada')
        and (v.veredito = 'bloqueado' or (v.veredito = 'exige_aprovacao' and not exists (
              select 1 from public.aprovacoes a where a.versao_id = v.id and a.status = 'aprovada')))),
    'ultimoTesteRestauracao', (
      select jsonb_build_object('em', b.iniciado_em, 'status', b.status, 'duracaoSegundos', b.duracao_segundos, 'detalhes', b.detalhes)
      from public.registros_backup b
      where b.org_id = v_org and b.tipo = 'teste_restauracao' order by b.iniciado_em desc limit 1),
    'ultimaCopiaExterna', (
      select jsonb_build_object('em', b.iniciado_em, 'status', b.status, 'tamanhoBytes', b.tamanho_bytes)
      from public.registros_backup b
      where b.org_id = v_org and b.tipo = 'copia_externa' order by b.iniciado_em desc limit 1)
  ) into v;
  return v;
end $$;

revoke execute on function public.painel_indicadores(date, date, uuid, uuid), public.prova_eficiencia() from public, anon;
grant execute on function public.painel_indicadores(date, date, uuid, uuid), public.prova_eficiencia() to authenticated;

-- Registro de acesso (alimenta a revisão trimestral e a suspensão por inatividade).
create or replace function public.registrar_acesso() returns void
language sql security definer set search_path = '' as $$
  update public.usuarios set ultimo_acesso = now()
  where id = auth.uid() and status = 'ativo' and (ultimo_acesso is null or ultimo_acesso < now() - interval '5 minutes')
$$;
revoke execute on function public.registrar_acesso() from public, anon;
grant execute on function public.registrar_acesso() to authenticated;

-- O que a aplicação precisa saber de quem entrou, antes mesmo do segundo fator:
-- só dados do próprio usuário. É por aqui que a tela descobre que o perfil exige
-- o segundo fator (as demais leituras ficam fechadas até a sessão ser aal2).
create or replace function public.meu_acesso() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'usuario', jsonb_build_object('id', u.id, 'nome', u.nome, 'email', u.email, 'status', u.status,
                                  'limiteAlcada', u.limite_alcada, 'aceiteTermosEm', u.aceite_termos_em),
    'organizacao', jsonb_build_object('id', o.id, 'nome', o.nome, 'config', o.config),
    'papeis', coalesce((
      select jsonb_agg(jsonb_build_object('papel', up.papel, 'nome', p.nome, 'unidadeId', up.unidade_id, 'canalId', up.canal_id,
                                          'exigeMfa', p.exige_mfa, 'validoAte', up.valido_ate))
      from public.usuario_papel up join public.papeis p on p.org_id = up.org_id and p.codigo = up.papel
      where up.usuario_id = u.id and p.ativo and (up.valido_ate is null or up.valido_ate > now())), '[]'::jsonb),
    'mfaOk', app.mfa_ok()
  )
  from public.usuarios u join public.organizacoes o on o.id = u.org_id
  where u.id = auth.uid() and u.status = 'ativo'
$$;
revoke execute on function public.meu_acesso() from public, anon;
grant execute on function public.meu_acesso() to authenticated;

-- Arquivos (PDF de proposta, planilha de contingência, importações): buckets
-- privados, sem política de leitura direta. O acesso é por link assinado de
-- curta duração, emitido pela API depois de conferir perfil e escopo.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('propostas', 'propostas', false), ('contingencia', 'contingencia', false), ('importacoes', 'importacoes', false)
    on conflict (id) do nothing;
  end if;
end $$;
