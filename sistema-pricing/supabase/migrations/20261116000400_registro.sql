-- Domínio "Registro": o que aconteceu. A auditoria só aceita inserção e é
-- gravada por gatilho, na mesma transação da mudança.

create table public.eventos_auditoria (
  id bigint generated always as identity primary key,
  org_id uuid,
  ocorrido_em timestamptz not null default now(),
  ator_id uuid,
  ator_tipo text not null default 'sistema' check (ator_tipo in ('usuario', 'chave_api', 'sistema', 'automacao', 'consultoria')),
  acao text not null,
  tabela text,
  registro_id text,
  anterior jsonb,
  novo jsonb,
  ip inet,
  contexto jsonb not null default '{}'::jsonb
);
create index eventos_auditoria_org_data on public.eventos_auditoria (org_id, ocorrido_em desc);
create index eventos_auditoria_registro on public.eventos_auditoria (tabela, registro_id, ocorrido_em);
create index eventos_auditoria_acao on public.eventos_auditoria (org_id, acao, ocorrido_em desc);

create or replace function app.auditoria_so_insercao() returns trigger
language plpgsql as $$
begin
  -- A única saída é a rotina de retenção (arquivamento ao fim do prazo), que
  -- declara a intenção na transação.
  if tg_op = 'DELETE' and current_setting('app.retencao', true) = 'arquivar' then
    return old;
  end if;
  raise exception 'A trilha de auditoria só aceita inserção.' using errcode = 'P0001';
end $$;

create trigger eventos_auditoria_imutavel before update or delete on public.eventos_auditoria
  for each row execute function app.auditoria_so_insercao();
create trigger eventos_auditoria_sem_truncate before truncate on public.eventos_auditoria
  for each statement execute function app.auditoria_so_insercao();

create or replace function app.config(p_nome text) returns text
language sql stable as $$ select nullif(current_setting(p_nome, true), '') $$;

-- Evento de negócio explícito (cotacao.emitida, usuario.convidado, regra.publicada...).
create or replace function app.registrar_evento(
  p_org uuid, p_acao text, p_tabela text, p_registro text,
  p_anterior jsonb default null, p_novo jsonb default null, p_contexto jsonb default '{}'::jsonb
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
begin
  insert into public.eventos_auditoria (org_id, ator_id, ator_tipo, acao, tabela, registro_id, anterior, novo, ip, contexto)
  values (
    p_org,
    coalesce(app.config('app.ator_id')::uuid, auth.uid()),
    coalesce(app.config('app.ator_tipo'), case when auth.uid() is null then 'sistema' else 'usuario' end),
    p_acao, p_tabela, p_registro, p_anterior, p_novo,
    app.config('app.ip')::inet,
    coalesce(p_contexto, '{}'::jsonb)
  )
  returning id into v_id;
  return v_id;
end $$;

-- Gatilho genérico: quem, quando, o quê, valor anterior e novo, IP.
-- Colunas volumosas ou sensíveis (argumento do gatilho) ficam fora do registro.
create or replace function app.auditar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_anterior jsonb;
  v_novo jsonb;
  v_coluna text;
  v_registro text;
  v_org uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_anterior := to_jsonb(old); end if;
  if tg_op in ('UPDATE', 'INSERT') then v_novo := to_jsonb(new); end if;
  for i in 0 .. tg_nargs - 1 loop
    v_coluna := tg_argv[i];
    v_anterior := v_anterior - v_coluna;
    v_novo := v_novo - v_coluna;
  end loop;
  if tg_op = 'UPDATE' then
    if (v_anterior - 'atualizado_em' - 'ultimo_acesso') is not distinct from (v_novo - 'atualizado_em' - 'ultimo_acesso') then
      return new;
    end if;
    -- guarda só o que mudou
    select jsonb_object_agg(n.key, n.value), jsonb_object_agg(n.key, v_anterior -> n.key)
      into v_novo, v_anterior
    from jsonb_each(v_novo) n
    where n.value is distinct from (v_anterior -> n.key) and n.key <> 'atualizado_em';
  end if;
  v_registro := coalesce(to_jsonb(coalesce(new, old)) ->> 'id', to_jsonb(coalesce(new, old)) ->> 'cotacao_id',
                         to_jsonb(coalesce(new, old)) ->> 'codigo');
  v_org := (to_jsonb(coalesce(new, old)) ->> 'org_id')::uuid;
  insert into public.eventos_auditoria (org_id, ator_id, ator_tipo, acao, tabela, registro_id, anterior, novo, ip, contexto)
  values (
    v_org,
    coalesce(app.config('app.ator_id')::uuid, auth.uid()),
    coalesce(app.config('app.ator_tipo'), case when auth.uid() is null then 'sistema' else 'usuario' end),
    lower(tg_op) || ' ' || tg_table_name, tg_table_name, v_registro, v_anterior, v_novo,
    app.config('app.ip')::inet,
    coalesce(app.config('app.contexto')::jsonb, '{}'::jsonb)
  );
  return coalesce(new, old);
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'organizacoes', 'unidades', 'canais', 'papeis', 'usuarios', 'usuario_papel',
    'dimensoes', 'produtos', 'componentes', 'tabelas_preco', 'itens_tabela', 'fatores',
    'politicas', 'parametros_custo', 'campanhas', 'casos_referencia', 'cotacoes', 'aprovacoes', 'anexos'
  ] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app.auditar()',
                   t || '_auditoria', t);
  end loop;
