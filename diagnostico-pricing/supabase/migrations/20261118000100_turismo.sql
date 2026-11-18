-- P1 do plano v3 (docs/ajustamento-v3.md): turismo na base.
-- Uma reserva é uma transação: as colunas de reserva são opcionais e o pipeline atual é reaproveitado.
-- Migração só aditiva: tabelas e colunas novas, e funções do motor e da API recriadas com o comportamento
-- anterior preservado para quem não manda dado de reserva (a distribuição continua com os mesmos números).

-- ================================================================ estrutura
alter table public.transacoes
  add column data_servico date,
  add column fornecedor text,
  add column custo_unitario_moeda numeric,
  add column moeda_custo text,
  add column cambio_venda numeric,
  add column cambio_pagamento numeric,
  add column data_pagamento_fornecedor date,
  -- over: incentivo que o fornecedor paga por passageiro, em reais; reduz o custo
  add column over_unitario numeric,
  add column status_reserva text;

alter table motor.fato
  add column fornecedor text,
  add column data_servico date,
  add column moeda text,
  -- custo total na moeda do fornecedor (quantidade × custo unitário em moeda)
  add column custo_moeda numeric,
  add column cambio_venda numeric,
  -- câmbio usado no custo: o do pagamento; sem ele, a projeção (câmbio da venda no P1)
  add column cambio_custo numeric,
  add column cambio_projetado boolean not null default false,
  add column over_total numeric,
  -- custo em moeda × (câmbio da venda − câmbio do custo): positivo quando a moeda caiu entre a venda e o pagamento
  add column resultado_cambial numeric;

alter table public.diagnosticos
  add column tipo text not null default 'diagnostico' check (tipo in ('diagnostico', 'acompanhamento', 'nota_avulsa')),
  add column segmento text check (segmento in ('operadora', 'consolidadora', 'mga', 'distribuicao', 'industria', 'varejo_b2b'));
update public.diagnosticos d set segmento = c.setor
  from public.clientes c where c.id = d.cliente_id and d.segmento is null
   and c.setor in ('operadora', 'consolidadora', 'mga', 'distribuicao', 'industria', 'varejo_b2b');

alter table public.uploads drop constraint uploads_bloco_check;
alter table public.uploads add constraint uploads_bloco_check
  check (bloco in ('transacoes', 'custos', 'custos_servir', 'descontos_fora_fatura', 'produtos', 'contas', 'bloqueios'));

-- Lugares contratados com o fornecedor para uma saída. A multa é por lugar, em reais; sem multa, o lugar
-- não vendido custa o custo unitário na moeda do fornecedor.
create table public.bloqueios (
  id bigint generated always as identity primary key,
  cliente_id uuid not null,
  diagnostico_id uuid not null references public.diagnosticos (id) on delete cascade,
  produto text,
  fornecedor text,
  data_servico date,
  lugares_contratados numeric,
  lugares_vendidos numeric,
  data_devolucao date,
  multa_por_lugar numeric,
  custo_unitario_moeda numeric,
  moeda text
);
create index on public.bloqueios (diagnostico_id);

-- ================================================================ catálogo versão 2
alter table public.metricas_catalogo add column segmentos text[];

update public.catalogo_versoes set vigente = false where versao = 1;
insert into public.catalogo_versoes (versao, descricao, vigente)
values (2, 'Versão 1 mais métricas de turismo (operadoras e consolidadoras), informativas até a definição dos limiares', true);

insert into public.metricas_catalogo (versao, codigo, dimensao, nome, unidade, limiar_bom, limiar_ruim, peso, ordem, descricao, segmentos)
select 2, codigo, dimensao, nome, unidade, limiar_bom, limiar_ruim, peso, ordem, descricao, null from public.metricas_catalogo where versao = 1;
insert into public.regras_achado (versao, codigo, dimensao, titulo, descricao, alavanca, parametros)
select 2, codigo, dimensao, titulo, descricao, alavanca, parametros from public.regras_achado where versao = 1;
insert into public.alavancas_catalogo (versao, codigo, nome, ordem, descricao)
select 2, codigo, nome, ordem, descricao from public.alavancas_catalogo where versao = 1;
insert into public.pesos_setor (versao, setor, dimensao, peso)
select 2, setor, dimensao, peso from public.pesos_setor where versao = 1;
insert into public.premissas_padrao (versao, cenario, alavanca, chave, valor)
select 2, cenario, alavanca, chave, valor from public.premissas_padrao where versao = 1;

-- Métricas de turismo: sem limiar (informativas) até a definição dos limiares; a dimensão fica fora da nota geral.
insert into public.metricas_catalogo (versao, codigo, dimensao, nome, unidade, limiar_bom, limiar_ruim, peso, ordem, descricao, segmentos) values
  (2, 'margem_passageiro',          'margem',     'Margem por passageiro',              'R$', null, null, 0, 4, '(Receita pocket − custo) ÷ passageiros, nas reservas com custo', '{operadora,consolidadora}'),
  (2, 'markup_fornecedor_pct',      'margem',     'Markup sobre o fornecedor',          '%',  null, null, 0, 5, '(Receita pocket − custo) ÷ custo; o detalhe traz cada fornecedor', '{operadora,consolidadora}'),
  (2, 'resultado_cambial_pct',      'cambio',     'Resultado cambial',                  '%',  null, null, 0, 1, 'Custo em moeda × (câmbio da venda − câmbio do pagamento) ÷ receita faturada; negativo quando a moeda subiu depois da venda', '{operadora,consolidadora}'),
  (2, 'cambio_equilibrio',          'cambio',     'Folga até o câmbio de equilíbrio',   '%',  null, null, 0, 2, 'Quanto a moeda do fornecedor pode subir sobre o câmbio da venda antes de zerar a margem; o valor é o do produto mais exposto', '{operadora,consolidadora}'),
  (2, 'ocupacao_bloqueio_pct',      'capacidade', 'Ocupação dos bloqueios',             '%',  null, null, 0, 1, 'Lugares vendidos ÷ lugares contratados', '{operadora,consolidadora}'),
  (2, 'custo_lugar_nao_vendido',    'capacidade', 'Custo de lugar não vendido',         'R$', null, null, 0, 2, 'Lugares não vendidos com prazo de devolução vencido no fim do período × (multa ou custo do lugar)', '{operadora,consolidadora}'),
  (2, 'curva_reservas_vs_anterior', 'capacidade', 'Reservas contra o ano anterior',     '%',  null, null, 0, 3, 'Passageiros com serviço nos últimos 12 meses do período contra os 12 meses anteriores; o detalhe traz a curva por antecedência', '{operadora,consolidadora}');

