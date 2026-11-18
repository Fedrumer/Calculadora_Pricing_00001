-- A2 (e base para A8): custo em moeda estrangeira e câmbio de referência.
-- Tudo aditivo: sem moeda nos custos e sem câmbio publicado, nada muda no cálculo.

-- Câmbio de referência: publicado pelo gestor de pricing (ou, no futuro, a partir
-- da PTAX), com vigência. Cada linha é imutável; vale, em cada data, a de início
-- mais recente até ela.
create table public.cambios_referencia (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id),
  moeda text not null check (moeda ~ '^[A-Z]{3}$'),
  taxa numeric(18, 6) not null check (taxa > 0),
  vigente_de date not null,
  origem text not null default 'politica' check (origem in ('politica', 'ptax')),
  observacao text,
  publicado_por uuid references public.usuarios (id),
  criado_em timestamptz not null default now(),
  unique (org_id, moeda, vigente_de)
);
create index cambios_referencia_vigencia on public.cambios_referencia (org_id, moeda, vigente_de desc);

create or replace function app.cambio_imutavel() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Câmbio de referência publicado é imutável; publique um novo com outra vigência.' using errcode = 'P0001';
end $$;
create trigger cambios_referencia_imutavel before update or delete on public.cambios_referencia
  for each row execute function app.cambio_imutavel();
create trigger cambios_referencia_auditoria after insert on public.cambios_referencia
  for each row execute function app.auditar();

-- Câmbio de mercado (PTAX do Banco Central), gravado pela automação do A8. Nasce
-- vazio, para o painel já ter onde ler. Nunca muda preço sozinho.
create table public.cambios_mercado (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizacoes (id),
  moeda text not null check (moeda ~ '^[A-Z]{3}$'),
  data date not null,
  boletim text not null default 'fechamento',
  taxa_compra numeric(18, 6),
  taxa_venda numeric(18, 6) not null check (taxa_venda > 0),
  origem text not null default 'ptax',
  criado_em timestamptz not null default now(),
  unique (org_id, moeda, data, boletim)
);

-- Custos em moeda própria e com condição por dimensão.
alter table public.parametros_custo
  add column moeda text check (moeda is null or moeda ~ '^[A-Z]{3}$'),
  add column condicoes jsonb;

-- Taxas usadas em cada versão de cotação (as versões antigas ficam com nulo).
alter table public.cotacao_versoes add column cambios jsonb;

-- Câmbio de referência vigente de uma moeda em uma data.
create or replace function app.cambios_vigentes(p_org uuid, p_data date)
returns table (moeda text, taxa numeric, vigente_de date, origem text)
language sql stable security definer set search_path = '' as $$
  select distinct on (c.moeda) c.moeda, c.taxa, c.vigente_de, c.origem
  from public.cambios_referencia c
  where c.org_id = p_org and c.vigente_de <= p_data
  order by c.moeda, c.vigente_de desc, c.criado_em desc
$$;
revoke execute on function app.cambios_vigentes(uuid, date) from public, anon, authenticated;
grant execute on function app.cambios_vigentes(uuid, date) to service_role;

-- RLS: negar por padrão; só perfis internos leem. O canal não vê câmbio.
alter table public.cambios_referencia enable row level security;
alter table public.cambios_mercado enable row level security;
revoke all on public.cambios_referencia, public.cambios_mercado from anon;
revoke insert, update, delete, truncate, references, trigger on public.cambios_referencia, public.cambios_mercado from authenticated;
grant select on public.cambios_referencia, public.cambios_mercado to authenticated;
create policy barreira_org_mfa on public.cambios_referencia as restrictive for all to authenticated
  using (org_id = (select app.org_id()) and (select app.mfa_ok()));
create policy barreira_org_mfa on public.cambios_mercado as restrictive for all to authenticated
  using (org_id = (select app.org_id()) and (select app.mfa_ok()));
create policy ler on public.cambios_referencia for select to authenticated using ((select app.interno()));
create policy ler on public.cambios_mercado for select to authenticated using ((select app.interno()));
