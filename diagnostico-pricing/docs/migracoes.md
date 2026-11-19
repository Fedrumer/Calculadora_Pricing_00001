# Migrações: arquivo e versão registrada no projeto

O projeto Supabase `diagnostico_pricing` recebe as migrações pelo conector, que registra cada uma com a hora
da aplicação como versão. Por isso a versão no projeto difere do nome do arquivo. Esta tabela é o de-para:
toda migração nova entra aqui no mesmo pull request em que é aplicada.

Não rode `supabase db push` neste projeto sem antes alinhar o histórico. Para alinhar, marque as versões do
projeto como revertidas e as dos arquivos como aplicadas, uma por uma, com `supabase migration repair`. Enquanto
isso não for feito, continue aplicando pelo conector e registrando aqui.

| Arquivo | Versão no projeto | Nome no projeto |
| --- | --- | --- |
| `20261117000100_esquema.sql` | `20261117003953` | `esquema` |
| `20261117000200_catalogo.sql` | `20261117004012` | `catalogo` |
| `20261117000300_motor.sql` (primeira metade: validação, base e métricas) | `20261117015440` | `motor_validacao_e_metricas` |
| `20261117000300_motor.sql` (segunda metade: pontuação, achados, simulação e painel) | `20261117015610` | `motor_pontuacao_achados_simulacao` |
| `20261117000400_api.sql` | `20261117015725` | `api` |
| `20261117000500_rls.sql` | `20261117015756` | `rls` |
| `20261118000100_turismo.sql` (estrutura e catálogo versão 2: linhas 1 a 97) | `20261118145833` | `turismo_estrutura_e_catalogo` |
| `20261118000100_turismo.sql` (validação: linhas 98 a 283) | `20261119004416` | `turismo_validacao` |
| `20261118000100_turismo.sql` (base de cálculo e métricas de turismo: linhas 284 a 490) | `20261119004543` | `turismo_base_e_metricas` |
| `20261118000100_turismo.sql` (pontuação, painel, API e acesso: linhas 491 em diante) | `20261119004652` | `turismo_pontuacao_api_e_acesso` |
| `20261119000100_simulacao.sql` (tabelas, catálogo de distribuições e RLS) | `20261119173253` | `simulacao_tabelas` |
| `20261119000100_simulacao.sql` (base da simulação, gravação e leitura) | `20261119173339` | `simulacao_base_e_gravacao` |
| `20261119000100_simulacao.sql` (carga do bloco capacidade e permissões das funções) | `20261119173440` | `simulacao_carga_e_acesso` |

Edge Functions publicadas: `simular` (P2), a partir de `supabase/functions/simular/index.js`, com verificação de JWT.

Arquivos grandes foram aplicados em partes; o conteúdo somado é o do arquivo, conferido por hash do corpo de
cada função (37 funções idênticas ao banco local dos testes em 19/11/2026).

## Projeto do sistema de pricing (`Calculadora_Pricing_00001`)

| Mudança | Versão no projeto | Nome no projeto |
| --- | --- | --- |
| RLS ligado em `app.segredos_demo` (P0); a tabela é criada pela própria API em `sistema-pricing/supabase/functions/api/src/segredos-demo.ts`, que agora também liga o RLS | `20261118142959` | `rls_segredos_demo` |
