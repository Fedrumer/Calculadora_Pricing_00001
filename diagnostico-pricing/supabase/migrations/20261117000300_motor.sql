-- Motor de diagnóstico: validação, base de cálculo, métricas, pontuação, achados e simulação.
-- Tudo em SQL, determinístico e reproduzível. Nenhuma função daqui é exposta pela API:
-- quem as chama são as funções de public, que conferem o perfil antes.

-- ================================================================ validação
create or replace function motor.registrar_validacao(p_diag uuid, p_cliente uuid, p_bloco text, p_regra text, p_severidade text, p_ocorrencias numeric, p_total numeric, p_mensagem text)
returns void language sql set search_path = public, motor as $$
  insert into validacoes (cliente_id, diagnostico_id, bloco, regra, severidade, ocorrencias, total, mensagem)
  select p_cliente, p_diag, p_bloco, p_regra, p_severidade, p_ocorrencias, p_total, p_mensagem
  where coalesce(p_ocorrencias, 0) > 0
$$;

create or replace function motor.validar(p_diag uuid) returns void
language plpgsql set search_path = public, motor as $$
declare
  d diagnosticos;
  v_total numeric; v_validas numeric; v_n numeric; v_meses integer;
  v_rec numeric; v_rec_com_custo numeric; v_nota numeric;
  v_tem boolean; v_itens numeric; v_ok numeric;