end $$;

create trigger convites_auditoria after insert or update or delete on public.convites
  for each row execute function app.auditar('token_hash');
create trigger cotacao_versoes_auditoria after insert on public.cotacao_versoes
  for each row execute function app.auditar('entrada', 'resultado', 'resultado_publico');
create trigger cotacao_dados_pessoais_auditoria after insert or update or delete on public.cotacao_dados_pessoais
  for each row execute function app.auditar('documento_cifrado', 'documento_hash');

-- Integrações ------------------------------------------------------------------

create table public.chaves_api (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id),
  canal_id uuid references public.canais (id),
  nome text not null,
  -- primeiros caracteres, para o administrador reconhecer a chave
  prefixo text not null,
  -- só o hash da chave é guardado
  hash text not null unique,
  escopos text[] not null default '{cotar}',
  limite_por_minuto int not null default 60,
  expira_em timestamptz,
  revogada_em timestamptz,
  ultimo_uso timestamptz,
  criado_por uuid references public.usuarios (id),
  criado_em timestamptz not null default now()
);
alter table public.cotacoes
  add constraint cotacoes_chave_api_fk foreign key (chave_api_id) references public.chaves_api (id);

create table public.webhooks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id),
  nome text not null,
  url text not null check (url ~ '^https://'),
  eventos text[] not null default '{}',
  segredo_hash text,
  ativo boolean not null default true,
  criado_por uuid references public.usuarios (id),
  criado_em timestamptz not null default now()
);

create trigger chaves_api_auditoria after insert or update or delete on public.chaves_api
  for each row execute function app.auditar('hash');
create trigger webhooks_auditoria after insert or update or delete on public.webhooks
  for each row execute function app.auditar('segredo_hash');

-- Caixa de saída: o que o n8n avisa e integra. Fica fora do caminho crítico:
-- se o n8n parar, a cotação continua funcionando e os eventos aguardam aqui.
create table public.eventos_saida (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizacoes (id),
  tipo text not null,
  carga jsonb not null,
  criado_em timestamptz not null default now(),
  processado_em timestamptz,
  tentativas int not null default 0,
  ultimo_erro text
);
create index eventos_saida_pendentes on public.eventos_saida (criado_em) where processado_em is null;

-- Idempotência das escritas da API.
create table public.idempotencia (
  org_id uuid not null,
  chave text not null,
  rota text not null,
  ator text not null,
  status int not null,
  resposta jsonb not null,
  criado_em timestamptz not null default now(),
  primary key (org_id, ator, rota, chave)
);

-- Limite de requisições por usuário e por chave (janela fixa de um minuto).
create table public.limites_requisicao (
  chave text not null,
  janela timestamptz not null,
  contagem int not null default 1,
  primary key (chave, janela)
);

create or replace function app.consumir_limite(p_chave text, p_limite int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_contagem int;
begin
  insert into public.limites_requisicao as l (chave, janela) values (p_chave, date_trunc('minute', now()))
  on conflict (chave, janela) do update set contagem = l.contagem + 1
  returning contagem into v_contagem;
  return v_contagem <= p_limite;
end $$;

-- Duração das chamadas da API (prova de eficiência: p95 da simulação).
create table public.metricas_api (
  id bigint generated always as identity primary key,
  org_id uuid,
  rota text not null,
  status int not null,
  duracao_ms numeric(10, 2) not null,
  criado_em timestamptz not null default now()
);
create index metricas_api_rota on public.metricas_api (rota, criado_em desc);

-- Registro das chamadas de IA (entrada já mascarada).
create table public.chamadas_ia (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizacoes (id),
  usuario_id uuid references public.usuarios (id),
  tipo text not null check (tipo in ('explicar', 'sugerir', 'ler', 'vigiar')),
  cotacao_id uuid references public.cotacoes (id),
  modelo text not null,
  entrada_mascarada jsonb not null,
  saida jsonb,
  tokens_entrada int,
  tokens_saida int,
  duracao_ms int,
  erro text,
  criado_em timestamptz not null default now()
);

-- Cópias de segurança e testes de restauração: backup não testado não conta.
create table public.registros_backup (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizacoes (id),
  tipo text not null check (tipo in ('copia_externa', 'teste_restauracao', 'planilha_contingencia', 'reposicao_demo')),
  status text not null check (status in ('ok', 'falha')),
  iniciado_em timestamptz not null default now(),
  duracao_segundos numeric(10, 1),
  tamanho_bytes bigint,
  destino text,
  detalhes jsonb not null default '{}'::jsonb
);
create index registros_backup_tipo on public.registros_backup (org_id, tipo, iniciado_em desc);
