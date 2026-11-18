<!-- Cópia do documento "Ajustamento do sistema de diagnóstico ao plano v3" (https://claude.ai/artifact/PcVRGmBvcp4ZwbZBzfxSVy), exportada em 18/11/2026. O original é o documento; esta cópia serve de referência para as sessões de implementação. -->

# Ajustamento do sistema de diagnóstico ao plano v3

2026-11-18 · Fernando Duarte Bezerra

Este documento diz ao Claude Code o que mudar no sistema de diagnóstico já construído para atender o plano v3, em dez pacotes, sem quebrar o que hoje passa nos testes. A base é a análise [Sistema de diagnóstico — ajustes ao plano v3](https://claude.ai/artifact/3PK3bYFa2aWcxTbAXrtGXh); aqui ela vira tabela, função, teste e critério de aceite.

## 1. Estado atual

O sistema está na Fase 1 homologada: comércio B2B, três dimensões, duas alavancas e três cenários fixos, rodando no projeto Supabase `diagnostico_pricing`. Conferido em 18/11/2026 no repositório e nos dois projetos.

| Componente | Onde | Como está |
|---|---|---|
| Código | Pasta `diagnostico-pricing/` do repositório `Fedrumer/Calculadora_Pricing_00001`, branch `main` (17/11) | Cinco migrações, aplicação Next.js em `apps/web`, ferramentas locais sem Docker |
| Banco | Projeto `diagnostico_pricing`, São Paulo, Postgres 17 | Seis migrações registradas pelo conector, com versões diferentes dos nomes dos arquivos; empresa fictícia de distribuição publicada (14.266 transações) |
| Motor | Esquema `motor`, 15 funções em SQL | `validar`, `montar_fato`, `calcular_metricas`, `pontuar`, `gerar_achados`, `simular`, `rodar_cenarios`, `calcular`, `montar_painel` e apoio |
| API | 18 funções em `public` | O navegador só lê; toda escrita passa por função que confere o perfil (consultor, cliente editor, cliente leitor) |
| Catálogo | Versão 1 | 10 métricas, 6 regras de achado, 2 alavancas, pesos para distribuição, indústria e varejo B2B, premissas por cenário |
| Telas | `apps/web` | Abas Resumo, Realização, Oportunidades e Dados; gráfico de barras por cenário |
| Testes | `ferramentas/testes` e `ferramentas/e2e` | 10 do motor, 9 de acesso, roteiro de 26 conferências no navegador, homologação de 27 |
| Não usados | — | n8n, Claude, Storage do arquivo original, multi-segmento |

O projeto `diagnostico_pricing` já é multicliente com RLS: ele é o "ambiente da consultoria" da análise e não precisa ser recriado.

### Sistema de pricing (pontos de contato)

A pasta `sistema-pricing/` e o projeto Supabase `Calculadora_Pricing_00001` já cobrem parte do que o v3 pede ao motor de cotação:

- **Motivo de perda**: já obrigatório. Um gatilho recusa cotação com status `perdida` sem `desfecho_motivo`; o campo é texto livre.
- **Desconto por vendedor**: `cotacao_versoes` grava `desconto_pct`, `comissao_pct` e `margem_pct`; o vendedor é `cotacoes.dono_id`.
- **Identificador**: `org_id` em todas as tabelas.
- **Empresas fictícias**: `demo-assistencia` e `demo-distribuidor`. O v3 tira assistências do nicho e pede uma operadora de turismo na demonstração.

## 2. Regras da mudança

O que já funciona continua funcionando: cada pacote termina com os testes atuais verdes e com os números da empresa fictícia de distribuição inalterados (nota geral 66,4; ganho de R$ 18 mil a R$ 109 mil por ano nos três cenários).

1. **Migrações só aditivas.** Toda mudança de banco é um arquivo novo em `diagnostico-pricing/supabase/migrations`, a partir de `20261118...`. As cinco existentes não são editadas.
2. **Histórico alinhado antes da primeira migração nova.** O projeto registrou as versões `20261117003953` a `20261117015756` pelo conector. Ou se alinha com `supabase migration repair` antes de qualquer `db push`, ou se continua aplicando pelo conector e se registra no arquivo o nome usado.
3. **`cliente_id`**** fica como está.** Renomear para `org_id` tocaria as 33 funções e todos os testes. O de-para `cliente_id` → `org_id` acontece só na exportação para a instância do cliente. Isso substitui a recomendação de renomear feita na análise.
4. **SQL prepara, TypeScript sorteia.** A simulação de Monte Carlo não roda em SQL: o banco entrega a base agregada uma vez, e o serviço novo faz os sorteios. `motor.simular` fica como implementação de referência e teste de paridade.
5. **Mesmo modelo de segurança.** O navegador só lê; escrita por função que confere o perfil; serviços recebem `diagnostico_id` explícito; cada tabela nova entra no bloco de RLS e nos testes de acesso.
6. **Toda métrica nova tem caso de referência conferido à mão**, como as dez atuais.
7. **Um pacote por pull request**, com `docs/pendencias.md` atualizado no mesmo PR.
8. **Repositórios privados antes do pacote 2.** O repositório atual é público e mistura três projetos (a raiz tem outro aplicativo, um cotador em React e PocketBase). Simulação e medição são o que sustenta a mensalidade; não devem ficar públicas. O `README` do sistema de pricing já traz o comando de separação com histórico (`git subtree split`).

## 3. Modelo de dados

São 5 tabelas alteradas e 26 novas, distribuídas pelos pacotes da seção 10. Toda tabela com dado de cliente leva `cliente_id`; as de catálogo são globais e versionadas, como hoje.

### Alterações

| Tabela | Mudança | Pacote |
|---|---|---|
| `transacoes` | Colunas opcionais de reserva: `data_servico`, `fornecedor`, `custo_unitario_moeda`, `moeda_custo`, `cambio_venda`, `cambio_pagamento`, `data_pagamento_fornecedor`, `over_unitario`, `status_reserva`. Uma reserva é uma transação, e o pipeline atual é reaproveitado | P1 |
| `motor.fato` | `fornecedor`, `data_servico`, `custo_moeda`, `resultado_cambial`; `montar_fato` usa o custo da própria reserva quando existe e cai na tabela `custos` quando não | P1 |
| `uploads.bloco` | Novos valores no `check`: `bloqueios`, `propostas`, `comissoes_pagas`, `contratos_performance`, `pesquisas_dap` | P1, P5 |
| `diagnosticos` | `tipo` (`diagnostico`, `acompanhamento`, `nota_avulsa`), `segmento` (`operadora`, `consolidadora`, `mga`, `distribuicao`, `industria`, `varejo_b2b`) | P1, P6 |
| `cenario_premissas.origem` | Valores novos: `medido`, `estimado`, `pesquisa`, `referencia` | P5 |

### Tabelas novas

| Tabela | Colunas principais | Pacote |
|---|---|---|
| `bloqueios` | produto, fornecedor, data_servico, lugares_contratados, lugares_vendidos, data_devolucao, multa_por_lugar, custo_unitario_moeda, moeda | P1 |
| `premissas_distribuicao` (catálogo) | versao, alavanca, chave, tipo (`quantis`, `discreta`), p10, p50, p90, minimo, maximo, opcoes jsonb | P2 |
| `simulacoes` | semente, sorteios, versao_catalogo, versao_servico, premissas jsonb com origem, nota_id, criado_por | P2 |
| `simulacao_resultado` | simulacao_id, opcao, alavanca (nulo = total), media, p10, p50, p90, prob_positivo, contribuicao_media, histograma jsonb | P2 |
| `simulacao_sensibilidade` | simulacao_id, opcao, premissa, resultado_no_p10, resultado_no_p90, amplitude, ordem | P2 |
| `premissas_mercado` | serie, data_referencia, horizonte, estatistica, valor, fonte, coletado_em | P3 |
| `tipos_decisao` (catálogo) | codigo, nome, premissas_exigidas jsonb, opcoes_padrao jsonb, horizonte_meses, regra (nome da regra no serviço) | P3 |
| `notas_decisao` | numero, tipo_decisao, titulo, decisao, status, simulacao_id, recomendacao, indicador, data_revisao, avulsa, contrato_id, aprovado_por, entregue_em | P3 |
| `nota_opcoes` | nota_id, codigo, descricao, premissas jsonb, e_manter | P3 |
| `nota_premissas` | nota_id, chave, distribuição, origem, fonte | P3 |
| `nota_versoes` | nota_id, versao, conteudo jsonb, imutável como `publicacoes` | P3 |
| `ofertas_catalogo` (catálogo) | codigo, versao_oferta (`padrao`, `enxuta`), fidelidade, preco, notas_mes, vigente_desde | P4 |
| `garantias` | diagnostico_id, valor_pago, multiplicador, criterio jsonb, travado_em, p50_ganho, atendida | P4 |
| `faixas_elasticidade` (catálogo) | segmento, categoria, p10, p50, p90, fonte, url, data | P5 |
| `propostas` | data, conta, canal, vendedor, produto, valor_lista, desconto_pct, status (`ganha`, `perdida`, `aberta`), motivo_perda, comissao_pct | P5 |
| `comissoes_pagas` | mes, vendedor, canal, base (`receita`, `margem`), valor_pago | P5 |
| `contratos_performance` | periodo, meta_tipo, limite, percentual_bonus | P5 |
| `contratos` | nivel, versao_oferta, fidelidade, inicio, fim, notas_mes, fundador, variavel_pct, variavel_teto | P6 |
| `extratos_cliente` | competencia, origem, linhas, recebido_em, diagnostico_id do acompanhamento | P6 |
| `protocolos_medicao` | contrato_id, nota_id, metrica, unidade_comparacao, linha_base_inicio, linha_base_fim, linha_base_valor, efeito_esperado, efeito_minimo_detectavel, metodo, semente_grupos, regra_leitura, data_leitura, assinado_em, hash | P7 |
| `protocolo_grupos` | protocolo_id, unidade, grupo (`tratamento`, `controle`), estrato | P7 |
| `medicoes` | protocolo_id, periodo, efeito, intervalo_inferior, intervalo_superior, prob_positivo, ganho_medido, variavel_calculada, detalhe jsonb | P7 |
| `alertas_regras` e `alertas_disparos` | metrica, recorte, limiar; disparado_em, valor | P8 |
| `horas_registro` | contrato_id, nota_id, diagnostico_id, data, horas, atividade | P8 |
| `pesquisas_dap` | resposta, segmento, muito_barato, barato, caro, muito_caro, preco_testado, compraria | P9 |

## 4. Serviço de simulação

O serviço novo troca os três cenários fixos por uma distribuição de 10.000 sorteios, reaproveitando a lógica de `motor.simular` sem reescrever a regra de negócio.

**Onde fica**: pacote `diagnostico-pricing/servicos/simulacao`, em TypeScript puro, sem banco, relógio ou rede no núcleo (o mesmo padrão do motor do sistema de pricing). Exposto como Edge Function `simular` no projeto `diagnostico_pricing`. Se 10.000 sorteios passarem do limite de execução da Edge Function, o mesmo pacote roda como serviço Node ao lado do n8n.

**Fluxo**:

1. Nova função SQL `motor.base_simulacao(p_diag)` devolve, uma vez, os pares conta e produto com preço, quantidade, custo (incluindo custo de servir e descontos fora da fatura), piso da banda, quartil de volume da conta e fator anual. São as CTEs `base`, `piso` e `contas_resumo` de `motor.simular`, sem as premissas.
2. O serviço recebe a base, as premissas com distribuição e origem, as opções a comparar, a semente e o número de sorteios.
3. Em cada sorteio: sorteia as premissas, aplica as alavancas na ordem do catálogo (porte fiel de `motor.simular`), soma o ganho e guarda a contribuição de cada alavanca.
4. Grava `simulacoes`, `simulacao_resultado` e `simulacao_sensibilidade`.

**Regras de cálculo**:

- **Distribuição por quantis**: cada premissa é dada por P10, P50 e P90. O sorteio interpola linearmente a função quantil entre (0,1; P10), (0,5; P50) e (0,9; P90) e estende até mínimo e máximo. Limites: elasticidade ≤ 0; captura e fechamento entre 0 e 1.
- **Premissa discreta**: reação da concorrência (ignorar, acompanhar, copiar, contra-atacar) com probabilidades.
- **Valores iniciais**: a migração do P2 preenche `premissas_distribuicao` a partir de `premissas_padrao`, com P10 = conservador, P50 = base e P90 = agressivo. Nas oito chaves atuais o valor conservador nunca é maior que o base, nem o base maior que o agressivo, então a ordem dos quantis se mantém.
- **Sorteios comuns**: um gerador com semente (xoshiro128** ou equivalente, fixado no código), com o mesmo fluxo de números para cada premissa em todas as opções comparadas.
- **Saídas por opção**: média, P10, P50, P90, chance de ganho positivo, frase em frequência natural ("em 76 de cada 100 cenários"), histograma de 20 faixas.
- **Percentis não somam**: o painel mostra a contribuição média de cada alavanca (que soma a média do total) e a faixa P10–P90 do total. A garantia usa o P50 do total.
- **Sensibilidade (tornado)**: cada premissa vai ao seu P10 e ao seu P90 com as demais no P50, em cálculo determinístico; ordena pela amplitude.

**Compatibilidade**: os três cenários continuam calculados por `motor.rodar_cenarios` até a aba Oportunidades passar a ler a simulação (P3), para o painel publicado e os testes atuais não mudarem. As telas novas leem a simulação.

**Testes obrigatórios**:

- [ ] Paridade: com P10 = P50 = P90 nos valores do cenário base, o serviço dá o mesmo ganho de `motor.simular` na empresa fictícia, ao centavo, por alavanca.
- [ ] Mesma semente, mesmo resultado; semente diferente, P50 do total dentro de 1% com 10.000 sorteios.
- [ ] Soma das contribuições médias igual à média do total.
- [ ] Tempo de 10.000 sorteios medido na base de demonstração e registrado em `docs/pendencias.md`.

## 5. Nota de Decisão

A Nota vira a entidade central: é o que a mensalidade vende. Ela usa a base de um diagnóstico (ou de um acompanhamento mensal) e uma simulação com opções comparadas.

**Status**: `rascunho` → `simulada` → `em_revisao` → `entregue` (ou `cancelada`). Só o consultor aprova; a entrega grava uma versão imutável em `nota_versoes`, como a publicação do diagnóstico faz hoje.

**Funções novas em ****`public`** (todas conferem o perfil):

| Função | Faz |
|---|---|
| `criar_nota(p_cliente, p_tipo, p_titulo, p_diagnostico)` | Cria a Nota a partir do modelo do tipo, com opções e premissas padrão |
| `salvar_nota(p_nota, p_dados)` | Grava decisão, opções, premissas com origem, indicador e data de revisão |
| `simular_nota(p_nota, p_semente)` | Chama o serviço de simulação e liga o resultado à Nota |
| `enviar_para_revisao(p_nota)` | Exige simulação e recomendação preenchidas |
| `entregar_nota(p_nota)` | Exige a conferência de números aprovada; grava a versão e libera para o cliente |
| `nota_entregue(p_nota)` | O que o cliente lê: só a versão entregue da própria empresa |

**O que toda Nota calcula** (saídas do serviço da seção 4):

- Faixa P10, P50 e P90 de margem e faturamento por opção, e a frase em frequência natural.
- **Custo de não decidir**: a opção com `e_manter = true` é obrigatória e roda com os mesmos sorteios. O custo é a diferença de média entre ela e a melhor opção no horizonte da Nota, com custo e câmbio projetados por `premissas_mercado`.
- **Sensibilidade**: as três premissas de maior amplitude no tornado, com a frase "acompanhe X".
- **Equilíbrio**: variação de volume que mantém a contribuição, −p ÷ (m + p); com comissão e impostos percentuais, a margem nova é calculada direto.

**Tipos de decisão na primeira carga de ****`tipos_decisao`**: `reajuste` e `desconto` (usam as duas alavancas atuais) e `bloqueio_cambio` (turismo, refaz a Nota nº 02). `comissao_canal` e `servico_adicional` entram no P5.

**Narrativa**: um fluxo do n8n manda ao Claude só os números já calculados e grava o rascunho do texto. Antes de `entregar_nota`, a função `conferir_numeros_nota` extrai todo número do texto e confere com a simulação, com tolerância de arredondamento; se algum não bater, a entrega é recusada.

**Entrega ao cliente**: página da Nota entregue na aplicação, com folha de impressão para PDF pelo navegador.

## 6. Garantia, proposta e catálogo de ofertas

O diagnóstico passa a terminar numa proposta com os três níveis e no teste da garantia de 10x, ambos calculados pelo banco.

### Carga inicial de `ofertas_catalogo` (preços do plano v3)

| Código | Padrão | Enxuta | Notas por mês |
|---|---|---|---|
| `nota_avulsa` | R$ 3.000 | R$ 2.000 | — |
| `diagnostico` | R$ 4.500 | R$ 3.000 | — |
| `customizacao` com fidelidade | R$ 18.000 | R$ 12.000 | — |
| `customizacao` sem fidelidade | R$ 24.000 | R$ 16.000 | — |
| `essencial` | R$ 2.500 | R$ 1.800 | 1 |
| `gestao` | R$ 4.500 | R$ 3.000 | 3 |
| `completo` | R$ 7.500 | não oferecido | 6 |
| `nota_extra` | R$ 2.000 | R$ 1.500 | — |

Preço é dado com vigência: mudar o preço é inserir linha nova, e a proposta grava a vigência usada.

### Proposta

Função `proposta(p_diagnostico, p_versao_oferta, p_fidelidade)` devolve os três níveis lado a lado:

```latex
C_{1º\,ano} = customização + 12 \times mensalidade
\qquad
Margem\ de\ equilíbrio = \frac{C_{1º\,ano}}{receita\ anual}
\qquad
Cobertura = \frac{P_{50}}{C_{1º\,ano}}
\qquad
Mês\ de\ retorno = \left\lceil \frac{customização}{P_{50}/12 - mensalidade} \right\rceil
```

- Receita anual: receita faturada de `motor.fato`, anualizada pelo fator que o motor já usa (365 ÷ dias do período).
- O valor da porta de entrada já pago é abatido da customização no saldo a pagar, mas não muda o custo do 1º ano.
- Se o ganho mensal P50 não passar da mensalidade, o mês de retorno sai como "não se paga no P50".

### Garantia de 10x

1. `travar_garantia(p_diagnostico, p_valor_pago, p_criterio)` grava o critério antes do cálculo: definição de ganho, horizonte, multiplicador (10) e as premissas com origem. Depois de travada, não muda.
2. Ao fim do cálculo, o P50 do ganho total anual da simulação com as premissas travadas vai para `garantias.p50_ganho`, e `atendida` = P50 ≥ 10 × valor pago.
3. Premissa alterada depois de travada continua permitida, mas a auditoria grava a ação como `premissa_pos_garantia`, e o painel mostra o aviso.

### Teste de aceite

- [ ] Padrão Gestão com fidelidade e receita de R$ 30 milhões devolve custo de R$ 72 mil e margem de equilíbrio de 0,24 ponto percentual, o número do plano.
- [ ] Enxuta Essencial com R$ 10 milhões devolve R$ 33,6 mil e 0,34 ponto.

## 7. Catálogo de turismo e MGAs e plano B de elasticidade

O catálogo versão 2 mantém tudo da versão 1 e acrescenta métricas, alavancas e pesos por segmento. Nova coluna `metricas_catalogo.segmentos text[]` (nulo = vale para todos).

### Métricas novas

Todas entram sem limiar, como informativas, até você definir os limiares; enquanto isso, a dimensão fica fora da nota geral, que sai marcada como parcial (comportamento atual).

| Código | Dimensão | Segmento | Cálculo |
|---|---|---|---|
| `margem_passageiro` | margem | operadora, consolidadora | (receita pocket − custo) ÷ passageiros |
| `resultado_cambial_pct` | cambio | operadora, consolidadora | custo em moeda × (câmbio da venda − câmbio do pagamento) ÷ receita faturada |
| `cambio_equilibrio` | cambio | operadora, consolidadora | câmbio que zera a margem, por produto, e a distância em % para o câmbio da venda |
| `ocupacao_bloqueio_pct` | capacidade | operadora, consolidadora | lugares vendidos ÷ contratados |
| `custo_lugar_nao_vendido` | capacidade | operadora, consolidadora | lugares não vendidos e não devolvidos até a data × (custo ou multa) |
| `markup_fornecedor_pct` | margem | operadora, consolidadora | (receita pocket − custo) ÷ custo, por fornecedor |
| `curva_reservas_vs_anterior` | capacidade | operadora, consolidadora | reservas acumuladas por antecedência contra o mesmo período do ano anterior |
| `conversao_canal_pct` | canal | mga | propostas ganhas ÷ total, por canal |
| `desconto_sobre_tarifa_pct` | realizacao | mga | desconto médio ponderado sobre a tarifa |
| `comissao_efetiva_canal_pct` | canal | mga | comissão paga ÷ prêmio, por canal |
| `comissao_por_margem` | governanca | todos | comissão paga ÷ margem gerada, por vendedor |

Para MGAs o sistema não calcula prêmio de risco nem tarifa: o preço técnico fica com a seguradora parceira.

### Alavancas novas (ordem fixa no catálogo)

`tamanho_bloqueio`, `cambio_travar_ou_repassar`, `markup_fornecedor`, `comissao_canal`, `preco_antecedencia`, `alcada_desconto`, `comissao_sobre_margem`. Cada uma traz premissas em `premissas_distribuicao` e uma regra no serviço de simulação, com teste por caso de referência.

### Validações novas em `motor.validar`

- Data do serviço igual ou posterior à data da venda.
- Moeda do custo no padrão ISO de três letras e câmbio maior que zero.
- Reserva cancelada fora do cálculo de margem e contada à parte.
- Pagamento ao fornecedor sem câmbio: usa a projeção de `premissas_mercado` e marca a linha como projetada.
- Bloqueio com lugares vendidos acima dos contratados.

### Empresa fictícia de turismo

Novo gerador `ferramentas/src/demo-turismo.ts`: operadora com 12 meses de reservas sintéticas, três destinos com custo em euro ou dólar e um bloqueio Lisboa de julho com os números da Nota nº 02 (preço R$ 9.900, margem de R$ 587 por passageiro, câmbio de premissa R$ 6,10 por euro). A empresa fictícia de distribuição continua.

### Plano B de elasticidade

Toda premissa de elasticidade carrega origem, e o sistema usa a melhor disponível nesta ordem: `medido` (histórico de 24 meses), `estimado` (propostas ganhas e perdidas), `pesquisa` (Van Westendorp ou Gabor-Granger, P9), `referencia` (`faixas_elasticidade`, com fonte) e `informada` (consultor).

- **Ganhas e perdidas**: regressão logística da chance de ganhar contra o desconto, por segmento ou canal, no serviço Python da seção 8. A saída vira P10, P50 e P90 da elasticidade no desconto médio. O mínimo de propostas fica no catálogo.
- **Origem na tela**: aparece ao lado de cada premissa, na Nota e no painel. Origem `referencia` ou `informada` alarga a faixa sorteada, e a Nota diz isso.

## 8. Medição

A medição precisa estar pronta para a primeira leitura do protocolo no portão da semana 16. Ela roda num serviço Python novo, `diagnostico-pricing/servicos/estatistica`, que também faz a regressão de ganhas e perdidas da seção 7.

**Serviço**: Python 3.12 com `numpy`, `scipy` e `statsmodels`; sem biblioteca de amostragem bayesiana pesada. Exposto por HTTP ao n8n e à Edge Function, com credencial de serviço e `diagnostico_id` explícito em cada chamada.

**Passos e funções**:

1. **Linha de base**: nova função SQL `motor.metrica_periodo(p_diag, p_metrica, p_inicio, p_fim, p_recorte)`. A linha de base e todas as leituras usam esta mesma função.
2. **Efeito mínimo detectável**, com 5% de significância e 80% de poder, para n unidades por grupo e desvio padrão σ da métrica na linha de base: MDE = 2,80 × σ × √(2 ÷ n). Se o efeito esperado (P50 da Nota) ficar abaixo do MDE, o protocolo nasce com `metodo = 'bayesiano'`.
3. **Sorteio dos grupos**: estratificado por quartil de receita, com semente gravada. Aceite: diferença padronizada da métrica no período anterior abaixo de 0,1; se passar, sorteia de novo com semente nova e registra as tentativas.
4. **Assinatura**: `assinar_protocolo(p_protocolo)` grava o hash SHA-256 do protocolo em forma canônica. Um gatilho recusa qualquer alteração depois disso.
5. **Leitura por diferença em diferenças**: regressão com interação grupo × período e erros agrupados por unidade.
6. **Leitura bayesiana** (volume baixo): diferença de médias com prior normal fraco e posterior analítica; a saída principal é a chance de o ganho ser positivo.
7. **Parcela variável**: Variável = mínimo entre (percentual do contrato × máximo(0, ganho medido)) e (teto anual − variável já cobrada no ano).

```latex
Efeito = (\bar{Y}^{trat}_{depois} - \bar{Y}^{trat}_{antes}) - (\bar{Y}^{ctrl}_{depois} - \bar{Y}^{ctrl}_{antes})
```

**Nível Gestão**: o mesmo módulo, sem grupo de controle, compara o realizado com a linha de base e marca o resultado como não causal.

**Testes de aceite**:

- [ ] Base sintética com efeito conhecido de +2 pontos de margem injetado no grupo tratado: a leitura recupera o efeito dentro do intervalo de 90%.
- [ ] Sem efeito injetado: a leitura não declara ganho em pelo menos 90 de 100 repetições.
- [ ] Protocolo assinado recusa alteração.
- [ ] Variável respeita o teto e nunca fica negativa.

## 9. Automações no n8n, telas e sistema de pricing

O n8n entra no diagnóstico com seis fluxos; as telas ganham quatro áreas novas; o sistema de pricing recebe três ajustes pequenos.

### Fluxos do n8n (arquivos em `diagnostico-pricing/n8n/workflows`)

| Fluxo | Gatilho | Faz | Pacote |
|---|---|---|---|
| Focus semanal | Toda segunda-feira | Lê a API de Expectativas de Mercado do Banco Central (`olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/...`, recursos anuais, mensais e inflação 12 meses) e grava `premissas_mercado` | P3 |
| Rascunho da Nota | Nota passa a `simulada` | Envia ao Claude os números da simulação, grava o texto e roda `conferir_numeros_nota` | P3 |
| Data de revisão | Diário | Avisa o consultor das Notas com revisão no dia | P3 |
| Extrato mensal | Dia 2 de cada mês | Lê a visão de extrato da instância do cliente com papel somente leitura e carrega no diagnóstico de acompanhamento | P6 |
| Alertas de margem | Após o cálculo do acompanhamento | Compara métricas com `alertas_regras` e avisa cliente e consultor | P8 |
| Fechamento do mês | Último dia útil | Conta Notas entregues por contrato contra a cota e marca as extras; soma horas | P8 |

### Telas (`apps/web`)

- **Nomes**: "dashboard" sai da interface; as abas viram Painel de margem e Business case.
- **Oportunidades**: as barras por cenário dão lugar à contribuição média por alavanca e à faixa P10–P90 do total, com a frase em frequência natural. P3.
- **Notas**: lista, editor (decisão, opções, premissas com origem, tornado, recomendação) e página entregue para o cliente. P3.
- **Proposta**: três níveis lado a lado, com Gestão em destaque, e o selo da garantia. Só o consultor vê. P4.
- **Medição**: protocolo, grupos, linha de base e leituras. O cliente vê o relatório. P7.
- **Contratos e horas**: nível, cota usada, horas por entrega. Só o consultor. P8.

### Sistema de pricing (`sistema-pricing/`)

1. **Motivo de perda em lista**: manter o gatilho atual e trocar o texto livre por lista configurável por cliente, com texto opcional. A análise de ganhas e perdidas precisa de categoria. P5.
2. **Visão ****`extrato_diagnostico`**** e papel ****`leitor_consultoria`**: cotações aceitas e perdidas com data, canal, produto, vendedor, desconto, comissão, margem e motivo, sem dado pessoal do cliente final. P6.
3. **Empresa fictícia**: trocar `demo-assistencia` por uma operadora de turismo coerente com a do diagnóstico, para a demonstração de 20 minutos contar uma só história. P1.

## 10. Plano de execução

Dez pacotes, um pull request cada. P0 a P3 formam a Fase 0 do plano (semanas 3–4, demonstração e Nota); P4 e P5 a Fase 1 (semanas 5–8, diagnóstico vendável com garantia); P6 a P8 a Fase 2 (semanas 9–16, dentro da primeira customização); P9 a Fase 3.

| Pacote | Entrega | Depende de | Critério de aceite |
|---|---|---|---|
| P0 Preparação | Repositórios privados para `diagnostico-pricing` e `sistema-pricing` com histórico; histórico de migrações alinhado; RLS ligado em `app.segredos_demo` no projeto do sistema de pricing | — | Lista de migrações igual no arquivo e no projeto; os 19 testes e o roteiro de 26 conferências verdes no repositório novo |
| P1 Turismo na base | Colunas de reserva em `transacoes` e `motor.fato`, `bloqueios`, `diagnosticos.segmento` e `tipo`, validações novas, catálogo versão 2 com métricas de turismo, `demo-turismo.ts`, nova empresa fictícia no sistema de pricing | P0 | Operadora fictícia carrega e calcula; caso de referência de turismo conferido à mão; distribuição segue com nota 66,4 |
| P2 Simulação | `motor.base_simulacao`, pacote TypeScript, Edge Function, `premissas_distribuicao`, tabelas de simulação | P0 | Os quatro testes da seção 4 |
| P3 Nota de Decisão | Tabelas e funções da Nota, tipos `reajuste`, `desconto` e `bloqueio_cambio`, `premissas_mercado`, fluxos Focus, rascunho e revisão, telas de Notas e Oportunidades nova | P1, P2 | Nota nº 02 refeita no sistema sobre a operadora fictícia; entrega recusada sem aprovação ou com número divergente; roteiro de 20 minutos roda sem falha |
| P4 Garantia e proposta | `ofertas_catalogo`, `garantias`, `proposta()`, `travar_garantia`, tela de proposta | P2 | Os dois testes da seção 6; premissa alterada após a trava aparece na auditoria e no painel |
| P5 MGAs e plano B | Catálogo de MGAs, `propostas`, `comissoes_pagas`, `contratos_performance`, serviço Python (regressão), origem das premissas, motivo de perda em lista no sistema de pricing, tipos `comissao_canal` e `servico_adicional` | P1, P3 | Regressão igual a um caso calculado fora do sistema; origem visível em toda premissa |
| P6 Extrato da instância | `contratos`, `extratos_cliente`, diagnóstico de acompanhamento, visão e papel no sistema de pricing, fluxo mensal | P3 | Extrato da instância de demonstração entra sem acesso de escrita; teste de acesso do papel novo |
| P7 Medição | Protocolo, grupos, efeito mínimo, leituras, variável, tela | P5, P6 | Os quatro testes da seção 8 |
| P8 Recorrência | Alertas, cota de Notas, horas, relatório do nível Gestão, fluxos de alerta e fechamento | P6, P7 | Alerta dispara na base de demonstração quando a métrica cruza o limiar; Nota além da cota sai como extra |
| P9 Comércio e pesquisa | `pesquisas_dap`, Van Westendorp e Gabor-Granger, comparação entre clientes do mesmo setor | P5 | Curvas conferidas contra cálculo de referência |

Se a regra de troca de segmento disparar na semana 6, P5 perde a parte de MGAs e o pacote de comércio sobe, sem mudar o resto da ordem.

## 11. Prompt para o Claude Code

Exporte este documento em Markdown, salve como `diagnostico-pricing/docs/ajustamento-v3.md` e abra uma sessão por pacote com o texto abaixo, trocando `P1` pelo pacote da vez.

```text
Você vai implementar o pacote P1 do documento diagnostico-pricing/docs/ajustamento-v3.md
no sistema de diagnóstico de pricing (pasta diagnostico-pricing, projeto Supabase diagnostico_pricing).

Antes de começar:
1. Leia ajustamento-v3.md inteiro, o README.md e docs/pendencias.md da pasta.
2. Leia as cinco migrações em supabase/migrations e os testes em ferramentas/testes.
3. Rode pnpm test e confirme que os 19 testes passam antes de mudar qualquer coisa.

Regras (seção 2 do documento):
- Só migrações novas; não edite as existentes. Não rode supabase db push sem alinhar o histórico.
- Não renomeie cliente_id.
- O navegador só lê; escrita só por função que confere o perfil; toda tabela nova entra no RLS e nos testes de acesso.
- Monte Carlo não roda em SQL: o banco entrega a base e o serviço TypeScript sorteia.
- Toda métrica nova tem caso de referência conferido à mão em ferramentas/testes.
- A empresa fictícia de distribuição tem de continuar com nota geral 66,4 e ganho de R$ 18 mil a R$ 109 mil.

Entrega:
- Tudo o que a linha do P1 na seção 10 lista, com os critérios de aceite cumpridos.
- pnpm test, pnpm typecheck e o roteiro do navegador verdes.
- docs/pendencias.md atualizado: o que foi feito, o que foi verificado, o que não foi e por quê.
- Um pull request só para este pacote, com o resumo dos critérios de aceite e como conferir cada um.

Se algo no documento contradizer o código existente, pare, descreva a contradição e proponha a saída antes de implementar.
```

## 12. Pendências que bloqueiam pacotes

Nenhuma pendência impede começar por P0, P1 e P2; três delas afetam pacotes até o P4 (limiares no P1, licença no P3, definição de ganho no P4).

| Pendência | Bloqueia | Enquanto não decide |
|---|---|---|
| Limiares e pesos de turismo e MGAs | Nota geral do P1 | Métricas entram como informativas e a nota geral sai parcial |
| Definição de ganho da garantia | P4 | Usar margem de contribuição anual depois do custo de servir, 12 meses, captura padrão (proposta da análise) |
| Licença da curva de câmbio futuro da B3 | Curva no P3 | Focus segue; forward do banco do cliente entra como premissa informada |
| Onde fica o motor de análise depois da customização (contrato) | P6 | Desenho assume o ambiente da consultoria |
| Percentual e teto da parcela variável | Valor do P7 | Cálculo pronto, parâmetros por contrato |
| Dados de sinistralidade que a MGA pode compartilhar e exigências da Susep | Métrica de comissão de performance no P5 | Métrica fica fora do catálogo de MGAs |
| 16 sugestões pendentes no documento de arquitetura | Nenhum pacote | O código já segue as da Fase 1; fechar para o documento refletir o código |
| Acessos `consultor@demo.local` e `cliente@demo.local` sem troca de senha | Carga de dados reais | Trocar a senha ou remover antes do primeiro cliente |

### Fontes

- [Análise: sistema de diagnóstico — ajustes ao plano v3](https://claude.ai/artifact/3PK3bYFa2aWcxTbAXrtGXh)
- [Plano de negócio v3](https://claude.ai/artifact/HXb2ioY5yvwFvHMkiY7NfJ)
- [Arquitetura do sistema de diagnóstico](https://claude.ai/artifact/K8Zs3REsTnrnCkGcEzoFAp)
- [Repositório Fedrumer/Calculadora_Pricing_00001](https://github.com/Fedrumer/Calculadora_Pricing_00001), branch `main`, conferido em 18/11/2026
- [Banco Central — API de Expectativas de Mercado](https://dadosabertos.bcb.gov.br/dataset/expectativas-mercado/resource/fb40c7c5-c5f7-40a3-9791-4f68021929ad)
- [B3 — Política de Consumo de Market Data](https://www.b3.com.br/data/files/66/82/D8/17/973699100A29E189AC094EA8/Politica%20de%20Consumo%20Market%20Data%20B3.pdf)