begin
  select * into strict d from diagnosticos where id = p_diag;
  delete from validacoes where diagnostico_id = p_diag;
  delete from qualidade_blocos where diagnostico_id = p_diag;

  -- ---- transações
  update transacoes set valida = coalesce(
      data is not null and produto is not null and conta is not null
      and quantidade > 0 and preco_lista > 0 and preco_faturado > 0
      and data between d.periodo_inicio and d.periodo_fim, false)
   where diagnostico_id = p_diag;

  select count(*) into v_total from transacoes where diagnostico_id = p_diag;

  select count(*) into v_n from transacoes where diagnostico_id = p_diag
     and (data is null or produto is null or conta is null or quantidade is null or preco_lista is null or preco_faturado is null);
  perform motor.registrar_validacao(p_diag, d.cliente_id, 'transacoes', 'campos_obrigatorios', 'alerta', v_n, v_total,
    'Linhas com data, produto, conta, quantidade ou preço vazios. Ficam fora do cálculo.');

  select count(*) into v_n from transacoes where diagnostico_id = p_diag and (quantidade <= 0 or preco_lista <= 0 or preco_faturado <= 0);
  perform motor.registrar_validacao(p_diag, d.cliente_id, 'transacoes', 'valor_zerado_ou_negativo', 'alerta', v_n, v_total,
    'Linhas com quantidade ou preço zerados ou negativos (devoluções, bonificações, estornos). Ficam fora do cálculo.');

  select count(*) into v_n from transacoes where diagnostico_id = p_diag and data is not null and data not between d.periodo_inicio and d.periodo_fim;
  perform motor.registrar_validacao(p_diag, d.cliente_id, 'transacoes', 'fora_do_periodo', 'alerta', v_n, v_total,
    'Linhas com data fora do período do diagnóstico. Ficam fora do cálculo.');

  -- duplicatas: mesma nota, produto, conta, data, quantidade e preço. Só com nota fiscal informada.
  with repetidas as (
    select id, row_number() over (partition by nota_fiscal, produto, conta, data, quantidade, preco_faturado order by id) as n
      from transacoes where diagnostico_id = p_diag and valida and nota_fiscal is not null
  ), marcadas as (
    update transacoes t set valida = false from repetidas r where t.id = r.id and r.n > 1 returning 1
  )
  select count(*) into v_n from marcadas;
  perform motor.registrar_validacao(p_diag, d.cliente_id, 'transacoes', 'duplicatas', 'alerta', v_n, v_total,
    'Linhas repetidas (mesma nota, produto, conta, data, quantidade e preço). A repetição fica fora do cálculo.');

  select count(*) into v_n from transacoes where diagnostico_id = p_diag and valida and preco_faturado > preco_lista * 1.0001;
  perform motor.registrar_validacao(p_diag, d.cliente_id, 'transacoes', 'faturado_acima_da_lista', 'alerta', v_n, v_total,
    'Linhas com preço faturado acima do preço de lista. Entram no cálculo como desconto negativo; confira se a lista está atualizada.');

  select count(*) into v_n from transacoes where diagnostico_id = p_diag and valida
     and coalesce(desc_comercial, desc_volume, desc_promocional, desc_financeiro) is not null
     and abs(preco_lista - coalesce(desc_comercial, 0) - coalesce(desc_volume, 0) - coalesce(desc_promocional, 0) - coalesce(desc_financeiro, 0) - preco_faturado) > preco_lista * 0.01;
  perform motor.registrar_validacao(p_diag, d.cliente_id, 'transacoes', 'descontos_nao_fecham', 'alerta', v_n, v_total,
    'Linhas em que lista menos descontos não fecha com o preço faturado (diferença acima de 1%). A diferença aparece como desconto não classificado.');

  select count(*), count(distinct date_trunc('month', data)) into v_validas, v_meses from transacoes where diagnostico_id = p_diag and valida;
  if v_validas > 0 and v_meses < 12 then
    perform motor.registrar_validacao(p_diag, d.cliente_id, 'transacoes', 'cobertura_do_periodo', 'alerta', 12 - v_meses, 12,
      format('O histórico válido cobre %s de 12 meses. A sazonalidade não é capturada e o ganho anual é uma extrapolação.', v_meses));
  end if;
  if not d.precos_liquidos_de_impostos then
    perform motor.registrar_validacao(p_diag, d.cliente_id, 'transacoes', 'precos_com_impostos', 'alerta', 1, 1,
      'Os preços foram informados com impostos. Comparações entre regiões e contas com tributação diferente ficam distorcidas.');
  end if;
  if v_total > 0 and v_validas = 0 then
    perform motor.registrar_validacao(p_diag, d.cliente_id, 'transacoes', 'sem_linhas_validas', 'erro', 1, 1, 'Nenhuma transação válida no período do diagnóstico.');
  end if;

  v_nota := case when v_total > 0 then greatest(0, 100 * v_validas / v_total - case when v_meses < 12 then 10 else 0 end) end;
  insert into qualidade_blocos values (d.cliente_id, p_diag, 'transacoes', true, v_total > 0, v_total, round(v_nota, 1));

  -- ---- custos
  select count(*), count(*) filter (where produto is null or custo_unitario is null or custo_unitario <= 0) into v_itens, v_n from custos where diagnostico_id = p_diag;
  perform motor.registrar_validacao(p_diag, d.cliente_id, 'custos', 'custo_invalido', 'alerta', v_n, v_itens,
    'Linhas de custo sem produto ou com custo zerado ou negativo. São ignoradas.');
  select coalesce(sum(t.quantidade * t.preco_faturado), 0),
         coalesce(sum(t.quantidade * t.preco_faturado) filter (where exists (
           select 1 from custos k where k.diagnostico_id = p_diag and k.produto = t.produto and k.custo_unitario > 0)), 0)
    into v_rec, v_rec_com_custo from transacoes t where t.diagnostico_id = p_diag and t.valida;
  if v_rec > 0 and v_rec_com_custo < v_rec then
    perform motor.registrar_validacao(p_diag, d.cliente_id, 'custos', 'produto_sem_custo', case when v_rec_com_custo = 0 then 'erro' else 'alerta' end,
      round(100 * (v_rec - v_rec_com_custo) / v_rec, 1), 100,
      format('%s%% da receita faturada vem de produtos sem custo cadastrado. Essas vendas ficam fora das métricas de margem e das alavancas.',
             replace(to_char(round(100 * (v_rec - v_rec_com_custo) / v_rec, 1), 'FM990.0'), '.', ',')));
  end if;
  insert into qualidade_blocos values (d.cliente_id, p_diag, 'custos', true, v_itens > 0, v_itens,
    case when v_itens > 0 and v_rec > 0 then round(100 * v_rec_com_custo / v_rec, 1) end);

  -- ---- cadastro de produtos
  select count(*) > 0 into v_tem from produtos where diagnostico_id = p_diag;
  select count(*), count(*) filter (where p.categoria is not null) into v_itens, v_ok
    from (select distinct produto from transacoes where diagnostico_id = p_diag and valida) t
    left join produtos p on p.diagnostico_id = p_diag and p.codigo = t.produto;
  if v_tem then
    perform motor.registrar_validacao(p_diag, d.cliente_id, 'produtos', 'produto_sem_categoria', 'alerta', v_itens - v_ok, v_itens,
      'Produtos vendidos sem categoria no cadastro. Aparecem como "(sem categoria)".');
  end if;
  insert into qualidade_blocos values (d.cliente_id, p_diag, 'produtos', false, v_tem, (select count(*) from produtos where diagnostico_id = p_diag),
    case when v_tem and v_itens > 0 then round(100 * v_ok / v_itens, 1) end);

  -- ---- cadastro de contas
  select count(*) > 0 into v_tem from contas where diagnostico_id = p_diag;
  select count(*), count(*) filter (where c.segmento is not null) into v_itens, v_ok
    from (select distinct conta from transacoes where diagnostico_id = p_diag and valida) t
    left join contas c on c.diagnostico_id = p_diag and c.codigo = t.conta;
  if v_tem then
    perform motor.registrar_validacao(p_diag, d.cliente_id, 'contas', 'conta_sem_segmento', 'alerta', v_itens - v_ok, v_itens,
      'Contas com venda no período sem segmento no cadastro. Aparecem como "(sem segmento)".');
  end if;
  insert into qualidade_blocos values (d.cliente_id, p_diag, 'contas', false, v_tem, (select count(*) from contas where diagnostico_id = p_diag),
    case when v_tem and v_itens > 0 then round(100 * v_ok / v_itens, 1) end);

  -- ---- custos de servir
  select count(*), count(*) filter (where percentual is not null and percentual >= 0 and percentual < 100 and tipo is not null) into v_itens, v_ok from custos_servir where diagnostico_id = p_diag;
  perform motor.registrar_validacao(p_diag, d.cliente_id, 'custos_servir', 'percentual_invalido', 'alerta', v_itens - v_ok, v_itens,
    'Linhas de custo de servir sem tipo ou com percentual fora da faixa de 0 a 100. São ignoradas.');
  insert into qualidade_blocos values (d.cliente_id, p_diag, 'custos_servir', false, v_itens > 0, v_itens, case when v_itens > 0 then round(100 * v_ok / v_itens, 1) end);

  -- ---- descontos fora da fatura
  select count(*), count(*) filter (where f.valor > 0 and f.mes is not null and exists (
           select 1 from transacoes t where t.diagnostico_id = p_diag and t.valida and t.conta = f.conta and date_trunc('month', t.data) = date_trunc('month', f.mes)))
    into v_itens, v_ok from descontos_fora_fatura f where f.diagnostico_id = p_diag;
  perform motor.registrar_validacao(p_diag, d.cliente_id, 'descontos_fora_fatura', 'sem_venda_correspondente', 'alerta', v_itens - v_ok, v_itens,
    'Lançamentos sem valor, sem mês ou sem venda da conta naquele mês. Não entram na cascata de preço.');
  insert into qualidade_blocos values (d.cliente_id, p_diag, 'descontos_fora_fatura', false, v_itens > 0, v_itens, case when v_itens > 0 then round(100 * v_ok / v_itens, 1) end);
end $$;

