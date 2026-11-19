# O que foi verificado e o que falta

O plano de ajuste ao v3 está em `docs/ajustamento-v3.md` (treze pacotes, P0 a P12, com as seções 13 e 14). Esta
página registra, por pacote, o que foi feito, o que foi verificado e o que não foi.

## Andamento do plano v3

| Pacote | Situação |
| --- | --- |
| P0 Preparação | Feito. Os repositórios privados deixaram de ser pré-requisito pela decisão de 19/11/2026 (regra 8 revista: o repositório fica público durante os testes, sem dado real de cliente) |
| P1 Turismo na base | Feito, aplicado no projeto Supabase e homologado (19/11/2026) |
| P2 Simulação | Feito, aplicado no projeto, Edge Function `simular` publicada e homologado (19/11/2026) |
| P3 a P12 | Não começados. Ordem: P3; P4, P5 e P10; P6, P7, P8 e P11; P9 e P12 |

## Padrões provisórios das pendências da seção 12

Cada pendência abaixo segue a coluna "Enquanto não decide" do plano até você decidir. Todos são provisórios.

| Pendência | Padrão provisório em uso | Pacote |
| --- | --- | --- |
| Limiares e pesos de turismo e MGAs | Métricas informativas, nota geral parcial | P1 (em uso) |
| Definição de ganho da garantia | Margem de contribuição anual depois do custo de servir, 12 meses, captura padrão | P4 |
| Licença da curva de câmbio futuro da B3 | Focus; forward do banco do cliente como premissa informada | P3 |
| Onde fica o motor de análise depois da customização | Ambiente da consultoria | P6 |
| Percentual e teto da parcela variável | Cálculo pronto, parâmetros por contrato | P7 |
| Sinistralidade que a MGA pode compartilhar | Métrica de comissão de performance fora do catálogo de MGAs | P5 |
| 16 sugestões pendentes no documento de arquitetura | Nenhum pacote depende; o código segue as da Fase 1 | — |
| Acessos `consultor@demo.local` e `cliente@demo.local` | Trocar a senha ou remover antes do primeiro cliente | — |
| Correlações iniciais das Notas nº 01 e nº 02 | 0,5 entre adesão e pedidos a mais como padrão do tipo `servico_adicional`, origem informada. A Nota nº 01 refeita usa 0, porque a Nota original sorteia as premissas de forma independente (conferido no código dela); com 0,5 a chance da taxa cai de 76 para 72 em 100, fora da tolerância de 2 pontos | P2, P3 |
| Limite de risco padrão da regra de escolha | 10% de chance de prejuízo (`LIMITE_RISCO_PADRAO`) | P2 (em uso) |
| Rodadas e níveis do simulador do cliente | 50 rodadas por dia, todos os níveis | P3 |
| Cortes da curva ABC e da matriz; mínimos da cesta; taxa do prazo | 80% e 95%, medianas, 30 pedidos e lift 1,2, Selic projetada; métricas informativas | P10 |
| Janela e mínimo de eventos da reação da concorrência; variação mínima de preço | 30 dias e 5 eventos; regra de variação no catálogo | P11 |
| Estrutura de custo da operadora fictícia | As duas ficam como casos de aceite (testadas no P2: +224% e +538%) | P2, P3 |
| Faixas iniciais das premissas sem histórico | Origem informada e faixa larga | P5 |
| Mínimo de respondentes da pesquisa de disposição a pagar | 50 por segmento | P9 |
| Números e fontes dos slides | Padronizar pelos números do sistema depois do P3 | P3 |

## P2 Simulação (19/11/2026)

### Feito

- **Serviço `servicos/simulacao`** (TypeScript puro, sem banco, relógio ou rede no núcleo): gerador xoshiro128** com
  semente; distribuições por quantis (P10, P50 e P90 interpolados, com a reta estendida fora deles), triangular,
  lognormal (câmbio, média preservada), discreta e reação da concorrência; cópula gaussiana com Cholesky e
  r = 2 sen(π ρs ÷ 6), que recusa matriz incoerente apontando o par; sorteios comuns a todas as opções; saídas por
  opção e medida (margem, faturamento, volume): média, P10, P50, P90, chance de ganho e de prejuízo, chance de
  atingir a meta, frase em frequência natural e histograma de 20 faixas; contribuição média por alavanca; tornado;
  as quatro regras de escolha de 13.3 com o que cada uma escolheria; grade de opções; varredura com ponto de virada;
  capacidade no sorteio (13.4); elasticidade de forma constante e linear (13.10).
