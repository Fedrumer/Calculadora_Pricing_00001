-- P2 Simulação (plano v3, seções 4, 13.1 a 13.4 e 13.10).
-- SQL prepara, TypeScript sorteia: o banco entrega a base agregada uma vez (motor.base_simulacao), o serviço
-- servicos/simulacao faz os sorteios e grava o resultado por public.gravar_simulacao. motor.simular continua
-- como implementação de referência e teste de paridade; os três cenários seguem calculados por motor.rodar_cenarios.

-- ================================================================ blocos de carga
-- Registro dos blocos aceitos pela carga, para os pacotes seguintes acrescentarem blocos sem trocar a restrição.
create table public.blocos_carga (
  codigo text primary key,
  ordem integer not null,
  pacote text not null
);
insert into public.blocos_carga (codigo, ordem, pacote) values
  ('transacoes', 1, 'fase1'), ('custos', 2, 'fase1'), ('produtos', 3, 'fase1'), ('contas', 4, 'fase1'),
  ('custos_servir', 5, 'fase1'), ('descontos_fora_fatura', 6, 'fase1'), ('bloqueios', 7, 'P1'), ('capacidade', 8, 'P2');

alter table public.uploads drop constraint uploads_bloco_check;
alter table public.uploads add constraint uploads_bloco_fk foreign key (bloco) references public.blocos_carga (codigo);

-- Bloco capacidade (13.4): recurso, unidade, capacidade por mês, uso por venda e custo da unidade extra.
create table public.capacidade (
  id bigint generated always as identity primary key,
  cliente_id uuid not null,
  diagnostico_id uuid not null references public.diagnosticos (id) on delete cascade,
  recurso text not null,
  unidade text,
  capacidade_mes numeric not null check (capacidade_mes > 0),
  uso_por_venda numeric not null default 1 check (uso_por_venda > 0),
  custo_unidade_extra numeric check (custo_unidade_extra >= 0)
);
create index on public.capacidade (diagnostico_id);

-- ================================================================ premissas com distribuição
create table public.premissas_distribuicao (
  versao integer not null references public.catalogo_versoes (versao),
  alavanca text not null,
  chave text not null,
  tipo text not null check (tipo in ('quantis', 'discreta')),
  p10 numeric,
  p50 numeric,
  p90 numeric,
  minimo numeric,
  maximo numeric,
  opcoes jsonb,
  primary key (versao, alavanca, chave),
  check (tipo = 'discreta' or (p10 <= p50 and p50 <= p90))
);

-- P10 = conservador, P50 = base, P90 = agressivo, para as oito chaves atuais e em cada versão do catálogo.
-- Mínimo e máximo ficam nulos: fora de P10 e P90 a reta continua com a mesma inclinação. Os limites de domínio
-- (elasticidade até 0; captura e fechamento entre 0 e 1) são aplicados pelo serviço a cada sorteio.
insert into public.premissas_distribuicao (versao, alavanca, chave, tipo, p10, p50, p90)
select c.versao, c.alavanca, c.chave, 'quantis', c.valor, b.valor, a.valor
  from public.premissas_padrao c
  join public.premissas_padrao b on b.versao = c.versao and b.alavanca = c.alavanca and b.chave = c.chave and b.cenario = 'base'
  join public.premissas_padrao a on a.versao = c.versao and a.alavanca = c.alavanca and a.chave = c.chave and a.cenario = 'agressivo'
 where c.cenario = 'conservador';

-- Correlação de postos entre premissas (13.1), por tipo de decisão ou por Nota.
create table public.premissas_correlacao (
  id bigint generated always as identity primary key,
  cliente_id uuid,
  tipo_decisao text,
  nota_id uuid,
  premissa_a text not null,
  premissa_b text not null,
  rho numeric not null check (rho between -0.95 and 0.95),
  origem text not null default 'informada',
  fonte text,
  check (premissa_a <> premissa_b),
  check (tipo_decisao is not null or nota_id is not null)
);

