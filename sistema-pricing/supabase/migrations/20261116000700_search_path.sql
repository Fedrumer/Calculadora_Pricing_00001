-- Fixa o search_path das funções de gatilho e de apoio (recomendação do
-- verificador de segurança do Supabase): nenhuma delas resolve nomes pelo
-- caminho de busca de quem chama.
alter function app.config(text) set search_path = '';
alter function app.tocar_atualizado_em() set search_path = '';
alter function app.proibir_exclusao() set search_path = '';
alter function app.proteger_versao_publicada() set search_path = '';
alter function app.proteger_filho_de_versao() set search_path = '';
alter function app.versao_imutavel() set search_path = '';
alter function app.transicao_cotacao() set search_path = '';
alter function app.cotacao_sem_delete() set search_path = '';
alter function app.decisao_aprovacao() set search_path = '';
alter function app.auditoria_so_insercao() set search_path = '';
