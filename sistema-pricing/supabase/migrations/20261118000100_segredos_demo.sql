-- A0: fecha a tabela de segredos da demonstração. Ela só existe no ambiente de
-- demonstração (a função a cria na primeira execução); aqui ela passa a ter RLS
-- ligado, sem política, e nenhuma permissão para anon e authenticated.
create table if not exists app.segredos_demo (
  nome text primary key,
  valor text not null,
  criado_em timestamptz not null default now()
);
alter table app.segredos_demo enable row level security;
revoke all on app.segredos_demo from public, anon, authenticated;
