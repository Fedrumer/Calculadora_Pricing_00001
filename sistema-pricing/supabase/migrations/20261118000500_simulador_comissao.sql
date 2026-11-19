-- A7: simulador da regra de comissão do vendedor. Compara duas regras sobre as
-- cotações aceitas do período, por vendedor, a partir do preço e da margem já
-- gravados nas versões: nada é recalculado pelo motor.
--
-- Regra: { "base": "receita" | "margem", "pct": número, "margemMinimaPct"?: número }
-- (o mesmo formato de politica.comissaoVendedor). Como no motor: sobre a receita,
-- pct do preço final; sobre a margem, pct da margem positiva, e nada abaixo da
-- margem mínima. A margem de partida é a de antes da comissão do vendedor
-- (quando a política vigente na cotação a deduzia, ela é somada de volta).
-- O efeito é mecânico: quanto o vendedor muda de comportamento só um piloto mede.

create or replace function app.comissao_pela_regra(p_regra jsonb, p_preco numeric, p_margem numeric, p_margem_pct numeric)
returns numeric
language sql immutable set search_path = '' as $$
  select case
    when p_regra ->> 'base' = 'receita' then round(p_preco * (p_regra ->> 'pct')::numeric / 100, 2)
    when p_regra ->> 'base' = 'margem' and p_margem > 0
         and (p_regra ->> 'margemMinimaPct' is null or p_margem_pct >= (p_regra ->> 'margemMinimaPct')::numeric)
      then round(p_margem * (p_regra ->> 'pct')::numeric / 100, 2)
    else 0
  end
$$;

create or replace function public.simular_comissao_vendedor(p_regra_a jsonb, p_regra_b jsonb, p_inicio date, p_fim date)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid := app.org_id();
  v jsonb;
begin
  if v_org is null or not app.mfa_ok() or not app.tem_papel('gestor_pricing', 'admin', 'leitura') then
    raise exception 'Sem permissão para simular a comissão do vendedor.' using errcode = '42501';
  end if;
  foreach v in array array[p_regra_a, p_regra_b] loop
    if v is null or coalesce(v ->> 'base', '') not in ('receita', 'margem')
       or jsonb_typeof(v -> 'pct') <> 'number' or (v ->> 'pct')::numeric < 0 or (v ->> 'pct')::numeric >= 100
       or (v ? 'margemMinimaPct' and jsonb_typeof(v -> 'margemMinimaPct') not in ('number', 'null')) then
      raise exception 'Regra de comissão inválida: informe base (receita ou margem) e pct entre 0 e 100.' using errcode = '22023';
    end if;
  end loop;
  if p_inicio is null or p_fim is null or p_fim < p_inicio then
    raise exception 'Período inválido.' using errcode = '22023';
  end if;

  with base as (
    select coalesce(u.nome, 'Integração de canal') as vendedor,
           v.preco_final, v.desconto_pct,
           v.margem_valor + case when coalesce((v.resultado #>> '{comissaoVendedor,deduzidaDaMargem}')::boolean, false)
                                 then v.comissao_vendedor_valor else 0 end as margem,
           v.comissao_vendedor_valor as comissao_gravada
    from public.cotacoes c
    join public.cotacao_versoes v on v.id = c.versao_atual_id
    left join public.usuarios u on u.id = c.dono_id
    where c.org_id = v_org and c.status = 'aceita'
      and c.criado_em >= p_inicio and c.criado_em < p_fim + 1
  ),
  calc as (
    select b.*,
           app.comissao_pela_regra(p_regra_a, b.preco_final, b.margem, case when b.preco_final > 0 then b.margem / b.preco_final * 100 else 0 end) as a,
           app.comissao_pela_regra(p_regra_b, b.preco_final, b.margem, case when b.preco_final > 0 then b.margem / b.preco_final * 100 else 0 end) as b
    from base b
  ),
  por_vendedor as (
    select vendedor, count(*) as aceitas, sum(preco_final) as receita, sum(margem) as margem,
           round(avg(desconto_pct), 2) as desconto_medio, sum(a) as comissao_a, sum(b) as comissao_b
    from calc group by vendedor
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim),
    'regraA', p_regra_a,
    'regraB', p_regra_b,
    'porVendedor', coalesce((select jsonb_agg(jsonb_build_object(
        'vendedor', p.vendedor, 'aceitas', p.aceitas, 'receita', p.receita, 'margem', p.margem,
        'margemPct', case when p.receita > 0 then round(p.margem / p.receita * 100, 2) end,
        'descontoMedioPct', p.desconto_medio,
        'comissaoA', p.comissao_a, 'comissaoB', p.comissao_b, 'diferenca', p.comissao_b - p.comissao_a,
        'diferencaPct', case when p.comissao_a > 0 then round((p.comissao_b / p.comissao_a - 1) * 100, 1) end)
        order by p.receita desc, p.vendedor) from por_vendedor p), '[]'::jsonb),
    'total', (select jsonb_build_object(
        'aceitas', count(*), 'receita', coalesce(sum(preco_final), 0), 'margem', coalesce(sum(margem), 0),
        'comissaoA', coalesce(sum(a), 0), 'comissaoB', coalesce(sum(b), 0), 'diferenca', coalesce(sum(b) - sum(a), 0),
        'comissaoAPctMargem', case when sum(margem) > 0 then round(sum(a) / sum(margem) * 100, 2) end,
        'comissaoBPctMargem', case when sum(margem) > 0 then round(sum(b) / sum(margem) * 100, 2) end)
      from calc)
  ) into v;
  return v;
end $$;

revoke execute on function app.comissao_pela_regra(jsonb, numeric, numeric, numeric) from public, anon, authenticated;
revoke execute on function public.simular_comissao_vendedor(jsonb, jsonb, date, date) from public, anon;
grant execute on function public.simular_comissao_vendedor(jsonb, jsonb, date, date) to authenticated;
