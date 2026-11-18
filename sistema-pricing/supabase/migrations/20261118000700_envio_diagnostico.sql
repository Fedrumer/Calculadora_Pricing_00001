-- A10: envio de dados ao diagnóstico. Os dois sistemas continuam
-- independentes: todo mês esta instância gera um pacote pseudonimizado
-- (contrato pacote-diagnostico/1) e o envia por uma chave que só deposita.
-- Nada aqui dá à consultoria acesso ao banco do cliente.

-- Cada pacote gerado: o ZIP fica no bucket privado "diagnostico" do próprio
-- cliente; aqui ficam competência, contagens, hash e o recibo do envio.
create table public.envios_diagnostico (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id),
  competencia date not null check (competencia = date_trunc('month', competencia)::date),
  contrato text not null default 'pacote-diagnostico/1',
  modo_conta text not null check (modo_conta in ('pseudonimo', 'agregado')),
  arquivo text not null,
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  tamanho_bytes integer not null check (tamanho_bytes > 0),
  linhas jsonb not null,
  status text not null default 'gerado' check (status in ('gerado', 'enviado', 'confirmado', 'falhou')),
  recibo jsonb,
  erro text,
  origem text not null check (origem in ('tela', 'automacao')),
  acionado_por uuid references public.usuarios (id),
  criado_em timestamptz not null default now(),
  enviado_em timestamptz
);
create index envios_diagnostico_competencia on public.envios_diagnostico (org_id, competencia desc, criado_em desc);

create trigger envios_diagnostico_auditoria after insert or update on public.envios_diagnostico
  for each row execute function app.auditar();

-- RLS: negar por padrão. Só o administrador (com segundo fator, pela barreira)
-- lê o histórico; quem grava é a API.
alter table public.envios_diagnostico enable row level security;
revoke all on public.envios_diagnostico from public, anon;
revoke insert, update, delete, truncate, references, trigger on public.envios_diagnostico from authenticated;
grant select on public.envios_diagnostico to authenticated;
create policy barreira_org_mfa on public.envios_diagnostico as restrictive for all to authenticated
  using (org_id = (select app.org_id()) and (select app.mfa_ok()));
create policy ler on public.envios_diagnostico for select to authenticated using ((select app.tem_papel('admin')));

-- Visões internas do pacote. Ficam no esquema app (fora da API pública) e só o
-- papel de serviço as lê. Os valores vêm da versão gravada de cada cotação:
-- nada é recalculado. As duas colunas de identificação do cliente final
-- (nome e documento cifrado) existem só para a API calcular o código
-- pseudônimo; nunca vão para o pacote.
create view app.v_pacote_cotacoes with (security_invoker = true) as
select c.id, c.org_id, c.numero, c.criado_em, c.criado_em::date as data, c.status,
       c.dono_id, c.chave_api_id, c.desfecho_categoria, c.concorrente_preco,
       p.codigo as produto, ca.codigo as canal,
       v.entrada -> 'dimensoes' as dimensoes,
       coalesce((v.resultado ->> 'multiplicador')::numeric, 1) as quantidade,
       v.preco_base, v.preco_final, v.desconto_pct,
       coalesce((v.resultado ->> 'descontoValor')::numeric, 0) as desconto_valor,
       coalesce((v.resultado ->> 'campanhaValor')::numeric, 0) as campanha_valor,
       v.comissao_pct, v.comissao_valor, v.margem_valor, v.margem_pct, v.veredito, v.nivel_alcada,
       v.comissao_vendedor_valor, coalesce((v.resultado #>> '{comissaoVendedor,deduzidaDaMargem}')::boolean, false) as comissao_vendedor_deduzida,
       coalesce(v.resultado -> 'detalhamento', '[]'::jsonb) as detalhamento,
       v.cambios, v.motor_versao,
       c.cliente_nome as identificacao_nome, dp.documento_cifrado as identificacao_documento
from public.cotacoes c
join public.cotacao_versoes v on v.id = c.versao_atual_id
join public.produtos p on p.id = c.produto_id
left join public.canais ca on ca.id = c.canal_id
left join public.cotacao_dados_pessoais dp on dp.cotacao_id = c.id
where c.status in ('emitida', 'aceita', 'perdida', 'expirada');

-- Produto do pacote: código e nome, com as dimensões de categoria na ordem do
-- cadastro (o código do pacote junta o produto com esses valores).
create view app.v_pacote_produtos with (security_invoker = true) as
select p.org_id, p.codigo, p.nome,
       coalesce((select jsonb_agg(jsonb_build_object('codigo', d.codigo, 'nome', d.nome, 'valores', d.valores) order by d.ordem, d.codigo)
                 from public.dimensoes d
                 where d.org_id = p.org_id and d.tipo = 'categoria' and d.codigo = any (p.dimensoes)), '[]'::jsonb) as dimensoes
from public.produtos p;

revoke all on app.v_pacote_cotacoes, app.v_pacote_produtos from public, anon, authenticated;
grant select on app.v_pacote_cotacoes, app.v_pacote_produtos to service_role;

-- Bucket privado do pacote, sem política de leitura direta: o administrador
-- baixa por link assinado de curta duração emitido pela API.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('diagnostico', 'diagnostico', false)
    on conflict (id) do nothing;
  end if;
end $$;