-- ================================================================ base de cálculo
create or replace function motor.montar_fato(p_diag uuid) returns void
language plpgsql set search_path = public, motor as $$
begin
  delete from motor.fato where diagnostico_id = p_diag;
  insert into motor.fato
  with venda_mes as (
    select conta, date_trunc('month', data) as mes, sum(quantidade * preco_faturado) as receita
      from transacoes where diagnostico_id = p_diag and valida group by 1, 2
  ), fora as (
    select conta, date_trunc('month', mes) as mes, sum(valor) as valor
      from descontos_fora_fatura where diagnostico_id = p_diag and valor > 0 and mes is not null group by 1, 2
  ), taxa_fora as (
    select f.conta, f.mes, f.valor / v.receita as taxa from fora f join venda_mes v using (conta, mes) where v.receita > 0
  ), linhas as (
    select t.*, t.quantidade * t.preco_faturado as rf,
           coalesce(tf.taxa, 0) as taxa_fora, cs.frete, cs.comissao, cs.prazo, cs.outros, cu.custo_unitario,
           p.categoria, c.segmento, c.regiao, c.vendedor
      from transacoes t
      left join produtos p on p.diagnostico_id = p_diag and p.codigo = t.produto
      left join contas c on c.diagnostico_id = p_diag and c.codigo = t.conta
      left join taxa_fora tf on tf.conta = t.conta and tf.mes = date_trunc('month', t.data)
      left join lateral (
        select coalesce(sum(pct) filter (where tipo = 'frete'), 0) as frete, coalesce(sum(pct) filter (where tipo = 'comissao'), 0) as comissao,
               coalesce(sum(pct) filter (where tipo = 'prazo'), 0) as prazo, coalesce(sum(pct) filter (where tipo = 'outros'), 0) as outros
          from (select distinct on (tp) tp as tipo, s.percentual / 100 as pct
                  from custos_servir s, lateral (select case when lower(s.tipo) in ('frete', 'comissao', 'prazo') then lower(s.tipo) else 'outros' end as tp) n
                 where s.diagnostico_id = p_diag and s.tipo is not null and s.percentual >= 0 and s.percentual < 100
                   and (s.conta is null or s.conta = t.conta) and (s.canal is null or s.canal = t.canal)
                 order by tp, (s.conta is not null) desc, (s.canal is not null) desc, s.id) x
      ) cs on true
      left join lateral (
        select k.custo_unitario from custos k
         where k.diagnostico_id = p_diag and k.produto = t.produto and k.custo_unitario > 0
         order by (k.vigencia_inicio is null or k.vigencia_inicio <= t.data) desc,
                  case when k.vigencia_inicio <= t.data then k.vigencia_inicio end desc nulls last,
                  k.vigencia_inicio asc nulls first
         limit 1
      ) cu on true
     where t.diagnostico_id = p_diag and t.valida
  )
  select p_diag, id, data, produto, conta, coalesce(nullif(canal, ''), '(sem canal)'),
         coalesce(categoria, '(sem categoria)'), coalesce(segmento, '(sem segmento)'), coalesce(regiao, '(sem região)'), coalesce(vendedor, '(sem vendedor)'),
         quantidade, quantidade * preco_lista,
         quantidade * coalesce(desc_comercial, 0), quantidade * coalesce(desc_volume, 0), quantidade * coalesce(desc_promocional, 0), quantidade * coalesce(desc_financeiro, 0),
         quantidade * (preco_lista - preco_faturado - coalesce(desc_comercial, 0) - coalesce(desc_volume, 0) - coalesce(desc_promocional, 0) - coalesce(desc_financeiro, 0)),
         rf, rf * taxa_fora, rf * frete, rf * comissao, rf * prazo, rf * outros,
         rf * (1 - taxa_fora - frete - comissao - prazo - outros),
         quantidade * custo_unitario
    from linhas;
end $$;

-- Resumo por conta: volume, desconto em fatura e quartil de volume (1 = maiores contas).
create or replace function motor.contas_resumo(p_diag uuid)
returns table (conta text, rec_lista numeric, rec_faturada numeric, transacoes bigint, desc_pct numeric, quartil integer)
language sql stable set search_path = public, motor as $$
  select conta, sum(rec_lista), sum(rec_faturada), count(*),
         100 * (sum(rec_lista) - sum(rec_faturada)) / sum(rec_lista),
         ntile(4) over (order by sum(rec_lista) desc, conta)
    from motor.fato where diagnostico_id = p_diag group by conta
$$;

-- ================================================================ métricas
create or replace function motor.gravar_metrica(p_diag uuid, p_cliente uuid, p_metrica text, p_valor numeric, p_detalhe jsonb default null)
returns void language sql set search_path = public, motor as $$
  insert into metricas_resultado (cliente_id, diagnostico_id, metrica, valor, detalhe) values (p_cliente, p_diag, p_metrica, p_valor, p_detalhe)
$$;

create or replace function motor.calcular_metricas(p_diag uuid) returns void
language plpgsql set search_path = public, motor as $$
declare
  v_cliente uuid;
  t record; m record; b record;
  v_cobertura numeric; v_neg numeric; v_corr numeric; v_contas integer;
  v_col text;
  c_min_contas constant integer := 5;