-- ================================================================ simulações
create table public.simulacoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  diagnostico_id uuid references public.diagnosticos (id) on delete cascade,
  nota_id uuid,
  origem text not null default 'consultor' check (origem in ('consultor', 'cliente')),
  modelo text not null,
  semente bigint not null,
  sorteios integer not null check (sorteios between 100 and 100000),
  versao_catalogo integer,
  versao_servico text not null,
  premissas jsonb not null,
  correlacoes jsonb not null default '[]',
  opcoes jsonb not null,
  criterio jsonb,
  escolha jsonb,
  duracao_ms integer,
  criado_por uuid,
  criado_em timestamptz not null default now()
);
create index on public.simulacoes (diagnostico_id, criado_em desc);
create index on public.simulacoes (nota_id);

-- Uma linha por opção, medida e alavanca (alavanca nula = total).
create table public.simulacao_resultado (
  simulacao_id uuid not null references public.simulacoes (id) on delete cascade,
  cliente_id uuid not null,
  opcao text not null,
  alavanca text,
  medida text not null default 'margem' check (medida in ('margem', 'faturamento', 'volume')),
  media numeric,
  p10 numeric,
  p50 numeric,
  p90 numeric,
  prob_positivo numeric,
  prob_prejuizo numeric,
  prob_meta numeric,
  contribuicao_media numeric,
  prob_falta_capacidade numeric,
  volume_perdido_medio numeric,
  frase text,
  histograma jsonb
);
create unique index on public.simulacao_resultado (simulacao_id, opcao, medida, coalesce(alavanca, ''));

create table public.simulacao_sensibilidade (
  simulacao_id uuid not null references public.simulacoes (id) on delete cascade,
  cliente_id uuid not null,
  opcao text not null,
  premissa text not null,
  resultado_no_p10 numeric not null,
  resultado_no_p90 numeric not null,
  amplitude numeric not null,
  ordem integer not null,
  primary key (simulacao_id, opcao, premissa)
);

create table public.simulacao_varreduras (
  simulacao_id uuid not null references public.simulacoes (id) on delete cascade,
  cliente_id uuid not null,
  premissa text not null,
  valor numeric not null,
  opcao text not null,
  media numeric,
  p50 numeric,
  prob_positivo numeric,
  prob_prejuizo numeric,
  opcao_escolhida text,
  primary key (simulacao_id, premissa, valor, opcao)
);

-- ================================================================ base da simulação
-- As CTEs base e piso de motor.simular, sem as premissas: pares conta e produto com quantidade, preço faturado
-- médio, custo (com custo de servir e descontos fora da fatura) e quartil da conta; preços por conta de cada
-- produto vendido a 5 contas ou mais, para o serviço calcular o piso em qualquer percentil; fator anual.
create or replace function motor.base_simulacao(p_diag uuid) returns jsonb
language sql stable set search_path = public, motor as $$
  with periodo as (
    select 365.0 / (max(data) - min(data) + 1) as fator from motor.fato where diagnostico_id = p_diag
  ), base as (
    select produto, conta, sum(quantidade) as q, sum(rec_faturada) / sum(quantidade) as p,
           sum(custo + rec_faturada - rec_pocket) / sum(quantidade) as c
      from motor.fato where diagnostico_id = p_diag and custo is not null group by produto, conta
  ), precos as (
    select produto, sum(rec_faturada) / sum(quantidade) as preco from motor.fato where diagnostico_id = p_diag group by produto, conta
  ), bandas as (
    select produto, jsonb_agg(preco order by preco) as lista from precos group by produto having count(*) >= 5
  )
  select jsonb_build_object(
    'versao_catalogo', (select versao_catalogo from diagnosticos where id = p_diag),
    'fator_anual', (select fator from periodo),
    'margem_base_anual', round((select sum((p - c) * q) from base) * (select fator from periodo), 2),
    'receita_base_anual', round((select sum(p * q) from base) * (select fator from periodo), 2),
    'pares', coalesce((select jsonb_agg(jsonb_build_array(b.produto, b.conta, b.q, b.p, b.c, cr.quartil) order by b.produto, b.conta)
                         from base b join motor.contas_resumo(p_diag) cr on cr.conta = b.conta), '[]'),
    'precos', coalesce((select jsonb_object_agg(produto, lista) from bandas), '{}'),
    'alavancas', coalesce((select jsonb_agg(jsonb_build_object('codigo', a.codigo, 'ordem', a.ordem) order by a.ordem)
                             from alavancas_catalogo a join diagnosticos d on d.id = p_diag and a.versao = d.versao_catalogo), '[]'))
