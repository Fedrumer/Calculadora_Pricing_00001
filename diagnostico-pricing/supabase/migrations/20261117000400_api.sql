-- Funções que a aplicação chama. As de escrita conferem o perfil e rodam como dono;
-- as de leitura rodam como quem chama, então o RLS decide o que cada perfil enxerga.

create or replace function public.perfil_atual() returns text
language sql stable security definer set search_path = public as $$
  select perfil from usuarios where id = auth.uid() and ativo
$$;

create or replace function public.cliente_atual() returns uuid
language sql stable security definer set search_path = public as $$
  select cliente_id from usuarios where id = auth.uid() and ativo
$$;

create or replace function motor.exigir_consultor() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if public.perfil_atual() is distinct from 'consultor' then
    raise exception 'Apenas o consultor pode executar esta ação.' using errcode = '42501';
  end if;
  return auth.uid();
end $$;

create or replace function motor.auditar(p_diag uuid, p_acao text, p_detalhe jsonb default null) returns void
language sql security definer set search_path = public as $$
  insert into auditoria (cliente_id, diagnostico_id, usuario_id, acao, detalhe)
  values ((select cliente_id from diagnosticos where id = p_diag), p_diag, auth.uid(), p_acao, p_detalhe)
$$;

-- ---------------------------------------------------------------- sessão e listas
create or replace function public.meu_acesso() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', u.id, 'nome', u.nome, 'email', u.email, 'perfil', u.perfil,
                            'cliente', case when c.id is not null then jsonb_build_object('id', c.id, 'nome', c.nome) end)
    from usuarios u left join clientes c on c.id = u.cliente_id
   where u.id = auth.uid() and u.ativo
$$;

create or replace function public.listar_clientes() returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'setor', setor) order by nome), '[]') from clientes
$$;

create or replace function public.listar_diagnosticos() returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'nome', d.nome, 'status', d.status, 'cliente', c.nome, 'setor', c.setor,
           'periodo_inicio', d.periodo_inicio, 'periodo_fim', d.periodo_fim, 'calculado_em', d.calculado_em,
           'publicado_em', d.publicado_em, 'versao_publicada', d.versao_publicada) order by d.criado_em desc), '[]')
    from diagnosticos d join clientes c on c.id = d.cliente_id
$$;

-- ---------------------------------------------------------------- abertura
create or replace function public.criar_cliente(p_nome text, p_setor text default 'distribuicao') returns uuid
language plpgsql security definer set search_path = public, motor as $$
declare v_id uuid;
begin
  perform motor.exigir_consultor();
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome do cliente.'; end if;
  insert into clientes (nome, setor) values (trim(p_nome), coalesce(p_setor, 'distribuicao')) returning id into v_id;
  insert into auditoria (cliente_id, usuario_id, acao, detalhe) values (v_id, auth.uid(), 'cliente_criado', jsonb_build_object('nome', trim(p_nome)));
  return v_id;
end $$;

create or replace function public.criar_diagnostico(p_cliente uuid, p_nome text, p_inicio date, p_fim date, p_precos_liquidos boolean default true) returns uuid
language plpgsql security definer set search_path = public, motor as $$
declare v_id uuid; v_uid uuid;
begin
  v_uid := motor.exigir_consultor();
  if p_inicio is null or p_fim is null or p_fim < p_inicio then raise exception 'Período inválido.'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome do diagnóstico.'; end if;
  insert into diagnosticos (cliente_id, nome, periodo_inicio, periodo_fim, precos_liquidos_de_impostos, criado_por)
  values (p_cliente, trim(p_nome), p_inicio, p_fim, coalesce(p_precos_liquidos, true), v_uid) returning id into v_id;
  perform motor.auditar(v_id, 'diagnostico_criado');
  return v_id;
end $$;

-- Liga um usuário já criado no Supabase Auth a um perfil do sistema.
create or replace function public.definir_usuario(p_email text, p_nome text, p_perfil text, p_cliente uuid default null) returns uuid
language plpgsql security definer set search_path = public, motor as $$
declare v_id uuid;
begin
  perform motor.exigir_consultor();
  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then raise exception 'Não há usuário com este e-mail no Supabase Auth. Crie o usuário lá antes.'; end if;
  insert into usuarios (id, nome, email, perfil, cliente_id) values (v_id, p_nome, lower(trim(p_email)), p_perfil, p_cliente)
  on conflict (id) do update set nome = excluded.nome, perfil = excluded.perfil, cliente_id = excluded.cliente_id, ativo = true;
  insert into auditoria (cliente_id, usuario_id, acao, detalhe) values (p_cliente, auth.uid(), 'usuario_definido', jsonb_build_object('email', lower(trim(p_email)), 'perfil', p_perfil));
  return v_id;
end $$;

