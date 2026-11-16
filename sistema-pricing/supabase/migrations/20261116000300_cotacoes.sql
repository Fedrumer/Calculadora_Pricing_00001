-- Domínio "Cotação": o que foi cotado. Versões são imutáveis; o ciclo de vida
-- da cotação é uma máquina de estados conferida também no banco.

create table public.contadores (
  org_id uuid not null references public.organizacoes (id),
  nome text not null,
  valor bigint not null default 0,
  primary key (org_id, nome)
);

create or replace function app.proximo_numero(p_org uuid, p_nome text) returns bigint
language sql security definer set search_path = '' as $$
  insert into public.contadores as c (org_id, nome, valor) values (p_org, p_nome, 1)
  on conflict (org_id, nome) do update set valor = c.valor + 1
  returning valor
$$;

create table public.cotacoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id),
  -- número sequencial por organização
  numero bigint not null,
  cliente_nome text not null,
  cliente_email text,
  canal_id uuid references public.canais (id),
  unidade_id uuid references public.unidades (id),
  dono_id uuid references public.usuarios (id),
  chave_api_id uuid,
  produto_id uuid not null references public.produtos (id),
  status text not null default 'rascunho' check (status in (
    'rascunho', 'em_aprovacao', 'recusada', 'aprovada', 'emitida', 'aceita', 'perdida', 'expirada', 'cancelada')),
  versao_atual int not null default 0,
  versao_atual_id uuid,
  validade date,
  -- quando o formulário foi aberto (cronômetro entre abertura e emissão)
  iniciada_em timestamptz,
  emitida_em timestamptz,
  encerrada_em timestamptz,
  desfecho_motivo text,
  origem text not null default 'web' check (origem in ('web', 'api', 'contingencia', 'email', 'carga')),
  observacao text,
  anonimizada_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (org_id, numero),
  check (dono_id is not null or chave_api_id is not null or origem = 'carga')
);
create index cotacoes_org_status on public.cotacoes (org_id, status, criado_em desc);
create index cotacoes_dono on public.cotacoes (dono_id, criado_em desc);
create index cotacoes_canal on public.cotacoes (canal_id);
create index cotacoes_validade on public.cotacoes (validade) where status = 'emitida';
create trigger cotacoes_atualizado before update on public.cotacoes
  for each row execute function app.tocar_atualizado_em();

-- Dado pessoal mínimo: o documento do cliente final fica cifrado, em tabela à
-- parte, sem nenhuma política de leitura (só a API de negócio alcança).
create table public.cotacao_dados_pessoais (
  cotacao_id uuid primary key references public.cotacoes (id) on delete cascade,
  org_id uuid not null references public.organizacoes (id),
  documento_cifrado text,
  -- HMAC do documento, para localizar os dados de um titular sem decifrar
  documento_hash text,
  criado_em timestamptz not null default now()
);
create index cotacao_dados_pessoais_hash on public.cotacao_dados_pessoais (org_id, documento_hash);

create table public.cotacao_versoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id),
  cotacao_id uuid not null references public.cotacoes (id),
  versao int not null,
  -- pedido enviado ao motor (sem dado pessoal)
  entrada jsonb not null,
  -- resultado completo, com custo e margem: só perfis internos e o dono leem
  resultado jsonb not null,
  -- projeção sem custo, imposto nem margem: é o que o canal enxerga
  resultado_publico jsonb not null,
  tabela_id uuid not null references public.tabelas_preco (id),
  politica_id uuid not null references public.politicas (id),
  motor_versao text not null,
  moeda text not null default 'BRL',
  preco_base numeric(16, 2) not null,
  preco_final numeric(16, 2) not null,
  desconto_pct numeric(7, 4) not null default 0,
  comissao_pct numeric(7, 4) not null default 0,
  comissao_valor numeric(16, 2) not null default 0,
  margem_valor numeric(16, 2) not null,
  margem_pct numeric(9, 4) not null,
  veredito text not null check (veredito in ('dentro', 'exige_aprovacao', 'bloqueado')),
  nivel_alcada int,
  criado_por uuid references public.usuarios (id),
  criado_em timestamptz not null default now(),
  unique (cotacao_id, versao)
);
create index cotacao_versoes_cotacao on public.cotacao_versoes (cotacao_id, versao desc);

alter table public.cotacoes
  add constraint cotacoes_versao_atual_fk foreign key (versao_atual_id) references public.cotacao_versoes (id);

create table public.aprovacoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id),
  cotacao_id uuid not null references public.cotacoes (id),
  -- a aprovação vale só para esta versão exata
  versao_id uuid not null references public.cotacao_versoes (id),
  solicitante_id uuid references public.usuarios (id),
  motivo text not null check (length(btrim(motivo)) >= 10),
  nivel_alcada int not null,
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'recusada', 'cancelada')),
  aprovador_id uuid references public.usuarios (id),
  decisao_motivo text,
  prazo timestamptz not null,
  lembrado_em timestamptz,
  escalonado_em timestamptz,
  decidido_em timestamptz,
  criado_em timestamptz not null default now(),
  -- ninguém aprova a própria cotação
  check (aprovador_id is null or aprovador_id <> solicitante_id)
);
create unique index aprovacoes_uma_pendente on public.aprovacoes (versao_id) where status = 'pendente';
create index aprovacoes_pendentes on public.aprovacoes (org_id, status, prazo);