- **Modelos**: `diagnostico` (porte fiel de `motor.simular`, forma linear), `servico_adicional` (Nota nº 01),
  `bloqueio_cambio` (Nota nº 02) e `preco` (reajuste e desconto, com custos proporcionais ao preço). As premissas
  das duas Notas estão em `src/notas.ts`, como nas Notas originais.
- **Migração `20261119000100_simulacao.sql`**: `motor.base_simulacao`; `premissas_distribuicao` (P10 conservador,
  P50 base, P90 agressivo, nas versões 1 e 2 do catálogo); `premissas_correlacao`; `simulacoes`,
  `simulacao_resultado` (com `medida`), `simulacao_sensibilidade` e `simulacao_varreduras`; bloco de carga
  `capacidade`; registro `blocos_carga`, para os próximos pacotes acrescentarem blocos sem trocar a restrição.
  Funções `base_simulacao`, `gravar_simulacao` e `simulacao_do_diagnostico`, só para o consultor. RLS em todas.
- **Edge Function `simular`** (`supabase/functions/simular/index.js`, gerada por `pnpm --filter @diagnostico/simulacao
  empacotar`): roda com o JWT de quem chama, lê a base e grava o resultado pelas funções do banco, que conferem o
  perfil. O emulador local atende `/functions/v1/simular` com o mesmo código.
- **Tela**: em Oportunidades, o consultor vê a faixa de 10.000 cenários (P10, P50, P90, frase, contribuição por
  alavanca e as três premissas que mais mexem no resultado) e pode simular de novo. O cliente não vê nesta fase.
  Os três cenários continuam calculados por `motor.rodar_cenarios` e o painel publicado não muda.

### Verificado

- **48 testes** (eram 30): os 18 novos estão em `ferramentas/testes/simulacao.test.ts`, com os casos à mão no cabeçalho.
  - Paridade: com P10 = P50 = P90, o serviço dá o ganho de `motor.simular` ao centavo, por alavanca, nos três
    cenários; o painel continua com R$ 18.031, R$ 52.147 e R$ 108.883 e nota 66,4.
  - Mesma semente, mesmo resultado; outra semente, P50 a menos de 1%; soma das contribuições igual à média do total.
  - **Tempo de 10.000 sorteios na base de demonstração (4.621 pares conta e produto): cerca de 1,0 s** no
    ambiente local (Node 22); o P3 pode rodar 10.000 sorteios no simulador do cliente (limite de 3 s, seção 13.5).
  - 13.1: ρs = 0 dá o mesmo resultado da simulação sem correlação; ρs = 0,8 dá Spearman entre 0,77 e 0,83; P10, P50
    e P90 amostrais a menos de 1% dos informados; matriz incoerente recusada com o par apontado.
  - 13.2 e 13.3: Nota nº 01 refeita com chance de ganho a até 2 pontos da original nas quatro chances de reação
    (30,5 e 76,4 contra 32 e 76; 39 e 61 contra 39 e 60; 48 e 46 contra 48 e 45; 57 e 31 contra 57 e 30) e virada
    em 38%, entre 30% e 40%. Nota nº 02: a regra com risco de até 10% escolhe 100 lugares com câmbio travado;
    140 lugares têm P50 negativo.
  - 13.4: sem custo extra, nenhum sorteio vende além da capacidade livre; com custo extra, a margem cai por ele.
  - 13.10 e casos de equilíbrio de 13.6: −3,49%, −2,41%, −5,69% e −9,30%; +20%, +50%, −14,3%, 250 vendas;
    Nota nº 02 com R$ 587 → R$ 181,10 e +224%, e com custos fixos R$ 92 e +538%.
  - Acesso: o cliente não chama `base_simulacao`, `gravar_simulacao` nem a função, e não lê nenhuma tabela nova;
    ninguém escreve direto nas tabelas.
- `pnpm typecheck` nos três pacotes e o **roteiro do navegador com 40 conferências** (eram 37), com a faixa simulada
  pela tela do consultor e a ausência dela na tela do cliente.
- **No projeto `diagnostico_pricing`**: migração aplicada em três partes (ver `docs/migracoes.md`) e função
  publicada. Pelo SQL, com a sessão de cada perfil: a base tem os mesmos 4.621 pares do ambiente local, o
  consultor lê as 16 linhas de premissas, o cliente leitor é recusado e não lê `premissas_distribuicao` nem
  `simulacoes`. Pela função publicada, sem sessão de usuário: recusa (403). Verificador de segurança: só os itens
  intencionais já registrados.

### Homologação no projeto `diagnostico_pricing` (19/11/2026)