-- Pesos de operadora e consolidadora: os três pesos atuais repetem os da distribuição; câmbio e capacidade
-- entram com peso provisório e não afetam a nota enquanto suas métricas não tiverem limiar.
insert into public.pesos_setor (versao, setor, dimensao, peso)
select 2, s.setor, p.dimensao, p.peso
  from (values ('operadora'), ('consolidadora')) s (setor),
       (values ('realizacao', 25), ('margem', 25), ('dispersao', 15), ('mix', 10), ('elasticidade', 5), ('competitividade', 10),
               ('governanca', 10), ('cambio', 10), ('capacidade', 10)) p (dimensao, peso);

-- ================================================================ validação
create or replace function motor.validar(p_diag uuid) returns void
language plpgsql set search_path = public, motor as $$
declare
  d diagnosticos;
  v_total numeric; v_validas numeric; v_n numeric; v_meses integer; v_canceladas numeric;
  v_rec numeric; v_rec_com_custo numeric; v_nota numeric;
  v_tem boolean; v_itens numeric; v_ok numeric; v_custo_na_reserva boolean;
  c record;
begin
  select * into strict d from diagnosticos where id = p_diag;
  delete from validacoes where diagnostico_id = p_diag;
  delete from qualidade_blocos where diagnostico_id = p_diag;

  -- ---- transações e reservas
  update transacoes set valida = coalesce(
      data is not null and produto is not null and conta is not null
      and quantidade > 0 and preco_lista > 0 and preco_faturado > 0
      and data between d.periodo_inicio and d.periodo_fim
      and not motor.reserva_cancelada(status_reserva)
      and (data_servico is null or data_servico >= data)
      and motor.custo_reserva_valido(custo_unitario_moeda, moeda_custo, cambio_venda, cambio_pagamento), false)
   where diagnostico_id = p_diag;

  select count(*), count(*) filter (where motor.reserva_cancelada(status_reserva)) into v_total, v_canceladas
    from transacoes where diagnostico_id = p_diag;

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

  select count(*) as n, coalesce(sum(quantidade), 0) as pax, coalesce(sum(quantidade * preco_faturado), 0) as rf into c
    from transacoes where diagnostico_id = p_diag and motor.reserva_cancelada(status_reserva);
  perform motor.registrar_validacao(p_diag, d.cliente_id, 'transacoes', 'reservas_canceladas', 'alerta', c.n, v_total,
    format('Reservas canceladas: ficam fora da margem e são contadas à parte (%s passageiros, R$ %s faturados).',
           replace(to_char(c.pax, 'FM999,999,990'), ',', '.'), replace(to_char(c.rf, 'FM999,999,999,990'), ',', '.')));

  select count(*) into v_n from transacoes where diagnostico_id = p_diag and data_servico is not null and data is not null and data_servico < data;
  perform motor.registrar_validacao(p_diag, d.cliente_id, 'transacoes', 'servico_antes_da_venda', 'alerta', v_n, v_total,
    'Reservas com data do serviço anterior à data da venda. Ficam fora do cálculo.');

  select count(*) into v_n from transacoes where diagnostico_id = p_diag
     and not motor.custo_reserva_valido(custo_unitario_moeda, moeda_custo, cambio_venda, cambio_pagamento);
  perform motor.registrar_validacao(p_diag, d.cliente_id, 'transacoes', 'moeda_ou_cambio_invalido', 'alerta', v_n, v_total,
    'Reservas com custo em moeda sem código ISO de três letras (EUR, USD...), com custo negativo, com câmbio zerado ou negativo, ou sem câmbio de venda nem de pagamento. Ficam fora do cálculo.');

  select count(*) into v_n from transacoes where diagnostico_id = p_diag and valida
     and custo_unitario_moeda is not null and upper(trim(moeda_custo)) <> 'BRL' and cambio_pagamento is null;
  perform motor.registrar_validacao(p_diag, d.cliente_id, 'transacoes', 'cambio_projetado', 'alerta', v_n, v_total,
    'Reservas com custo em moeda estrangeira ainda sem câmbio do pagamento ao fornecedor: o custo usa o câmbio da venda como projeção e a linha fica marcada como projetada.');

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

  -- reserva cancelada não é erro de dado: não entra na nota de qualidade
  v_nota := case when v_total - v_canceladas > 0
                 then greatest(0, 100 * v_validas / (v_total - v_canceladas) - case when v_meses < 12 then 10 else 0 end) end;
  insert into qualidade_blocos values (d.cliente_id, p_diag, 'transacoes', true, v_total > 0, v_total, round(v_nota, 1));

  -- ---- custos: vêm da tabela de custos ou da própria reserva
  select exists (select 1 from transacoes where diagnostico_id = p_diag and valida and custo_unitario_moeda is not null) into v_custo_na_reserva;
  select count(*), count(*) filter (where produto is null or custo_unitario is null or custo_unitario <= 0) into v_itens, v_n from custos where diagnostico_id = p_diag;
  perform motor.registrar_validacao(p_diag, d.cliente_id, 'custos', 'custo_invalido', 'alerta', v_n, v_itens,
    'Linhas de custo sem produto ou com custo zerado ou negativo. São ignoradas.');
  select coalesce(sum(t.quantidade * t.preco_faturado), 0),
         coalesce(sum(t.quantidade * t.preco_faturado) filter (where t.custo_unitario_moeda is not null or exists (
           select 1 from custos k where k.diagnostico_id = p_diag and k.produto = t.produto and k.custo_unitario > 0)), 0)
    into v_rec, v_rec_com_custo from transacoes t where t.diagnostico_id = p_diag and t.valida;
  if v_rec > 0 and v_rec_com_custo < v_rec then
    perform motor.registrar_validacao(p_diag, d.cliente_id, 'custos', 'produto_sem_custo', case when v_rec_com_custo = 0 then 'erro' else 'alerta' end,
      round(100 * (v_rec - v_rec_com_custo) / v_rec, 1), 100,
      format('%s%% da receita faturada vem de produtos sem custo cadastrado. Essas vendas ficam fora das métricas de margem e das alavancas.',
             replace(to_char(round(100 * (v_rec - v_rec_com_custo) / v_rec, 1), 'FM990.0'), '.', ',')));
  end if;
  insert into qualidade_blocos values (d.cliente_id, p_diag, 'custos', not v_custo_na_reserva, v_itens > 0, v_itens,
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
  select count(*), count(*) filter (where c2.segmento is not null) into v_itens, v_ok
    from (select distinct conta from transacoes where diagnostico_id = p_diag and valida) t
    left join contas c2 on c2.diagnostico_id = p_diag and c2.codigo = t.conta;
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

  -- ---- bloqueios (turismo)
  select count(*), count(*) filter (where motor.bloqueio_valido(b)) into v_itens, v_ok from bloqueios b where b.diagnostico_id = p_diag;
  select count(*) into v_n from bloqueios where diagnostico_id = p_diag and lugares_vendidos > lugares_contratados;
  perform motor.registrar_validacao(p_diag, d.cliente_id, 'bloqueios', 'vendidos_acima_dos_contratados', 'alerta', v_n, v_itens,
    'Bloqueios com lugares vendidos acima dos contratados. Ficam fora das métricas de capacidade; confira o arquivo.');
  perform motor.registrar_validacao(p_diag, d.cliente_id, 'bloqueios', 'bloqueio_incompleto', 'alerta', v_itens - v_ok - v_n, v_itens,
    'Bloqueios sem produto ou sem lugares contratados e vendidos, ou com moeda fora do padrão ISO. São ignorados.');
  if v_itens > 0 then
    insert into qualidade_blocos values (d.cliente_id, p_diag, 'bloqueios', false, true, v_itens, round(100 * v_ok / v_itens, 1));
  end if;
end $$;

create or replace function motor.reserva_cancelada(p_status text) returns boolean
language sql immutable set search_path = public as $$ select coalesce(lower(trim(p_status)) like 'cancel%', false) $$;

-- Custo em moeda da reserva: vale quando ausente (o custo vem da tabela de custos) ou quando tem moeda ISO,
-- valor não negativo e um câmbio positivo para converter (BRL dispensa câmbio).
create or replace function motor.custo_reserva_valido(p_custo numeric, p_moeda text, p_cambio_venda numeric, p_cambio_pagamento numeric) returns boolean
language sql immutable set search_path = public as $$
  select p_custo is null or (
    p_custo >= 0 and coalesce(upper(trim(p_moeda)) ~ '^[A-Z]{3}$', false)
    and (upper(trim(p_moeda)) = 'BRL' or (
      coalesce(p_cambio_venda > 0, true) and coalesce(p_cambio_pagamento > 0, true) and coalesce(p_cambio_pagamento, p_cambio_venda) is not null)))
$$;

create or replace function motor.bloqueio_valido(b public.bloqueios) returns boolean
language sql immutable set search_path = public as $$
  select b.produto is not null and b.lugares_contratados > 0 and b.lugares_vendidos >= 0 and b.lugares_vendidos <= b.lugares_contratados
     and (b.moeda is null or upper(trim(b.moeda)) ~ '^[A-Z]{3}$')
$$;

-- ================================================================ base de cálculo
-- Mesma base de antes, mais a reserva: quando a linha traz custo em moeda, o custo é o da própria reserva
-- (convertido pelo câmbio do pagamento, ou da venda como projeção, menos o over); sem isso, a tabela de custos.
create or replace function motor.montar_fato(p_diag uuid) returns void
language plpgsql set search_path = public, motor as $$
begin
  delete from motor.fato where diagnostico_id = p_diag;
  insert into motor.fato (diagnostico_id, transacao_id, data, produto, conta, canal, categoria, segmento, regiao, vendedor, quantidade,
                          rec_lista, d_comercial, d_volume, d_promocional, d_financeiro, d_nao_classificado, rec_faturada, d_fora_fatura,
                          cs_frete, cs_comissao, cs_prazo, cs_outros, rec_pocket, custo,
                          fornecedor, data_servico, moeda, custo_moeda, cambio_venda, cambio_custo, cambio_projetado, over_total, resultado_cambial)
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
           p.categoria, c.segmento, c.regiao, c.vendedor,
           upper(trim(t.moeda_custo)) as moeda,
           case when t.custo_unitario_moeda is null then null
                when upper(trim(t.moeda_custo)) = 'BRL' then 1
                else coalesce(t.cambio_pagamento, t.cambio_venda) end as cambio_custo
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
         case when custo_unitario_moeda is not null
              then quantidade * custo_unitario_moeda * cambio_custo - quantidade * coalesce(over_unitario, 0)
              else quantidade * custo_unitario end,
         coalesce(nullif(trim(fornecedor), ''), '(sem fornecedor)'), data_servico,
         case when custo_unitario_moeda is not null then moeda end,
         quantidade * custo_unitario_moeda,
         case when custo_unitario_moeda is not null then case when moeda = 'BRL' then 1 else cambio_venda end end,
         cambio_custo,
         custo_unitario_moeda is not null and moeda <> 'BRL' and cambio_pagamento is null,
         case when custo_unitario_moeda is not null then quantidade * coalesce(over_unitario, 0) end,
         case when custo_unitario_moeda is not null and moeda <> 'BRL' and cambio_venda is not null
              then quantidade * custo_unitario_moeda * (cambio_venda - cambio_custo) end
    from linhas;
end $$;

-- ================================================================ métricas de turismo
-- Calculadas depois das métricas gerais, só para operadoras e consolidadoras.
create or replace function motor.calcular_metricas_turismo(p_diag uuid) returns void
language plpgsql set search_path = public, motor as $$
declare
  d diagnosticos; v_seg text; v_ref date;
  t record; v_val numeric; v_det jsonb; v_rf numeric;
  v_atual numeric; v_anterior numeric;
begin
  select * into strict d from diagnosticos where id = p_diag;
  v_seg := coalesce(d.segmento, (select setor from clientes where id = d.cliente_id));
  if v_seg is null or v_seg not in ('operadora', 'consolidadora') then return; end if;
  v_ref := d.periodo_fim;
  select sum(rec_faturada) into v_rf from motor.fato where diagnostico_id = p_diag;
  if coalesce(v_rf, 0) = 0 then return; end if;

  -- ---- margem por passageiro e markup sobre o fornecedor
  select sum(quantidade) as pax, sum(rec_pocket) as pocket, sum(custo) as custo into t
    from motor.fato where diagnostico_id = p_diag and custo is not null;
  if coalesce(t.pax, 0) = 0 then
    perform motor.gravar_metrica(p_diag, d.cliente_id, 'margem_passageiro', null, jsonb_build_object('indisponivel', 'Nenhuma reserva com custo.'));
    perform motor.gravar_metrica(p_diag, d.cliente_id, 'markup_fornecedor_pct', null, jsonb_build_object('indisponivel', 'Nenhuma reserva com custo.'));
  else
    perform motor.gravar_metrica(p_diag, d.cliente_id, 'margem_passageiro', (t.pocket - t.custo) / t.pax,
      jsonb_build_object('passageiros', t.pax, 'margem', round(t.pocket - t.custo, 2),
        'por_produto', (select jsonb_agg(jsonb_build_object('produto', produto, 'passageiros', pax, 'margem_passageiro', round(margem / pax, 2), 'margem', round(margem, 2)) order by margem / pax)
                          from (select produto, sum(quantidade) as pax, sum(rec_pocket - custo) as margem from motor.fato
                                 where diagnostico_id = p_diag and custo is not null group by produto) x)));
    perform motor.gravar_metrica(p_diag, d.cliente_id, 'markup_fornecedor_pct', 100 * (t.pocket - t.custo) / nullif(t.custo, 0),
      jsonb_build_object('por_fornecedor', (select jsonb_agg(jsonb_build_object('fornecedor', fornecedor, 'passageiros', pax, 'custo', round(custo, 2),
                                                 'margem', round(pocket - custo, 2), 'markup_pct', round(100 * (pocket - custo) / nullif(custo, 0), 2)) order by (pocket - custo) / nullif(custo, 0))
                          from (select fornecedor, sum(quantidade) as pax, sum(rec_pocket) as pocket, sum(custo) as custo from motor.fato
                                 where diagnostico_id = p_diag and custo is not null group by fornecedor) x)));
  end if;

  -- ---- câmbio: resultado cambial e folga até o câmbio de equilíbrio
  select count(*) as n, sum(resultado_cambial) as resultado, count(*) filter (where cambio_projetado) as projetadas into t
    from motor.fato where diagnostico_id = p_diag and moeda is not null and moeda <> 'BRL';
  if t.n = 0 then
    perform motor.gravar_metrica(p_diag, d.cliente_id, 'resultado_cambial_pct', null, jsonb_build_object('indisponivel', 'Nenhuma reserva com custo em moeda estrangeira.'));
    perform motor.gravar_metrica(p_diag, d.cliente_id, 'cambio_equilibrio', null, jsonb_build_object('indisponivel', 'Nenhuma reserva com custo em moeda estrangeira.'));
  else
    perform motor.gravar_metrica(p_diag, d.cliente_id, 'resultado_cambial_pct', 100 * coalesce(t.resultado, 0) / v_rf,
      jsonb_build_object('resultado', round(coalesce(t.resultado, 0), 2), 'reservas_projetadas', t.projetadas,
        'por_moeda', (select jsonb_agg(jsonb_build_object('moeda', moeda, 'custo_moeda', round(cm, 2), 'resultado', round(res, 2)) order by moeda)
                        from (select moeda, sum(custo_moeda) as cm, coalesce(sum(resultado_cambial), 0) as res from motor.fato
                               where diagnostico_id = p_diag and moeda is not null and moeda <> 'BRL' group by moeda) x)));
    with p as (
      select produto, moeda, sum(rec_pocket) as pocket, coalesce(sum(over_total), 0) as over_total, sum(custo_moeda) as cm,
             sum(custo_moeda * cambio_venda) filter (where cambio_venda is not null) / nullif(sum(custo_moeda) filter (where cambio_venda is not null), 0) as cv,
             sum(custo_moeda * cambio_custo) / nullif(sum(custo_moeda), 0) as cc
        from motor.fato where diagnostico_id = p_diag and moeda is not null and moeda <> 'BRL' group by produto, moeda having sum(custo_moeda) > 0
    ), e as (
      select *, (pocket + over_total) / cm as equilibrio from p
    )
    select min(100 * (equilibrio / cv - 1)) as folga,
           jsonb_agg(jsonb_build_object('produto', produto, 'moeda', moeda, 'cambio_equilibrio', round(equilibrio, 4), 'cambio_venda_medio', round(cv, 4),
                                        'cambio_custo_medio', round(cc, 4), 'folga_pct', round(100 * (equilibrio / cv - 1), 2)) order by equilibrio / cv) as produtos
      into t from e where cv is not null;
    perform motor.gravar_metrica(p_diag, d.cliente_id, 'cambio_equilibrio', t.folga, jsonb_build_object('por_produto', t.produtos));
  end if;

  -- ---- capacidade: ocupação e custo de lugar não vendido, a partir dos bloqueios
  if not exists (select 1 from bloqueios b where b.diagnostico_id = p_diag and motor.bloqueio_valido(b)) then
    perform motor.gravar_metrica(p_diag, d.cliente_id, 'ocupacao_bloqueio_pct', null, jsonb_build_object('indisponivel', 'Envie o arquivo de bloqueios.'));
    perform motor.gravar_metrica(p_diag, d.cliente_id, 'custo_lugar_nao_vendido', null, jsonb_build_object('indisponivel', 'Envie o arquivo de bloqueios.'));
  else
    with b as (
      select x.*, upper(trim(x.moeda)) as m,
             x.lugares_contratados - x.lugares_vendidos as nao_vendidos,
             (x.data_devolucao is null or x.data_devolucao <= v_ref) as vencido
        from bloqueios x where x.diagnostico_id = p_diag and motor.bloqueio_valido(x)
    ), c as (
      select b.*,
             coalesce(b.multa_por_lugar, b.custo_unitario_moeda * case when b.m = 'BRL' then 1 else coalesce(
               (select sum(f.custo_moeda * f.cambio_custo) / nullif(sum(f.custo_moeda), 0) from motor.fato f
                 where f.diagnostico_id = p_diag and f.produto = b.produto and f.moeda = b.m),
               (select sum(f.custo_moeda * f.cambio_custo) / nullif(sum(f.custo_moeda), 0) from motor.fato f
                 where f.diagnostico_id = p_diag and f.moeda = b.m)) end) as custo_lugar
        from b
    )
    select 100 * sum(lugares_vendidos) / sum(lugares_contratados) as ocupacao,
           coalesce(sum(nao_vendidos * custo_lugar) filter (where vencido), 0) as custo,
           coalesce(sum(nao_vendidos) filter (where not vencido), 0) as em_risco,
           count(*) filter (where vencido and nao_vendidos > 0 and custo_lugar is null) as sem_custo,
           jsonb_agg(jsonb_build_object('produto', produto, 'fornecedor', fornecedor, 'data_servico', data_servico,
                     'contratados', lugares_contratados, 'vendidos', lugares_vendidos, 'ocupacao_pct', round(100 * lugares_vendidos / lugares_contratados, 1),
                     'nao_vendidos', nao_vendidos, 'prazo_vencido', vencido, 'data_devolucao', data_devolucao,
                     'custo_lugar', round(custo_lugar, 2), 'custo', case when vencido then round(nao_vendidos * custo_lugar, 2) end)
                     order by data_servico, produto) as bloqueios,
           sum(lugares_vendidos) as vendidos, sum(lugares_contratados) as contratados
      into t from c;
    perform motor.gravar_metrica(p_diag, d.cliente_id, 'ocupacao_bloqueio_pct', t.ocupacao,
      jsonb_build_object('vendidos', t.vendidos, 'contratados', t.contratados, 'bloqueios', t.bloqueios));
    perform motor.gravar_metrica(p_diag, d.cliente_id, 'custo_lugar_nao_vendido', t.custo,
      jsonb_build_object('lugares_em_risco', t.em_risco, 'bloqueios_sem_custo', t.sem_custo, 'data_referencia', v_ref));
  end if;

  -- ---- curva de reservas: serviços dos últimos 12 meses do período contra os 12 anteriores
  select coalesce(sum(quantidade) filter (where data_servico > (v_ref - interval '1 year')::date and data_servico <= v_ref), 0),
         coalesce(sum(quantidade) filter (where data_servico > (v_ref - interval '2 years')::date and data_servico <= (v_ref - interval '1 year')::date), 0)
    into v_atual, v_anterior
    from motor.fato where diagnostico_id = p_diag and data_servico is not null;
  if v_atual = 0 or v_anterior = 0 then
    perform motor.gravar_metrica(p_diag, d.cliente_id, 'curva_reservas_vs_anterior', null,
      jsonb_build_object('indisponivel', 'A comparação precisa de reservas com data de serviço nos 12 meses finais do período e nos 12 meses anteriores (24 meses de histórico).'));
  else
    -- passageiros acumulados por antecedência mínima (dias entre a venda e o serviço), nas duas janelas
    select jsonb_agg(jsonb_build_object('antecedencia_minima_dias', k, 'atual', atual, 'anterior', anterior) order by k desc)
      into v_det
      from (select k,
                   coalesce(sum(r.quantidade) filter (where r.janela = 'atual' and r.antecedencia >= k), 0) as atual,
                   coalesce(sum(r.quantidade) filter (where r.janela = 'anterior' and r.antecedencia >= k), 0) as anterior
              from unnest(array[180, 120, 90, 60, 30, 0]) as k
              cross join (select quantidade, data_servico - data as antecedencia,
                                 case when data_servico > (v_ref - interval '1 year')::date then 'atual' else 'anterior' end as janela
                            from motor.fato where diagnostico_id = p_diag and data_servico is not null
                             and data_servico > (v_ref - interval '2 years')::date and data_servico <= v_ref) r
             group by k) z;
    perform motor.gravar_metrica(p_diag, d.cliente_id, 'curva_reservas_vs_anterior', 100 * (v_atual / v_anterior - 1),
      jsonb_build_object('passageiros_atual', v_atual, 'passageiros_anterior', v_anterior, 'curva', v_det));
  end if;

  -- ---- recorte por fornecedor, como os demais recortes
  insert into metricas_resultado (cliente_id, diagnostico_id, metrica, recorte_tipo, recorte_valor, valor, detalhe)
  select d.cliente_id, p_diag, 'recorte', 'fornecedor', fornecedor, 100 * (sum(rec_lista) - sum(rec_pocket)) / sum(rec_lista),
         jsonb_build_object(
           'rec_lista', round(sum(rec_lista), 2), 'rec_faturada', round(sum(rec_faturada), 2), 'rec_pocket', round(sum(rec_pocket), 2),
           'desconto_fatura_pct', round(100 * (sum(rec_lista) - sum(rec_faturada)) / sum(rec_lista), 2),
           'transacoes', count(*),
           'margem_pocket', round(sum(rec_pocket - custo) filter (where custo is not null), 2),
           'margem_pocket_pct', round(100 * sum(rec_pocket - custo) filter (where custo is not null) / nullif(sum(rec_pocket) filter (where custo is not null), 0), 2))
    from motor.fato where diagnostico_id = p_diag group by fornecedor;
end $$;

-- ================================================================ pontuação por segmento
create or replace function motor.pontuar(p_diag uuid) returns void
language plpgsql set search_path = public, motor as $$
declare
  d diagnosticos; v_setor text; v_dims integer; v_com_nota integer; v_geral numeric;
begin
  select * into strict d from diagnosticos where id = p_diag;
  delete from pontuacoes where diagnostico_id = p_diag;

  v_setor := coalesce(d.segmento, (select c.setor from clientes c where c.id = d.cliente_id));
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
           where c.versao = d.versao_catalogo
             and (c.segmentos is null or coalesce(d.segmento, (select setor from clientes where id = d.cliente_id)) = any (c.segmentos))) x
   group by dimensao;

  select count(*) into v_dims from pesos_setor where versao = d.versao_catalogo and setor = v_setor;
  select count(*), sum(p.nota * s.peso) / nullif(sum(s.peso), 0) into v_com_nota, v_geral
    from pontuacoes p join pesos_setor s on s.versao = d.versao_catalogo and s.setor = v_setor and s.dimensao = p.dimensao
   where p.diagnostico_id = p_diag and p.nota is not null;
  insert into pontuacoes (cliente_id, diagnostico_id, dimensao, nota, parcial, detalhe)
  values (d.cliente_id, p_diag, 'geral', round(v_geral, 1), v_com_nota < v_dims,
          jsonb_build_object('dimensoes_calculadas', v_com_nota, 'dimensoes_do_catalogo', v_dims, 'setor', v_setor));