-- ---------------------------------------------------------------- entrada de variáveis
-- Uma carga substitui a anterior do mesmo bloco: o diagnóstico nunca mistura dois arquivos do mesmo tipo.
create or replace function public.iniciar_upload(p_diagnostico uuid, p_bloco text, p_nome_arquivo text, p_mapeamento jsonb default '{}') returns uuid
language plpgsql security definer set search_path = public, motor as $$
declare d diagnosticos; v_id uuid; v_uid uuid;
begin
  v_uid := motor.exigir_consultor();
  select * into d from diagnosticos where id = p_diagnostico;
  if d.id is null then raise exception 'Diagnóstico não encontrado.'; end if;
  if p_bloco not in ('transacoes', 'custos', 'custos_servir', 'descontos_fora_fatura', 'produtos', 'contas') then raise exception 'Bloco desconhecido: %', p_bloco; end if;

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
    insert into transacoes (cliente_id, diagnostico_id, upload_id, data, nota_fiscal, produto, conta, canal, quantidade, preco_lista, preco_faturado, desc_comercial, desc_volume, desc_promocional, desc_financeiro)
    select u.cliente_id, u.diagnostico_id, u.id, x.data, nullif(trim(x.nota_fiscal), ''), nullif(trim(x.produto), ''), nullif(trim(x.conta), ''), nullif(trim(x.canal), ''),
           x.quantidade, x.preco_lista, x.preco_faturado, x.desc_comercial, x.desc_volume, x.desc_promocional, x.desc_financeiro
      from jsonb_to_recordset(p_linhas) as x (data date, nota_fiscal text, produto text, conta text, canal text, quantidade numeric, preco_lista numeric, preco_faturado numeric,
                                              desc_comercial numeric, desc_volume numeric, desc_promocional numeric, desc_financeiro numeric);
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
  end if;
  get diagnostics v_n = row_count;
  update uploads set linhas = linhas + jsonb_array_length(p_linhas) where id = p_upload;
  return v_n;
end $$;

create or replace function public.concluir_upload(p_upload uuid) returns void
language plpgsql security definer set search_path = public, motor as $$
declare u uploads;
begin
  perform motor.exigir_consultor();
  update uploads set status = 'concluido' where id = p_upload and status = 'recebendo' returning * into u;
  if u.id is null then raise exception 'Carga não encontrada ou já concluída.'; end if;
  -- dado novo: o que estava validado ou calculado deixa de valer até recalcular
  update diagnosticos set status = 'rascunho' where id = u.diagnostico_id and status in ('validado', 'calculado');
  perform motor.auditar(u.diagnostico_id, 'carga_concluida', jsonb_build_object('bloco', u.bloco, 'arquivo', u.nome_arquivo, 'linhas', u.linhas));
end $$;

create or replace function public.dados_do_diagnostico(p_diagnostico uuid) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'diagnostico', (select jsonb_build_object('id', d.id, 'nome', d.nome, 'status', d.status, 'periodo_inicio', d.periodo_inicio, 'periodo_fim', d.periodo_fim,
                       'precos_liquidos_de_impostos', d.precos_liquidos_de_impostos, 'calculado_em', d.calculado_em, 'versao_publicada', d.versao_publicada,
                       'cliente', c.nome) from diagnosticos d join clientes c on c.id = d.cliente_id where d.id = p_diagnostico),
    'uploads', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'bloco', u.bloco, 'arquivo', u.nome_arquivo, 'linhas', u.linhas, 'status', u.status, 'criado_em', u.criado_em,
                 'mapeamento', (select coalesce(jsonb_object_agg(m.campo, m.coluna_origem), '{}') from mapeamentos_coluna m where m.upload_id = u.id)) order by u.criado_em)
                 from uploads u where u.diagnostico_id = p_diagnostico), '[]'),
    'qualidade', coalesce((select jsonb_agg(jsonb_build_object('bloco', bloco, 'obrigatorio', obrigatorio, 'presente', presente, 'linhas', linhas, 'nota', nota)) from qualidade_blocos where diagnostico_id = p_diagnostico), '[]'),
    'validacoes', coalesce((select jsonb_agg(jsonb_build_object('bloco', bloco, 'regra', regra, 'severidade', severidade, 'ocorrencias', ocorrencias, 'total', total, 'mensagem', mensagem) order by severidade desc, bloco, regra)
                 from validacoes where diagnostico_id = p_diagnostico), '[]'))
$$;

-- ---------------------------------------------------------------- validação e cálculo
create or replace function motor.bloqueio(p_diag uuid) returns text
language sql stable set search_path = public as $$
  select case
    when not exists (select 1 from transacoes where diagnostico_id = p_diag) then 'Envie o arquivo de transações.'
    when not exists (select 1 from transacoes where diagnostico_id = p_diag and valida) then 'Nenhuma transação válida no período do diagnóstico.'
    when not exists (select 1 from custos where diagnostico_id = p_diag and custo_unitario > 0) then 'Envie o arquivo de custos.'
  end