begin
  select cliente_id into strict v_cliente from diagnosticos where id = p_diag;
  delete from metricas_resultado where diagnostico_id = p_diag;

  select sum(rec_lista) as lista, sum(d_comercial) as d_comercial, sum(d_volume) as d_volume, sum(d_promocional) as d_promocional,
         sum(d_financeiro) as d_financeiro, sum(d_nao_classificado) as d_nc, sum(rec_faturada) as faturada, sum(d_fora_fatura) as fora,
         sum(cs_frete) as frete, sum(cs_comissao) as comissao, sum(cs_prazo) as prazo, sum(cs_outros) as outros, sum(rec_pocket) as pocket,
         count(*) as linhas, min(data) as inicio, max(data) as fim
    into t from motor.fato where diagnostico_id = p_diag;
  if coalesce(t.lista, 0) = 0 then return; end if;

  -- ---- realização de preço
  perform motor.gravar_metrica(p_diag, v_cliente, 'vazamento_pct', 100 * (t.lista - t.pocket) / t.lista);
  perform motor.gravar_metrica(p_diag, v_cliente, 'desconto_fatura_pct', 100 * (t.lista - t.faturada) / t.lista);
  perform motor.gravar_metrica(p_diag, v_cliente, 'fora_fatura_pct', 100 * t.fora / t.lista);
  perform motor.gravar_metrica(p_diag, v_cliente, 'custo_servir_pct', 100 * (t.frete + t.comissao + t.prazo + t.outros) / t.lista);
  perform motor.gravar_metrica(p_diag, v_cliente, 'cascata', t.pocket, (
    select jsonb_agg(jsonb_build_object('degrau', degrau, 'rotulo', rotulo, 'tipo', tipo, 'valor', round(valor, 2)) order by ordem)
      from (values
        (1, 'lista', 'Preço de lista', 'total', t.lista),
        (2, 'd_comercial', 'Desconto comercial', 'queda', t.d_comercial),
        (3, 'd_volume', 'Desconto por volume', 'queda', t.d_volume),
        (4, 'd_promocional', 'Desconto promocional', 'queda', t.d_promocional),
        (5, 'd_financeiro', 'Desconto financeiro', 'queda', t.d_financeiro),
        (6, 'd_nao_classificado', 'Desconto não classificado', 'queda', t.d_nc),
        (7, 'faturado', 'Preço faturado', 'total', t.faturada),
        (8, 'fora_fatura', 'Descontos fora da fatura', 'queda', t.fora),
        (9, 'cs_frete', 'Frete', 'queda', t.frete),
        (10, 'cs_comissao', 'Comissão', 'queda', t.comissao),
        (11, 'cs_prazo', 'Prazo de pagamento', 'queda', t.prazo),
        (12, 'cs_outros', 'Outros custos de servir', 'queda', t.outros),
        (13, 'pocket', 'Pocket price', 'total', t.pocket)
      ) as d (ordem, degrau, rotulo, tipo, valor)
     where tipo = 'total' or abs(valor) > 0.005));
  perform motor.gravar_metrica(p_diag, v_cliente, 'base', t.faturada,
    jsonb_build_object('linhas', t.linhas, 'inicio', t.inicio, 'fim', t.fim, 'dias', t.fim - t.inicio + 1,
                       'rec_lista', round(t.lista, 2), 'rec_faturada', round(t.faturada, 2), 'rec_pocket', round(t.pocket, 2)));

  -- ---- margem (só linhas com custo)
  select sum(rec_faturada) as faturada, sum(rec_pocket) as pocket, sum(custo) as custo into m
    from motor.fato where diagnostico_id = p_diag and custo is not null;
  v_cobertura := coalesce(m.faturada, 0) / t.faturada;
  if v_cobertura < 0.5 then
    for v_col in select unnest(array['margem_contribuicao_pct', 'margem_pocket_pct', 'receita_margem_negativa_pct']) loop
      perform motor.gravar_metrica(p_diag, v_cliente, v_col, null,
        jsonb_build_object('indisponivel', format('Só %s%% da receita tem custo cadastrado; o mínimo para calcular margem é 50%%.', round(100 * v_cobertura))));
    end loop;
  else
    perform motor.gravar_metrica(p_diag, v_cliente, 'margem_contribuicao_pct', 100 * (m.faturada - m.custo) / m.faturada,
      jsonb_build_object('cobertura_pct', round(100 * v_cobertura, 1), 'margem', round(m.faturada - m.custo, 2)));
    perform motor.gravar_metrica(p_diag, v_cliente, 'margem_pocket_pct', 100 * (m.pocket - m.custo) / nullif(m.pocket, 0),
      jsonb_build_object('cobertura_pct', round(100 * v_cobertura, 1), 'margem', round(m.pocket - m.custo, 2)));
    select coalesce(sum(rf), 0) into v_neg from (
      select sum(rec_faturada) as rf from motor.fato where diagnostico_id = p_diag and custo is not null
       group by conta, produto having sum(rec_pocket - custo) < 0) x;
    perform motor.gravar_metrica(p_diag, v_cliente, 'receita_margem_negativa_pct', 100 * v_neg / m.faturada, jsonb_build_object('receita', round(v_neg, 2)));
  end if;

  -- ---- dispersão: banda do preço por conta, em cada produto com contas suficientes
  insert into metricas_resultado (cliente_id, diagnostico_id, metrica, recorte_tipo, recorte_valor, valor, detalhe)
  select v_cliente, p_diag, 'banda_preco', 'produto', produto, 100 * (p90 - p10) / p50,
         jsonb_build_object('contas', contas, 'p10', round(p10, 4), 'p25', round(p25, 4), 'p50', round(p50, 4), 'p90', round(p90, 4),
                            'cv_pct', round(100 * desvio / media, 2), 'receita', round(receita, 2))
    from (select produto, count(*) as contas, sum(rf) as receita, avg(preco) as media, coalesce(stddev_samp(preco), 0) as desvio,
                 percentile_cont(0.10) within group (order by preco)::numeric as p10, percentile_cont(0.25) within group (order by preco)::numeric as p25,
                 percentile_cont(0.50) within group (order by preco)::numeric as p50, percentile_cont(0.90) within group (order by preco)::numeric as p90
            from (select produto, conta, sum(rec_faturada) / sum(quantidade) as preco, sum(rec_faturada) as rf
                    from motor.fato where diagnostico_id = p_diag group by produto, conta) pc
           group by produto having count(*) >= c_min_contas) x;

  select sum(valor * (detalhe ->> 'receita')::numeric) / nullif(sum((detalhe ->> 'receita')::numeric), 0) as amplitude,
         sum((detalhe ->> 'cv_pct')::numeric * (detalhe ->> 'receita')::numeric) / nullif(sum((detalhe ->> 'receita')::numeric), 0) as cv,
         count(*) as produtos, sum((detalhe ->> 'receita')::numeric) as receita
    into b from metricas_resultado where diagnostico_id = p_diag and metrica = 'banda_preco';
  if coalesce(b.produtos, 0) = 0 then
    perform motor.gravar_metrica(p_diag, v_cliente, 'dispersao_banda_pct', null,
      jsonb_build_object('indisponivel', format('Nenhum produto foi vendido a pelo menos %s contas; não há banda de preço para medir.', c_min_contas)));
    perform motor.gravar_metrica(p_diag, v_cliente, 'cv_preco_pct', null, jsonb_build_object('indisponivel', 'Sem banda de preço.'));
  else
    perform motor.gravar_metrica(p_diag, v_cliente, 'dispersao_banda_pct', b.amplitude,
      jsonb_build_object('produtos', b.produtos, 'cobertura_pct', round(100 * b.receita / t.faturada, 1)));
    perform motor.gravar_metrica(p_diag, v_cliente, 'cv_preco_pct', b.cv);
  end if;

  select count(*), corr(desc_pct, ln(rec_lista))::numeric into v_contas, v_corr from motor.contas_resumo(p_diag);
  if v_contas < 10 or v_corr is null then
    perform motor.gravar_metrica(p_diag, v_cliente, 'correlacao_desconto_volume', null,
      jsonb_build_object('indisponivel', 'São necessárias pelo menos 10 contas com desconto variado para medir a relação entre desconto e volume.'));
  else
    perform motor.gravar_metrica(p_diag, v_cliente, 'correlacao_desconto_volume', v_corr, jsonb_build_object('contas', v_contas));
  end if;

  -- ---- recortes: realização e margem por canal, segmento, categoria, região, vendedor, produto e conta
  foreach v_col in array array['canal', 'segmento', 'categoria', 'regiao', 'vendedor', 'produto', 'conta'] loop
    execute format($f$
      insert into public.metricas_resultado (cliente_id, diagnostico_id, metrica, recorte_tipo, recorte_valor, valor, detalhe)
      select $2, $1, 'recorte', %L, %I, 100 * (sum(rec_lista) - sum(rec_pocket)) / sum(rec_lista),
             jsonb_build_object(
               'rec_lista', round(sum(rec_lista), 2), 'rec_faturada', round(sum(rec_faturada), 2), 'rec_pocket', round(sum(rec_pocket), 2),
               'desconto_fatura_pct', round(100 * (sum(rec_lista) - sum(rec_faturada)) / sum(rec_lista), 2),
               'transacoes', count(*),
               'margem_pocket', round(sum(rec_pocket - custo) filter (where custo is not null), 2),
               'margem_pocket_pct', round(100 * sum(rec_pocket - custo) filter (where custo is not null) / nullif(sum(rec_pocket) filter (where custo is not null), 0), 2))
        from motor.fato where diagnostico_id = $1 group by %I
    $f$, v_col, v_col, v_col) using p_diag, v_cliente;
  end loop;