end $$;

create or replace function motor.calcular(p_diag uuid) returns void
language plpgsql set search_path = public, motor as $$
begin
  update diagnosticos set versao_catalogo = (select versao from catalogo_versoes where vigente order by versao desc limit 1) where id = p_diag;
  perform motor.validar(p_diag);
  perform motor.montar_fato(p_diag);
  perform motor.calcular_metricas(p_diag);
  perform motor.calcular_metricas_turismo(p_diag);
  perform motor.pontuar(p_diag);
  perform motor.gerar_achados(p_diag);
  perform motor.rodar_cenarios(p_diag);
end $$;

-- O painel ganha segmento e tipo; o resto é o de antes.
create or replace function motor.montar_painel(p_diag uuid) returns jsonb
language sql stable set search_path = public, motor as $$
  select jsonb_build_object(
    'diagnostico', (select jsonb_build_object('id', d.id, 'nome', d.nome, 'status', d.status, 'periodo_inicio', d.periodo_inicio, 'periodo_fim', d.periodo_fim,
                       'calculado_em', d.calculado_em, 'versao_catalogo', d.versao_catalogo, 'versao_publicada', d.versao_publicada, 'publicado_em', d.publicado_em,
                       'precos_liquidos_de_impostos', d.precos_liquidos_de_impostos, 'segmento', coalesce(d.segmento, c.setor), 'tipo', d.tipo,
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
                       order by array_position(array['transacoes', 'custos', 'produtos', 'contas', 'custos_servir', 'descontos_fora_fatura', 'bloqueios'], bloco))
                     from qualidade_blocos where diagnostico_id = p_diag), '[]'),
    'validacoes', coalesce((select jsonb_agg(jsonb_build_object('bloco', bloco, 'regra', regra, 'severidade', severidade, 'ocorrencias', ocorrencias, 'total', total, 'mensagem', mensagem)
                       order by severidade desc, bloco, regra)
                     from validacoes where diagnostico_id = p_diag), '[]'))
