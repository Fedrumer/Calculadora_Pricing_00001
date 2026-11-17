-- Isolamento no banco. Toda tabela nega por padrão; o navegador só lê, e só o que a política libera.
--   consultor        tudo
--   cliente_editor   o cadastro, as cargas e a qualidade dos dados do próprio cliente, e o painel publicado
--   cliente_leitor   o painel publicado do próprio cliente
-- Escrita acontece apenas pelas funções de public, que conferem o perfil.
-- n8n, rotinas e consulta por MCP usam credenciais de serviço, que ignoram o RLS: cada uma delas
-- deve receber o diagnostico_id de forma explícita, e a consulta deve usar um papel somente leitura.

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('revoke all on public.%I from anon, authenticated', t.tablename);
    execute format('grant select on public.%I to authenticated', t.tablename);
  end loop;
end $$;
alter table motor.fato enable row level security;
revoke all on all tables in schema motor from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- só o consultor: base normalizada, catálogo, resultado, simulação e auditoria
do $$
declare t text;
begin
  foreach t in array array['transacoes', 'produtos', 'contas', 'custos', 'custos_servir', 'descontos_fora_fatura', 'mapeamentos_coluna',
                           'catalogo_versoes', 'metricas_catalogo', 'regras_achado', 'alavancas_catalogo', 'pesos_setor', 'premissas_padrao',
                           'metricas_resultado', 'pontuacoes', 'achados', 'cenarios', 'cenario_premissas', 'cenario_resultado', 'auditoria'] loop
    execute format($p$create policy consultor on public.%I for select to authenticated using (public.perfil_atual() = 'consultor')$p$, t);
  end loop;
end $$;

create policy leitura on public.clientes for select to authenticated
  using (public.perfil_atual() = 'consultor' or id = public.cliente_atual());

create policy leitura on public.usuarios for select to authenticated
  using (public.perfil_atual() = 'consultor' or id = auth.uid());

create policy leitura on public.diagnosticos for select to authenticated
  using (public.perfil_atual() = 'consultor'
         or (cliente_id = public.cliente_atual() and (versao_publicada is not null or public.perfil_atual() = 'cliente_editor')));

create policy leitura on public.publicacoes for select to authenticated
  using (public.perfil_atual() = 'consultor' or cliente_id = public.cliente_atual());

do $$
declare t text;
begin
  foreach t in array array['uploads', 'validacoes', 'qualidade_blocos'] loop
    execute format($p$create policy leitura on public.%I for select to authenticated
      using (public.perfil_atual() = 'consultor' or (public.perfil_atual() = 'cliente_editor' and cliente_id = public.cliente_atual()))$p$, t);
  end loop;
end $$;

-- funções: nada para anon; só as de public para quem tem sessão
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema motor from public, anon, authenticated;
grant execute on all functions in schema public to authenticated, service_role;
grant usage on schema motor to authenticated, service_role;
grant execute on function motor.montar_painel(uuid) to authenticated;
grant execute on all functions in schema motor to service_role;