$$;

create or replace function public.validar_diagnostico(p_diagnostico uuid) returns jsonb
language plpgsql security definer set search_path = public, motor as $$
declare v_bloqueio text;
begin
  perform motor.exigir_consultor();
  perform motor.validar(p_diagnostico);
  v_bloqueio := motor.bloqueio(p_diagnostico);
  update diagnosticos set status = case when v_bloqueio is null then 'validado' else 'rascunho' end
   where id = p_diagnostico and status in ('rascunho', 'validado');
  perform motor.auditar(p_diagnostico, 'validacao', jsonb_build_object('bloqueio', v_bloqueio));
  return jsonb_build_object('pode_calcular', v_bloqueio is null, 'bloqueio', v_bloqueio);
end $$;

create or replace function public.calcular_diagnostico(p_diagnostico uuid) returns jsonb
language plpgsql security definer set search_path = public, motor as $$
declare v_bloqueio text;
begin
  perform motor.exigir_consultor();
  perform motor.validar(p_diagnostico);
  v_bloqueio := motor.bloqueio(p_diagnostico);
  if v_bloqueio is not null then
    return jsonb_build_object('calculado', false, 'bloqueio', v_bloqueio);
  end if;
  perform motor.calcular(p_diagnostico);
  update diagnosticos set status = 'calculado', calculado_em = now() where id = p_diagnostico;
  perform motor.auditar(p_diagnostico, 'calculo', jsonb_build_object('versao_catalogo', (select versao_catalogo from diagnosticos where id = p_diagnostico)));
  return jsonb_build_object('calculado', true);
end $$;

-- ---------------------------------------------------------------- painel
-- Consultor vê o cálculo corrente. Perfis do cliente veem a última versão publicada, e só ela.
create or replace function public.painel(p_diagnostico uuid) returns jsonb
language plpgsql stable set search_path = public, motor as $$
begin
  if public.perfil_atual() = 'consultor' then
    return motor.montar_painel(p_diagnostico);
  end if;
  return (select conteudo || jsonb_build_object('publicacao', jsonb_build_object('versao', versao, 'publicado_em', publicado_em))
            from publicacoes where diagnostico_id = p_diagnostico order by versao desc limit 1);
end $$;

-- O simulador usa a mesma função de cálculo dos cenários: nenhum número nasce na interface.
create or replace function public.simular(p_diagnostico uuid, p_premissas jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, motor as $$
begin
  perform motor.exigir_consultor();
  return motor.simular(p_diagnostico, p_premissas);
end $$;

create or replace function public.salvar_premissas(p_diagnostico uuid, p_cenario text, p_premissas jsonb) returns void
language plpgsql security definer set search_path = public, motor as $$
declare v_cenario uuid;
begin
  perform motor.exigir_consultor();
  select id into v_cenario from cenarios where diagnostico_id = p_diagnostico and codigo = p_cenario;
  if v_cenario is null then raise exception 'Calcule o diagnóstico antes de alterar premissas.'; end if;
  update cenario_premissas p set valor = (p_premissas -> p.alavanca ->> p.chave)::numeric, origem = 'informada'
   where p.cenario_id = v_cenario and p_premissas -> p.alavanca ? p.chave and p.valor is distinct from (p_premissas -> p.alavanca ->> p.chave)::numeric;
  perform motor.rodar_cenarios(p_diagnostico);
  perform motor.auditar(p_diagnostico, 'premissas_alteradas', jsonb_build_object('cenario', p_cenario, 'premissas', p_premissas));
end $$;

create or replace function public.publicar_diagnostico(p_diagnostico uuid) returns integer
language plpgsql security definer set search_path = public, motor as $$
declare d diagnosticos; v_versao integer; v_uid uuid;
begin
  v_uid := motor.exigir_consultor();
  select * into d from diagnosticos where id = p_diagnostico;
  if d.status not in ('calculado', 'publicado') then raise exception 'Calcule o diagnóstico antes de publicar.'; end if;
  v_versao := coalesce((select max(versao) from publicacoes where diagnostico_id = p_diagnostico), 0) + 1;
  update diagnosticos set status = 'publicado', versao_publicada = v_versao, publicado_em = now() where id = p_diagnostico;
  insert into publicacoes (cliente_id, diagnostico_id, versao, conteudo, publicado_por)
  values (d.cliente_id, p_diagnostico, v_versao, motor.montar_painel(p_diagnostico), v_uid);
  perform motor.auditar(p_diagnostico, 'publicacao', jsonb_build_object('versao', v_versao));
  return v_versao;
end $$;