$$;

-- ================================================================ API
-- Custos podem vir da reserva: o cálculo só exige a tabela de custos quando as transações não trazem custo.
create or replace function motor.bloqueio(p_diag uuid) returns text
language sql stable set search_path = public as $$
  select case
    when not exists (select 1 from transacoes where diagnostico_id = p_diag) then 'Envie o arquivo de transações.'
    when not exists (select 1 from transacoes where diagnostico_id = p_diag and valida) then 'Nenhuma transação válida no período do diagnóstico.'
    when not exists (select 1 from custos where diagnostico_id = p_diag and custo_unitario > 0)
     and not exists (select 1 from transacoes where diagnostico_id = p_diag and valida and custo_unitario_moeda is not null) then 'Envie o arquivo de custos.'
  end
$$;

drop function public.criar_diagnostico(uuid, text, date, date, boolean);
create function public.criar_diagnostico(p_cliente uuid, p_nome text, p_inicio date, p_fim date, p_precos_liquidos boolean default true,
                                         p_segmento text default null, p_tipo text default 'diagnostico') returns uuid
language plpgsql security definer set search_path = public, motor as $$
declare v_id uuid; v_uid uuid; v_segmento text;
begin
  v_uid := motor.exigir_consultor();
  if p_inicio is null or p_fim is null or p_fim < p_inicio then raise exception 'Período inválido.'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome do diagnóstico.'; end if;
  v_segmento := coalesce(nullif(p_segmento, ''), (select setor from clientes where id = p_cliente));
  if v_segmento not in ('operadora', 'consolidadora', 'mga', 'distribuicao', 'industria', 'varejo_b2b') then v_segmento := null; end if;
  insert into diagnosticos (cliente_id, nome, periodo_inicio, periodo_fim, precos_liquidos_de_impostos, criado_por, segmento, tipo)
  values (p_cliente, trim(p_nome), p_inicio, p_fim, coalesce(p_precos_liquidos, true), v_uid, v_segmento, coalesce(p_tipo, 'diagnostico')) returning id into v_id;
  perform motor.auditar(v_id, 'diagnostico_criado', jsonb_build_object('segmento', v_segmento, 'tipo', coalesce(p_tipo, 'diagnostico')));
  return v_id;