- `pnpm homologar` passou nas **40 conferências** (eram 31) contra os serviços reais: a distribuidora segue com nota
  66,4 e ganhos de R$ 18.031, R$ 52.147 e R$ 108.883; a Edge Function `simular` calcula 10.000 cenários em
  **352 ms** no projeto (cerca de 1,4 s de ida e volta) e dá o mesmo P10 e P50 (R$ 50.166) que o pacote do
  repositório com a mesma semente, o que confirma que o código publicado é o do repositório; a simulação fica
  gravada com o tornado; o cliente leitor e o visitante não chamam a função nem leem as tabelas novas.
- **Senha dos acessos de demonstração redefinida** (sua decisão de 19/11/2026): `consultor@demo.local` e
  `cliente@demo.local` têm uma senha nova, só de demonstração, que não está no repositório. A senha antiga deixou de
  valer. Continua valendo a pendência de trocar ou remover esses acessos antes do primeiro cliente.

### Não verificado

- Simulação com dados reais de um cliente (a base é a empresa fictícia).

### Contradições entre o plano e o código, e a saída adotada

1. **Ponto de virada da Nota nº 02 (13.2).** O plano pede a troca de 100 para 90 lugares entre 30% e 35% de chance
   de reação. O cruzamento exato fica em 29,5%: com 100 lugares e câmbio travado há prejuízo quando se vendem 81
   ou menos, o que acontece com 4,2% de chance sem reação e 23,8% com reação; o limite de 10% é atingido em
   (0,10 − 0,042) ÷ (0,238 − 0,042) = 29,5%. Com 100 mil sorteios, a chance de prejuízo a 30% é 10,09%. A Nota
   original chega a 9,9% em 30% pelo acaso dos sorteios dela; com 10.000 sorteios, a troca cai entre 25% e 30% ou
   entre 30% e 35% conforme a semente. O sistema interpola o ponto de virada pela chance de prejuízo e dá 29% a 31%
   ("cerca de 30%", como diz a Nota original); o teste confere esse intervalo. **Critério aceito por você em
   19/11/2026: de 28% a 32%.**
2. **Correlação inicial de 0,5 na Nota nº 01** (13.1 e seção 12): ver a tabela de padrões acima.
3. **Distribuições das Notas.** O plano descreve premissas por P10, P50 e P90; as Notas originais usam triangulares
   (mínimo, provável, máximo) e a volatilidade do câmbio. O serviço aceita os dois formatos, e as Notas refeitas
   usam o formato original, para os números baterem.
4. **Limites de domínio.** Elasticidade até 0 e captura e fechamento entre 0 e 1 são limites aplicados a cada
   sorteio, não o mínimo e o máximo da distribuição; por isso `premissas_distribuicao.minimo` e `maximo` ficam nulos
   nas oito chaves atuais. Com eles preenchidos, P10 = P50 = P90 deixaria de ser um valor fixo.

### Definições adotadas (para revisar)

- Semente padrão da simulação do diagnóstico: 20261119; regra padrão: maior P50 com até 10% de chance de prejuízo.
- Na contenção de descontos, a variação de faturamento usa o preço e o volume já ajustados pela captura, como
  `motor.simular` faz para encadear a segunda alavanca.
- A Edge Function aceita qualquer chave do projeto no cabeçalho, mas a leitura e a gravação passam pelas funções do
  banco com o JWT de quem chamou; sem sessão de consultor, nada é lido nem gravado.

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

- (Resolvido em 19/11/2026: a migração foi aplicada inteira no projeto e homologada; veja abaixo.)
- **Empresa fictícia no sistema de pricing**: não trocada. Veja as contradições abaixo.
- Dados reais de uma operadora.

### Homologação no projeto `diagnostico_pricing` (19/11/2026)

- A migração entrou em quatro partes (veja `docs/migracoes.md`); as 37 funções do projeto têm o mesmo corpo,
  por hash, que as do banco local dos testes.
- `pnpm homologar` passou nas 31 conferências contra os serviços reais: a distribuidora segue com nota 66,4 e ganhos
  de R$ 18.031, R$ 52.147 e R$ 108.883 no catálogo versão 2; a operadora fictícia foi carregada pela API
  (1.737 reservas), calcula sem arquivo de custos e chega aos R$ 586,98 por passageiro no bloqueio de Lisboa; o
  isolamento de visitante e cliente leitor continua o mesmo.
- A operadora fictícia ficou publicada no projeto. O acesso `cliente@demo.local` continua ligado só à distribuidora.

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
