-- Diagnóstico de Pricing: esquema.
-- Toda tabela com dado de cliente carrega cliente_id e diagnostico_id.
-- As tabelas de catálogo são globais e versionadas.
-- No esquema, "cliente" é a empresa diagnosticada e "conta" é o cliente final dela.

create schema if not exists motor;

-- ---------------------------------------------------------------- cadastro
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  setor text not null default 'distribuicao',
  moeda text not null default 'BRL',
  criado_em timestamptz not null default now()
);

create table public.usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  email text not null,
  perfil text not null check (perfil in ('consultor', 'cliente_editor', 'cliente_leitor')),
  cliente_id uuid references public.clientes (id) on delete cascade,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  check ((perfil = 'consultor') = (cliente_id is null))
);

create table public.diagnosticos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  nome text not null,
  periodo_inicio date not null,
  periodo_fim date not null,
  precos_liquidos_de_impostos boolean not null default true,
  status text not null default 'rascunho' check (status in ('rascunho', 'validado', 'calculado', 'publicado')),
  versao_catalogo integer,
  versao_publicada integer,
  calculado_em timestamptz,
  publicado_em timestamptz,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  check (periodo_fim >= periodo_inicio)
);
create index on public.diagnosticos (cliente_id);

-- ---------------------------------------------------------------- ingestão
create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  diagnostico_id uuid not null references public.diagnosticos (id) on delete cascade,
  bloco text not null check (bloco in ('transacoes', 'custos', 'custos_servir', 'descontos_fora_fatura', 'produtos', 'contas')),
  nome_arquivo text not null,
  linhas integer not null default 0,
  status text not null default 'recebendo' check (status in ('recebendo', 'concluido')),
  criado_por uuid,
  criado_em timestamptz not null default now()
);
create index on public.uploads (diagnostico_id, bloco);

create table public.mapeamentos_coluna (
  upload_id uuid not null references public.uploads (id) on delete cascade,
  cliente_id uuid not null,
  diagnostico_id uuid not null references public.diagnosticos (id) on delete cascade,
  campo text not null,
  coluna_origem text not null,
  primary key (upload_id, campo)
);

create table public.validacoes (
  id bigint generated always as identity primary key,
  cliente_id uuid not null,
  diagnostico_id uuid not null references public.diagnosticos (id) on delete cascade,
  bloco text not null,
  regra text not null,
  severidade text not null check (severidade in ('erro', 'alerta')),
  ocorrencias numeric not null,
  total numeric,
  mensagem text not null
);
create index on public.validacoes (diagnostico_id);

create table public.qualidade_blocos (
  cliente_id uuid not null,
  diagnostico_id uuid not null references public.diagnosticos (id) on delete cascade,
  bloco text not null,
  obrigatorio boolean not null,
  presente boolean not null,
  linhas integer not null default 0,
  nota numeric,
  primary key (diagnostico_id, bloco)
);

-- ---------------------------------------------------------------- base normalizada
-- Preços e descontos são valores unitários. Campos numéricos aceitam nulo:
-- a validação conta o que veio vazio em vez de a carga falhar.
create table public.transacoes (
  id bigint generated always as identity primary key,
  cliente_id uuid not null,
  diagnostico_id uuid not null references public.diagnosticos (id) on delete cascade,
  upload_id uuid not null references public.uploads (id) on delete cascade,
  data date,
  nota_fiscal text,
  produto text,
  conta text,
  canal text,
  quantidade numeric,
  preco_lista numeric,
  preco_faturado numeric,
  desc_comercial numeric,
  desc_volume numeric,
  desc_promocional numeric,
  desc_financeiro numeric,
  valida boolean not null default false
);
create index on public.transacoes (diagnostico_id, produto);
create index on public.transacoes (diagnostico_id, conta);

create table public.produtos (
  cliente_id uuid not null,
  diagnostico_id uuid not null references public.diagnosticos (id) on delete cascade,
  codigo text not null,
  descricao text,
  categoria text,
  linha text,
  primary key (diagnostico_id, codigo)
);

create table public.contas (
  cliente_id uuid not null,
  diagnostico_id uuid not null references public.diagnosticos (id) on delete cascade,
  codigo text not null,
  nome text,
  segmento text,
  porte text,
  regiao text,
  vendedor text,
  primary key (diagnostico_id, codigo)
);

create table public.custos (
  id bigint generated always as identity primary key,
  cliente_id uuid not null,
  diagnostico_id uuid not null references public.diagnosticos (id) on delete cascade,
  produto text,
  custo_unitario numeric,
  vigencia_inicio date
);
create index on public.custos (diagnostico_id, produto);

-- Custo de servir como percentual do preço faturado. A regra mais específica vence:
-- por conta, depois por canal, depois a geral (conta e canal vazios).
create table public.custos_servir (
  id bigint generated always as identity primary key,
  cliente_id uuid not null,
  diagnostico_id uuid not null references public.diagnosticos (id) on delete cascade,
  tipo text,
  canal text,
  conta text,
  percentual numeric
);
create index on public.custos_servir (diagnostico_id);

-- Rebates, bonificações e verbas: valor total por conta e mês.
create table public.descontos_fora_fatura (
  id bigint generated always as identity primary key,
  cliente_id uuid not null,
  diagnostico_id uuid not null references public.diagnosticos (id) on delete cascade,
  conta text,
  mes date,
  tipo text,
  valor numeric
);
create index on public.descontos_fora_fatura (diagnostico_id);

-- ---------------------------------------------------------------- catálogo (global, versionado)
create table public.catalogo_versoes (
  versao integer primary key,
  descricao text not null,
  vigente boolean not null default false,
  criado_em timestamptz not null default now()
);

