# O que foi verificado e o que falta

## Verificado nesta construção

- **Motor**: 10 testes contra Postgres 16 sobre um caso de referência conferido à mão (cascata, vazamento,
  margens, banda de preço, pontuação e ganho das duas alavancas pela fórmula do documento).
- **Isolamento e demonstração**: 9 testes com o papel e o JWT de cada perfil, contra o RLS de verdade
  (visitante, leitor, editor, leitor de outro cliente, consultor), sobre a empresa fictícia inteira.
- **Aplicação web**: build de produção e roteiro no navegador com 26 conferências, incluindo a carga dos
  arquivos pela tela, validação, cálculo, alteração de premissa, publicação e a visão do cliente.
  Capturas em `docs/capturas`.

## Não verificado

- **Nada rodou em um projeto Supabase real.** Migrações, login e telas foram exercitados contra Postgres 16
  e o emulador local, que cobre login por senha e chamadas de função. Falta a homologação em um projeto de verdade.
- **Dados reais de um cliente.** O critério de saída da Fase 1 no documento é um diagnóstico completo com dados
  de um cliente piloto, com as métricas conferidas contra cálculo manual. A empresa da demonstração é sintética.
- **Volume.** A demonstração tem 14 mil linhas e calcula em cerca de 3 segundos. Não foi medido com centenas
  de milhares de linhas; a carga pelo navegador envia 2.000 linhas por chamada.
- A exportação estática (`DIAGNOSTICO_ESTATICO=1`) não foi publicada. O fluxo de GitHub Pages do repositório
  já serve o sistema de cotação; publicar este exige um segundo endereço ou subpasta.

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
