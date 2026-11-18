-- A4: comissão do vendedor gravada em cada versão (as antigas ficam com zero).
-- Só perfis internos e o vendedor dono leem cotacao_versoes; a visão do canal
-- (v_cotacao_versoes) lista as colunas uma a uma e não inclui esta.
alter table public.cotacao_versoes add column comissao_vendedor_valor numeric(16, 2) not null default 0;
