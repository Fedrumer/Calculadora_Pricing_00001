<!-- Cópia do documento "Ajustamento do sistema de diagnóstico ao plano v3" (https://claude.ai/artifact/PcVRGmBvcp4ZwbZBzfxSVy), versão com 13 pacotes e as seções 13 e 14, exportada em 19/11/2026. O original é o documento; esta cópia serve de referência para as sessões de implementação. -->

# Ajustamento do sistema de diagnóstico ao plano v3

2026-11-18 · Fernando Duarte Bezerra

Este documento diz ao Claude Code o que mudar no sistema de diagnóstico já construído para atender o plano v3, em treze pacotes (P0 a P12), sem quebrar o que hoje passa nos testes. A base é a análise [Sistema de diagnóstico — ajustes ao plano v3](https://claude.ai/artifact/3PK3bYFa2aWcxTbAXrtGXh); aqui ela vira tabela, função, teste e critério de aceite.

## Cobertura do escopo do plano v3 e da apresentação

Revisão de 18/11/2026: cada análise, técnica e métrica prometida no [plano de negócio v3](https://claude.ai/artifact/HXb2ioY5yvwFvHMkiY7NfJ), no escopo das análises de decisão e na [apresentação comercial](https://claude.ai/artifact/3aKbyT5wHCcFCiAQJQvm33) agora tem pacote neste plano. A versão anterior deixava de fora 13 itens, cobria pela metade outros 7 e tinha só parte de mais 4; eles estão especificados nas seções 13 e 14. Uma conferência independente contra cada slide achou mais 10 itens e 4 divergências de números, tratados no fim da tabela e em 13.8 a 13.10. Situação conferida no código em 18/11/2026, com P0 parcial e P1 feitos.

| Item prometido | Onde está prometido | Pacote | Situação |
|---|---|---|---|
| **Simulação e Nota de Decisão** |  |  |  |
| 10.000 cenários com resultado em faixa (P10, P50, P90) | Apresentação (técnica 1), escopo (módulo 5) | P2 | Previsto |
| Premissas que andam juntas sorteadas juntas | Apresentação (técnica 1) | P2 | Novo (13.1) |
| Premissas que mais pesam no resultado | Plano v3, apresentação (Nota) | P2 | Previsto |
| Reação da concorrência com chance por tipo | Escopo, apresentação (técnica 6) | P2 | Previsto |
| Ponto em que a recomendação muda | Apresentação (técnica 6), Notas nº 01 e nº 02 | P2 | Novo (13.2) |
| Escolha entre opções com limite de risco | Nota nº 02 | P2 | Novo (13.3) |
| Resultado em frequências naturais | Plano v3, apresentação | P2 | Previsto |
| Custo de não decidir, por mês | Plano v3, apresentação (Nota) | P3 | Previsto |
| Equilíbrio e meta em unidades e em reais, com custos percentuais | Escopo (módulo 4), apresentação (técnica 3) | P3 | Completado (13.6) |
| Volume e meta conferidos contra a capacidade | Escopo (módulos 3 e 4), apresentação (dados) | P2, P10 | Novo (13.4) |
| Premissas com origem; câmbio e inflação pelo Focus | Plano v3, apresentação (Nota) | P3, P5 | Previsto |
| Curva futura de câmbio e de juros | Plano v3, apresentação (Nota) | P3 | Pendente (licença da B3) |
| Simulador entregue com a Nota | Escopo, apresentação (Nota e exemplo 2) | P3 | Novo (13.5) |
| Medição combinada na Nota: indicador, grupo de comparação e data de leitura | Apresentação (Nota) | P3, P7 | Completado (13.6) |
| Notas nº 01 e nº 02 refeitas no sistema | Apresentação (exemplos) | P3 | Completado (antes só a nº 02) |
| **Análises** |  |  |  |
| Composição do preço: custo de servir completo, despesas fixas, piso, preço-alvo e margem unitária por produto, cliente e canal | Escopo (módulo 1), apresentação | P10 | Parcial: cascata e banda de preço feitas; resto novo (14) |
| Curva ABC por margem e matriz margem × volume com quatro grupos | Escopo (módulo 2), apresentação | P10 | Novo (14) |
| Análise de cesta | Escopo (módulo 2), apresentação | P10 | Novo (14) |
| Serviço adicional: cobrar à parte ou embutir, volume de equilíbrio, capacidade | Escopo (módulo 3), Nota nº 01 | P3, P10 | Completado: antecipado do P5 (13.6) |
| Mapa de descontos por vendedor e cliente | Apresentação | Fase 1; sistema de cotação (A5) | Feito |
| Elasticidade medida pelo histórico, por categoria, imediata e após meses | Apresentação (técnica 2), escopo (comércio) | P11 | Novo (14) |
| Elasticidade por propostas ganhas e perdidas | Plano v3, apresentação (dados) | P5 | Previsto |
| Pesquisa de disposição a pagar | Plano v3, apresentação (dados) | P9 | Previsto |
| Faixas de referência do setor | Plano v3, apresentação (dados) | P5 | Previsto |
| Previsão de demanda com faixa | Apresentação (técnica 4) | P11 | Novo (14) |
| Curva de reservas à frente ou atrás do esperado | Escopo (turismo), apresentação (técnica 4) | P1, P11 | Parcial: comparação com o ano anterior feita; previsão nova (14) |
| Grupo de controle: tamanho, diferença em diferenças, leitura bayesiana | Plano v3, apresentação (técnica 5 e medição) | P7; sistema de cotação (A9) | Previsto |
| Preços dos concorrentes e histórico de reações | Escopo, apresentação (técnica 6) | P11 | Novo (14) |
| **Segmentos** |  |  |  |
| Comércio: repasse de reajuste de fornecedor | Escopo | P3 | Novo (13.6) |
| Comércio: dispersão por cliente e vendedor; elasticidade por categoria | Escopo | Fase 1; P11 | Dispersão feita; elasticidade nova |
| Turismo: câmbio entre venda e pagamento, tamanho do bloqueio, custo de travar o câmbio | Escopo, Nota nº 02 | P3 | Completado (13.6) |
| Turismo: comissão e over por fornecedor | Escopo | P1, P10 | Markup feito; over novo (14) |
| MGAs: canal, conversão e comissionamento | Escopo, plano v3 | P5 | Previsto |
| MGAs: chance de a carteira atingir a comissão de performance | Escopo | P5 | Completado (13.7) |
| Serviços: chance de ganhar a proposta pelo preço | Escopo, apresentação | P5 | Previsto |
| Serviços: custo de projetos de preço fechado | Escopo | P12 | Novo (14) |
| Contratos recorrentes: cancelamento e valor do cliente | Escopo, apresentação | P12 | Novo (14) |
| **Oferta e operação** |  |  |  |
| Garantia de 10x; proposta com ganho provável e margem de equilíbrio | Plano v3, apresentação (retorno) | P4 | Previsto |
| Cota de Notas, Nota extra, alertas, relatório contra a linha de base | Plano v3, apresentação (planos) | P8 | Previsto |
| Parte variável com teto | Plano v3, apresentação (planos) | P7 | Previsto |
| Números antes e depois dos clientes fundadores | Plano v3, apresentação (fundadores) | P7, P8 | Previsto |
| Comissão do vendedor sobre a margem | Plano v3, apresentação (implantação) | P5; sistema de cotação (A4, A7) | Cálculo no sistema de cotação feito; análise prevista |
| Motivo de perda obrigatório, em lista | Plano v3, apresentação (implantação) | Sistema de cotação (A3) | Feito |
| Dados das cotações do cliente para o acompanhamento | Arquitetura do sistema de pricing | P6; sistema de cotação (A10) | Completado: envio de pacote (14) |
| **Acrescentados na conferência** |  |  |  |
| Chance de atingir a meta | Escopo (módulos 4 e 5) | P2 | Novo (13.3) |
| Quanto comprar ou reservar para a temporada (comércio) | Apresentação (perguntas, previsão) | P10 | Novo (14) |
| Comissão sobre a venda ou sobre a margem, como tipo de decisão | Apresentação (perguntas) | P5 | Novo (13.7) |
| Chance de fechar a proposta pelo preço, como curva e decisão | Apresentação (técnicas), escopo (serviços) | P5 | Completado (13.7) |
| Fórmulas das alavancas de turismo, canal, alçada e comissão | Escopo, plano (seção 7) | P3, P5, P10 | Completado (13.8) |
| Tamanho do piloto em unidades e semanas; intervalo de 95%; protocolo de uma página | Apresentação (controle, medição) | P7 | Completado (13.9) |
| Elasticidade de forma constante; faixa de margem e de faturamento; número de sorteios; equilíbrio por custo fixo | Apresentação (elasticidade, equilíbrio, exemplos) | P2, P3 | Completado (13.6, 13.10) |
| Dados pessoais anonimizados nas cargas por planilha; base organizada devolvida à empresa | Apresentação (dados) | P10 | Novo (14) |
| Regras da pesquisa de disposição a pagar e das faixas de referência | Plano v3, apresentação (dados) | P5, P9 | Completado (14) |
| Atualização de tabela no nível Essencial; regra do cliente fundador | Apresentação (planos, fundadores) | Sistema de cotação; P8 | Completado (14) |

Meta reversa no exemplo de turismo: os dois números em circulação estão certos, cada um para uma estrutura de custo. A nota do slide (+556%, 0,05 ÷ 0,009) supõe que todos os custos do pacote são fixos por passageiro. A Nota nº 02 (+224%) supõe que 18% do preço é comissão e impostos, que caem junto com o desconto. O sistema calcula a meta com a estrutura de custo de cada cliente e tem as duas como casos de aceite (13.6); a nota do slide fica como está, e vale só dizer nela que os custos são fixos por passageiro.

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
8. **Repositório**** público durante a fase de testes (decisão de 19/11/2026)****.** O repositório atual é público e mistura três projetos (a raiz tem outro aplicativo, um cotador em React e PocketBase). A construção segue nele até o fim, sem dado real de cliente. Antes de replicar o sistema para a primeira empresa real, o código vai para repositório privado em plano pago do GitHub, que também mantém o GitHub Pages. O `README` do sistema de pricing já traz o comando de separação com histórico (`git subtree split`).

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

As tabelas, colunas e blocos de carga dos complementos (P2, P3, P5) e dos pacotes P6 revisto, P10, P11 e P12 estão nas seções 13 e 14.

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

**Tipos de decisão na primeira carga de ****`tipos_decisao`**: `reajuste`, `desconto` e `repasse_fornecedor`; `servico_adicional` (comércio, refaz a Nota nº 01); `bloqueio_cambio` (turismo, refaz a Nota nº 02). `comissao_canal` e `meta_performance` entram no P5; `preco_projeto` e `reajuste_contrato`, no P12. Cada tipo define sua regra de escolha (13.3).

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

Fórmula e pacote de cada alavanca: seção 13.8.

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

- [ ] Base sintética com efeito conhecido de +2 pontos de margem injetado no grupo tratado: a leitura recupera o efeito dentro do intervalo de 95% (13.9).
- [ ] Sem efeito injetado: a leitura não declara ganho em pelo menos 90 de 100 repetições.
- [ ] Protocolo assinado recusa alteração.
- [ ] Variável respeita o teto e nunca fica negativa.

## 9. Automações no n8n, telas e sistema de pricing

O n8n entra no diagnóstico com seis fluxos; as telas ganham oito áreas novas; o sistema de cotação já recebeu os três ajustes que lhe cabem.

### Fluxos do n8n (arquivos em `diagnostico-pricing/n8n/workflows`)

| Fluxo | Gatilho | Faz | Pacote |
|---|---|---|---|
| Focus semanal | Toda segunda-feira | Lê a API de Expectativas de Mercado do Banco Central (`olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/...`, recursos anuais, mensais e inflação 12 meses) e grava `premissas_mercado` | P3 |
| Rascunho da Nota | Nota passa a `simulada` | Envia ao Claude os números da simulação, grava o texto e roda `conferir_numeros_nota` | P3 |
| Data de revisão | Diário | Avisa o consultor das Notas com revisão no dia | P3 |
| Pacotes da instância | Chegada de um pacote | Carrega no diagnóstico de acompanhamento o pacote que a instância enviou (seção 14) e avisa o consultor; nada lê o banco do cliente | P6 |
| Alertas de margem | Após o cálculo do acompanhamento | Compara métricas com `alertas_regras` e avisa cliente e consultor | P8 |
| Fechamento do mês | Último dia útil | Conta Notas entregues por contrato contra a cota e marca as extras; soma horas | P8 |

### Telas (`apps/web`)

- **Nomes**: "dashboard" sai da interface; as abas viram Painel de margem e Business case.
- **Oportunidades**: as barras por cenário dão lugar à contribuição média por alavanca e à faixa P10–P90 do total, com a frase em frequência natural. P3.
- **Notas**: lista, editor (decisão, opções, premissas com origem, tornado, recomendação) e página entregue para o cliente. P3.
- **Proposta**: três níveis lado a lado, com Gestão em destaque, e o selo da garantia. Só o consultor vê. P4.
- **Medição**: protocolo, grupos, linha de base e leituras. O cliente vê o relatório. P7.
- **Contratos e horas**: nível, cota usada, horas por entrega. Só o consultor. P8.
- **Simulador do cliente**: na página da Nota entregue, premissas ajustáveis e resultado refeito na hora. P3.
- **Pacotes recebidos**: lista por cliente e competência, conferência do manifesto e carga. Só o consultor. P6.
- **Composição e portfólio**: cascata do preço por produto, cliente e canal; curva ABC por margem; matriz com os quatro grupos; cesta. P10.
- **Previsão e elasticidade**: séries com faixa, curva de reservas, elasticidade por categoria e reações dos concorrentes. P11.

### Sistema de pricing (`sistema-pricing/`)

1. **Motivo de perda em lista**: feito no sistema de cotação (ajuste A3), com categoria obrigatória e preço do concorrente opcional.
2. **Envio ao diagnóstico**: substitui a visão `extrato_diagnostico` e o papel `leitor_consultoria`. A instância gera e envia o pacote pseudonimizado (ajuste A10); o diagnóstico recebe no P6.
3. **Empresa fictícia de turismo**: feita no sistema de cotação (ajuste A1), com o pacote Lisboa calibrado pela Nota nº 02.

## 10. Plano de execução

Treze pacotes, um pull request cada. P0 a P3 formam a Fase 0 (semanas 3–4: demonstração e Notas nº 01 e nº 02 refeitas no sistema); P4, P5 e P10 a Fase 1 (semanas 5–8: diagnóstico vendável com garantia e os cinco módulos de análise); P6, P7, P8 e P11 a Fase 2 (semanas 9–16, dentro da primeira customização); P9 e P12 a Fase 3. P2, P3, P5 e P6 cresceram nesta revisão (seções 13 e 14).

| Pacote | Entrega | Depende de | Critério de aceite |
|---|---|---|---|
| P0 Preparação | Repositórios privados para `diagnostico-pricing` e `sistema-pricing` com histórico; histórico de migrações alinhado; RLS ligado em `app.segredos_demo` no projeto do sistema de pricing | — | Lista de migrações igual no arquivo e no projeto; os 19 testes e o roteiro de 26 conferências verdes no repositório novo |
| P1 Turismo na base | Colunas de reserva em `transacoes` e `motor.fato`, `bloqueios`, `diagnosticos.segmento` e `tipo`, validações novas, catálogo versão 2 com métricas de turismo, `demo-turismo.ts`, nova empresa fictícia no sistema de pricing | P0 | Operadora fictícia carrega e calcula; caso de referência de turismo conferido à mão; distribuição segue com nota 66,4 |
| P2 Simulação | `motor.base_simulacao`, pacote TypeScript, Edge Function, `premissas_distribuicao`, tabelas de simulação; premissas correlacionadas, varredura e ponto de virada, regra de escolha e grade de opções, capacidade no sorteio com o bloco `capacidade` (13.1 a 13.4); chance de atingir a meta, elasticidade de forma constante, medidas de margem e de faturamento (13.10) | P0 | Os quatro testes da seção 4 e os testes de 13.1 a 13.4 e 13.10 |
| P3 Nota de Decisão | Tabelas e funções da Nota, tipos `reajuste`, `desconto`, `repasse_fornecedor`, `servico_adicional` e `bloqueio_cambio`, `premissas_mercado`, fluxos Focus, rascunho e revisão, simulador do cliente, Nota completa, telas de Notas e Oportunidades nova (seção 5, 13.5 e 13.6) | P1, P2 | Notas nº 01 e nº 02 refeitas no sistema com chance a até 2 pontos e resultado provável a até 5% da apresentação; entrega recusada sem aprovação ou com número divergente; simulador do cliente reproduz a Nota; roteiro de 20 minutos roda sem falha |
| P4 Garantia e proposta | `ofertas_catalogo`, `garantias`, `proposta()`, `travar_garantia`, tela de proposta | P2 | Os dois testes da seção 6; premissa alterada após a trava aparece na auditoria e no painel |
| P5 MGAs e plano B | Catálogo de MGAs, `propostas` (alimentado também pelo `cotacoe``s.csv` do pacote, seção 14), `comissoes_pagas`, `contratos_performance`, serviço Python (regressão), origem das premissas, tipos `comissao_canal`, `meta_performance`, `preco_proposta` e `comissao_vendedor` (13.7); alavancas `comissao_canal`, `alcada_desconto` e `comissao_sobre_margem` (13.8); faixas de referência com fonte (seção 14) | P1, P3 | Regressão igual a um caso calculado fora do sistema; origem visível em toda premissa; chance de atingir a meta de performance conferida à mão |
| P6 Pacotes da instância | `contratos`, `extratos_cliente`, diagnóstico de acompanhamento, função `receber-pacote`, tela de pacotes recebidos e carga com mapeamento fixo (seção 14) | P3 | Pacote da instância de demonstração recebido, conferido e carregado sem de-para; a chave de envio não lê nada nem deposita para outro cliente |
| P7 Medição | Protocolo, grupos, efeito mínimo, leituras, variável, tela; tamanho do piloto, intervalo de 95% e protocolo de uma página (13.9) | P5, P6 | Os quatro testes da seção 8 |
| P8 Recorrência | Alertas, cota de Notas, horas, relatório do nível Gestão, fluxos de alerta e fechamento; regra do cliente fundador e registro da atualização de tabela (seção 14) | P6, P7 | Alerta dispara na base de demonstração quando a métrica cruza o limiar; Nota além da cota sai como extra |
| P9 Comércio e pesquisa | `pesquisas_dap`, Van Westendorp e Gabor-Granger com as regras da seção 14, comparação entre clientes do mesmo setor | P5 | Curvas conferidas contra cálculo de referência |
| P10 Composição, portfólio e capacidade | Prazo e forma de pagamento, bloco de despesas fixas, catálogo versão 3, curva ABC por margem, matriz e quatro grupos, cesta, over por fornecedor, margem-alvo, tipo quantidade_compra, alavancas markup_fornecedor e preco_antecedencia (13.8), cargas com dados pessoais pseudonimizados e base organizada entregue (seção 14) | P2 | Caso de referência à mão por métrica; quatro grupos conferidos num caso montado; distribuição segue com nota 66,4 |
| P11 Previsão, elasticidade e concorrência | Blocos de histórico de preços e preços dos concorrentes, previsão de demanda, curva de reservas, elasticidade pelo histórico, reação da concorrência (seção 14) | P5, P10 | Testes de recuperação da seção 14 |
| P12 Serviços e contratos recorrentes | Blocos de projetos e contratos recorrentes, tipos preco_projeto e reajuste_contrato, sobrevivência e regressão de Cox (seção 14) | P5, P11 | Base sintética com desvio de horas e cancelamento conhecidos |

Se a regra de troca de segmento disparar na semana 6, P5 perde a parte de MGAs e o pacote de comércio sobe, sem mudar o resto da ordem.

## 11. Prompt para o Claude Code

Exporte este documento em Markdown, salve como `diagnostico-pricing/docs/ajustamento-v3.md` e abra uma sessão por pacote com o texto abaixo, trocando `P1` pelo pacote da vez.

```text
Você vai implementar o pacote P1 do documento diagnostico-pricing/docs/ajustamento-v3.md
no sistema de diagnóstico de pricing (pasta diagnostico-pricing, projeto Supabase diagnostico_pricing).

Antes de começar:
1. Leia ajustamento-v3.md inteiro, inclusive a Cobertura do escopo e as seções 13 e 14, o README.md e docs/pendencias.md da pasta.
2. Leia as cinco migrações em supabase/migrations e os testes em ferramentas/testes.
3. Rode pnpm test e confirme que todos os testes passam (30 depois do P1) antes de mudar qualquer coisa.

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

### Prompt para construir todos os pacotes em sequência

Use este quando quiser que o Claude Code siga até o P12 sem abrir uma sessão por pacote, na ordem das fases da seção 10. Ele usa o padrão provisório de cada pendência da seção 12 e só para quando um critério de aceite não fecha.

```text
Você vai concluir o sistema de diagnóstico de pricing seguindo diagnostico-pricing/docs/ajustamento-v3.md
(exporte de novo o documento antes de começar: ele inclui as seções 13 e 14 e os pacotes P10 a P12),
do ponto em que docs/pendencias.md parou até o P12, e os ajustes de sistema-pricing/docs/ajustes-v3.md
que os pacotes do diagnóstico usam.

Decisão de 19/11/2026: o repositório fica público durante os testes. A regra 8 não bloqueia mais o P2.
Não use dado real de cliente.

Ordem:
1. Termine o P1 no projeto Supabase diagnostico_pricing (as funções de validação, base, métricas, pontuação,
   API e acesso que ficaram de fora), registre em docs/migracoes.md e rode pnpm homologar contra o projeto real.
2. Fase 0: P2 e P3. Fase 1: P4, P5 e P10. Fase 2: P6, P7, P8 e P11. Fase 3: P9 e P12.
   Um pull request por pacote, nesta ordem.
3. Para cada pendência da seção 12, use o padrão da coluna "Enquanto não decide" e registre em
   docs/pendencias.md que é provisório.

Regras de cada pacote:
- Antes: pnpm test verde. Depois: pnpm test, pnpm typecheck, roteiro do navegador e homologação verdes.
- A distribuição fictícia continua com nota geral 66,4 e ganhos de R$ 18.031, R$ 52.147 e R$ 108.883 nos três cenários.
- Só migrações novas; não renomeie cliente_id; Monte Carlo no serviço TypeScript, não em SQL.
- Toda métrica, alavanca, previsão e leitura estatística nova tem caso de referência conferido à mão.
- Os critérios de aceite da seção 10 e das seções 13 e 14 passam antes do próximo pacote.
- Atualize docs/pendencias.md no mesmo pull request: feito, verificado, não verificado.

Pare e me pergunte só se um critério de aceite não puder ser cumprido ou se o documento contradisser o código
de um jeito que mude o resultado para o cliente.
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
| Correlações iniciais das Notas nº 01 e nº 02 | Teste de aceite do P3 | 0,5 entre adesão e pedidos a mais, origem informada |
| Limite de risco padrão da regra de escolha | Nenhum pacote | 10% de chance de prejuízo |
| Rodadas e níveis que recebem o simulador do cliente | Nenhum pacote | 50 rodadas por dia, todos os níveis |
| Cortes da curva ABC e da matriz; mínimos da cesta; taxa do custo financeiro do prazo | Nota geral do P10 | 80% e 95%, medianas, 30 pedidos e lift 1,2, Selic projetada; métricas informativas |
| Janela e mínimo de eventos da reação da concorrência; variação mínima de preço para estimar elasticidade | Nenhum pacote | 30 dias e 5 eventos; regra de variação no catálogo, ajustada no primeiro cliente |
| Estrutura de custo da operadora fictícia (custos fixos por passageiro, como no slide, ou 18% proporcional ao preço, como na Nota nº 02) | Nenhum pacote | As duas ficam como casos de aceite; escolher uma só para as três bases fictícias (slide, sistema de cotação e diagnóstico) |
| Faixas iniciais das premissas sem histórico (reação do canal à comissão, captura da alçada, queda do desconto com comissão sobre margem) | Nenhum pacote | Origem informada e faixa larga, até o primeiro cliente |
| Mínimo de respondentes da pesquisa de disposição a pagar | Nenhum pacote | 50 por segmento |
| Números e fontes dos slides (sorteios, tabela de concorrência) | Nenhum pacote | Padronizar pelos números do sistema depois do P3 |

## 13. Complementos à simulação e à Nota (P2, P3, P5)

Estes complementos fecham o que a apresentação promete sobre a simulação e a Nota. Entram nos pacotes indicados, junto com o que as seções 4 e 5 já pedem.

### 13.1 Premissas que andam juntas (P2)

- Tabela `premissas_correlacao` (por tipo de decisão ou por Nota): `premissa_a`, `premissa_b`, `rho` (correlação de postos, entre −0,95 e 0,95), `origem`, `fonte`.
- Sorteio por cópula gaussiana: normais independentes viram normais correlacionadas pela decomposição de Cholesky, depois uniformes pela distribuição normal acumulada, depois o valor de cada premissa pela sua função quantil (seção 4). As faixas P10, P50 e P90 de cada premissa não mudam.
- A correlação de postos desejada (ρs) vira correlação das normais por r = 2 × sen(π × ρs ÷ 6).
- Matriz que não é positiva definida: o serviço recusa e aponta o par incoerente; não corrige sozinho.
- A premissa discreta (reação da concorrência) entra na mesma cópula pela sua uniforme, o que permite correlacioná-la com outras.
- Valores iniciais no P3: adesão à taxa e pedidos a mais (Nota nº 01) com ρs = 0,5 e origem `informada`, até conferir o valor usado na Nota original.

Testes: com ρs = 0, mesmo resultado da simulação sem correlação e mesma semente; com ρs = 0,8, correlação de Spearman amostral entre 0,77 e 0,83 em 10.000 sorteios; P10, P50 e P90 amostrais de cada premissa a menos de 1% dos informados.

### 13.2 Ponto em que a recomendação muda (P2)

- Função `varrer(simulacao, premissa, valores)`: refaz a simulação com os mesmos sorteios para cada valor (por exemplo, chance de reação de 0% a 60%, de 5 em 5 pontos) e grava em `simulacao_varreduras` (`simulacao_id`, `premissa`, `valor`, `opcao`, `media`, `p50`, `prob_positivo`, `prob_prejuizo`, `opcao_escolhida`).
- Ponto de virada: primeiro valor em que a opção escolhida pela regra de 13.3 muda, interpolado entre os dois pontos vizinhos. A Nota mostra a frase "a recomendação muda se X passar de Y".
- Toda Nota com reação da concorrência roda a varredura dessa premissa por padrão; o consultor pode varrer qualquer outra.

Testes: na Nota nº 01 refeita, o ponto de virada fica entre 30% e 40% (apresentação: cerca de 35%); na nº 02, a escolha passa de 100 para 90 lugares entre 30% e 35% de chance de reação.

### 13.3 Regra de escolha e grade de opções (P2, P3)

- Coluna `tipos_decisao.criterio` com quatro regras: `max_media`, `max_p50`, `max_prob_ganho` e `max_p50_com_risco` (maior P50 entre as opções com chance de prejuízo até um limite, padrão 10%).
- Opções em grade: um tipo pode gerar opções por faixa (bloqueio de 60 a 180 lugares, de 10 em 10), todas com os mesmos sorteios.
- A Nota mostra a regra usada e, ao lado, o que cada uma das outras escolheria.

Teste: na Nota nº 02, `max_p50_com_risco` com limite de 10% escolhe 100 lugares com câmbio travado, e 140 lugares têm P50 negativo.

**Chance de atingir a meta.** Cada opção pode ter uma meta de margem ou de faturamento no horizonte da Nota. A simulação devolve, além da chance de ganho, `prob_meta`: a chance de o resultado ficar na meta ou acima, também em frequência natural. A meta vem do cliente; sem ela, usa a margem-meta da política do sistema de cotação, quando houver.

### 13.4 Capacidade dentro do sorteio (P2, com os dados do P10)

- Premissa de capacidade por recurso (unidades por mês) e uso por venda, vinda do bloco `capacidade` (seção 14). Em cada sorteio, o volume acima da capacidade livre não é vendido; se o bloco trouxer custo de capacidade extra, ele é cobrado em vez disso.
- Saídas novas por opção: chance de faltar capacidade e volume perdido médio.
- O volume de equilíbrio (seção 5) é conferido contra a capacidade livre; se passar dela, a Nota avisa que a decisão não se paga mesmo que a venda venha.

O bloco de carga `capacidade` (recurso, unidade, capacidade por mês, uso por venda, custo da unidade extra) nasce no P2, para a capacidade já funcionar no P3; o P10 só acrescenta a métrica de utilização.

Testes: com capacidade livre de 100 unidades e volume adicional sorteado acima disso, nenhum sorteio vende mais de 100 a mais; com custo de unidade extra informado, a margem cai por esse custo em vez de o volume ser cortado.

### 13.5 Simulador entregue com a Nota (P3)

- Na página da Nota entregue, o cliente muda as premissas que o consultor marcou como ajustáveis (P10, P50 e P90, chance de reação, valores das opções) e vê de novo a chance, a faixa e a recomendação.
- Usa o serviço da seção 4. Se o tempo de 10.000 sorteios medido no P2 passar de 3 segundos, a tela roda 2.000 e avisa.
- Rodadas do cliente ficam em `simulacoes` com `origem = 'cliente'`, ligadas à Nota, e nunca alteram a versão entregue. Limite padrão de 50 rodadas por dia por cliente.
- Os perfis `cliente_editor` e `cliente_leitor` simulam; só o consultor salva premissas na Nota.

Testes: rodada do cliente com as premissas da versão entregue reproduz o resultado da Nota; o cliente não grava em `nota_versoes` nem em `nota_premissas`.

### 13.6 Nota completa (P3)

- **Equilíbrio e meta** em unidades e em reais. Com custos proporcionais ao preço (comissão, impostos), a margem nova é calculada direto, sem a fórmula simples. Casos de conferência: Nota nº 02, desconto de 5%, margem de R$ 587 para R$ 181 por passageiro e +224% de passageiros (18% do preço proporcional); a mesma conta com todos os custos fixos dá margem de R$ 92 e cerca de +540%, o número do slide.
- **Custo de não decidir** por mês e no horizonte da Nota.
- **Medição combinada**: campos `indicador`, `grupo_comparacao` (unidade e critério propostos) e `data_leitura` em `notas_decisao`; no P7 eles viram um `protocolos_medicao`.
- **Câmbio no pagamento** (bloqueio): centro no câmbio de referência informado ou, para o dólar, na mediana do Focus para a data do pagamento; faixa pela volatilidade histórica de 12 meses da PTAX da moeda, ajustada ao prazo (σ × √t), com origem `referencia`.
- **Custo de travar o câmbio**: (câmbio travado − câmbio esperado no pagamento) × valor em moeda. O câmbio travado é informado (cotação do banco) até a licença da curva futura. "Travar" e "em aberto" usam os mesmos sorteios de procura.
- **Tipo ****`repasse_fornecedor`** (comércio): aumento de custo do fornecedor em faixa; opções repassar 0%, 50% ou 100%; elasticidade da categoria.
- **Tipo ****`servico_adicional`**, antecipado do P5 para refazer a Nota nº 01: opções "embutir com reajuste" e "taxa opcional"; premissas adesão, pedidos a mais, custo por entrega, custo fixo e capacidade.

O critério de aceite do P3 passa a ser: Notas nº 01 e nº 02 refeitas com as premissas originais, com chance de ganho a até 2 pontos e resultado provável a até 5% dos valores da apresentação.

**Equilíbrio: fórmulas e casos que o teste confere.** Mudança de preço p com margem m: variação de volume = −p ÷ (m + p). Custo fixo novo: vendas a mais = custo fixo adicional ÷ margem de contribuição unitária. Com custos proporcionais ao preço, a margem nova é calculada direto. Casos:

| Caso | Resultado esperado |
|---|---|
| Margem de 30%, desconto de 5% | +20% de volume |
| Margem de 30%, desconto de 10% | +50% de volume |
| Margem de 30%, reajuste de 5% | volume pode cair até 14,3% |
| Serviço de R$ 20 mil por mês, margem de R$ 80 por venda | 250 vendas a mais por mês |
| Nota nº 01: reajuste de 3% e taxa opcional | +5,1% e +2,5% de pedidos |
| Nota nº 02: desconto de 5% | +224% de passageiros |
| Slide do exemplo de turismo: margem de 5,9%, desconto de 5%, todos os custos fixos por passageiro | cerca de +556% (0,05 ÷ 0,009); com a margem exata de R$ 587, +538% |

**Elasticidade no serviço adicional.** A opção "embutir com reajuste" sorteia a elasticidade em faixa, como na Nota nº 01.

**Roteiro de 20 minutos do diagnóstico** (aceite do P3): 1. arquivos da operadora fictícia carregados (pacote baixado ou planilhas); 2. painel de margem e de câmbio; 3. oportunidades com faixa por alavanca; 4. Nota nº 02 com o tamanho do bloqueio, travar ou não o câmbio e o ponto de virada; 5. simulador do cliente mudando a chance de reação; 6. Nota nº 01 com as duas formas de cobrar a entrega. O passo 7, proposta com ganho provável, margem de equilíbrio e garantia, entra com o P4. O roteiro automatizado no navegador confere cada passo.

### 13.7 MGAs: meta de performance (P5)

- Tipo `meta_performance`: sorteia a produção mensal da carteira por canal (base: histórico; com o P11, a previsão) e a métrica da meta (`contratos_performance.meta_tipo`); devolve a chance de atingir cada faixa e o bônus esperado.
- Meta que dependa de sinistralidade só entra com dado compartilhado pela MGA (pendência da seção 12).

Teste: caso montado à mão com produção e meta conhecidas; a chance de atingir confere com o cálculo analítico a menos de 1 ponto.

**Chance de fechar pelo preço (P5).** A regressão logística de ganhas e perdidas gera também a curva da chance de ganhar contra o desconto (ou o preço), com faixa. Tipo `preco_proposta`: escolhe o preço que maximiza a margem esperada (chance de ganhar × margem), sorteando os coeficientes dentro do erro da regressão.

**Comissão sobre a venda ou sobre a margem (P5).** Tipo `comissao_vendedor`, com a alavanca `comissao_sobre_margem` (13.8) sobre `comissoes_pagas` e `propostas`. Usa o mesmo cálculo do simulador de comissão do sistema de cotação (ajuste A7).

### 13.8 Regras das alavancas novas (P3, P5, P10)

| Alavanca | Pacote | Regra |
|---|---|---|
| `tamanho_bloqueio` | P3 | Grade de lugares; procura sorteada; vendidos = mínimo entre procura e lugares; sobra paga a multa ou o custo do lugar; escolha pela regra de 13.3 |
| `cambio_travar_ou_repassar` | P3 | Travar: custo em moeda × câmbio travado. Em aberto: × câmbio sorteado no pagamento. Repassar: preço corrigido pelo câmbio até a data-limite, com elasticidade |
| `markup_fornecedor` | P10 | Onde o markup atual fica abaixo do alvo do catálogo, preço novo = custo × (1 + alvo); quantidade ajustada pela elasticidade; só entra onde o ganho é positivo (mesma estrutura do reajuste seletivo) |
| `preco_antecedencia` | P10 | Preço por faixa de antecedência = preço × (1 + ajuste da faixa); procura de cada faixa pela elasticidade da faixa; total limitado aos lugares do bloqueio |
| `comissao_canal` | P5 | Comissão do canal passa de k para k'; margem por venda muda em (k − k') × preço; volume do canal = Q × (1 + εc × (k' − k) ÷ k), com εc (reação do canal à comissão) em faixa |
| `alcada_desconto` | P5 | Descontos acima do novo limite passam a exigir aprovação; uma fração deles volta ao limite (captura) e outra fração das vendas se perde; ganho = desconto recuperado − margem das vendas perdidas |
| `comissao_sobre_margem` | P5 | Custo de comissão pela regra nova (percentual × margem) contra a atual (percentual × receita); desconto médio de cada vendedor cai em faixa; ganho = margem recuperada pelo desconto menor − diferença no custo de comissão |

Cada alavanca tem caso de referência à mão no pacote em que entra. Premissas sem histórico (reação do canal, captura, queda do desconto) entram com origem `informada` e faixa larga.

### 13.9 Medição: tamanho do piloto, confiança e protocolo (P7)

- **Tamanho do piloto**: inverte a fórmula do efeito mínimo da seção 8. Unidades por grupo = 2 × (2,80 × σ ÷ efeito esperado)². Para métricas semanais, semanas = unidades-semana necessárias ÷ unidades disponíveis por grupo, supondo semanas independentes (aproximação declarada na tela). A tela responde "quantas lojas, regiões ou clientes e quantas semanas".
- **Intervalo de 95%**, como no slide de controle. A tabela `medicoes` ganha `nivel_confianca`, e o primeiro teste da seção 8 confere a recuperação do efeito dentro do intervalo de 95%.
- **Protocolo de uma página**: `protocolo_documento(p_protocolo)` gera a página de impressão com métrica, linha de base, comparação, tamanho, regra de leitura e data. Teste: cabe numa página A4 no navegador.

### 13.10 Forma de cálculo e números de referência (P2, P3, P11)

- **Forma da elasticidade**: o serviço aceita `constante`, com q' = q × (p' ÷ p)^ε, padrão das Notas e do slide de elasticidade, e `linear`, com q × (1 + ε × Δp ÷ p), igual a `motor.simular`. O teste de paridade do P2 usa `linear`; as Notas usam `constante`. Conferência: com ε = −1,2, um reajuste de 3% dá −3,5%; um reajuste de 5% com ε de −0,5, −1,2 e −2,0 dá −2,4%, −5,7% e −9,3%.
- **Medidas**: `simulacao_resultado` ganha a coluna `medida` (`margem`, `faturamento`, `volume`), para a Nota mostrar a faixa de margem e a de faturamento.
- **Sorteios**: padrão de 10.000, configurável por Nota, que informa o número usado. As Notas refeitas no sistema usam 10.000, e a linha de fonte dos slides passa a citar esse número (hoje cita 6.000 no exemplo de turismo e 20.000 na tabela de concorrência).
- **Referência da Nota nº 01 com reação**: valem os números da Nota original. Sem reação, 32 e 76 em 100 (reajuste e taxa); com 20% de chance, 39 e 60; com 40%, 48 e 45; com 60%, 57 e 30. Os slides diferem em até 1 ponto (32 e 75, 40 e 60, 49 e 45; 31 e 76 no exemplo), dentro da tolerância de 2 pontos; padronizar os slides pelos números do sistema.
- **Curto ou longo prazo (P11)**: Nota com horizonte de até 3 meses usa a elasticidade de curto prazo; acima disso, a de longo prazo. A Nota mostra as duas.

## 14. Análises novas e recebimento de dados (P6, P10, P11, P12)

### P6 revisto: pacotes da instância

O P6 deixa de ler o banco do cliente com um papel somente leitura. A instância do sistema de cotação envia, todo mês, um pacote pseudonimizado no formato `pacote-diagnostico/1` (ajuste A10 do documento [Ajustes do Sistema de Pricing](https://claude.ai/artifact/6FNumBoL6UrH3Q5j8hzqFQ)).

- Função `receber-pacote`: aceita só chave de envio válida, que deposita pacotes de um único cliente e não lê nada; confere versão, hashes e contagens do manifesto; guarda o ZIP em armazenamento privado; registra em `extratos_cliente`; devolve recibo.
- Mesmo hash na mesma competência não muda nada; hash novo vira nova versão e a anterior fica marcada como substituída.
- Tela do consultor "Pacotes recebidos": carrega o pacote no diagnóstico de acompanhamento com mapeamento fixo, sem de-para. Os arquivos `transacoes`, `custos`, `produtos`, `contas` e `custos_servir` já usam os nomes de campo dos blocos atuais; `cotacoes.csv` entra no bloco `propostas` do P5 por mapeamento fixo: `aceita` vira ganha, `perdida` e `expirada` viram perdida, `emitida` vira aberta; `categoria_perda` vai para `motivo_perda`, `preco_lista` × `quantidade` para `valor_lista` e `comissao_canal_pct` para `comissao_pct`. Piloto e braço seguem para a medição do P7.
- Aceita a versão atual do contrato do pacote e a anterior.

### P10 Composição, portfólio e capacidade (Fase 1)

| Dado novo | Conteúdo |
|---|---|
| `transacoes` | Colunas `prazo_pagamento_dias` e `forma_pagamento` |
| Bloco `despesas_fixas` | Mês, centro de custo, valor, critério de rateio (receita, volume ou horas) |
| Bloco `capacidade` | Criado no P2 (13.4); o P10 acrescenta só a métrica de utilização |
| `custos_servir.tipo` | Valor novo `taxa_cartao`, por forma de pagamento |

Métricas do catálogo versão 3, informativas até haver limiar:

| Código | Dimensão | Cálculo |
|---|---|---|
| `custo_financeiro_prazo_pct` | realizacao | preço faturado × taxa mensal × prazo ÷ 30, sobre a receita; taxa da Selic projetada em `premissas_mercado` ou informada |
| `taxa_cartao_pct` | realizacao | taxas de cartão ÷ receita |
| `margem_apos_fixos_pct` | margem | margem de contribuição menos despesas fixas rateadas, ÷ receita |
| `receita_abaixo_piso_pct` | margem | receita vendida abaixo do piso de custo (custo variável unitário total, inclusive custo de servir) |
| `distancia_preco_alvo_pct` | margem | (preço-alvo − preço praticado) ÷ preço-alvo, com preço-alvo = custo variável ÷ (1 − margem-alvo) |
| `concentracao_margem_pct` | portfolio | parcela dos produtos que formam 80% da margem de contribuição total |
| `utilizacao_capacidade_pct` | capacidade | uso ÷ capacidade, por recurso |
| `over_fornecedor_pct` | margem (turismo) | over recebido ÷ custo, por fornecedor |

O piso de custo convive com o piso da banda de preço já existente: um é o mínimo que não dá prejuízo, o outro o mínimo praticado pelo mercado da própria empresa.

**Portfólio (módulo 2):**

- Curva ABC por margem de contribuição total (A até 80% acumulado, B até 95%, C o resto; cortes no catálogo), ao lado da ABC por receita, com destaque para os produtos que mudam de classe.
- Matriz margem unitária × volume, com cortes nas medianas (configuráveis), e quatro grupos: proteger margem (margem acima da mediana); ajustar preço (margem abaixo, volume acima, sem efeito de cesta); manter como gerador de volume ou tráfego (margem abaixo, com efeito de cesta); revisar ou descontinuar (margem abaixo, volume abaixo e sem efeito de cesta, ou margem negativa).
- Uma regra de achado por grupo, com o valor exposto e a ação recomendada.

**Cesta:**

- Pares de produtos no mesmo pedido (`nota_fiscal`): suporte, confiança e lift; mínimos no catálogo (padrão: 30 pedidos com o par e lift de pelo menos 1,2).
- Efeito de cesta de um produto: margem média dos pedidos que o contêm, menos a margem do próprio produto.
- Depende de pedido com vários itens, que vem da carga do sistema de gestão do cliente. O pacote do sistema de cotação tem um produto por cotação e não alimenta a cesta.

Testes: caso de referência à mão para cada métrica; os quatro grupos conferidos num caso montado; a empresa fictícia de distribuição segue com nota geral 66,4.

**Também no P10:**

- **Margem-alvo**: `diagnosticos.margem_alvo_pct`, informada pelo consultor; quando o cliente usa o sistema de cotação, o padrão é a margem-meta da política dele. Sem margem-alvo, `distancia_preco_alvo_pct` não é calculada.
- **Quanto comprar para a temporada** (tipo `quantidade_compra`, comércio): grade de quantidades; procura sorteada (informada no P10, prevista pelo P11 depois); vendido = mínimo entre procura e quantidade; sobra vale o custo menos o valor residual informado; falta perde a margem; escolha pela regra de 13.3. É o cálculo do bloqueio de turismo aplicado ao estoque.
- **Alavancas de turismo** `markup_fornecedor` e `preco_antecedencia`, com as regras de 13.8.
- **Dados pessoais nas cargas por planilha**: a carga ganha a marca `clientes_pessoas_fisicas`. Com ela, `conta` vira código HMAC com chave por cliente guardada só no servidor, e `contas.nome` é descartado. Para cliente empresa, nada muda, porque razão social não é dado pessoal. E-mail, telefone e documento não têm campo de destino, e o arquivo original não é guardado. Teste: depois de uma carga marcada, nenhum valor original de conta aparece no banco.
- **Base organizada entregue à empresa**: `exportar_base(p_diag)` gera um ZIP com os blocos normalizados e validados (nos nomes de campo da carga) e um dicionário de dados, anexado à publicação do diagnóstico.
- **Efeito de cesta relevante**: o produto tem pelo menos um par que passa os mínimos do catálogo (suporte e lift).

### P11 Previsão, elasticidade histórica e concorrência (Fase 2)

Roda no serviço Python da seção 8.

| Dado ou saída | Conteúdo |
|---|---|
| Bloco `historico_precos` | Produto, início, fim, preço de tabela, tipo `tabela` ou `promocao` |
| Bloco `precos_concorrentes` | Data, concorrente, produto ou equivalente, preço |
| Tabela `previsoes` | Série, mês, P10, P50, P90, modelo |
| Tabela `elasticidades_estimadas` | Recorte, curto prazo, longo prazo, P10, P50, P90, observações, método |
| Tabela `reacoes_concorrencia` | Tipo de evento, reações por tipo, eventos, chance |

- **Previsão de demanda**: série mensal por produto ou categoria; decomposição STL (tendência, sazonalidade, resto); suavização exponencial com tendência e sazonalidade (ETS), escolhida por AIC; 6 meses à frente com intervalo de 80% (P10 a P90). Com menos de 24 meses, só tendência, e a previsão sai marcada.
- **Curva de reservas (turismo)**: reservas finais previstas = reservas atuais × fator médio de crescimento até a saída, por antecedência, nas saídas passadas; faixa pela dispersão desses fatores; status à frente ou atrás do esperado.
- **Elasticidade pelo histórico**: painel produto × mês; logaritmo da quantidade contra logaritmo do preço líquido, com efeitos fixos de produto e de mês (compara com o que não mudou de preço e absorve a sazonalidade), preço do concorrente como controle quando houver e defasagens de 1 a 3 meses (curto prazo = coeficiente do mês; longo prazo = soma); erros agrupados por produto. Saída P10, P50 e P90 por categoria, com origem `medido`. Sem variação de preço suficiente (regra no catálogo), não estima, e o plano B segue para `estimado`.
- **Reação da concorrência**: para cada mudança de preço própria (de `historico_precos`), verifica se o concorrente mudou o preço em até N dias (padrão 30) e classifica em ignorar, acompanhar, copiar ou contra-atacar. Com menos de 5 eventos, a chance entra com origem `informada` e faixa larga.
- As três saídas entram nas Notas como premissas, com origem e fonte.

Testes: base sintética com elasticidade −1,2 injetada — o intervalo de 80% estimado contém −1,2; série com sazonalidade conhecida — o intervalo de 80% cobre entre 70% e 90% dos meses de teste; reação — caso montado à mão.

### P12 Serviços e contratos recorrentes (Fase 3)

| Dado novo | Conteúdo |
|---|---|
| Bloco `projetos` | Tipo, horas orçadas, horas realizadas, custo por hora, preço |
| Bloco `contratos_recorrentes` | Conta, início, fim ou cancelamento, valor mensal, reajustes, motivo |

- **Custo de projeto de preço fechado**: Monte Carlo com a distribuição observada da razão horas realizadas ÷ orçadas por tipo de projeto (reamostragem). Saídas: chance de prejuízo no preço proposto e preço que leva essa chance a até 10%. Tipo de decisão `preco_projeto`.
- **Cancelamento e valor do cliente**: curva de sobrevivência (Kaplan-Meier) por segmento; regressão de Cox com o reajuste recebido como covariável, para medir quanto um reajuste muda o risco de cancelamento; valor do cliente = soma da margem mensal × chance de continuar, descontada. Tipo de decisão `reajuste_contrato`.
- Mesmo serviço Python; o `statsmodels` tem os dois modelos.

Testes: base sintética com desvio de horas e taxa de cancelamento conhecidos, recuperados dentro do intervalo de 80%.

### P5, P8 e P9: regras que faltavam

- **Faixas de referência do setor (P5)**: `faixas_elasticidade` começa vazia e só aceita linha com fonte publicada (URL e data). Sem linha para o segmento, a origem cai para `informada`.
- **Van Westendorp (P9)**: ponto de barateza marginal = cruzamento de "muito barato" com "não é barato" (1 − barato); ponto de carência marginal = cruzamento de "muito caro" com "não é caro" (1 − caro); a faixa aceitável vai de um ao outro; preço ótimo = cruzamento de "muito barato" com "muito caro".
- **Gabor-Granger (P9)**: proporção que compraria em cada preço testado dá a curva de demanda; elasticidade entre preços vizinhos; faixa P10–P90 por reamostragem dos respondentes; entra nas Notas com origem `pesquisa`. Mínimo padrão de 50 respondentes por segmento, no catálogo.
- **Cliente fundador (P8)**: `contratos.fundador = true` cobra o nível Gestão e entrega o Completo (cota de 6 Notas e medição com grupo de controle), sem parte variável, por 12 meses. Uma restrição impede mais de 2 contratos fundadores ativos.
- **Atualização de tabela (nível Essencial, P8)**: o trabalho é feito no sistema de cotação do cliente (importação do fluxo 04 e publicação com simulação de impacto). No diagnóstico, `horas_registro.atividade` ganha o valor `atualizacao_tabela`, e o fechamento do mês lista as atualizações feitas por contrato.

### Fontes

- [Análise: sistema de diagnóstico — ajustes ao plano v3](https://claude.ai/artifact/3PK3bYFa2aWcxTbAXrtGXh)
- [Plano de negócio v3](https://claude.ai/artifact/HXb2ioY5yvwFvHMkiY7NfJ)
- [Arquitetura do sistema de diagnóstico](https://claude.ai/artifact/K8Zs3REsTnrnCkGcEzoFAp)
- [Repositório Fedrumer/Calculadora_Pricing_00001](https://github.com/Fedrumer/Calculadora_Pricing_00001), branch `main`, conferido em 18/11/2026
- [Banco Central — API de Expectativas de Mercado](https://dadosabertos.bcb.gov.br/dataset/expectativas-mercado/resource/fb40c7c5-c5f7-40a3-9791-4f68021929ad)
- [B3 — Política de Consumo de Market Data](https://www.b3.com.br/data/files/66/82/D8/17/973699100A29E189AC094EA8/Politica%20de%20Consumo%20Market%20Data%20B3.pdf)
