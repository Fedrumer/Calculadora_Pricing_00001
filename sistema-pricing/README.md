# Sistema de Pricing

Base do sistema de cotação com a política comercial embutida, construída a partir do documento
**Arquitetura do Sistema de Pricing**. Uma instalação isolada por cliente, gerada deste mesmo código;
o que muda de um cliente para outro é configuração.

Esta pasta é independente do restante do repositório e não reaproveita nada dele: motor e esquema
foram escritos do zero. Para levá-la a um repositório próprio e privado, com o histórico de autoria:

```bash
git subtree split --prefix=sistema-pricing -b sistema-pricing
git push git@github.com:<conta>/sistema-pricing.git sistema-pricing:main
```

A função da demonstração já contém o código (não depende mais deste repositório ser público). As telas da
demonstração, porém, são publicadas pelo GitHub Pages deste repositório: em conta gratuita, o Pages não
publica repositório privado. Antes de fechar o repositório, decida onde as telas ficam (ver `docs/pendencias.md`).

## Novidades da v3 (`docs/ajustes-v3.md`)

- Custos em moeda estrangeira, câmbio de referência publicado pelo gestor e o "câmbio que zera a margem".
- Comissão do vendedor, que ele vê na própria cotação; o canal nunca vê.
- Motivo de perda em lista configurável, com o preço do concorrente.
- Painel com desconto por vendedor, conversão por faixa de desconto, perdas por categoria e exposição cambial.
- Envio mensal ao diagnóstico de um pacote pseudonimizado (sem nome, e-mail, documento nem texto livre), desligado por padrão.
- A demonstração passou a ser a Operadora Exemplo Turismo (fictícia).
- Simulador da regra de comissão do vendedor (atual contra proposta) sobre o histórico, com exportação em CSV.
- Alertas ao gestor: margem do mês abaixo da meta, desconto acima da linha de base e câmbio de mercado (PTAX do
  Banco Central) acima da referência ou deixando cotações aceitas sem margem.
- Piloto com grupo de controle: parte da equipe cota com uma regra alternativa e o painel compara os dois grupos.

## O que tem aqui

| Pasta | Conteúdo |
| --- | --- |
| `supabase/functions/_shared/motor` | Motor de cálculo: TypeScript puro, sem banco, relógio ou rede. Casos de referência como teste. |
| `supabase/migrations` | Banco: quatro domínios, `org_id` em tudo, RLS negando por padrão, versões imutáveis, auditoria só de inserção. |
| `supabase/functions/api` | API de negócio (Edge Function): a única que chama o motor e grava. |
| `supabase/functions/_shared/extensoes` | Ponto de extensão para regra de cálculo que não cabe nas etapas padrão. |
| `apps/web` | Aplicação web em Next.js. Não contém regra de preço. |
| `n8n/workflows` | Dez fluxos: avisos, lembretes, rotina diária (com alertas de margem), importação, relatório, cópia externa, saúde, revisão de acessos, câmbio de mercado (PTAX) e envio ao diagnóstico. |
| `config/clientes` | Uma configuração por cliente. Vêm três empresas fictícias: a operadora de turismo da demonstração, assistência e distribuidor B2B. |
| `ferramentas` | Instalação por configuração, dados sintéticos, ambiente local sem Docker, cópia externa, teste de restauração, exportação de saída, roteiro de demonstração automatizado. |
| `publicacao` | A função `api` pronta para publicar com o código dentro (ver `publicacao/LEIA-ME.md`). |
| `docs` | Operação, segurança, adaptação por cliente, os ajustes da v3 (`ajustes-v3.md`) e o que ainda falta decidir. |

## Rodar na sua máquina

Precisa de Node 22, pnpm e um Postgres 16 local (sem Docker).

```bash
pnpm install
# uma vez: usuário e permissão no Postgres local
psql -U postgres -c "create role pricing superuser login password 'pricing'"

pnpm test                 # motor (52) + API e RLS (122)
pnpm local                # banco, emulador do Supabase, operadora de turismo fictícia, 12 meses de dados, cópia e restauração
# em outro terminal, com as três variáveis NEXT_PUBLIC_* que o comando acima imprime em apps/web/.env.local:
pnpm dev:web              # http://localhost:3000
node ferramentas/e2e/roteiro.mjs ./capturas   # o roteiro de 20 minutos no navegador, com 49 conferências
```

`pnpm local -- --config demo-distribuidor.json` (ou `demo-assistencia.json`) sobe outra empresa fictícia, com outra ordem de
etapas, outras dimensões e outros impostos, sem mudar uma linha de código.

O emulador local (`ferramentas/src/local/emulador.ts`) cobre só o que a aplicação usa do Supabase.
Ele aplica o RLS de verdade, mas não substitui a homologação em um projeto Supabase real.

## Instalar para um cliente

1. Crie o projeto Supabase **na conta do cliente**, região São Paulo, e o repositório do cliente.
2. `supabase link` e `supabase db push` (migrações).
3. Defina os segredos da função (`.env.exemplo`, inclusive `SEGREDO_PSEUDONIMO`) e publique: `supabase functions deploy api --no-verify-jwt`
   (ou a pasta `publicacao/`, pela API de gerenciamento, como em `publicacao/LEIA-ME.md`).
4. Escreva `config/clientes/<cliente>.json` a partir do diagnóstico, com os casos de referência calculados à mão.
5. `SUPABASE_DB_URL=... URL_APLICACAO=... pnpm instalar -- --config <cliente>.json --admin fulano@cliente.com.br`
   A instalação só grava se a configuração for coerente e 100% dos casos de referência baterem.
   O comando imprime o convite do primeiro administrador; os demais usuários entram por convite, pela tela.
6. Publique `apps/web` na hospedagem do cliente com `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
7. Importe os fluxos de `n8n/workflows`, configure as credenciais e ative. O envio ao diagnóstico (fluxo 10)
   começa desligado: nada sai até o administrador do cliente ligar na tela "Envio ao diagnóstico".
8. Rode a primeira cópia externa e o primeiro teste de restauração (`docs/operacao.md`).

Detalhes em `docs/`.
