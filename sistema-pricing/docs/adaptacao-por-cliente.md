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
| Custo pago em moeda estrangeira | `politica.custos[].moeda` (ex.: `"EUR"`); ausente = moeda da tabela. Só para custo em valor, não em percentual |
| Custo que vale só para alguns valores de dimensão | `politica.custos[].condicoes` (ex.: `{ "temporada": ["alta"], "acomodacao": ["duplo"] }`) |
| Câmbio de referência inicial | `cambios`: `[{ "moeda": "EUR", "taxa": 6.10, "vigenteDe": "2025-11-01" }]`. Depois, o gestor publica pela tela Política (imutável, com vigência) |
| Folga mínima entre o câmbio que zera a margem e o de referência | `politica.limites.folgaCambialMinimaPct`; abaixo dela a cotação pede aprovação |
| Comissão do vendedor | `politica.comissaoVendedor`: `{ "base": "margem" ou "receita", "pct": 10, "margemMinimaPct": 0, "deduzDaMargem": false }`. Informativa quando não deduz da margem |
| Motivos de perda | `organizacao.config.motivosPerda`: lista de `{ codigo, nome, pedeTexto, pedeConcorrente, ativo }`; sem ela vale a lista padrão (preço do concorrente, prazo, escopo, desistiu, sem resposta, outro) |
| Faixas de desconto do painel | `organizacao.config.painel.faixasDesconto` (padrão `[2, 5, 10]`: sem desconto, até 2%, 2 a 5%, 5 a 10%, acima de 10%) |
| Envio ao diagnóstico | `organizacao.config.envioDiagnostico`: `{ "ativo": false, "destino": null, "modoConta": "pseudonimo" ou "agregado", "diaDoMes": 2 }`. Desligado por padrão; ligar fica na auditoria. Segredos `SEGREDO_PSEUDONIMO` e `CHAVE_ENVIO_DIAGNOSTICO` no cofre da função |
| Linha de base do diagnóstico (alerta de desconto) | `organizacao.config.linhaDeBase.descontoMedioPct`: acima dela, o gestor recebe aviso uma vez por dia (fluxo 03) |
| Meta de margem (alerta de margem) | `politica.limites.margemMetaPct`: com as aceitas do mês abaixo dela, o gestor recebe aviso uma vez por dia |
| Câmbio de mercado | Nada a configurar: o fluxo 09 busca a PTAX das moedas usadas nos custos da política vigente. Ligado, o painel compara a exposição cambial com a PTAX |
| Pilotos | Pela tela Pilotos (gestor de pricing): período, Nota de Decisão, regra alternativa (tabela, política ou as duas), critério (vendedor, canal ou unidade) e os dois grupos. Combine o critério com o gestor antes |
| Dados sintéticos da demonstração | `demo` (reajuste, trajetória do câmbio, sazonalidade, probabilidade de canal) e `usuarios[].demo.perfilDesconto` (`baixo`, `medio`, `alto`). Só a carga sintética lê esses campos |

A demonstração usa a operadora de turismo fictícia (`demo-turismo.json`): custos de aéreo e hotel em euro,
custos que dependem da temporada e da acomodação, câmbio de referência, comissão do vendedor e motivos de perda.
Os quatro casos de referência reproduzem a tabela de calibração da Nota nº 02 centavo a centavo.

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