end $$;

create or replace function public.iniciar_upload(p_diagnostico uuid, p_bloco text, p_nome_arquivo text, p_mapeamento jsonb default '{}') returns uuid
language plpgsql security definer set search_path = public, motor as $$
declare d diagnosticos; v_id uuid; v_uid uuid;
begin
  v_uid := motor.exigir_consultor();
  select * into d from diagnosticos where id = p_diagnostico;
  if d.id is null then raise exception 'Diagnóstico não encontrado.'; end if;
  if p_bloco not in ('transacoes', 'custos', 'custos_servir', 'descontos_fora_fatura', 'produtos', 'contas', 'bloqueios') then raise exception 'Bloco desconhecido: %', p_bloco; end if;

  delete from uploads where diagnostico_id = p_diagnostico and bloco = p_bloco;  -- leva as transações junto (on delete cascade)
  execute format('delete from public.%I where diagnostico_id = $1', p_bloco) using p_diagnostico;

  insert into uploads (cliente_id, diagnostico_id, bloco, nome_arquivo, criado_por) values (d.cliente_id, p_diagnostico, p_bloco, p_nome_arquivo, v_uid) returning id into v_id;
  insert into mapeamentos_coluna (upload_id, cliente_id, diagnostico_id, campo, coluna_origem)
  select v_id, d.cliente_id, p_diagnostico, key, value from jsonb_each_text(coalesce(p_mapeamento, '{}')) where value <> '';
  return v_id;