create table public.metricas_catalogo (
  versao integer not null references public.catalogo_versoes (versao),
  codigo text not null,
  dimensao text not null,
  nome text not null,
  unidade text not null,
  -- nota 100 em limiar_bom e 0 em limiar_ruim, linear entre os dois; sem limiar = métrica informativa
  limiar_bom numeric,
  limiar_ruim numeric,
  peso numeric not null default 1,
  ordem integer not null default 0,
  descricao text,
  primary key (versao, codigo)
);

create table public.regras_achado (
  versao integer not null references public.catalogo_versoes (versao),
  codigo text not null,
  dimensao text not null,
  titulo text not null,
  descricao text not null,
  alavanca text,
  parametros jsonb not null default '{}',
  primary key (versao, codigo)
);

create table public.alavancas_catalogo (
  versao integer not null references public.catalogo_versoes (versao),
  codigo text not null,
  nome text not null,
  -- ordem fixa de aplicação na cascata de ganhos
  ordem integer not null,
  descricao text,
  primary key (versao, codigo)
);

create table public.pesos_setor (
  versao integer not null references public.catalogo_versoes (versao),
  setor text not null,
  dimensao text not null,
  peso numeric not null,
  primary key (versao, setor, dimensao)
);

create table public.premissas_padrao (
  versao integer not null references public.catalogo_versoes (versao),
  cenario text not null check (cenario in ('conservador', 'base', 'agressivo')),
  alavanca text not null,
  chave text not null,
  valor numeric not null,
  primary key (versao, cenario, alavanca, chave)
);

-- ---------------------------------------------------------------- resultado
create table public.metricas_resultado (
  id bigint generated always as identity primary key,
  cliente_id uuid not null,
  diagnostico_id uuid not null references public.diagnosticos (id) on delete cascade,
  metrica text not null,
  recorte_tipo text not null default 'total',
  recorte_valor text not null default '',
  valor numeric,
  detalhe jsonb,
  unique (diagnostico_id, metrica, recorte_tipo, recorte_valor)
);

create table public.pontuacoes (
  cliente_id uuid not null,
  diagnostico_id uuid not null references public.diagnosticos (id) on delete cascade,
  dimensao text not null,
  nota numeric,
  parcial boolean not null default false,
  detalhe jsonb,
  primary key (diagnostico_id, dimensao)
);

create table public.achados (
  id bigint generated always as identity primary key,
  cliente_id uuid not null,
  diagnostico_id uuid not null references public.diagnosticos (id) on delete cascade,
  regra text not null,
  dimensao text not null,
  titulo text not null,
  descricao text not null,
  alavanca text,
  valor_exposto numeric,
  evidencia jsonb
);
create index on public.achados (diagnostico_id);

-- ---------------------------------------------------------------- simulação
create table public.cenarios (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null,
  diagnostico_id uuid not null references public.diagnosticos (id) on delete cascade,
  codigo text not null check (codigo in ('conservador', 'base', 'agressivo')),
  unique (diagnostico_id, codigo)
);

create table public.cenario_premissas (
  cenario_id uuid not null references public.cenarios (id) on delete cascade,
  cliente_id uuid not null,
  diagnostico_id uuid not null references public.diagnosticos (id) on delete cascade,
  alavanca text not null,
  chave text not null,
  valor numeric not null,
  -- 'padrao' = veio do catálogo; 'informada' = o consultor alterou
  origem text not null default 'padrao' check (origem in ('padrao', 'informada')),
  primary key (cenario_id, alavanca, chave)
);

create table public.cenario_resultado (
  cenario_id uuid not null references public.cenarios (id) on delete cascade,
  cliente_id uuid not null,
  diagnostico_id uuid not null references public.diagnosticos (id) on delete cascade,
  alavanca text not null,
  ordem integer not null,
  ganho_anual numeric not null,
  receita_afetada numeric not null,
  itens integer not null,
  primary key (cenario_id, alavanca)
);

-- ---------------------------------------------------------------- entrega
-- A publicação guarda o painel inteiro como foi publicado: recalcular depois não muda o que o cliente vê.
create table public.publicacoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null,
  diagnostico_id uuid not null references public.diagnosticos (id) on delete cascade,
  versao integer not null,
  conteudo jsonb not null,
  publicado_por uuid,
  publicado_em timestamptz not null default now(),
  unique (diagnostico_id, versao)
);

create table public.auditoria (
  id bigint generated always as identity primary key,
  cliente_id uuid,
  diagnostico_id uuid,
  usuario_id uuid,
  acao text not null,
  detalhe jsonb,
  em timestamptz not null default now()
);
create index on public.auditoria (diagnostico_id, em);

-- ---------------------------------------------------------------- base de cálculo (interna ao motor)
create table motor.fato (
  diagnostico_id uuid not null references public.diagnosticos (id) on delete cascade,
  transacao_id bigint not null,
  data date not null,
  produto text not null,
  conta text not null,
  canal text not null,
  categoria text not null,
  segmento text not null,
  regiao text not null,
  vendedor text not null,
  quantidade numeric not null,
  rec_lista numeric not null,
  d_comercial numeric not null,
  d_volume numeric not null,
  d_promocional numeric not null,
  d_financeiro numeric not null,
  d_nao_classificado numeric not null,
  rec_faturada numeric not null,
  d_fora_fatura numeric not null,
  cs_frete numeric not null,
  cs_comissao numeric not null,
  cs_prazo numeric not null,
  cs_outros numeric not null,
  rec_pocket numeric not null,
  -- nulo quando o produto não tem custo cadastrado: a linha fica fora das métricas de margem
  custo numeric
);
create index on motor.fato (diagnostico_id, produto);
create index on motor.fato (diagnostico_id, conta);