end $$;

-- ================================================================ pontuação
create or replace function motor.pontuar(p_diag uuid) returns void
language plpgsql set search_path = public, motor as $$
declare
  d diagnosticos; v_setor text; v_dims integer; v_com_nota integer; v_geral numeric;
begin
  select * into strict d from diagnosticos where id = p_diag;
  delete from pontuacoes where diagnostico_id = p_diag;

  select c.setor into v_setor from clientes c where c.id = d.cliente_id;
  if not exists (select 1 from pesos_setor where versao = d.versao_catalogo and setor = v_setor) then v_setor := 'distribuicao'; end if;

  insert into pontuacoes (cliente_id, diagnostico_id, dimensao, nota, parcial, detalhe)
  select d.cliente_id, p_diag, dimensao,
         round(sum(nota * peso) filter (where nota is not null) / nullif(sum(peso) filter (where nota is not null), 0), 1),
         bool_or(nota is null and limiar_bom is not null),
         jsonb_agg(jsonb_build_object('metrica', codigo, 'nota', round(nota, 1)) order by ordem)
    from (select c.dimensao, c.codigo, c.peso, c.ordem, c.limiar_bom,
                 case when c.limiar_bom is not null and r.valor is not null
                      then 100 * greatest(0, least(1, (r.valor - c.limiar_ruim) / (c.limiar_bom - c.limiar_ruim))) end as nota
            from metricas_catalogo c
            left join metricas_resultado r on r.diagnostico_id = p_diag and r.metrica = c.codigo and r.recorte_tipo = 'total'
           where c.versao = d.versao_catalogo) x
   group by dimensao;

  select count(*) into v_dims from pesos_setor where versao = d.versao_catalogo and setor = v_setor;
  select count(*), sum(p.nota * s.peso) / nullif(sum(s.peso), 0) into v_com_nota, v_geral
    from pontuacoes p join pesos_setor s on s.versao = d.versao_catalogo and s.setor = v_setor and s.dimensao = p.dimensao
   where p.diagnostico_id = p_diag and p.nota is not null;
  insert into pontuacoes (cliente_id, diagnostico_id, dimensao, nota, parcial, detalhe)
  values (d.cliente_id, p_diag, 'geral', round(v_geral, 1), v_com_nota < v_dims,
          jsonb_build_object('dimensoes_calculadas', v_com_nota, 'dimensoes_do_catalogo', v_dims, 'setor', v_setor));
end $$;

-- ================================================================ achados
create or replace function motor.gerar_achados(p_diag uuid) returns void
language plpgsql set search_path = public, motor as $$
declare
  d diagnosticos; r regras_achado; t record; a record;
  v_mediana numeric; v_valor numeric;
