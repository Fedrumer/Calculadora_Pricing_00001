-- A9 + A10: piloto e braço passam a sair no cotacoes.csv do pacote ao diagnóstico.
-- Fica numa migração própria, depois da 0700 (que cria a visão do pacote) e da
-- 0600 (que cria as colunas de piloto em cotacoes), porque a ordem dos arquivos
-- não acompanha a ordem em que os ajustes foram feitos.
create or replace view app.v_pacote_cotacoes with (security_invoker = true) as
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
       c.cliente_nome as identificacao_nome, dp.documento_cifrado as identificacao_documento,
       c.piloto_id, c.braco
from public.cotacoes c
join public.cotacao_versoes v on v.id = c.versao_atual_id
join public.produtos p on p.id = c.produto_id
left join public.canais ca on ca.id = c.canal_id
left join public.cotacao_dados_pessoais dp on dp.cotacao_id = c.id
where c.status in ('emitida', 'aceita', 'perdida', 'expirada');
revoke all on app.v_pacote_cotacoes from public, anon, authenticated;
grant select on app.v_pacote_cotacoes to service_role;
