# Adaptação por cliente

A base tem três camadas. Quanto mais a adaptação ficar na segunda, mais o Sprint cabe no prazo.

## 1. Núcleo (não muda)

Motor, ciclo de cotação, alçadas, usuários e perfis, auditoria, segurança, backup, painel, API, camada de IA.
Recebe atualizações do repositório de origem por migração versionada.

## 2. Configuração (horas)

Tudo em `config/clientes/<cliente>.json`, carregado por `pnpm instalar`, e depois mantido pelas telas.

| O que | Onde |
| --- | --- |
| Produtos, componentes obrigatórios e opcionais | `produtos` |
| Dimensões de preço (categorias ou faixas numéricas) | `dimensoes`. O motor não conhece "região" ou "faixa etária": recebe o que estiver cadastrado. |
| Quais dimensões multiplicam o preço (dias, vidas, quantidade) | `produtos[].multiplicadores` |
| Tabela e fatores | `tabela.itens` (chave ausente ou `*` vale para qualquer valor; vence o item mais específico) e `tabela.fatores` |
| Ordem das etapas e base de cada percentual | `politica.etapas`. Tipos: `preco_base`, `fatores` (multiplicativa ou aditiva), `campanha`, `desconto`, `arredondamento`, `comissao`, `impostos`, `custos`, `extensao`. A base é `{ "de": "preco" ou id de etapa, "menos": [deduções anteriores] }`. |
| Comissão por dentro ou por fora | etapa `comissao`, `modo`: `deduz_da_margem` ou `acrescenta_ao_preco` |
| Impostos e custos | `politica.custos` (percentual, valor fixo ou valor por unidade; por produto ou geral) |
| Limites e alçadas | `politica.limites` e `politica.alcadas` |
| Comissões | `politica.comissoes` (por canal e, se quiser, por produto) |
| Arredondamento | `politica.arredondamento` (casas e modo) |
| Campanhas e acumulação | `campanhas` |
| Perfis ativos e segundo fator | tabela `papeis` |
| Formulário, proposta, prazos, retenção, módulos | `organizacao.config` |
| Casos de referência | `casosReferencia`: cotações reais do cliente calculadas à mão |

A segunda empresa fictícia (`demo-distribuidor.json`) existe para provar isto: fatores aditivos em vez de
multiplicativos, impostos antes da comissão, comissão sobre o preço líquido de impostos.

## 3. Extensão (dias, orçada à parte)

- **Regra de cálculo fora do padrão:** função pura em `supabase/functions/_shared/extensoes/index.ts`,
  chamada por uma etapa `{ "tipo": "extensao", "funcao": "nome" }`. A atualização do núcleo não toca nessa pasta.
- **Integração com ERP ou CRM:** fluxo novo no n8n, consumindo a caixa de saída (`GET /automacao/eventos`) ou
  a API de canal (`/v1/cotacoes`).
- **Relatório específico:** visão ou função SQL nova, em migração própria do cliente.

## Limites conhecidos da base

- Uma cotação tem um produto (com componentes). Cotação com vários produtos na mesma proposta é extensão.
- Uma tabela de preço vigente por data cobre todos os produtos.
- Campanhas não são versionadas junto com a tabela; a cotação guarda quais foram aplicadas.
- SSO corporativo (SAML) é configuração do Supabase Auth do cliente; a aplicação não tem tela própria para isso.