begin
  select * into strict d from diagnosticos where id = p_diag;
  delete from achados where diagnostico_id = p_diag;
  select sum(rec_lista) as lista, sum(rec_pocket) as pocket into t from motor.fato where diagnostico_id = p_diag;
  if coalesce(t.lista, 0) = 0 then return; end if;

  for r in select * from regras_achado where versao = d.versao_catalogo order by codigo loop
    select 0::bigint as itens, null::numeric as exposto, null::jsonb as evidencia into a;
    if r.codigo = 'vazamento_alto' then
      v_valor := 100 * (t.lista - t.pocket) / t.lista;
      if v_valor > (r.parametros ->> 'limite_pct')::numeric then
        select 1::bigint as itens, (v_valor - (r.parametros ->> 'limite_pct')::numeric) / 100 * t.lista as exposto,
               jsonb_build_object('vazamento_pct', round(v_valor, 1), 'limite_pct', (r.parametros ->> 'limite_pct')::numeric, 'receita_lista', round(t.lista, 2)) as evidencia into a;
      end if;

    elsif r.codigo = 'contas_pequenas_desconto_alto' then
      select percentile_cont(0.5) within group (order by desc_pct) into v_mediana from motor.contas_resumo(p_diag) where quartil = 1;
      select count(*) as itens, sum((desc_pct - v_mediana) / 100 * rec_lista) as exposto,
             jsonb_build_object('contas', count(*), 'mediana_quartil_superior_pct', round(v_mediana, 1),
               'desconto_medio_pct', round(100 * (sum(rec_lista) - sum(rec_faturada)) / sum(rec_lista), 1), 'receita_lista', round(sum(rec_lista), 2),
               'exemplos', (select jsonb_agg(e) from (select jsonb_build_object('conta', x.conta, 'desconto_pct', round(x.desc_pct, 1), 'receita_lista', round(x.rec_lista, 2)) as e
                              from motor.contas_resumo(p_diag) x where x.quartil = 4 and x.transacoes >= (r.parametros ->> 'min_transacoes')::int and x.desc_pct > v_mediana
                             order by (x.desc_pct - v_mediana) * x.rec_lista desc limit 10) ex)) as evidencia
        into a from motor.contas_resumo(p_diag)
       where quartil = 4 and transacoes >= (r.parametros ->> 'min_transacoes')::int and desc_pct > v_mediana;

    elsif r.codigo = 'preco_abaixo_do_piso' then
      with pc as (
        select produto, conta, sum(rec_faturada) / sum(quantidade) as preco, sum(quantidade) as qtd, sum(rec_faturada) as rf
          from motor.fato where diagnostico_id = p_diag group by produto, conta
      ), piso as (
        select produto, percentile_cont((r.parametros ->> 'percentil_piso')::numeric / 100) within group (order by preco)::numeric as piso
          from pc group by produto having count(*) >= (r.parametros ->> 'min_contas')::int
      ), abaixo as (
        select pc.*, piso.piso from pc join piso using (produto) join motor.contas_resumo(p_diag) cr on cr.conta = pc.conta
         where pc.preco < piso.piso and cr.quartil <> 1
      )
      select count(*) as itens, sum((piso - preco) * qtd) as exposto,
             jsonb_build_object('pares_conta_produto', count(*), 'contas', count(distinct conta), 'produtos', count(distinct produto),
               'receita_faturada', round(sum(rf), 2), 'percentil_piso', (r.parametros ->> 'percentil_piso')::numeric,
               'exemplos', (select jsonb_agg(e) from (select jsonb_build_object('conta', conta, 'produto', produto, 'preco', round(preco, 2), 'piso', round(piso, 2), 'valor', round((piso - preco) * qtd, 2)) as e
                              from abaixo order by (piso - preco) * qtd desc limit 10) ex)) as evidencia
        into a from abaixo;

    elsif r.codigo in ('margem_negativa', 'margem_baixa') then
      with pr as (
        select produto, count(*) as n, sum(rec_pocket) as pocket, sum(rec_faturada) as rf, sum(rec_pocket - custo) as margem
          from motor.fato where diagnostico_id = p_diag and custo is not null group by produto
      ), alvo as (
        select pr.*, case when r.codigo = 'margem_negativa' then -margem else (r.parametros ->> 'alvo_pct')::numeric / 100 * pocket - margem end as valor
          from pr where n >= (r.parametros ->> 'min_transacoes')::int
           and case when r.codigo = 'margem_negativa' then margem < 0
                    else margem >= 0 and margem < (r.parametros ->> 'alvo_pct')::numeric / 100 * pocket end
      )
      select count(*) as itens, sum(valor) as exposto,
             jsonb_build_object('produtos', count(*), 'receita_faturada', round(sum(rf), 2), 'margem_pocket', round(sum(margem), 2),
               'alvo_pct', (r.parametros ->> 'alvo_pct')::numeric,
               'exemplos', (select jsonb_agg(e) from (select jsonb_build_object('produto', produto, 'margem_pocket_pct', round(100 * margem / nullif(pocket, 0), 1), 'receita_faturada', round(rf, 2), 'valor', round(valor, 2)) as e
                              from alvo order by valor desc limit 10) ex)) as evidencia
        into a from alvo;

    elsif r.codigo = 'desconto_sem_relacao_com_volume' then
      select valor into v_valor from metricas_resultado where diagnostico_id = p_diag and metrica = 'correlacao_desconto_volume' and recorte_tipo = 'total';
      if v_valor is not null and v_valor < (r.parametros ->> 'limite')::numeric then
        select 1::bigint as itens, null::numeric as exposto, jsonb_build_object('correlacao', round(v_valor, 2), 'limite', (r.parametros ->> 'limite')::numeric) as evidencia into a;
      end if;
    end if;

    if coalesce(a.itens, 0) > 0 then
      insert into achados (cliente_id, diagnostico_id, regra, dimensao, titulo, descricao, alavanca, valor_exposto, evidencia)
      values (d.cliente_id, p_diag, r.codigo, r.dimensao, r.titulo, r.descricao, r.alavanca, round(a.exposto, 2), jsonb_strip_nulls(a.evidencia));
    end if;
  end loop;
end $$;