end $$;

create or replace function public.enviar_linhas(p_upload uuid, p_linhas jsonb) returns integer
language plpgsql security definer set search_path = public, motor as $$
declare u uploads; v_n integer;
begin
  perform motor.exigir_consultor();
  select * into u from uploads where id = p_upload;
  if u.id is null or u.status <> 'recebendo' then raise exception 'Carga não encontrada ou já concluída.'; end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) > 5000 then raise exception 'Envie de 1 a 5000 linhas por chamada.'; end if;

  if u.bloco = 'transacoes' then
    insert into transacoes (cliente_id, diagnostico_id, upload_id, data, nota_fiscal, produto, conta, canal, quantidade, preco_lista, preco_faturado,
                            desc_comercial, desc_volume, desc_promocional, desc_financeiro,
                            data_servico, fornecedor, custo_unitario_moeda, moeda_custo, cambio_venda, cambio_pagamento, data_pagamento_fornecedor, over_unitario, status_reserva)
    select u.cliente_id, u.diagnostico_id, u.id, x.data, nullif(trim(x.nota_fiscal), ''), nullif(trim(x.produto), ''), nullif(trim(x.conta), ''), nullif(trim(x.canal), ''),
           x.quantidade, x.preco_lista, x.preco_faturado, x.desc_comercial, x.desc_volume, x.desc_promocional, x.desc_financeiro,
           x.data_servico, nullif(trim(x.fornecedor), ''), x.custo_unitario_moeda, nullif(upper(trim(x.moeda_custo)), ''), x.cambio_venda, x.cambio_pagamento,
           x.data_pagamento_fornecedor, x.over_unitario, nullif(lower(trim(x.status_reserva)), '')
      from jsonb_to_recordset(p_linhas) as x (data date, nota_fiscal text, produto text, conta text, canal text, quantidade numeric, preco_lista numeric, preco_faturado numeric,
                                              desc_comercial numeric, desc_volume numeric, desc_promocional numeric, desc_financeiro numeric,
                                              data_servico date, fornecedor text, custo_unitario_moeda numeric, moeda_custo text, cambio_venda numeric, cambio_pagamento numeric,
                                              data_pagamento_fornecedor date, over_unitario numeric, status_reserva text);
  elsif u.bloco = 'custos' then
    insert into custos (cliente_id, diagnostico_id, produto, custo_unitario, vigencia_inicio)
    select u.cliente_id, u.diagnostico_id, nullif(trim(x.produto), ''), x.custo_unitario, x.vigencia_inicio
      from jsonb_to_recordset(p_linhas) as x (produto text, custo_unitario numeric, vigencia_inicio date);
  elsif u.bloco = 'custos_servir' then
    insert into custos_servir (cliente_id, diagnostico_id, tipo, canal, conta, percentual)
    select u.cliente_id, u.diagnostico_id, nullif(trim(x.tipo), ''), nullif(trim(x.canal), ''), nullif(trim(x.conta), ''), x.percentual
      from jsonb_to_recordset(p_linhas) as x (tipo text, canal text, conta text, percentual numeric);
  elsif u.bloco = 'descontos_fora_fatura' then
    insert into descontos_fora_fatura (cliente_id, diagnostico_id, conta, mes, tipo, valor)
    select u.cliente_id, u.diagnostico_id, nullif(trim(x.conta), ''), x.mes, nullif(trim(x.tipo), ''), x.valor
      from jsonb_to_recordset(p_linhas) as x (conta text, mes date, tipo text, valor numeric);
  elsif u.bloco = 'produtos' then
    insert into produtos (cliente_id, diagnostico_id, codigo, descricao, categoria, linha)
    select distinct on (trim(x.codigo)) u.cliente_id, u.diagnostico_id, trim(x.codigo), nullif(trim(x.descricao), ''), nullif(trim(x.categoria), ''), nullif(trim(x.linha), '')
      from jsonb_to_recordset(p_linhas) as x (codigo text, descricao text, categoria text, linha text) where nullif(trim(x.codigo), '') is not null
    on conflict (diagnostico_id, codigo) do update set descricao = excluded.descricao, categoria = excluded.categoria, linha = excluded.linha;
  elsif u.bloco = 'contas' then
    insert into contas (cliente_id, diagnostico_id, codigo, nome, segmento, porte, regiao, vendedor)
    select distinct on (trim(x.codigo)) u.cliente_id, u.diagnostico_id, trim(x.codigo), nullif(trim(x.nome), ''), nullif(trim(x.segmento), ''), nullif(trim(x.porte), ''), nullif(trim(x.regiao), ''), nullif(trim(x.vendedor), '')
      from jsonb_to_recordset(p_linhas) as x (codigo text, nome text, segmento text, porte text, regiao text, vendedor text) where nullif(trim(x.codigo), '') is not null
    on conflict (diagnostico_id, codigo) do update set nome = excluded.nome, segmento = excluded.segmento, porte = excluded.porte, regiao = excluded.regiao, vendedor = excluded.vendedor;
  elsif u.bloco = 'bloqueios' then
    insert into bloqueios (cliente_id, diagnostico_id, produto, fornecedor, data_servico, lugares_contratados, lugares_vendidos, data_devolucao, multa_por_lugar, custo_unitario_moeda, moeda)
    select u.cliente_id, u.diagnostico_id, nullif(trim(x.produto), ''), nullif(trim(x.fornecedor), ''), x.data_servico, x.lugares_contratados, x.lugares_vendidos,
           x.data_devolucao, x.multa_por_lugar, x.custo_unitario_moeda, nullif(upper(trim(x.moeda)), '')
      from jsonb_to_recordset(p_linhas) as x (produto text, fornecedor text, data_servico date, lugares_contratados numeric, lugares_vendidos numeric,
                                              data_devolucao date, multa_por_lugar numeric, custo_unitario_moeda numeric, moeda text);
  end if;
  get diagnostics v_n = row_count;
  update uploads set linhas = linhas + jsonb_array_length(p_linhas) where id = p_upload;
  return v_n;