$$;

-- O que o serviço precisa para simular um diagnóstico: a base, as premissas com distribuição e a capacidade.
create or replace function public.base_simulacao(p_diagnostico uuid) returns jsonb
language plpgsql stable security definer set search_path = public, motor as $$
declare d diagnosticos;
begin
  perform motor.exigir_consultor();
  select * into d from diagnosticos where id = p_diagnostico;
  if d.id is null then raise exception 'Diagnóstico não encontrado.'; end if;
  if d.versao_catalogo is null then raise exception 'Calcule o diagnóstico antes de simular.'; end if;
  return motor.base_simulacao(p_diagnostico) || jsonb_build_object(
    'diagnostico_id', d.id, 'cliente_id', d.cliente_id,
    'premissas', coalesce((select jsonb_agg(jsonb_build_object('alavanca', alavanca, 'chave', chave, 'tipo', tipo, 'p10', p10, 'p50', p50, 'p90', p90,
                                  'minimo', minimo, 'maximo', maximo, 'opcoes', opcoes) order by alavanca, chave)
                             from premissas_distribuicao where versao = d.versao_catalogo), '[]'),
    'capacidade', coalesce((select jsonb_agg(jsonb_build_object('recurso', recurso, 'unidade', unidade, 'capacidade_mes', capacidade_mes,
                                  'uso_por_venda', uso_por_venda, 'custo_unidade_extra', custo_unidade_extra) order by recurso)
                              from capacidade where diagnostico_id = p_diagnostico), '[]'));
end $$;

