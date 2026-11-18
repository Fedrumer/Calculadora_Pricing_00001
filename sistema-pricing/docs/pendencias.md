# O que está pronto, o que foi verificado e o que falta

## Verificado

- Motor 1.1.0: 52 testes (os 33 anteriores, sem alteração, e 19 de câmbio e comissão do vendedor), incluindo
  os casos de referência das empresas fictícias. Os quatro casos da operadora de turismo reproduzem a tabela de
  calibração da Nota nº 02 centavo a centavo (Lisboa R$ 9.900, margem R$ 587,00, câmbio que zera a margem
  R$ 6,59, comissão do vendedor R$ 58,70; com 5%, margem R$ 181,10 e comissão R$ 18,11, aprovação do gerente).
- Configurações sem os campos novos calculam exatamente como antes: os casos de referência antigos passam sem mudança.
- API e banco: 99 testes de integração contra Postgres 16 (os 65 anteriores, sem alteração, e 34 novos),
  incluindo RLS e API para os campos internos: o canal não recebe câmbio, exposição cambial nem comissão do
  vendedor, nem pela API nem lendo o banco.
- Pacote ao diagnóstico: teste que procura dentro do ZIP todos os nomes, e-mails, documentos e textos livres do
  banco e não encontra nenhum; o mesmo cliente tem o mesmo código em dois meses e outro código com outro segredo;
  a soma de preço faturado × quantidade é igual à receita aceita do mês no painel; com o envio desligado nada sai,
  nem pela automação, e a tentativa fica na auditoria.
- Roteiro de 20 minutos no navegador (49 conferências): 49 de 49 no ambiente local e 49 de 49 no projeto Supabase
  real, este pela primeira vez no navegador (telas rodando localmente apontadas para o projeto), incluindo o
  cadastro do segundo fator pelo Supabase Auth.
- Cópia externa e teste de restauração executados de verdade no ambiente local.

## Homologação no projeto Supabase (18/11/2026)

Projeto `Calculadora_Pricing_00001` (São Paulo):

- Função `api` republicada com o código dentro (versão 3, pasta `publicacao/`), pela API de gerenciamento do
  Supabase. Não importa mais nada de `raw.githubusercontent.com`.
- Migrações 0200, 0300, 0400 e 0700 aplicadas. A 0100 (RLS em `app.segredos_demo`) já estava no projeto com o nome
  `rls_segredos_demo`. No histórico do projeto as migrações ficaram com a data em que foram aplicadas, não com a
  data do arquivo: não rode `supabase db push` neste projeto sem antes alinhar o histórico (`supabase migration repair`).
- Demonstração reposta com a operadora de turismo: a Aurora saiu, 11 usuários e cerca de 840 cotações sintéticas de
  12 meses entraram. Senha nova da demonstração; a antiga é recusada pelo Supabase Auth (conferido).
- `SEGREDO_PSEUDONIMO` gerado e guardado em `app.segredos_demo`, como os demais segredos da demonstração.
- Pacote de outubro de 2026 gerado e baixado pela tela do administrador: 33 transações (soma igual à receita aceita
  do painel, R$ 1.704.329,14), 77 cotações, nenhum dos 174 nomes, e-mails e textos livres do banco dentro dele.
- O verificador de segurança não aponta nada novo das migrações desta versão; seguem os itens intencionais
  (visões e funções com dono, tabelas sem política por serem inalcançáveis pelo navegador) e a proteção contra
  senha vazada, que se liga no painel do Supabase.

## Compatibilidade com o diagnóstico

O pacote de outubro foi carregado na tela de carga do diagnóstico (código atual de `diagnostico-pricing`, sem
alteração), rodando localmente: as 26 colunas dos cinco arquivos foram sugeridas pelo próprio nome, sem nenhum
ajuste; a validação deu só dois alertas esperados (conta sem segmento, porque o sistema de cotação não tem
segmento; e um mês de histórico em vez de doze) e o diagnóstico foi calculado.

## Não verificado

- **Carga do pacote no projeto `diagnostico_pricing` real.** Foi feita na mesma tela, mas com o banco local do
  diagnóstico: a senha do consultor da demonstração do diagnóstico não está nesta sessão.
- **Repositório privado.** Não foi feito: criar repositório e mudar a visibilidade é ação na conta do GitHub. A
  função já não depende do repositório ser público. As telas da demonstração são publicadas pelo GitHub Pages
  deste repositório, e em conta gratuita o Pages não publica repositório privado. É preciso decidir antes: plano
  pago do GitHub, ou publicar as telas em outro lugar (por exemplo, Vercel ou Netlify, a partir do repositório
  privado), ou manter este repositório público só com as telas.
