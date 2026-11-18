# O que foi verificado e o que falta

O plano de ajuste ao v3 está em `docs/ajustamento-v3.md` (dez pacotes, P0 a P9). Esta página registra, por pacote,
o que foi feito, o que foi verificado e o que não foi.

## Andamento do plano v3

| Pacote | Situação |
| --- | --- |
| P0 Preparação | Parcial: documento salvo, de-para das migrações em `docs/migracoes.md`, RLS ligado em `app.segredos_demo`. Faltam os repositórios privados, que dependem de você |
| P1 Turismo na base | Feito no código e verificado localmente. No projeto Supabase, só a estrutura e o catálogo entraram (veja abaixo) |
| P2 a P9 | Não começados. O P2 (simulação) espera os repositórios privados, como manda a regra 8 do plano |

## P0 Preparação (18/11/2026)

- **Documento**: `docs/ajustamento-v3.md`, cópia em Markdown do documento do plano.
- **Histórico de migrações**: o projeto continua recebendo migrações pelo conector; `docs/migracoes.md` registra,
  para cada arquivo, a versão e o nome usados no projeto. Não rode `supabase db push` sem antes alinhar o histórico.
- **`app.segredos_demo`** (projeto do sistema de pricing): RLS ligado no projeto (`rls_segredos_demo`) e no código
  que cria a tabela (`sistema-pricing/supabase/functions/api/src/segredos-demo.ts`, com o pacote da API regerado).
  A tabela pertence ao `postgres`, que é quem a lê, então o RLS sem política não muda o funcionamento. Os 98 testes
  do sistema de pricing (33 do motor e 65 da API) passaram depois da mudança.
- **Não feito: repositórios privados.** Só existe o repositório público `Fedrumer/Calculadora_Pricing_00001`, e criar
  repositórios fica fora do alcance desta sessão. O comando de separação com histórico está no README do sistema
  de pricing (`git subtree split --prefix=diagnostico-pricing` e `--prefix=sistema-pricing`).

## P1 Turismo na base (18/11/2026)

### Feito

- Migração `20261118000100_turismo.sql`: colunas de reserva em `transacoes` e em `motor.fato`, tabela `bloqueios`,
  `diagnosticos.tipo` e `diagnosticos.segmento`, bloco `bloqueios` nas cargas, `metricas_catalogo.segmentos` e catálogo
  versão 2 (a versão 1 inteira mais sete métricas de turismo, informativas, e pesos de operadora e consolidadora).
- Motor: o custo vem da própria reserva quando ela traz custo em moeda (câmbio do pagamento, ou o da venda como
  projeção, menos o over) e da tabela de custos quando não traz. Validações novas: reserva cancelada à parte,
  serviço antes da venda, moeda e câmbio, câmbio projetado e bloqueio com vendidos acima dos contratados.
- Métricas de turismo: margem por passageiro, markup por fornecedor, resultado cambial, folga até o câmbio de
  equilíbrio, ocupação dos bloqueios, custo de lugar não vendido e reservas contra o ano anterior; recorte por fornecedor.
- Pontuação por segmento: cada diagnóstico usa as métricas do seu segmento e os pesos dele.
- Telas: segmento no novo diagnóstico e na lista, bloco de bloqueios e campos de reserva na carga (só em turismo),
  aba Câmbio e capacidade.
- Empresa fictícia de turismo (`ferramentas/src/demo-turismo.ts`): Atlântica Viagens, 1.737 reservas em 12 meses,
  Portugal, Paris e Orlando, e o bloqueio Lisboa de julho com os números da Nota nº 02.

### Verificado

- **30 testes** contra Postgres 16 (eram 19). Os 19 de antes continuam passando, e o teste de acesso agora trava os
  números da distribuição no catálogo versão 2: nota geral 66,4 e ganhos de R$ 18.031, R$ 52.147 e R$ 108.883.
- **Caso de referência de turismo** (`ferramentas/testes/turismo.test.ts`): cada uma das sete métricas, as validações
  e o custo de cada reserva conferidos contra contas feitas à mão, escritas no cabeçalho do teste.
- **Operadora fictícia**: carrega e calcula em menos de 1 segundo; o bloqueio de Lisboa sai com 34 de 40 lugares
  vendidos e R$ 586,98 por passageiro (preço R$ 9.900, comissão de 10%, 1.364,43 EUR pagos a R$ 6,10).