-- Grava uma simulação feita pelo serviço: entrada, resultado por opção e medida, contribuição por alavanca,
-- tornado e varreduras. Só o consultor grava; o resultado é imutável (não há função que altere).
create or replace function public.gravar_simulacao(p_diagnostico uuid, p_dados jsonb) returns uuid
language plpgsql security definer set search_path = public, motor as $$
declare d diagnosticos; v_id uuid; v_uid uuid; e jsonb := p_dados -> 'entrada'; r jsonb := p_dados -> 'resultado';
begin
  v_uid := motor.exigir_consultor();
  select * into d from diagnosticos where id = p_diagnostico;
  if d.id is null then raise exception 'Diagnóstico não encontrado.'; end if;
  if e is null or r is null or jsonb_typeof(r -> 'opcoes') <> 'array' then raise exception 'Envie a entrada e o resultado da simulação.'; end if;

  insert into simulacoes (cliente_id, diagnostico_id, origem, modelo, semente, sorteios, versao_catalogo, versao_servico, premissas, correlacoes, opcoes,
                          criterio, escolha, duracao_ms, criado_por)
  values (d.cliente_id, d.id, 'consultor', e ->> 'modelo', (r ->> 'semente')::bigint, (r ->> 'sorteios')::int, d.versao_catalogo, r ->> 'versao_servico',
          coalesce(e -> 'premissas', '[]'), coalesce(e -> 'correlacoes', '[]'), coalesce(e -> 'opcoes', '[]'), e -> 'criterio', r -> 'escolha',
          (p_dados ->> 'duracao_ms')::int, v_uid)
  returning id into v_id;

  insert into simulacao_resultado (simulacao_id, cliente_id, opcao, alavanca, medida, media, p10, p50, p90, prob_positivo, prob_prejuizo, prob_meta,
                                   prob_falta_capacidade, volume_perdido_medio, frase, histograma)
  select v_id, d.cliente_id, o ->> 'codigo', null, m.key, (m.value ->> 'media')::numeric, (m.value ->> 'p10')::numeric, (m.value ->> 'p50')::numeric,
         (m.value ->> 'p90')::numeric, (m.value ->> 'prob_positivo')::numeric, (m.value ->> 'prob_prejuizo')::numeric, (m.value ->> 'prob_meta')::numeric,
         (o ->> 'prob_falta_capacidade')::numeric, (o ->> 'volume_perdido_medio')::numeric, m.value ->> 'frase', m.value -> 'histograma'
    from jsonb_array_elements(r -> 'opcoes') o, jsonb_each(o -> 'medidas') m;

  insert into simulacao_resultado (simulacao_id, cliente_id, opcao, alavanca, medida, contribuicao_media)
  select v_id, d.cliente_id, o ->> 'codigo', c ->> 'alavanca', 'margem', (c ->> 'media')::numeric
    from jsonb_array_elements(r -> 'opcoes') o, jsonb_array_elements(coalesce(o -> 'contribuicoes', '[]')) c;

  insert into simulacao_sensibilidade (simulacao_id, cliente_id, opcao, premissa, resultado_no_p10, resultado_no_p90, amplitude, ordem)
  select v_id, d.cliente_id, s ->> 'opcao', s ->> 'premissa', (s ->> 'resultado_no_p10')::numeric, (s ->> 'resultado_no_p90')::numeric,
         (s ->> 'amplitude')::numeric, (s ->> 'ordem')::int
    from jsonb_array_elements(coalesce(r -> 'sensibilidade', '[]')) s;

  insert into simulacao_varreduras (simulacao_id, cliente_id, premissa, valor, opcao, media, p50, prob_positivo, prob_prejuizo, opcao_escolhida)
  select v_id, d.cliente_id, v ->> 'premissa', (pt ->> 'valor')::numeric, pt ->> 'opcao', (pt ->> 'media')::numeric, (pt ->> 'p50')::numeric,
         (pt ->> 'prob_positivo')::numeric, (pt ->> 'prob_prejuizo')::numeric, pt ->> 'opcao_escolhida'
    from jsonb_array_elements(coalesce(p_dados -> 'varreduras', '[]')) v, jsonb_array_elements(v -> 'pontos') pt;

  perform motor.auditar(p_diagnostico, 'simulacao_gravada', jsonb_build_object('simulacao', v_id, 'sorteios', r -> 'sorteios', 'semente', r -> 'semente'));
  return v_id;
end $$;

-- Última simulação do diagnóstico, para a tela do consultor (o cliente não vê simulação nesta fase).
create or replace function public.simulacao_do_diagnostico(p_diagnostico uuid) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('id', s.id, 'criado_em', s.criado_em, 'sorteios', s.sorteios, 'semente', s.semente, 'versao_servico', s.versao_servico,
           'duracao_ms', s.duracao_ms, 'escolha', s.escolha,
           'resultado', coalesce((select jsonb_agg(jsonb_build_object('opcao', r.opcao, 'alavanca', r.alavanca, 'medida', r.medida, 'media', r.media,
                                   'p10', r.p10, 'p50', r.p50, 'p90', r.p90, 'prob_positivo', r.prob_positivo, 'prob_prejuizo', r.prob_prejuizo,
                                   'contribuicao_media', r.contribuicao_media, 'frase', r.frase, 'histograma', r.histograma) order by r.opcao, r.medida, r.alavanca nulls first)
                                  from simulacao_resultado r where r.simulacao_id = s.id), '[]'),
           'sensibilidade', coalesce((select jsonb_agg(jsonb_build_object('opcao', x.opcao, 'premissa', x.premissa, 'resultado_no_p10', x.resultado_no_p10,
                                   'resultado_no_p90', x.resultado_no_p90, 'amplitude', x.amplitude, 'ordem', x.ordem) order by x.opcao, x.ordem)
                                  from simulacao_sensibilidade x where x.simulacao_id = s.id), '[]'))
    from simulacoes s where s.diagnostico_id = p_diagnostico and s.origem = 'consultor'
   order by s.criado_em desc limit 1