- **As telas publicadas no GitHub Pages** ainda são as da versão anterior: o fluxo de publicação só roda quando as
  mudanças chegarem à branch `main`. O roteiro no Supabase usou as telas novas rodando localmente.
- O lado do diagnóstico que recebe o pacote (`receber-pacote`) não existe ainda; por isso o envio automático fica
  desligado e o pacote é baixado.
- A publicação pela CLI (`supabase functions deploy`) e pelo fluxo de `.github-modelo/ci.yml`.
- Os fluxos do n8n (inclusive o 10, envio ao diagnóstico) foram escritos no formato de exportação e não foram
  importados nem executados em um n8n.
- A camada de IA foi testada com um serviço simulado; nenhuma chamada real à API da Anthropic foi feita.
- Envio de e-mail (convites, avisos) depende do n8n; a tela mostra o link do convite para o administrador copiar.
- SSO (SAML) e a redefinição de senha por e-mail.
- Cópia externa e teste de restauração contra o projeto real (rodaram só no ambiente local).

## Decisões do documento que continuam em aberto

1. Horas da Fase 0.
2. Custo de infraestrutura por cliente.
3. Onde roda o n8n (o fluxo de saúde pede um n8n fora da infraestrutura do cliente).
4. PITR como padrão ou opcional.
5. Limite de responsabilidade e seguro.
6. Exigências da Susep para clientes regulados.
7. Onde ficam as telas da demonstração quando o repositório for privado (ver acima).

## Escolhas feitas na construção que vale revisar

- Os preços, custos e limites das empresas fictícias são inventados e servem só de exemplo.
- O histórico sintético é carga direta no banco, com origem "carga"; não passa pela API.
- No ambiente de demonstração, os casos de referência são recalculados pelo motor depois do reajuste histórico.
  Em cliente real eles são sempre calculados à mão.
- O frontend guarda a sessão no navegador (padrão do cliente Supabase); a segurança não depende dele.
- Decisões tomadas nos ajustes da v3 e que não estavam no documento: ver "Decisões da v3" abaixo.

## Decisões da v3 que não estavam no documento

- **Câmbio pela data do pedido:** o motor recebe o histórico de câmbios até a data e usa o vigente na data do
  pedido (o caso de referência de 2025 usa o câmbio de 2025). Custo em percentual não aceita moeda.
- **Custo com condição:** `politica.custos[].condicoes` (custo que vale só para certos valores de dimensão),
  necessário para o hotel por temporada e acomodação da operadora.
- **Arredondamento da conversão:** cada custo em moeda é convertido e arredondado a centavos linha a linha; por
  isso o aéreo e o hotel de Lisboa são linhas separadas (€ 489,53 e € 708,43), o que dá exatamente R$ 7.307,55 e a
  margem de R$ 587,00 da tabela de calibração.
- **Câmbio publicado:** só para hoje ou adiante (`VIGENCIA_NO_PASSADO`), imutável, com simulação de impacto antes.
- **Perdas antigas:** as perdas gravadas antes da v3 ficaram na categoria `outro`, com o texto original.
- **Painel:** em `porVendedor`, cotações feitas por usuário de canal aparecem com o nome desse usuário e as feitas
  por chave de API como "Integração de canal". A exposição cambial usa as aceitas dos 90 dias até o fim do período
  do painel e o câmbio de referência vigente hoje.
- **Pacote ao diagnóstico:** o preço de lista é o preço de tabela já com os fatores da tabela (grupo, temporada,
  acomodação), para lista menos descontos fechar com o faturado; venda direta sai com canal `direto`; custos em
  valor viram custo unitário e custos em percentual (impostos, taxas) mais a comissão do vendedor deduzida viram uma
  linha `outros` em custos de servir; a comissão do canal sai por canal; o vendedor da conta é o dono da cotação
  mais recente do mês; segmento, porte e região saem vazios (o sistema de cotação não os tem). O código do cliente
  usa o documento quando há, senão o nome normalizado; o manifesto traz também um `hashConteudo`, que só muda
  quando os dados mudam (o hash do ZIP muda a cada geração, pela data).
- **Demonstração:** o `SEGREDO_PSEUDONIMO` da demonstração é gerado e guardado em `app.segredos_demo`, como os outros
  segredos dela. Em cliente, fica só no cofre da função.
- **Correções que a homologação revelou:** o cadastro do segundo fator passou a rodar uma vez só por tela (no modo
  de desenvolvimento do React o efeito rodava duas vezes e uma execução apagava o fator da outra); o roteiro passou
  a usar o proxy de saída quando há um e a seguir o link de convite publicado com subpasta.
