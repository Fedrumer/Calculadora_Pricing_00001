-- A4: comissão do vendedor gravada em cada versão (as antigas ficam com zero).
-- Só perfis internos e o vendedor dono leem cotacao_versoes; a visão do canal
-- (v_cotacao_versoes) lista as colunas uma a uma e não inclui esta.
alter table public.cotacao_versoes add column comissao_vendedor_valor numeric(16, 2) not null default 0;

-- A5: o painel ganha dispersão de desconto por vendedor, conversão por faixa de
-- desconto, motivos de perda por categoria (com a diferença para o preço do
-- concorrente) e exposição cambial das aceitas. Tudo a partir das versões já
-- gravadas, sem recalcular nada. Quem vê o painel continua igual.
create or replace function app.indicadores(
  v_org uuid, p_inicio date, p_fim date, p_produto uuid default null, p_canal uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb;
begin
  with base as (
    select c.id, c.status, c.canal_id, c.produto_id, c.criado_em, c.emitida_em, c.desfecho_motivo,
           c.dono_id, c.desfecho_categoria, c.concorrente_preco,
           v.preco_final, v.margem_valor, v.margem_pct, v.desconto_pct, v.veredito, v.comissao_vendedor_valor
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
  -- A5: motivos por categoria; em preço do concorrente, a diferença média entre o nosso preço e o informado
  perdas as (
    select coalesce(desfecho_categoria, 'nao_informado') as categoria, count(*) as quantidade,
           count(concorrente_preco) filter (where concorrente_preco > 0) as com_concorrente,
           round(avg((preco_final - concorrente_preco) / concorrente_preco * 100) filter (where concorrente_preco > 0), 1) as diferenca_pct
    from emitidas where status = 'perdida' group by 1
  ),
  nomes_perda as (
    select m ->> 'codigo' as codigo, m ->> 'nome' as nome
    from jsonb_array_elements(coalesce(
      (select o.config -> 'motivosPerda' from public.organizacoes o where o.id = v_org),
      '[{"codigo":"preco_concorrente","nome":"Preço acima do concorrente"},{"codigo":"prazo","nome":"Prazo ou disponibilidade"},
        {"codigo":"escopo","nome":"Produto não atende"},{"codigo":"desistiu","nome":"Cliente desistiu da compra"},
        {"codigo":"sem_resposta","nome":"Sem resposta do cliente"},{"codigo":"outro","nome":"Outro"}]'::jsonb)) m
  ),
  -- A5: dispersão de desconto por vendedor (o dono da cotação; cotações por chave de API ficam como integração)
  por_vendedor as (
    select coalesce(u.nome, 'Integração de canal') as vendedor,
           count(*) as emitidas,
           count(*) filter (where e.status = 'aceita') as aceitas,
           count(*) filter (where e.status in ('aceita', 'perdida', 'expirada')) as com_desfecho,
           round(avg(e.desconto_pct), 2) as desconto_medio,
           round(coalesce(stddev_samp(e.desconto_pct), 0), 2) as desconto_desvio,
           max(e.desconto_pct) as desconto_maximo,
           coalesce(sum(e.preco_final) filter (where e.status = 'aceita'), 0) as volume,
           coalesce(sum(e.margem_valor) filter (where e.status = 'aceita'), 0) as margem,
           coalesce(sum(e.comissao_vendedor_valor) filter (where e.status = 'aceita'), 0) as comissao_vendedor
    from emitidas e left join public.usuarios u on u.id = e.dono_id group by 1
  ),
  -- A5: conversão por faixa de desconto (faixas configuráveis; padrão 0, até 2%, 2 a 5%, 5 a 10%, acima de 10%)
  limites_faixa as (
    select coalesce(array(select (x)::numeric from jsonb_array_elements_text(
             (select o.config #> '{painel,faixasDesconto}' from public.organizacoes o where o.id = v_org)) x),
           array[2, 5, 10]::numeric[]) as l
  ),
  faixas as (
    select e.*, case
             when e.desconto_pct <= 0 then 0
             else 1 + coalesce((select count(*) from unnest((select l from limites_faixa)) b where e.desconto_pct > b), 0)
           end as faixa
    from emitidas e
  ),
  por_faixa as (
    select f.faixa,
           count(*) as emitidas,
           count(*) filter (where f.status = 'aceita') as aceitas,
           count(*) filter (where f.status in ('aceita', 'perdida', 'expirada')) as com_desfecho,
           round(avg(f.margem_pct) filter (where f.status = 'aceita'), 2) as margem_pct
    from faixas f group by 1
  ),
  -- A5: exposição cambial das aceitas nos 90 dias até o fim do período, a partir do resultado gravado
  expo as (
    select x ->> 'moeda' as moeda, (x ->> 'valorMoeda')::numeric as valor_moeda, (x ->> 'valorConvertido')::numeric as valor_convertido,
           nullif(x ->> 'cambioEquilibrio', '')::numeric as equilibrio
    from public.cotacoes c
    join public.cotacao_versoes v on v.id = c.versao_atual_id
    cross join lateral jsonb_array_elements(coalesce(v.resultado -> 'exposicaoCambial', '[]'::jsonb)) x
    where c.org_id = v_org and c.status = 'aceita'
      and c.criado_em >= p_fim - 90 and c.criado_em < p_fim + 1
      and (p_produto is null or c.produto_id = p_produto)
      and (p_canal is null or c.canal_id = p_canal)
  ),
  referencia as (select moeda, taxa from app.cambios_vigentes(v_org, least(p_fim, current_date))),
  por_moeda as (
    select e.moeda, count(*) as cotacoes, sum(e.valor_moeda) as valor_moeda, sum(e.valor_convertido) as valor_convertido,
           round(sum(e.equilibrio * e.valor_moeda) / nullif(sum(e.valor_moeda) filter (where e.equilibrio is not null), 0), 4) as equilibrio_medio,
           r.taxa as referencia,
           count(*) filter (where r.taxa is not null and e.equilibrio is not null and e.equilibrio < r.taxa) as sem_margem
    from expo e left join referencia r on r.moeda = e.moeda group by e.moeda, r.taxa
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
    'motivosPerda', coalesce((select jsonb_agg(jsonb_build_object(
        'categoria', x.categoria, 'motivo', coalesce(n.nome, case x.categoria when 'nao_informado' then 'Não informado' else x.categoria end),
        'quantidade', x.quantidade, 'comPrecoConcorrente', x.com_concorrente, 'diferencaMediaPct', x.diferenca_pct) order by x.quantidade desc)
        from perdas x left join nomes_perda n on n.codigo = x.categoria), '[]'::jsonb),
    'porVendedor', coalesce((select jsonb_agg(jsonb_build_object(
        'vendedor', p.vendedor, 'emitidas', p.emitidas, 'aceitas', p.aceitas,
        'conversaoPct', case when p.com_desfecho > 0 then round(p.aceitas::numeric / p.com_desfecho * 100, 1) end,
        'descontoMedioPct', p.desconto_medio, 'descontoDesvioPct', p.desconto_desvio, 'descontoMaximoPct', p.desconto_maximo,
        'volume', p.volume, 'margem', p.margem, 'margemPct', case when p.volume > 0 then round(p.margem / p.volume * 100, 2) end,
        'comissaoVendedor', p.comissao_vendedor) order by p.desconto_medio desc, p.vendedor) from por_vendedor p), '[]'::jsonb),
    'conversaoPorDesconto', coalesce((select jsonb_agg(jsonb_build_object(
        'faixa', f.faixa,
        'rotulo', case when f.faixa = 0 then 'Sem desconto'
                       when f.faixa = 1 then 'Até ' || trim(to_char(l[1], 'FM990.##')) || '%'
                       when f.faixa > array_length(l, 1) then 'Acima de ' || trim(to_char(l[array_length(l, 1)], 'FM990.##')) || '%'
                       else trim(to_char(l[f.faixa - 1], 'FM990.##')) || '% a ' || trim(to_char(l[f.faixa], 'FM990.##')) || '%' end,
        'emitidas', f.emitidas, 'aceitas', f.aceitas,
        'conversaoPct', case when f.com_desfecho > 0 then round(f.aceitas::numeric / f.com_desfecho * 100, 1) end,
        'margemPct', f.margem_pct,
        'amostraPequena', f.emitidas < 30) order by f.faixa)
        from por_faixa f, limites_faixa), '[]'::jsonb),
    'exposicaoCambial', coalesce((select jsonb_agg(jsonb_build_object(
        'moeda', m.moeda, 'cotacoes', m.cotacoes, 'valorMoeda', round(m.valor_moeda, 2), 'valorConvertido', round(m.valor_convertido, 2),
        'cambioEquilibrioMedio', m.equilibrio_medio, 'cambioReferencia', m.referencia,
        'folgaMediaPct', case when m.referencia > 0 and m.equilibrio_medio is not null then round((m.equilibrio_medio / m.referencia - 1) * 100, 2) end,
        'semMargemNaReferencia', m.sem_margem, 'fonte', 'referencia') order by m.valor_convertido desc) from por_moeda m), '[]'::jsonb)
  ) into v;
  return v;
end $$;