$$;

-- ================================================================ carga: bloco capacidade
create or replace function public.iniciar_upload(p_diagnostico uuid, p_bloco text, p_nome_arquivo text, p_mapeamento jsonb default '{}') returns uuid
language plpgsql security definer set search_path = public, motor as $$
declare d diagnosticos; v_id uuid; v_uid uuid;
begin
  v_uid := motor.exigir_consultor();
  select * into d from diagnosticos where id = p_diagnostico;
  if d.id is null then raise exception 'Diagnóstico não encontrado.'; end if;
  if not exists (select 1 from blocos_carga where codigo = p_bloco) then raise exception 'Bloco desconhecido: %', p_bloco; end if;

  delete from uploads where diagnostico_id = p_diagnostico and bloco = p_bloco;  -- leva as transações junto (on delete cascade)
  execute format('delete from public.%I where diagnostico_id = $1', p_bloco) using p_diagnostico;

  insert into uploads (cliente_id, diagnostico_id, bloco, nome_arquivo, criado_por) values (d.cliente_id, p_diagnostico, p_bloco, p_nome_arquivo, v_uid) returning id into v_id;
  insert into mapeamentos_coluna (upload_id, cliente_id, diagnostico_id, campo, coluna_origem)
  select v_id, d.cliente_id, p_diagnostico, key, value from jsonb_each_text(coalesce(p_mapeamento, '{}')) where value <> '';
  return v_id;
end $$;

-- Blocos acrescentados a partir do P2. Cada pacote que cria bloco substitui esta função e mantém os anteriores.
create or replace function motor.inserir_bloco(u public.uploads, p_linhas jsonb) returns integer
language plpgsql set search_path = public, motor as $$
declare v_n integer;
begin
  if u.bloco = 'capacidade' then
    insert into capacidade (cliente_id, diagnostico_id, recurso, unidade, capacidade_mes, uso_por_venda, custo_unidade_extra)
    select u.cliente_id, u.diagnostico_id, trim(x.recurso), nullif(trim(x.unidade), ''), x.capacidade_mes, coalesce(x.uso_por_venda, 1), x.custo_unidade_extra
      from jsonb_to_recordset(p_linhas) as x (recurso text, unidade text, capacidade_mes numeric, uso_por_venda numeric, custo_unidade_extra numeric)
     where nullif(trim(x.recurso), '') is not null and x.capacidade_mes > 0;
  else
    raise exception 'Bloco sem rotina de carga: %', u.bloco;
  end if;
  get diagnostics v_n = row_count;
  return v_n;
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
  else
    v_n := motor.inserir_bloco(u, p_linhas);
  end if;
  if v_n is null then get diagnostics v_n = row_count; end if;
  update uploads set linhas = linhas + jsonb_array_length(p_linhas) where id = p_upload;
  return v_n;
end $$;

-- ================================================================ acesso
do $$
declare t text;
begin
  foreach t in array array['blocos_carga', 'capacidade', 'premissas_distribuicao', 'premissas_correlacao', 'simulacoes', 'simulacao_resultado',
                           'simulacao_sensibilidade', 'simulacao_varreduras'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
  -- só o consultor lê: base, catálogo e simulações (o cliente recebe a simulação pela Nota entregue, no P3)
  foreach t in array array['capacidade', 'premissas_distribuicao', 'premissas_correlacao', 'simulacoes', 'simulacao_resultado',
                           'simulacao_sensibilidade', 'simulacao_varreduras'] loop
    execute format($p$create policy consultor on public.%I for select to authenticated using (public.perfil_atual() = 'consultor')$p$, t);
  end loop;
end $$;
-- a lista de blocos não tem dado de cliente: quem carrega (consultor) e quem acompanha a carga (cliente editor) leem
create policy leitura on public.blocos_carga for select to authenticated using (public.perfil_atual() in ('consultor', 'cliente_editor'));

revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema motor from public, anon, authenticated;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function motor.montar_painel(uuid) to authenticated;
grant execute on all functions in schema motor to service_role;