- **Roteiro no navegador com 37 conferências** (eram 26), incluindo a carga dos arquivos de reservas e bloqueios da
  operadora pela tela, com os títulos do sistema dela reconhecidos, e o cálculo sem arquivo de custos.
- `pnpm typecheck` e o build de produção da aplicação.

### Não verificado

- **Aplicação no projeto Supabase incompleta.** O trecho de estrutura e catálogo entrou (`turismo_estrutura_e_catalogo`).
  O segundo trecho (validação) ficou parado numa pergunta de confirmação do conector que não foi respondida a tempo;
  as funções do motor e da API ainda são as da Fase 1. Até completar: o catálogo versão 2 está vigente no projeto com as
  funções antigas, e um recálculo da distribuição lá mostraria as dimensões Câmbio e Capacidade vazias na nota por
  dimensão (a nota geral não muda). A homologação no projeto real fica para depois de completar.
- **Empresa fictícia no sistema de pricing**: não trocada. Veja as contradições abaixo.
- Dados reais de uma operadora.

### Contradições entre o plano e o código, e a saída adotada

1. **Projeção de câmbio no P1 depende de tabela do P3.** O plano manda usar `premissas_mercado` quando falta o câmbio
   do pagamento, mas essa tabela só nasce no P3. No P1 a projeção é o câmbio da venda (resultado cambial zero na linha),
   e a linha fica marcada como projetada; no P3 a projeção passa a vir do Focus.
2. **Trocar `demo-assistencia` no sistema de pricing quebra os testes de lá.** Os 33 testes do motor e os 65 da API usam
   essa empresa como base, com casos de referência conferidos à mão. Proposta: acrescentar uma terceira configuração,
   `demo-operadora.json`, coerente com a Atlântica Viagens, e torná-la a padrão da demonstração, mantendo a de
   assistência só como base dos testes. Não implementado: espera sua decisão.
3. **P1 depende do P0, mas os repositórios privados só são exigidos antes do P2.** O P1 foi feito no repositório atual.
4. **Pesos de turismo.** O plano deixa os pesos pendentes. Câmbio e Capacidade entraram com peso 10 provisório; como
   as métricas delas não têm limiar, ficam sem nota e fora da nota geral, que sai parcial (3 de 9 dimensões).
5. **Segmento do diagnóstico e setor do cliente.** O plano cria `diagnosticos.segmento`, e o cliente já tinha `setor`.
   O segmento nasce do setor do cliente e pode ser trocado por diagnóstico; a pontuação usa o segmento.

### Definições adotadas (para revisar)

- **Over**: valor em reais por passageiro que o fornecedor paga à operadora; reduz o custo da reserva.
- **Custo de lugar não vendido**: só conta o bloqueio cujo prazo de devolução venceu até o fim do período do
  diagnóstico. O custo do lugar é a multa, quando informada, ou o custo na moeda convertido pelo câmbio médio pago
  nas reservas do mesmo produto e moeda. Lugar com prazo ainda aberto aparece como "em risco".
- **Folga até o câmbio de equilíbrio**: o valor da métrica é a do produto mais exposto; o detalhe traz cada produto.
- **Reservas contra o ano anterior**: compara passageiros com data de serviço nos últimos 12 meses do período com os
  12 anteriores; precisa de 24 meses de reservas, por isso fica indisponível na operadora fictícia.

---

# Fase 1 (17/11/2026)

## Verificado na construção da Fase 1

- **Motor**: 10 testes contra Postgres 16 sobre um caso de referência conferido à mão (cascata, vazamento,
  margens, banda de preço, pontuação e ganho das duas alavancas pela fórmula do documento).
- **Isolamento e demonstração**: 9 testes com o papel e o JWT de cada perfil, contra o RLS de verdade
  (visitante, leitor, editor, leitor de outro cliente, consultor), sobre a empresa fictícia inteira.
- **Aplicação web**: build de produção e roteiro no navegador com 26 conferências, incluindo a carga dos
  arquivos pela tela, validação, cálculo, alteração de premissa, publicação e a visão do cliente.
  Capturas em `docs/capturas`.

## Homologação no projeto Supabase `diagnostico_pricing` (17/11/2026)

Feita no projeto `diagnostico_pricing` (São Paulo, Postgres 17), pelo conector, sem a CLI:

- As cinco migrações aplicaram sem ajuste. O corpo das 33 funções publicadas foi comparado por hash com o
  do banco local dos testes: são idênticos.
- `pnpm homologar` passou nas 27 conferências contra os serviços reais: login pelo Supabase Auth, chamadas
  pelo PostgREST com a chave publicável, carga da empresa fictícia (14.266 linhas, seis blocos), cálculo em
  1,6 s, publicação, e o isolamento de visitante, consultor e cliente leitor.
- Os números do projeto real são os mesmos do ambiente local (nota geral 66,4; ganho de R$ 18 mil a R$ 109 mil por ano).
- As telas (build de produção e exportação estática servida em subpasta, como no GitHub Pages) foram abertas no
  navegador contra o projeto real, como consultor e como cliente.
- O verificador de segurança do Supabase aponta só itens intencionais: funções com dono chamáveis por quem tem
  sessão (cada uma confere o perfil antes de agir) e `motor.fato` sem política (inalcançável pelo navegador).

O projeto ficou com a empresa fictícia publicada e dois acessos de demonstração: `consultor@demo.local` e
`cliente@demo.local`. Eles foram criados direto nas tabelas do Auth, sem e-mail de confirmação. Troque a senha
ou remova-os antes de carregar dados de um cliente de verdade.

## Não verificado

- **Dados reais de um cliente.** O critério de saída da Fase 1 no documento é um diagnóstico completo com dados
  de um cliente piloto, com as métricas conferidas contra cálculo manual. A empresa da demonstração é sintética.
- **Volume.** A demonstração tem 14 mil linhas. Não foi medido com centenas de milhares de linhas; a carga pelo
  navegador envia 2.000 linhas por chamada.
- **A publicação no GitHub Pages.** O fluxo `.github/workflows/pricing-pages.yml` passou a gerar também estas
  telas, na subpasta `/diagnostico`, mas só roda quando a mudança chegar à branch `main`. A exportação estática
  foi testada localmente em um servidor que imita o Pages, não no Pages.
- A carga de arquivos pela tela e a alteração de premissas rodaram no navegador só contra o emulador local;
  contra o projeto real foram exercitadas pela API.
- A migração pela CLI (`supabase db push`): os arquivos em `supabase/migrations` têm data própria, diferente da
  versão registrada no projeto pelo conector. Em um projeto novo isso não importa; neste, não rode `db push`
  sem antes alinhar o histórico (`supabase migration repair`).

## Diferenças em relação ao documento

- **Arquivos**: a carga lê CSV. XLSX precisa ser salvo como CSV antes.
- **Orquestração**: o n8n não entrou. Validação e cálculo são funções do banco chamadas pela tela, então
  não havia o que orquestrar na Fase 1. Ele volta a fazer sentido com cargas periódicas e notificações (Fase 3).
- **Arquivo original**: a tela envia as linhas já lidas; o arquivo bruto não é guardado no Storage.
  O que fica registrado é o nome do arquivo, o de-para de colunas e o número de linhas.
- **IA**: o de-para de colunas é por dicionário de sinônimos, sem Claude. Narrativa e consulta por MCP são Fase 2.
- **Elasticidade**: é premissa informada por cenário e alavanca, não por categoria. A estimativa a partir do
  histórico é Fase 2.
- **Custo de servir**: entra como percentual do faturado e é tratado como fixo por unidade na simulação
  (um aumento de preço não aumenta o frete ou a comissão calculados).
- **Matriz impacto por esforço**: não entrou; depende de o consultor informar esforço e risco por alavanca.
- **Questionário de maturidade** e bloco de política comercial: alimentam a dimensão de governança, que é Fase 2.
- **Impostos**: o sistema registra se os preços vieram líquidos ou não e alerta; não converte preço bruto em líquido.
- **Perfil cliente editor**: enxerga cargas e checagens da própria empresa, mas quem envia arquivo é o consultor,
  conforme a decisão adotada para o MVP.

## Itens da revisão do documento já refletidos no código

As 16 sugestões deixadas no documento continuam pendentes de aceite lá. O código já segue as que cabiam na Fase 1:
descontos fora da fatura como bloco de entrada, recarga gerando nova versão com a publicada imutável, nota por
faixa de limiar com nota geral parcial, mínimo de transações por regra de achado, convenções da fórmula de ganho,
ordem fixa das alavancas no catálogo, simulação pela função do banco e catálogo global separado dos dados do cliente.
