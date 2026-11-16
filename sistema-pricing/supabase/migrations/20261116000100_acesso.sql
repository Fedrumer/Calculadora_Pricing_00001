-- Domínio "Acesso": quem acessa. Toda tabela carrega org_id, mesmo havendo uma
-- só organização por instalação, para manter aberta a alternativa multiempresa.

create schema if not exists app;
comment on schema app is 'Funções de apoio a RLS, auditoria e regras de integridade. Não é exposto pela API do banco.';

create table public.organizacoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid generated always as (id) stored,
  nome text not null,
  slug text not null unique,
  -- identidade visual, prazos, módulos ligados, retenção e campos do formulário
  config jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.unidades (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id),
  codigo text not null,
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (org_id, codigo)
);

create table public.canais (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id),
  codigo text not null,
  nome text not null,
  tipo text not null default 'parceiro',
  ativo boolean not null default true,
  -- o administrador habilita o responsável do canal a convidar usuários do próprio canal
  permite_convite boolean not null default false,
  criado_em timestamptz not null default now(),
  unique (org_id, codigo)
);

create table public.papeis (
  org_id uuid not null references public.organizacoes (id),
  codigo text not null check (codigo in ('admin', 'gestor_pricing', 'aprovador', 'vendedor', 'canal', 'leitura', 'suporte')),
  nome text not null,
  descricao text not null default '',
  exige_mfa boolean not null default false,
  ativo boolean not null default true,
  primary key (org_id, codigo)
);

create table public.usuarios (
  id uuid primary key references auth.users (id),
  org_id uuid not null references public.organizacoes (id),
  nome text not null,
  email text not null,
  status text not null default 'ativo' check (status in ('ativo', 'suspenso', 'desativado')),
  -- maior nível de alçada que este usuário pode liberar (nulo = não aprova)
  limite_alcada int check (limite_alcada is null or limite_alcada > 0),
  substituto_id uuid references public.usuarios (id),
  ausente_ate date,
  aceite_termos_em timestamptz,
  ultimo_acesso timestamptz,
  motivo_status text,
  status_alterado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (org_id, email),
  check (substituto_id is null or substituto_id <> id)
);

create table public.usuario_papel (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id),
  usuario_id uuid not null references public.usuarios (id),
  papel text not null,
  -- escopo: nulo = toda a organização
  unidade_id uuid references public.unidades (id),
  canal_id uuid references public.canais (id),
  -- acesso com prazo (suporte da consultoria); renovado pelo administrador do cliente
  valido_ate timestamptz,
  criado_por uuid references public.usuarios (id),
  criado_em timestamptz not null default now(),
  foreign key (org_id, papel) references public.papeis (org_id, codigo),
  check (papel <> 'canal' or canal_id is not null),
  check (papel = 'canal' or canal_id is null)
);
create unique index usuario_papel_unico on public.usuario_papel
  (usuario_id, papel, coalesce(unidade_id, '00000000-0000-0000-0000-000000000000'), coalesce(canal_id, '00000000-0000-0000-0000-000000000000'));
create index usuario_papel_usuario on public.usuario_papel (usuario_id);

create table public.convites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id),
  email text not null,
  nome text,
  papel text not null,
  unidade_id uuid references public.unidades (id),
  canal_id uuid references public.canais (id),
  limite_alcada int,
  -- só o hash do token de uso único é guardado
  token_hash text not null unique,
  expira_em timestamptz not null,
  -- nulo só no convite do primeiro administrador, criado na instalação
  convidado_por uuid references public.usuarios (id),
  aceito_em timestamptz,
  aceito_por uuid references public.usuarios (id),
  cancelado_em timestamptz,
  criado_em timestamptz not null default now(),
  foreign key (org_id, papel) references public.papeis (org_id, codigo)
);
create index convites_org on public.convites (org_id, criado_em desc);

-- Funções de identidade usadas pelas políticas de RLS -------------------------

create or replace function app.org_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select u.org_id from public.usuarios u where u.id = auth.uid() and u.status = 'ativo'
$$;

create or replace function app.tem_papel(variadic p_papeis text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.usuario_papel up
    join public.usuarios u on u.id = up.usuario_id
    join public.papeis p on p.org_id = up.org_id and p.codigo = up.papel
    where up.usuario_id = auth.uid()
      and u.status = 'ativo'
      and p.ativo
      and up.papel = any (p_papeis)
      and (up.valido_ate is null or up.valido_ate > now())
  )
$$;

-- Perfis com visão ampla da organização (veem custo e margem).
create or replace function app.interno() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.tem_papel('admin', 'gestor_pricing', 'aprovador', 'leitura', 'suporte')
$$;

-- Quem tem perfil com segundo fator obrigatório só enxerga dados com sessão aal2.
create or replace function app.mfa_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    or not exists (
      select 1
      from public.usuario_papel up
      join public.papeis p on p.org_id = up.org_id and p.codigo = up.papel
      where up.usuario_id = auth.uid()
        and p.exige_mfa
        and p.ativo
        and (up.valido_ate is null or up.valido_ate > now())
    )
$$;

create or replace function app.canais_ids() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(up.canal_id), '{}')
  from public.usuario_papel up
  where up.usuario_id = auth.uid() and up.papel = 'canal'
    and (up.valido_ate is null or up.valido_ate > now())
$$;

create or replace function app.tocar_atualizado_em() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

create trigger organizacoes_atualizado before update on public.organizacoes
  for each row execute function app.tocar_atualizado_em();
create trigger usuarios_atualizado before update on public.usuarios
  for each row execute function app.tocar_atualizado_em();

-- Desativar, não excluir: usuário nunca é apagado.
create or replace function app.proibir_exclusao() returns trigger
language plpgsql as $$
begin
  raise exception 'Registros de % não são excluídos; use a desativação.', tg_table_name
    using errcode = 'P0001';
end $$;

create trigger usuarios_sem_delete before delete on public.usuarios
  for each row execute function app.proibir_exclusao();
create trigger organizacoes_sem_delete before delete on public.organizacoes
  for each row execute function app.proibir_exclusao();