end $$;

create or replace function public.dados_do_diagnostico(p_diagnostico uuid) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'diagnostico', (select jsonb_build_object('id', d.id, 'nome', d.nome, 'status', d.status, 'periodo_inicio', d.periodo_inicio, 'periodo_fim', d.periodo_fim,
                       'precos_liquidos_de_impostos', d.precos_liquidos_de_impostos, 'calculado_em', d.calculado_em, 'versao_publicada', d.versao_publicada,
                       'cliente', c.nome, 'segmento', coalesce(d.segmento, c.setor), 'tipo', d.tipo)
                      from diagnosticos d join clientes c on c.id = d.cliente_id where d.id = p_diagnostico),
    'uploads', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'bloco', u.bloco, 'arquivo', u.nome_arquivo, 'linhas', u.linhas, 'status', u.status, 'criado_em', u.criado_em,
                 'mapeamento', (select coalesce(jsonb_object_agg(m.campo, m.coluna_origem), '{}') from mapeamentos_coluna m where m.upload_id = u.id)) order by u.criado_em)
                 from uploads u where u.diagnostico_id = p_diagnostico), '[]'),
    'qualidade', coalesce((select jsonb_agg(jsonb_build_object('bloco', bloco, 'obrigatorio', obrigatorio, 'presente', presente, 'linhas', linhas, 'nota', nota)) from qualidade_blocos where diagnostico_id = p_diagnostico), '[]'),
    'validacoes', coalesce((select jsonb_agg(jsonb_build_object('bloco', bloco, 'regra', regra, 'severidade', severidade, 'ocorrencias', ocorrencias, 'total', total, 'mensagem', mensagem) order by severidade desc, bloco, regra)
                 from validacoes where diagnostico_id = p_diagnostico), '[]'))
$$;

create or replace function public.listar_diagnosticos() returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'nome', d.nome, 'status', d.status, 'cliente', c.nome, 'setor', c.setor,
           'segmento', coalesce(d.segmento, c.setor), 'tipo', d.tipo,
           'periodo_inicio', d.periodo_inicio, 'periodo_fim', d.periodo_fim, 'calculado_em', d.calculado_em,
           'publicado_em', d.publicado_em, 'versao_publicada', d.versao_publicada) order by d.criado_em desc), '[]')
    from diagnosticos d join clientes c on c.id = d.cliente_id
$$;

-- ================================================================ acesso
alter table public.bloqueios enable row level security;
revoke all on public.bloqueios from anon, authenticated;
grant select on public.bloqueios to authenticated;
create policy consultor on public.bloqueios for select to authenticated using (public.perfil_atual() = 'consultor');

-- funções novas ou recriadas: nada para anon; as de public para quem tem sessão; as do motor só para o serviço
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema motor from public, anon, authenticated;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function motor.montar_painel(uuid) to authenticated;
grant execute on all functions in schema motor to service_role;