-- ================================================================ simulação de ajustes
-- Ganho anual de margem por alavanca, para um conjunto de premissas.
--   ganho = [ (P + dP - C) * Q * (1 + e * dP / P) - (P - C) * Q ] * captura
-- P é o preço faturado médio do par conta e produto; C é o custo unitário incluindo custo de servir e
-- descontos fora da fatura, para o ganho sair em pocket margin; e é a elasticidade (negativa).
-- As alavancas rodam na ordem do catálogo, cada uma sobre a base já ajustada pela anterior, e o ajuste
-- só entra nos pares em que o ganho é positivo. O resultado do período é levado a 12 meses.
create or replace function motor.simular(p_diag uuid, p_premissas jsonb) returns jsonb
language sql stable set search_path = public, motor as $$
  with par as (
    select coalesce((p_premissas #>> '{contencao_descontos,percentil_piso}')::numeric, 25) / 100 as pp,
           coalesce((p_premissas #>> '{contencao_descontos,fechamento}')::numeric, 0.5) as fech,
           least(coalesce((p_premissas #>> '{contencao_descontos,elasticidade}')::numeric, -0.7), 0) as e1,
           coalesce((p_premissas #>> '{contencao_descontos,captura}')::numeric, 0.6) as cap1,
           coalesce((p_premissas #>> '{reajuste_seletivo,margem_alvo_pct}')::numeric, 10) / 100 as alvo,
           coalesce((p_premissas #>> '{reajuste_seletivo,aumento_pct}')::numeric, 4) / 100 as aum,
           least(coalesce((p_premissas #>> '{reajuste_seletivo,elasticidade}')::numeric, -1), 0) as e2,
           coalesce((p_premissas #>> '{reajuste_seletivo,captura}')::numeric, 0.6) as cap2
  ), periodo as (
    select 365.0 / (max(data) - min(data) + 1) as fator from motor.fato where diagnostico_id = p_diag
  ), base as (
    select produto, conta, sum(quantidade) as q, sum(rec_faturada) / sum(quantidade) as p,
           sum(custo + rec_faturada - rec_pocket) / sum(quantidade) as c
      from motor.fato where diagnostico_id = p_diag and custo is not null group by produto, conta
  ), piso as (
    -- a banda usa todas as vendas do produto, com ou sem custo cadastrado
    select produto, percentile_cont((select pp from par)) within group (order by preco)::numeric as piso
      from (select produto, conta, sum(rec_faturada) / sum(quantidade) as preco from motor.fato where diagnostico_id = p_diag group by produto, conta) x
     group by produto having count(*) >= 5
  ), l1 as (
    select b.*, case when b.p < piso.piso and cr.quartil <> 1 then (piso.piso - b.p) * par.fech else 0 end as dp
      from base b cross join par left join piso using (produto) join motor.contas_resumo(p_diag) cr on cr.conta = b.conta
  ), s1 as (
    select l1.*, case when dp > 0 and (p + dp - c) * q * greatest(0, 1 + par.e1 * dp / p) - (p - c) * q > 0
                      then ((p + dp - c) * q * greatest(0, 1 + par.e1 * dp / p) - (p - c) * q) * par.cap1 else 0 end as ganho
      from l1 cross join par
  ), e1 as (
    select produto, conta, c, ganho as ganho1, p * q as receita,
           case when ganho > 0 then p + dp * par.cap1 else p end as p1,
           case when ganho > 0 then q * greatest(0, 1 + par.e1 * dp / p * par.cap1) else q end as q1
      from s1 cross join par
  ), fraco as (
    select produto from e1 cross join par group by produto, par.alvo having sum((p1 - c) * q1) < par.alvo * sum(p1 * q1)
  ), s2 as (
    select e1.*, case when f.produto is not null
                      then ((p1 * (1 + par.aum) - c) * q1 * greatest(0, 1 + par.e2 * par.aum) - (p1 - c) * q1) * par.cap2 else 0 end as bruto2
      from e1 cross join par left join fraco f using (produto)
  ), linhas as (
    select 'contencao_descontos' as alavanca, coalesce(sum(ganho1), 0) as ganho, coalesce(sum(receita) filter (where ganho1 > 0), 0) as receita, count(*) filter (where ganho1 > 0) as itens from s2
    union all
    select 'reajuste_seletivo', coalesce(sum(bruto2) filter (where bruto2 > 0), 0), coalesce(sum(p1 * q1) filter (where bruto2 > 0), 0), count(*) filter (where bruto2 > 0) from s2
  )
  select jsonb_build_object(
    'fator_anual', round((select fator from periodo), 4),
    'margem_base_anual', round((select sum((p - c) * q) from base) * (select fator from periodo), 2),
    'receita_base_anual', round((select sum(p * q) from base) * (select fator from periodo), 2),
    'alavancas', (select jsonb_agg(jsonb_build_object('alavanca', l.alavanca, 'nome', a.nome, 'ordem', a.ordem,
                           'ganho_anual', round(l.ganho * (select fator from periodo), 2),
                           'receita_afetada', round(l.receita * (select fator from periodo), 2), 'itens', l.itens) order by a.ordem)
                    from linhas l join alavancas_catalogo a on a.codigo = l.alavanca
                     and a.versao = (select versao_catalogo from diagnosticos where id = p_diag)),
    'ganho_total_anual', round((select sum(ganho) from linhas) * (select fator from periodo), 2))
$$;

create or replace function motor.rodar_cenarios(p_diag uuid) returns void
language plpgsql set search_path = public, motor as $$
declare
  d diagnosticos; c cenarios; v_premissas jsonb; v_resultado jsonb;
begin
  select * into strict d from diagnosticos where id = p_diag;
  insert into cenarios (cliente_id, diagnostico_id, codigo)
  select d.cliente_id, p_diag, x from unnest(array['conservador', 'base', 'agressivo']) x on conflict do nothing;
  insert into cenario_premissas (cenario_id, cliente_id, diagnostico_id, alavanca, chave, valor)
  select c2.id, d.cliente_id, p_diag, p.alavanca, p.chave, p.valor
    from cenarios c2 join premissas_padrao p on p.versao = d.versao_catalogo and p.cenario = c2.codigo
   where c2.diagnostico_id = p_diag on conflict do nothing;

  delete from cenario_resultado where diagnostico_id = p_diag;
  if not exists (select 1 from motor.fato where diagnostico_id = p_diag and custo is not null) then return; end if;
  for c in select * from cenarios where diagnostico_id = p_diag loop
    select jsonb_object_agg(alavanca, chaves) into v_premissas
      from (select alavanca, jsonb_object_agg(chave, valor) as chaves from cenario_premissas where cenario_id = c.id group by alavanca) x;
    v_resultado := motor.simular(p_diag, v_premissas);
    insert into cenario_resultado (cenario_id, cliente_id, diagnostico_id, alavanca, ordem, ganho_anual, receita_afetada, itens)
    select c.id, d.cliente_id, p_diag, e ->> 'alavanca', (e ->> 'ordem')::int, (e ->> 'ganho_anual')::numeric, (e ->> 'receita_afetada')::numeric, (e ->> 'itens')::int
      from jsonb_array_elements(v_resultado -> 'alavancas') e;
  end loop;
end $$;

-- ================================================================ orquestração
create or replace function motor.calcular(p_diag uuid) returns void
language plpgsql set search_path = public, motor as $$
begin
  update diagnosticos set versao_catalogo = (select versao from catalogo_versoes where vigente order by versao desc limit 1) where id = p_diag;
  perform motor.validar(p_diag);
  perform motor.montar_fato(p_diag);
  perform motor.calcular_metricas(p_diag);
  perform motor.pontuar(p_diag);
  perform motor.gerar_achados(p_diag);
  perform motor.rodar_cenarios(p_diag);
end $$;

-- ================================================================ painel
-- O painel inteiro em um documento: é o que a interface lê e o que a publicação guarda.
create or replace function motor.montar_painel(p_diag uuid) returns jsonb
language sql stable set search_path = public, motor as $$
  select jsonb_build_object(
    'diagnostico', (select jsonb_build_object('id', d.id, 'nome', d.nome, 'status', d.status, 'periodo_inicio', d.periodo_inicio, 'periodo_fim', d.periodo_fim,
                       'calculado_em', d.calculado_em, 'versao_catalogo', d.versao_catalogo, 'versao_publicada', d.versao_publicada, 'publicado_em', d.publicado_em,
                       'precos_liquidos_de_impostos', d.precos_liquidos_de_impostos,
                       'cliente', jsonb_build_object('id', c.id, 'nome', c.nome, 'setor', c.setor, 'moeda', c.moeda))
                      from diagnosticos d join clientes c on c.id = d.cliente_id where d.id = p_diag),
    'base', (select detalhe from metricas_resultado where diagnostico_id = p_diag and metrica = 'base'),
    'pontuacoes', coalesce((select jsonb_agg(jsonb_build_object('dimensao', dimensao, 'nota', nota, 'parcial', parcial, 'detalhe', detalhe) order by dimensao)
                     from pontuacoes where diagnostico_id = p_diag), '[]'),
    'metricas', coalesce((select jsonb_agg(jsonb_build_object('codigo', c.codigo, 'dimensao', c.dimensao, 'nome', c.nome, 'unidade', c.unidade, 'descricao', c.descricao,
                       'limiar_bom', c.limiar_bom, 'limiar_ruim', c.limiar_ruim, 'valor', round(r.valor, 4), 'detalhe', r.detalhe) order by c.dimensao, c.ordem)
                     from metricas_catalogo c join diagnosticos d on d.id = p_diag and d.versao_catalogo = c.versao
                     join metricas_resultado r on r.diagnostico_id = p_diag and r.metrica = c.codigo and r.recorte_tipo = 'total'), '[]'),
    'cascata', coalesce((select detalhe from metricas_resultado where diagnostico_id = p_diag and metrica = 'cascata'), '[]'),
    'recortes', coalesce((select jsonb_object_agg(recorte_tipo, linhas) from (
                     select recorte_tipo, jsonb_agg(jsonb_build_object('valor', recorte_valor, 'vazamento_pct', round(valor, 2)) || detalhe
                                                    order by (detalhe ->> 'rec_lista')::numeric desc) as linhas
                       from (select *, row_number() over (partition by recorte_tipo order by (detalhe ->> 'rec_lista')::numeric desc) as n
                               from metricas_resultado where diagnostico_id = p_diag and metrica = 'recorte') r
                      where n <= 25 group by recorte_tipo) x), '{}'),
    'achados', coalesce((select jsonb_agg(jsonb_build_object('regra', a.regra, 'dimensao', a.dimensao, 'titulo', a.titulo, 'descricao', a.descricao,
                       'alavanca', a.alavanca, 'alavanca_nome', l.nome, 'valor_exposto', a.valor_exposto, 'evidencia', a.evidencia) order by a.valor_exposto desc nulls last)
                     from achados a join diagnosticos d on d.id = a.diagnostico_id
                     left join alavancas_catalogo l on l.versao = d.versao_catalogo and l.codigo = a.alavanca
                    where a.diagnostico_id = p_diag), '[]'),
    'cenarios', coalesce((select jsonb_agg(jsonb_build_object('codigo', c.codigo,
                       'ganho_total_anual', (select coalesce(sum(ganho_anual), 0) from cenario_resultado r where r.cenario_id = c.id),
                       'alavancas', coalesce((select jsonb_agg(jsonb_build_object('alavanca', r.alavanca, 'nome', l.nome, 'ordem', r.ordem, 'ganho_anual', r.ganho_anual,
                                        'receita_afetada', r.receita_afetada, 'itens', r.itens) order by r.ordem)
                                       from cenario_resultado r join diagnosticos d on d.id = r.diagnostico_id
                                       join alavancas_catalogo l on l.versao = d.versao_catalogo and l.codigo = r.alavanca where r.cenario_id = c.id), '[]'),
                       'premissas', coalesce((select jsonb_agg(jsonb_build_object('alavanca', p.alavanca, 'chave', p.chave, 'valor', p.valor, 'origem', p.origem) order by p.alavanca, p.chave)
                                       from cenario_premissas p where p.cenario_id = c.id), '[]'))
                       order by array_position(array['conservador', 'base', 'agressivo'], c.codigo))
                     from cenarios c where c.diagnostico_id = p_diag), '[]'),
    'qualidade', coalesce((select jsonb_agg(jsonb_build_object('bloco', bloco, 'obrigatorio', obrigatorio, 'presente', presente, 'linhas', linhas, 'nota', nota)
                       order by array_position(array['transacoes', 'custos', 'produtos', 'contas', 'custos_servir', 'descontos_fora_fatura'], bloco))
                     from qualidade_blocos where diagnostico_id = p_diag), '[]'),
    'validacoes', coalesce((select jsonb_agg(jsonb_build_object('bloco', bloco, 'regra', regra, 'severidade', severidade, 'ocorrencias', ocorrencias, 'total', total, 'mensagem', mensagem)
                       order by severidade desc, bloco, regra)
                     from validacoes where diagnostico_id = p_diag), '[]'))
$$;
