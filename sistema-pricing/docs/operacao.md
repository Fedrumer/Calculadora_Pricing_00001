# Operação

## Ambientes

Desenvolvimento local (`pnpm local`), homologação e produção, cada um com o próprio projeto Supabase.
Homologação não recebe dado pessoal real. O ambiente de demonstração serve de homologação do núcleo.

## Publicação

`.github-modelo/ci.yml` é o fluxo: varredura de segredos, testes do motor, testes de API e de RLS,
build, migração e deploy. Produção só por esse fluxo, com aprovação manual.

## Preservação de dados

| Camada | Como | Comando |
| --- | --- | --- |
| 1. Backup do provedor | Diário, automático | painel do Supabase |
| 2. PITR | Complemento pago; decisão em aberto | painel do Supabase |
| 3. Cópia externa | Banco (esquemas `public` e `app`, mais os usuários de autenticação) e arquivos, cifrados com AES-256-GCM | `pnpm --filter @pricing/ferramentas copia -- --registrar` |

A cópia externa grava em `COPIA_DESTINO`, que deve ser um volume ou bucket **do cliente, em outra conta de nuvem**.
Rotação: 35 diárias e 12 mensais.

### Teste de restauração (trimestral)

```bash
COPIA_ARQUIVO=/mnt/copias/banco-AAAA-MM-DDTHH-MM-SS.sql.gz.enc COPIA_SENHA=... \
RESTAURACAO_DB_URL=postgresql://.../pricing_restauracao SUPABASE_DB_URL=... \
pnpm --filter @pricing/ferramentas restauracao -- --registrar
```

Restaura em um banco temporário, compara a contagem de registros e recalcula uma amostra de 60 cotações
com as regras gravadas nelas. O resultado aparece no painel, em "Prova de eficiência". Backup não testado não conta.

Para restaurar em um projeto Supabase novo (que já tem os esquemas `auth` e `extensions`), acrescente `--sem-compat`.

### Contingência

A cada publicação de tabela ou política a API gera a planilha de contingência (`.xlsx`) com preços, fatores,
limites, alçadas e comissões, sem custo nem margem. Ela fica em Tabelas e regras. As cotações feitas por ela
são lançadas depois com a origem "contingência".

### Saída do cliente

`pnpm --filter @pricing/ferramentas exportar -- --destino ./exportacao` gera o SQL completo e um CSV por tabela.

## Demonstração

`AMBIENTE=demonstracao SUPABASE_DB_URL=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... DEMO_SENHA=... pnpm demo:repor`
volta os dados ao estado inicial. Agende toda noite e rode antes de cada reunião. O comando recusa rodar se a
organização instalada não for a da demonstração.

Os perfis com segundo fator obrigatório cadastram o aplicativo autenticador no primeiro acesso depois de cada reposição.

## Os cinco incidentes mais prováveis

| Sintoma | Primeiro passo |
| --- | --- |
| Ninguém consegue cotar | `GET /saude`; depois `/automacao/saude`: falta tabela ou política vigente? |
| Preço diferente do esperado | Abrir a cotação: o detalhamento mostra etapa por etapa e as versões de tabela e política usadas. Rodar os casos de referência. |
| Aprovação parada | Fila de aprovações; conferir alçada, ausência e substituto do aprovador. |
| Usuário não entra | Usuários e canais: situação, validade do acesso, segundo fator. |
| Tabela publicada com erro | Publicar nova versão corrigida (a anterior é imutável); as cotações já emitidas não mudam. |
