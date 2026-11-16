# Segurança: onde cada barreira está no código

| Barreira | Controle | Onde | Como é verificado |
| --- | --- | --- | --- |
| Identidade | Senha de 12+ caracteres, sessão com expiração, cadastro público desligado | `supabase/config.toml`, rota `/convites/aceitar` | teste `usuarios.test.ts` |
| Identidade | Segundo fator (TOTP) obrigatório para administrador, gestor, aprovador, leitura e suporte | `papeis.exige_mfa`, `app.mfa_ok()`, checagem na API | `rls.test.ts` (com um fator o perfil não enxerga nada) e `cotacoes.test.ts` |
| Autorização | RLS em 100% das tabelas; nenhuma escrita pelo navegador | `migrations/..._rls.sql` | `rls.test.ts`: lê e grava como cada perfil |
| Autorização | Custo e margem fora do alcance do canal | `resultadoPublico()` no motor, visão `v_cotacao_versoes` | testes do motor, da API e de RLS, e o roteiro no navegador |
| Autorização | Ninguém aprova a própria cotação; alçada conferida no servidor | rota `/cotacoes/:id/aprovacao`, restrição na tabela `aprovacoes` | `cotacoes.test.ts` |
| Integridade | Versões imutáveis, máquina de estados e "só emite com aprovação" também no banco | gatilhos em `..._regras.sql` e `..._cotacoes.sql` | testes que tentam burlar por SQL direto |
| Segredos | Chave de serviço só na função e no n8n; convite e chave de API guardados como hash | `cripto.ts`, `usuarios.ts`, `administracao.ts` | testes; varredura de segredos no fluxo de publicação |
| Dado pessoal | Documento cifrado (AES-256-GCM) em tabela sem política de leitura; fora das versões | `cotacao_dados_pessoais` | `cotacoes.test.ts` |
| Rastreio | Auditoria só de inserção, por gatilho, na mesma transação | `..._registro.sql` | `cotacoes.test.ts` |
| API | Validação de formato, limite por usuário e por chave, CORS restrito, idempotência | `app.ts` | testes |
| Frontend | CSP e demais cabeçalhos | `apps/web/next.config.ts` | conferência manual |
| IA | Só o servidor chama; entrada mascarada; chamadas registradas; nunca grava preço | `ia.ts`, `rotas/ia.ts` | `usuarios.test.ts` |

## LGPD

- Localizar e anonimizar os dados de um titular: tela Configurações (rotas `/lgpd/localizar` e `/lgpd/anonimizar`).
- Exportar: `pnpm --filter @pricing/ferramentas exportar`.
- Retenção: rota `/automacao/retencao`, chamada pelo fluxo diário do n8n; prazos em `organizacao.config.retencao`.
- Aviso de incidente em 24 horas e acordo de tratamento de dados são cláusulas de contrato, não código.

## O que não está coberto pelo código

- Rotação semestral de chaves, revisão trimestral de ambientes e amostra mensal da auditoria são rotinas do Pricing Ops.
- As visões de projeção rodam com o dono (não aplicam o RLS das tabelas de base) e trazem o próprio filtro.
  O linter do Supabase aponta isso como aviso; é intencional.
- As exigências da Susep para serviços terceirizados precisam ser conferidas com o jurídico do cliente.
