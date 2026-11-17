# O que foi verificado e o que falta

## Verificado nesta construção

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
