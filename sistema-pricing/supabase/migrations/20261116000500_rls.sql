-- Negar por padrão: toda tabela nasce com RLS ativo e sem acesso. A permissão
-- de leitura é concedida por perfil e escopo. Nenhuma escrita é permitida pelo
-- navegador: cotação, regra e usuário só mudam pelas funções de servidor.

do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('revoke all on public.%I from anon, authenticated', t.tablename);
  end loop;
end $$;

grant usage on schema app to authenticated, service_role;
revoke execute on all functions in schema app from public, anon, authenticated;
grant execute on all functions in schema app to service_role;
grant execute on function app.org_id(), app.tem_papel(text[]), app.interno(), app.mfa_ok(), app.canais_ids()
  to authenticated;

-- Tabelas que o navegador pode ler (sempre filtradas pelas políticas abaixo).
grant select on
  public.organizacoes, public.unidades, public.canais, public.papeis, public.usuarios, public.usuario_papel,
  public.dimensoes, public.produtos, public.componentes, public.tabelas_preco, public.itens_tabela, public.fatores,
  public.politicas, public.parametros_custo, public.campanhas, public.casos_referencia,
  public.cotacoes, public.cotacao_versoes, public.aprovacoes, public.anexos,
  public.eventos_auditoria, public.chamadas_ia, public.registros_backup
to authenticated;

-- Barreira comum (restritiva): mesma organização, usuário ativo e, para perfis
-- com segundo fator obrigatório, sessão autenticada com dois fatores (aal2).
do $$
declare
  t text;
begin
  foreach t in array array[
    'unidades', 'canais', 'papeis', 'usuarios', 'usuario_papel', 'dimensoes', 'produtos', 'componentes',
    'tabelas_preco', 'itens_tabela', 'fatores', 'politicas', 'parametros_custo', 'campanhas', 'casos_referencia',
    'cotacoes', 'cotacao_versoes', 'aprovacoes', 'anexos', 'eventos_auditoria', 'chamadas_ia', 'registros_backup'
  ] loop
    execute format(
      'create policy barreira_org_mfa on public.%I as restrictive for all to authenticated
         using (org_id = (select app.org_id()) and (select app.mfa_ok()))', t);
  end loop;
end $$;

create policy barreira_org_mfa on public.organizacoes as restrictive for all to authenticated
  using (id = (select app.org_id()) and (select app.mfa_ok()));
create policy ler_propria_org on public.organizacoes for select to authenticated using (true);

-- Acesso -----------------------------------------------------------------------
create policy ler on public.unidades for select to authenticated using (true);
create policy ler on public.papeis for select to authenticated using (true);
create policy ler on public.canais for select to authenticated
  using ((select app.interno()) or (select app.tem_papel('vendedor')) or id = any ((select app.canais_ids())::uuid[]));
create policy ler on public.usuarios for select to authenticated
  using (id = (select auth.uid()) or (select app.interno()));
create policy ler on public.usuario_papel for select to authenticated
  using (usuario_id = (select auth.uid()) or (select app.tem_papel('admin', 'leitura', 'suporte')));

-- Regra ------------------------------------------------------------------------
-- Catálogo: todo perfil que cota precisa dele para preencher o formulário.
create policy ler on public.dimensoes for select to authenticated using (true);
create policy ler on public.produtos for select to authenticated using (true);
create policy ler on public.componentes for select to authenticated using (true);

-- Tabelas de preço: perfis internos veem tudo; vendedor só o que está publicado;
-- canal não lê a tabela (recebe o preço pela simulação).
create policy ler on public.tabelas_preco for select to authenticated
  using ((select app.interno()) or (status = 'publicada' and (select app.tem_papel('vendedor'))));
create policy ler on public.itens_tabela for select to authenticated
  using (exists (select 1 from public.tabelas_preco t where t.id = tabela_id));
create policy ler on public.fatores for select to authenticated
  using (exists (select 1 from public.tabelas_preco t where t.id = tabela_id));
create policy ler on public.campanhas for select to authenticated
  using ((select app.interno()) or (select app.tem_papel('vendedor')));

-- Política comercial, custos e casos de referência: só perfis internos.
create policy ler on public.politicas for select to authenticated using ((select app.interno()));
create policy ler on public.parametros_custo for select to authenticated using ((select app.interno()));
create policy ler on public.casos_referencia for select to authenticated using ((select app.interno()));

-- Cotação ----------------------------------------------------------------------
create policy ler on public.cotacoes for select to authenticated
  using ((select app.interno()) or dono_id = (select auth.uid()));
-- Versão completa (com custo e margem): perfis internos e o vendedor dono.
-- O usuário de canal lê a visão v_cotacao_versoes, que não tem essas colunas.
create policy ler on public.cotacao_versoes for select to authenticated
  using (
    (select app.interno())
    or ((select app.tem_papel('vendedor')) and exists (
          select 1 from public.cotacoes c where c.id = cotacao_id and c.dono_id = (select auth.uid())))
  );
create policy ler on public.aprovacoes for select to authenticated
  using ((select app.interno()) or exists (select 1 from public.cotacoes c where c.id = cotacao_id));
create policy ler on public.anexos for select to authenticated
  using (exists (select 1 from public.cotacoes c where c.id = cotacao_id));

-- Registro ---------------------------------------------------------------------
create policy ler on public.eventos_auditoria for select to authenticated
  using ((select app.tem_papel('admin', 'leitura', 'suporte')));
create policy ler on public.chamadas_ia for select to authenticated
  using ((select app.tem_papel('admin', 'leitura', 'suporte')));
create policy ler on public.registros_backup for select to authenticated
  using ((select app.interno()));

-- Sem política (inalcançáveis pelo navegador): convites, chaves_api, webhooks,
-- cotacao_dados_pessoais, contadores, eventos_saida, idempotencia,
-- limites_requisicao, metricas_api.