create table public.anexos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id),
  cotacao_id uuid not null references public.cotacoes (id),
  versao_id uuid references public.cotacao_versoes (id),
  tipo text not null default 'proposta' check (tipo in ('proposta', 'documento')),
  bucket text not null,
  caminho text not null,
  nome text not null,
  tamanho_bytes bigint,
  criado_por uuid references public.usuarios (id),
  criado_em timestamptz not null default now(),
  unique (bucket, caminho)
);
create index anexos_cotacao on public.anexos (cotacao_id);

-- Versão de cotação: imutável após gravação ------------------------------------

create or replace function app.versao_imutavel() returns trigger
language plpgsql as $$
begin
  raise exception 'Versões de cotação são imutáveis; grave uma nova versão.' using errcode = 'P0001';
end $$;

create trigger cotacao_versoes_imutavel before update or delete on public.cotacao_versoes
  for each row execute function app.versao_imutavel();
create trigger cotacao_versoes_sem_truncate before truncate on public.cotacao_versoes
  for each statement execute function app.versao_imutavel();

-- Máquina de estados da cotação ------------------------------------------------

create or replace function app.transicao_cotacao() returns trigger
language plpgsql as $$
declare
  v_ok boolean;
begin
  if new.org_id <> old.org_id or new.numero <> old.numero then
    raise exception 'Organização e número da cotação não mudam.' using errcode = 'P0001';
  end if;
  if new.status = old.status then
    if old.status in ('aceita', 'perdida', 'cancelada') and new.anonimizada_em is not distinct from old.anonimizada_em
       and (to_jsonb(new) - 'atualizado_em') is distinct from (to_jsonb(old) - 'atualizado_em') then
      raise exception 'Cotação % está encerrada (%).', old.numero, old.status using errcode = 'P0001';
    end if;
    return new;
  end if;
  v_ok := case old.status
    when 'rascunho' then new.status in ('emitida', 'em_aprovacao', 'cancelada')
    when 'em_aprovacao' then new.status in ('aprovada', 'recusada', 'cancelada')
    when 'recusada' then new.status in ('rascunho', 'cancelada')
    when 'aprovada' then new.status in ('emitida', 'rascunho', 'cancelada')
    when 'emitida' then new.status in ('aceita', 'perdida', 'expirada', 'rascunho')
    when 'expirada' then new.status in ('rascunho')
    else false
  end;
  if not v_ok then
    raise exception 'Transição de status inválida: % para %.', old.status, new.status using errcode = 'P0001';
  end if;
  if new.status = 'perdida' and coalesce(btrim(new.desfecho_motivo), '') = '' then
    raise exception 'O motivo da perda é obrigatório.' using errcode = 'P0001';
  end if;
  if new.status = 'emitida' then
    -- só chega ao cliente final dentro da política ou com exceção aprovada para esta versão
    if not exists (
      select 1 from public.cotacao_versoes v
      where v.id = new.versao_atual_id and v.cotacao_id = new.id
        and (v.veredito = 'dentro'
             or (v.veredito = 'exige_aprovacao' and exists (
                   select 1 from public.aprovacoes a where a.versao_id = v.id and a.status = 'aprovada')))
    ) then
      raise exception 'A versão atual não está dentro da política nem tem exceção aprovada.' using errcode = 'P0001';
    end if;
    if new.validade is null then
      raise exception 'Cotação emitida precisa de data de validade.' using errcode = 'P0001';
    end if;
  end if;
  if new.status in ('aceita', 'perdida', 'expirada', 'cancelada') then
    new.encerrada_em := coalesce(new.encerrada_em, now());
  end if;
  return new;
end $$;

create trigger cotacoes_transicao before update on public.cotacoes
  for each row execute function app.transicao_cotacao();

create or replace function app.cotacao_sem_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'Cotações não são excluídas; cancele ou aguarde a rotina de retenção.' using errcode = 'P0001';
end $$;
create trigger cotacoes_sem_delete before delete on public.cotacoes
  for each row execute function app.cotacao_sem_delete();

-- Decisão de aprovação: só uma vez, e nunca pelo próprio solicitante.
create or replace function app.decisao_aprovacao() returns trigger
language plpgsql as $$
begin
  if old.status <> 'pendente' and (to_jsonb(new) - 'lembrado_em' - 'escalonado_em') is distinct from (to_jsonb(old) - 'lembrado_em' - 'escalonado_em') then
    raise exception 'Esta aprovação já foi decidida.' using errcode = 'P0001';
  end if;
  if new.status in ('aprovada', 'recusada') then
    if new.aprovador_id is null then
      raise exception 'Decisão sem aprovador.' using errcode = 'P0001';
    end if;
    if new.status = 'recusada' and coalesce(btrim(new.decisao_motivo), '') = '' then
      raise exception 'A recusa exige motivo.' using errcode = 'P0001';
    end if;
    new.decidido_em := coalesce(new.decidido_em, now());
  end if;
  return new;
end $$;
create trigger aprovacoes_decisao before update on public.aprovacoes
  for each row execute function app.decisao_aprovacao();
