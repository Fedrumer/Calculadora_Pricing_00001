-- Domínio "Regra": qual é a regra. Tabelas e políticas são versionadas; uma
-- versão publicada é imutável e só uma pode estar vigente em cada data.

set search_path = public, extensions;
create extension if not exists btree_gist with schema extensions;

create table public.dimensoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id),
  codigo text not null,
  nome text not null,
  tipo text not null check (tipo in ('categoria', 'faixa')),
  valores jsonb not null default '[]'::jsonb,
  faixas jsonb not null default '[]'::jsonb,
  ordem int not null default 0,
  criado_em timestamptz not null default now(),
  unique (org_id, codigo)
);

create table public.produtos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id),
  codigo text not null,
  nome text not null,
  descricao text not null default '',
  ativo boolean not null default true,
  dimensoes text[] not null default '{}',
  multiplicadores text[] not null default '{}',
  ordem int not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (org_id, codigo)
);
create trigger produtos_atualizado before update on public.produtos
  for each row execute function app.tocar_atualizado_em();

create table public.componentes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id),
  produto_id uuid not null references public.produtos (id),
  codigo text not null,
  nome text not null,
  obrigatorio boolean not null default false,
  ativo boolean not null default true,
  ordem int not null default 0,
  unique (produto_id, codigo)
);

create table public.tabelas_preco (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id),
  nome text not null,
  versao int not null,
  moeda text not null default 'BRL',
  status text not null default 'rascunho' check (status in ('rascunho', 'publicada', 'arquivada')),
  vigencia_inicio date,
  vigencia_fim date,
  origem text not null default 'tela' check (origem in ('tela', 'planilha', 'configuracao', 'copia')),
  observacao text,
  criado_por uuid references public.usuarios (id),
  criado_em timestamptz not null default now(),
  publicado_por uuid references public.usuarios (id),
  publicado_em timestamptz,
  unique (org_id, versao),
  check (status = 'rascunho' or vigencia_inicio is not null),
  check (vigencia_fim is null or vigencia_fim >= vigencia_inicio),
  constraint tabela_unica_por_data exclude using gist (
    org_id with =, daterange(vigencia_inicio, vigencia_fim, '[]') with &&
  ) where (status = 'publicada')
);

create table public.itens_tabela (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id),
  tabela_id uuid not null references public.tabelas_preco (id) on delete cascade,
  produto_id uuid not null references public.produtos (id),
  componente_id uuid references public.componentes (id),
  dimensoes jsonb not null default '{}'::jsonb,
  preco_base numeric(16, 4) not null check (preco_base >= 0)
);
create index itens_tabela_tabela on public.itens_tabela (tabela_id);
create unique index itens_tabela_unico on public.itens_tabela
  (tabela_id, produto_id, coalesce(componente_id, '00000000-0000-0000-0000-000000000000'), dimensoes);

create table public.fatores (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id),
  tabela_id uuid not null references public.tabelas_preco (id) on delete cascade,
  codigo text not null,
  nome text not null,
  dimensao text not null,
  valor text not null,
  tipo text not null default 'percentual' check (tipo in ('percentual', 'valor')),
  ajuste numeric(16, 4) not null,
  produto_id uuid references public.produtos (id),
  grupo text,
  unique (tabela_id, codigo)
);

create table public.politicas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id),
  versao int not null,
  status text not null default 'rascunho' check (status in ('rascunho', 'publicada', 'arquivada')),
  vigencia_inicio date,
  vigencia_fim date,
  -- etapas do cálculo, arredondamento, limites, alçadas, comissões por canal, prazos
  regras jsonb not null,
  observacao text,
  criado_por uuid references public.usuarios (id),
  criado_em timestamptz not null default now(),
  publicado_por uuid references public.usuarios (id),
  publicado_em timestamptz,
  unique (org_id, versao),
  check (status = 'rascunho' or vigencia_inicio is not null),
  check (vigencia_fim is null or vigencia_fim >= vigencia_inicio),
  constraint politica_unica_por_data exclude using gist (
    org_id with =, daterange(vigencia_inicio, vigencia_fim, '[]') with &&
  ) where (status = 'publicada')
);

-- Impostos, custo de cobrança e custo variável: versionados junto com a política.
create table public.parametros_custo (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id),
  politica_id uuid not null references public.politicas (id) on delete cascade,
  codigo text not null,
  nome text not null,
  categoria text not null check (categoria in ('imposto', 'cobranca', 'custo_variavel')),
  tipo text not null check (tipo in ('percentual', 'valor_fixo', 'valor_por_unidade')),
  valor numeric(16, 4) not null check (valor >= 0),
  produto_id uuid references public.produtos (id),
  base jsonb,
  unique (politica_id, codigo)
);

create table public.campanhas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id),
  codigo text not null,
  nome text not null,
  inicio date not null,
  fim date not null,
  tipo text not null check (tipo in ('percentual', 'valor')),
  valor numeric(16, 4) not null check (valor > 0),
  -- produtos, canais e condições por dimensão; regras de acumulação
  produtos text[],
  canais text[],
  condicoes jsonb,
  acumula_com_desconto boolean not null default false,
  acumula_com_outras boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (org_id, codigo),
  check (fim >= inicio)
);

-- Cotações reais calculadas à mão; rodam a cada publicação de regra.
create table public.casos_referencia (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id),
  nome text not null,
  pedido jsonb not null,
  esperado jsonb not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (org_id, nome)
);

-- Imutabilidade das versões publicadas ---------------------------------------

create or replace function app.proteger_versao_publicada() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'rascunho' then
      raise exception 'Versão % de % já foi publicada e não pode ser excluída.', old.versao, tg_table_name using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.status = 'rascunho' then
    return new;
  end if;
  -- publicada: só é permitido encerrar a vigência ou arquivar.
  if (to_jsonb(new) - 'vigencia_fim' - 'status') is distinct from (to_jsonb(old) - 'vigencia_fim' - 'status')
     or (new.status not in (old.status, 'arquivada'))
     or old.status = 'arquivada' then
    raise exception 'Versão % de % é imutável; crie uma nova versão.', old.versao, tg_table_name using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger tabelas_preco_imutavel before update or delete on public.tabelas_preco
  for each row execute function app.proteger_versao_publicada();
create trigger politicas_imutavel before update or delete on public.politicas
  for each row execute function app.proteger_versao_publicada();

create or replace function app.proteger_filho_de_versao() returns trigger
language plpgsql as $$
declare
  v_pai uuid;
  v_status text;
begin
  if tg_argv[0] = 'tabelas_preco' then
    v_pai := case when tg_op = 'DELETE' then old.tabela_id else new.tabela_id end;
    select status into v_status from public.tabelas_preco where id = v_pai;
  else
    v_pai := case when tg_op = 'DELETE' then old.politica_id else new.politica_id end;
    select status into v_status from public.politicas where id = v_pai;
  end if;
  -- v_status nulo: o pai está sendo excluído em cascata (só rascunhos chegam aqui).
  if v_status is not null and v_status <> 'rascunho' then
    raise exception 'A versão já foi publicada; itens de % não podem mais mudar.', tg_table_name using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger itens_tabela_imutavel before insert or update or delete on public.itens_tabela
  for each row execute function app.proteger_filho_de_versao('tabelas_preco');
create trigger fatores_imutavel before insert or update or delete on public.fatores
  for each row execute function app.proteger_filho_de_versao('tabelas_preco');
create trigger parametros_custo_imutavel before insert or update or delete on public.parametros_custo
  for each row execute function app.proteger_filho_de_versao('politicas');
