# Ajustes do Sistema de Pricing para a Arquitetura Base

Nov 18, 2026 · @Fernando Duarte Bezerra

## Resumo

O sistema de cotação em `sistema-pricing/` já cobre a arquitetura base inteira, inclusive o ambiente de demonstração: o ajuste não é de estrutura, é de funcionalidade. São 10 ajustes que vêm do plano de negócio v3 e do escopo das análises de decisão. Sete entram antes da primeira venda, porque a demonstração de 20 minutos depende deles; três ficam para o primeiro cliente pago.

O que muda, em uma frase cada:

- **Turismo na demonstração.** A empresa fictícia de assistência dá lugar a uma operadora de turismo calibrada com os números da Nota de Decisão nº 02, para o sistema de cotação e o diagnóstico contarem a mesma história.
- **Câmbio no motor.** Custos em moeda estrangeira, câmbio de referência versionado e o câmbio que zera a margem em cada cotação.
- **Comissão do vendedor sobre margem.** O vendedor vê na hora quanto o desconto custa a ele; o gestor compara a regra atual com a proposta sobre o histórico.
- **Motivo de perda em lista.** Categoria obrigatória, texto opcional e preço do concorrente quando houver, para alimentar a análise de ganhas e perdidas.
- **Painel com vendedor e desconto.** Dispersão por vendedor, conversão por faixa de desconto e exposição cambial.
- **Envio ao diagnóstico.** Todo mês a instância do cliente gera um pacote sem nome, documento nem texto livre e o entrega ao sistema de diagnóstico, onde só o consultor entra; nenhum dos dois lê o banco do outro.
- **Piloto com grupo de controle, alertas e simulador de comissão** ficam para o primeiro cliente.

Todas as mudanças são aditivas: nenhum campo existente muda de significado, as cotações já gravadas continuam iguais e os 98 testes atuais têm de continuar passando.

## Ponto de partida

Conferido no código em 18/11/2026, no repositório `Fedrumer/Calculadora_Pricing_00001` (branch `main`, último merge em 17/11). A base foi construída a partir da arquitetura de 15/11 e já inclui a separação em núcleo, configuração e extensão, além do ambiente de demonstração.

| Área | O que já existe | Onde |
| --- | --- | --- |
| Motor | Etapas configuráveis (preço base, fatores, campanha, desconto, comissão, impostos, custos, arredondamento, extensão); uma moeda por tabela; 33 testes, versão 1.0.0 | `supabase/functions/_shared/motor` |
| Banco | 7 migrações, `org_id` em tudo, RLS por perfil, versões imutáveis, auditoria só de inserção | `supabase/migrations` |
| Cotação | 9 status; desconto, comissão do canal e margem gravados por versão; vendedor em `cotacoes.dono_id` | `20261116000300_cotacoes.sql` |
| Motivo de perda | Obrigatório por gatilho, mas em texto livre (`desfecho_motivo`) | mesmo arquivo, linha 181 |
| Painel | Resumo, por mês, por canal, por produto, motivos de perda (agrupados pelo texto), prova de eficiência | `20261116000600_visoes_painel.sql` |
| Linha de base | `organizacoes.config.linhaDeBase`, usada no relatório mensal | fluxo `05-relatorio-mensal` |
| Alertas | Saúde, backup, fila de aprovação, erros, pico de bloqueios; nenhum alerta de margem ou câmbio | `rotas/automacao.ts` |
| Demonstração | `demo-assistencia` (Aurora Assistências) e `demo-distribuidor`; 12 meses sintéticos; roteiro de 7 passos com 30 conferências | `config/clientes`, `ferramentas/e2e/roteiro.mjs` |
| Módulos além da Fase 0 do v3 | Portal de canal, API externa, segunda configuração, IA, cópia externa | já construídos |
| Homologação | Migrações e API rodando no projeto Supabase `Calculadora_Pricing_00001` desde 16/11 | `docs/pendencias.md` |

O que o plano v3 pede e o código ainda não tem:

- Empresa fictícia de turismo, que o v3 põe na Fase 0 e que a Nota nº 02 usa.
- Custo em moeda estrangeira: hoje a tabela tem uma moeda só e os custos não conhecem câmbio.
- Comissão do vendedor: não existe; a única comissão calculada é a do canal.
- Motivo de perda com categoria, que a análise de ganhas e perdidas exige.
- Visão por vendedor e por faixa de desconto no painel.
- Aplicar uma regra só a um grupo, para pilotos com grupo de controle.

O v3 também encolheu a Fase 0 para o mínimo da demonstração. Como portal de canal, API, segunda configuração e IA já estão prontos, a recomendação é mantê-los e não investir mais neles até o primeiro cliente.

## Mapa de ajustes

A0 é pré-requisito; A1 a A6 e A10 fecham a demonstração; A7 a A9 são construídos no primeiro cliente, dentro das 80 horas que o v3 já prevê para ele.

| Nº | Ajuste | Origem | Fase | Depende de | Arquivos principais |
| --- | --- | --- | --- | --- | --- |
| A0 | Repositório próprio e privado; segredos da demonstração fechados | Ajustamento do diagnóstico, pacote P0 | Pré-requisito | — | raiz do repositório, nova migração |
| A1 | Operadora de turismo fictícia no lugar da assistência | Plano v3 (Fase 0), Nota nº 02 | Demonstração | A2 | `config/clientes/demo-turismo.json`, `demo-configs.ts`, gerador de dados |
| A2 | Custo em moeda estrangeira e câmbio de referência | Escopo das análises (turismo), Nota nº 02 | Demonstração | — | motor (`tipos`, `calcular`, `veredito`), `regras.ts`, nova migração, telas |
| A3 | Motivo de perda em lista configurável | Plano v3 (equipe comercial), ajustamento P5 | Demonstração | — | nova migração, `rotas/cotacoes.ts`, tela de detalhe |
| A4 | Comissão do vendedor calculada e exibida | Plano v3 (customização) | Demonstração | — | motor, nova migração, `formulario-cotacao.tsx` |
| A5 | Painel por vendedor, por faixa de desconto e de exposição cambial | Escopo das análises (dispersão, plano B) | Demonstração | A2, A3, A4 | `app.indicadores`, `painel/page.tsx` |
| A6 | Roteiro de 20 minutos refeito com a história de turismo | Plano v3 (Fase 0) | Demonstração | A1 a A5 e A10 | `ferramentas/e2e/roteiro.mjs`, `docs/` |
| A7 | Simulador: regra de comissão atual contra proposta | Plano v3 (customização) | 1º cliente | A4 | função SQL, tela de política |
| A8 | Alertas de margem e de câmbio | Plano v3 (mensalidade Essencial) | 1º cliente | A2 | `rotas/automacao.ts`, fluxos n8n 07 e 09 |
| A9 | Piloto com grupo de controle | Plano v3 (nível Completo), Nota nº 01 | 1º cliente | — | nova migração, `regras.ts`, tela de pilotos |
| A10 | Envio mensal de pacote pseudonimizado ao diagnóstico | Ajustamento P6, revisto em 18/11 | Demonstração | A3, A4 | nova migração, rotas `/envio-diagnostico`, tela de envio, fluxo n8n 10 |

A0, A1 e A10 repetem itens do [ajustamento do sistema de diagnóstico](https://claude.ai/artifact/PcVRGmBvcp4ZwbZBzfxSVy), com os mesmos nomes, para os dois documentos não divergirem. A3 sobe do pacote P5 daquele documento para a fase de demonstração, porque é pequeno e o roteiro usa a análise de perdas.

A10 também muda o desenho do P6: em vez de a consultoria ler o banco do cliente com um papel próprio, o cliente envia um pacote. O lado que recebe precisa ser ajustado no outro documento (ver A10).

Documentos de origem: [plano de negócio v3](https://claude.ai/artifact/HXb2ioY5yvwFvHMkiY7NfJ), [escopo das análises de decisão](https://claude.ai/artifact/3aKbyT5wHCcFCiAQJQvm33), [Nota nº 01](https://claude.ai/artifact/XvmR8CEAoiVCLfV7gZ4aZL), [Nota nº 02](https://claude.ai/artifact/KdpGbnTutJdMc85rCHVXXw) e a [arquitetura do sistema](https://claude.ai/artifact/9VoyWHC8vtvDYCqVNZoFRh).

## Especificação de cada ajuste

Cada ajuste diz o comportamento esperado, o que muda no motor, no banco, na API e nas telas, e como se prova que funciona. Nomes de campos e tabelas são propostas; o Claude Code pode ajustá-los desde que mantenha o significado.

### A0 — Repositório próprio e segredos fechados

O `sistema-pricing/` divide hoje um repositório público com o `diagnostico-pricing/` e com uma aplicação anterior na raiz. O próprio README da pasta já prevê a separação.

1. Criar o repositório privado `sistema-pricing` com o histórico da pasta: `git subtree split --prefix=sistema-pricing -b sistema-pricing`.
2. **Republicar a função `api` da demonstração antes de fechar o repositório.** Hoje ela é um carregador que importa `api.empacotada.js` de `raw.githubusercontent.com`; com o repositório privado essa importação falha e a demonstração para. A função deve passar a conter o código, publicada pela CLI ou pelo conector com os arquivos inteiros.
3. Migração curta: `alter table app.segredos_demo enable row level security` e revogação explícita para `anon` e `authenticated`.
4. Gerar nova `DEMO_SENHA` e trocar a senha dos 10 usuários da demonstração.

Aceite: a demonstração responde no projeto Supabase com o repositório já privado; a senha antiga não entra.

### A2 — Custo em moeda estrangeira e câmbio de referência

Vem antes de A1 porque a operadora fictícia depende dele. Uma operadora vende em reais e paga aéreo e hotel em euro ou dólar; a margem depende do câmbio entre a venda e o pagamento ao fornecedor.

**Comportamento.** Cada parâmetro de custo pode ter moeda própria. O motor converte pelo câmbio de referência vigente na data e informa, para cada moeda, o câmbio que zera a margem da cotação. A política pode exigir uma folga mínima entre esse câmbio e o de referência; abaixo dela, a cotação vai para aprovação.

**Motor** (continua puro; o câmbio chega como dado):

- `ParametroCusto.moeda?: string` (ausente = moeda da tabela).
- `ConjuntoRegras.cambios: { moeda, taxa, vigenteDe, origem }[]`, só com as taxas vigentes na data do pedido.
- `Politica.limites.folgaCambialMinimaPct?: number`.
- Na etapa `custos`, o valor em moeda estrangeira é convertido; a linha do detalhamento mostra valor na moeda, taxa e valor em reais, como linha interna.
- Erro `CAMBIO_AUSENTE` quando um custo tem moeda sem taxa vigente.
- Resultado ganha `exposicaoCambial: { moeda, valorMoeda, taxa, valorConvertido, cambioEquilibrio, folgaPct }[]`, fora do `ResultadoPublico`.
- Novo motivo de veredito `FOLGA_CAMBIAL_ABAIXO_DO_MINIMO`, interno, que leva a `exige_aprovacao`.
- `VERSAO_MOTOR` passa de 1.0.0 para 1.1.0.

Cálculo, para cada moeda, mantendo as outras constantes:

```latex
c_{eq} = c + \frac{M}{V_{moeda}} \qquad \text{folga} = \frac{c_{eq}}{c} - 1
```

onde c é o câmbio de referência, M a margem em reais e V o total de custos naquela moeda. Na Nota nº 02: c = 6,10, M = R$ 587 e V = € 1.197,96 dão c\_eq = 6,59 e folga de 8,0%.

**Banco:** tabela `cambios_referencia` (moeda, taxa com 6 casas, vigência, origem `politica` ou `ptax`, quem publicou), imutável como as tabelas de preço; coluna `moeda` em `parametros_custo`; coluna `cambios jsonb` em `cotacao_versoes`, com as taxas usadas.

**API:** `GET` e `POST /regras/cambios`, só gestor de pricing com segundo fator; `carregarRegras` passa a incluir os câmbios vigentes.

**Telas:** em Política, bloco "Câmbio de referência" com moeda, taxa e vigência. Na cotação, só para perfis internos: "Câmbio que zera a margem: R$ 6,59 por euro (folga de 8,0%)". O canal não vê nada disso.

Aceite: caso de referência de turismo bate (A1); custo sem taxa vigente devolve erro claro; canal não recebe `exposicaoCambial`.

### A1 — Operadora de turismo fictícia

Substitui `demo-assistencia.json` por `demo-turismo.json`: "Operadora Exemplo Turismo (fictícia)", a mesma empresa da Nota nº 02 do diagnóstico, para a reunião contar uma história só.

**Calibração obrigatória.** O pacote Lisboa de julho, para 1 passageiro em apartamento duplo, tem de reproduzir os números da Nota nº 02. A composição abaixo os reproduz exatamente; a divisão dos 18% entre comissão e impostos é livre.

| Item | Valor por passageiro |
| --- | --- |
| Preço de tabela | R$ 9.900,00 |
| Comissão da agência e impostos | 18% do preço (por exemplo, 12% e 6%) = R$ 1.782,00 |
| Custos em reais (traslado, seguro, guia) | R$ 223,45 |
| Aéreo e hotel em euro | € 1.197,96 a R$ 6,10 = R$ 7.307,55 |
| Margem | R$ 587,00 (5,9%) |
| Câmbio que zera a margem | R$ 6,59 por euro |
| Com 5% de desconto | margem de R$ 181,10 por passageiro |

Conferência: com margem de R$ 181,10, manter a margem total exige 224% a mais de passageiros, o mesmo número da meta reversa da Nota nº 02.

**Configuração:**

- Dimensões: destino, mês de saída (temporada alta ou baixa), acomodação (duplo ou individual) e passageiros (multiplicador).
- Produtos: três pacotes internacionais (Lisboa, Madri, Paris) e um nacional, em reais, para mostrar que o câmbio só entra onde há custo em moeda.
- Canais: venda direta e duas agências parceiras.
- Limites propostos: desconto livre até 2%, máximo 8%, margem mínima 1,5%, meta 5%, folga cambial mínima 5%. Com eles, 5% de desconto fica amarelo (vai ao aprovador) e 8% fica vermelho (margem negativa).
- Comissão do vendedor (A4): 10% da margem, sem deduzir da margem, para preservar os números da Nota.
- Câmbio de referência inicial: R$ 6,10 por euro.
- Casos de referência: o pacote Lisboa acima, mais um com 5% de desconto e um nacional, calculados à mão.

**Dados sintéticos (12 meses):** sazonalidade com pico em julho e dezembro; trajetória de câmbio sintética em torno de R$ 6,10; três vendedores com comportamentos distintos, um deles concedendo desconto acima da média, para o painel por vendedor ter o que mostrar; perdas com categoria e, em parte delas, preço do concorrente.

Trocar a entrada `assistencia` por `turismo` em `demo-configs.ts`. O `demo-distribuidor` continua como segunda configuração; renomeá-lo para "Distribuidora Exemplo Ltda.", a empresa da Nota nº 01, é opcional.

### A3 — Motivo de perda em lista configurável

O gatilho atual continua; o texto livre vira categoria obrigatória mais texto opcional. Sem categoria não há análise de propostas ganhas e perdidas, que é o plano B do v3 para cliente sem dado de elasticidade.

**Configuração:** `organizacao.config.motivosPerda`, lista de `{ codigo, nome, pedeTexto, pedeConcorrente, ativo }`. Lista padrão proposta:

| Código | Nome | Pede |
| --- | --- | --- |
| `preco_concorrente` | Preço acima do concorrente | Nome e preço do concorrente, se o vendedor souber |
| `prazo` | Prazo ou disponibilidade | — |
| `escopo` | Produto não atende | — |
| `desistiu` | Cliente desistiu da compra | — |
| `sem_resposta` | Sem resposta do cliente | — |
| `outro` | Outro | Texto obrigatório |

**Banco:** em `cotacoes`, colunas `desfecho_categoria`, `concorrente_nome` e `concorrente_preco`. O gatilho passa a exigir categoria em `perdida`. As perdas já gravadas recebem `outro`, com o texto preservado em `desfecho_motivo`.

**API:** `POST /cotacoes/:id/desfecho` recebe `{ resultado, categoria, motivo?, concorrente?: { nome?, preco? } }`; recusa categoria inexistente ou inativa e exige texto de pelo menos 10 caracteres quando a categoria pede.

**Tela:** no detalhe da cotação, lista de categorias e campos que aparecem conforme a escolhida.

Aceite: perda sem categoria é recusada na API e no banco; o canal registra perda só nas próprias cotações, como hoje.

### A4 — Comissão do vendedor calculada e exibida

O v3 entrega na customização uma proposta de comissão do vendedor atrelada à margem. O sistema torna essa regra visível no momento em que o vendedor decide o desconto. Não confundir com a comissão do canal, que já existe.

**Comportamento.** Ao lado do semáforo, o vendedor vê "Sua comissão nesta cotação", recalculada a cada simulação. No pacote Lisboa, com 10% da margem, a comissão cai de R$ 58,70 para R$ 18,11 quando o desconto vai de 0 a 5%.

**Política:** `comissaoVendedor?: { base: 'receita' | 'margem', pct, margemMinimaPct?, deduzDaMargem }`.

**Motor:**

- Calculada depois da margem. Base `margem`: pct × margem, zero se a margem for negativa ou menor que `margemMinimaPct`. Base `receita`: pct × preço final.
- Com `deduzDaMargem`, a margem e o veredito passam a considerar a comissão; sem ele, ela é só informativa. O padrão é `false`, para não alterar nenhuma configuração existente.
- Resultado ganha `comissaoVendedor: { base, pct, valor } | null`, fora do `ResultadoPublico`.

**Banco:** `cotacao_versoes.comissao_vendedor_valor`, com padrão zero.

**Quem vê:** o vendedor dono da cotação, aprovador, gestor, leitura e administrador. O canal nunca.

Aceite: testes do motor para as duas bases, para o piso de margem e para `deduzDaMargem` ligado e desligado; o caso Lisboa dá R$ 58,70.

### A5 — Painel por vendedor, por desconto e de câmbio

`app.indicadores` ganha quatro blocos, todos a partir das versões já gravadas, sem recalcular nada.

| Bloco | Conteúdo | Para que serve |
| --- | --- | --- |
| `porVendedor` | Emitidas, aceitas, conversão, desconto médio e desvio-padrão do desconto, margem e comissão do vendedor | Dispersão de preço por vendedor, do escopo das análises |
| `conversaoPorDesconto` | Emitidas, aceitas e conversão por faixa de desconto (0, até 2%, 2 a 5%, 5 a 10%, acima de 10%; faixas configuráveis) | Primeira leitura de elasticidade pelas propostas ganhas e perdidas |
| `motivosPerda` | Agora por categoria; em `preco_concorrente`, a diferença média entre o nosso preço e o informado | Saber se a perda é de preço ou de outra coisa |
| `exposicaoCambial` | Aceitas dos últimos 90 dias com custo em moeda: total na moeda, câmbio de equilíbrio médio e quantas ficam sem margem ao câmbio de referência atual | Mostrar quanto da margem depende do câmbio |

Faixa de desconto com menos de 30 cotações emitidas aparece com o aviso "amostra pequena", para ninguém ler tendência onde há ruído. Quem vê o painel continua igual: perfis internos com segundo fator.

### A6 — Roteiro de 20 minutos com a história de turismo

Os sete passos ficam, com o conteúdo da operadora e as funcionalidades novas:

1. Vendedor cota o pacote Lisboa de julho dentro da política, vê a própria comissão e o câmbio que zera a margem, e emite a proposta em PDF.
2. Vendedor pede 5% de desconto: margem cai de R$ 587 para R$ 181 por passageiro, comissão de R$ 58,70 para R$ 18,11, e a cotação vai ao aprovador com motivo. Com 8%, fica vermelha.
3. Aprovador decide pelo celular, vendo o impacto na margem e a folga cambial.
4. Agência parceira cota o mesmo pacote e não vê custo, margem, câmbio nem comissão do vendedor.
5. Gestor publica um câmbio de referência de R$ 6,30, vê o impacto e confere que a proposta já emitida mantém o preço.
6. Vendedor registra uma perda por preço com o valor do concorrente; o administrador convida um usuário e mostra a auditoria do que acabou de acontecer.
7. Painel: margem por canal, dispersão por vendedor, conversão por faixa de desconto e exposição cambial. Fecha com o envio ao diagnóstico: o administrador mostra a prévia do pacote do mês, sem nome nem documento, e o envia; o consultor o recebe no diagnóstico, de onde sai a Nota nº 02 da mesma operadora.

`ferramentas/e2e/roteiro.mjs` ganha as conferências novas (comissão, câmbio, categoria de perda, blocos do painel) e as capturas de `docs/capturas` são refeitas.

### A7 — Simulador da regra de comissão (1º cliente)

Transforma a proposta de comissão sobre margem em número, com o histórico do próprio cliente.

- Função `simular_comissao_vendedor(regra_a, regra_b, inicio, fim)`: para cada vendedor, cotações aceitas, receita, margem, desconto médio, comissão pela regra A, pela regra B e a diferença. Usa preço e margem já gravados, sem recalcular.
- Regra A padrão: a da política vigente; se a política não tiver regra, o gestor informa a prática atual do cliente (por exemplo, 2% da receita).
- Tela em Política, "Comparar regras de comissão", com exportação em CSV para anexar à proposta da customização.
- Só gestor de pricing, administrador e leitura, com segundo fator.

Limite a declarar na tela: o simulador mostra o efeito mecânico da regra sobre o histórico. Quanto o vendedor muda de comportamento só se mede com piloto (A9).

### A8 — Alertas de margem e de câmbio (1º cliente)

O nível Essencial da mensalidade promete alertas de margem; hoje os alertas são só de operação.

- **Margem:** nova rota `/automacao/alertas-negocio`, chamada pela rotina diária (fluxo 03), uma vez por dia. Avisa o gestor quando a margem das aceitas no mês fica abaixo da meta da política ou quando o desconto médio do mês passa o da linha de base. Guarda o último aviso para não repetir no mesmo dia.
- **Câmbio:** novo fluxo `09-cambio.json`, em dias úteis, depois do boletim de fechamento da PTAX. Busca a cotação de venda de cada moeda usada nos custos pelo recurso `CotacaoMoedaDia` da [API PTAX do Banco Central](https://dadosabertos.bcb.gov.br/dataset/taxas-de-cambio-todos-os-boletins-diarios/resource/db9b40bf-9b8f-47c4-a82d-3a3afab52e90) e grava em `cambios_mercado` pela rota `POST /automacao/cambios-mercado`. Avisa quando a PTAX passa o câmbio de referência mais a folga mínima ou quando cotações aceitas ficam sem margem a ela.
- A PTAX nunca muda preço sozinha: quem publica novo câmbio de referência é o gestor. Com A8 ligado, o bloco `exposicaoCambial` do painel passa a usar a PTAX mais recente.

### A9 — Piloto com grupo de controle (1º cliente)

As Notas recomendam decisões em piloto (a Nota nº 01 propõe a taxa de entrega por 60 dias com grupo de controle), e o nível Completo vende medição com grupo de controle. Hoje uma tabela vigente vale para todos, então o sistema não consegue aplicar uma regra só a uma parte da equipe.

**Comportamento.** O gestor cria um piloto ligado a uma Nota de Decisão: período, regra alternativa (tabela, política ou as duas, já publicadas) e o critério de grupo (unidade, canal ou vendedor), com a lista de tratamento e a de controle. Durante o piloto, o grupo de tratamento cota com a regra alternativa e o controle com a vigente.

- **Banco:** tabela `pilotos` (nome, referência da Nota, início, fim, status `rascunho`, `ativo` ou `encerrado`, tabela e política alternativas, critério, listas de tratamento e controle), imutável depois de ativado, exceto o encerramento. Um mesmo vendedor, canal ou unidade só pode estar em um piloto ativo. Em `cotacoes`, colunas `piloto_id` e `braco` (`tratamento` ou `controle`).
- **API:** `carregarRegras` recebe o contexto da cotação (unidade, canal, vendedor) e resolve o piloto; rotas para criar, ativar e encerrar piloto, só gestor com segundo fator.
- **Painel:** comparação descritiva entre tratamento e controle, antes e durante (margem, desconto, conversão). O teste estatístico (diferença em diferenças) fica no serviço de medição do diagnóstico, pacote P7.

Aceite: um vendedor do tratamento e um do controle cotam o mesmo pedido e recebem preços diferentes, cada um com o braço gravado; um vendedor não entra em dois pilotos ativos.

### A10 — Envio de dados ao diagnóstico (demonstração)

Os dois sistemas continuam independentes: nenhum lê o banco do outro. Todo mês, a instância do cliente gera um pacote de dados pseudonimizado, no formato que o diagnóstico já lê, e o envia por uma chave que só deposita. O diagnóstico, onde só o consultor entra, recebe, confere e carrega sem mapear colunas.

Isto substitui a proposta anterior (visão `extrato_diagnostico` lida pela consultoria com o papel `leitor_consultoria`), que pedia uma credencial da consultoria dentro do banco de cada cliente. Pelo mesmo motivo, A10 sobe para a fase de demonstração: é a ponte que alimenta as análises da mensalidade.

&#91;embedded content: envio ao diagnóstico · dois sistemas sem banco compartilhado\]

O envio automático e o pacote baixado levam exatamente os mesmos arquivos; o que muda é só o caminho.

**O que sai e o que nunca sai.**

| Dado | Como sai do sistema de cotação |
| --- | --- |
| Cliente final | Código pseudônimo: `C-` mais 16 caracteres de HMAC-SHA256 do documento (ou do nome normalizado, se não houver documento). Em configuração de venda a pessoa física, pode sair como um código único agregado |
| Vendedor | Código pseudônimo: `V-` mais HMAC do identificador do usuário |
| Produto, dimensões, canal | Código e nome do cadastro, porque são do negócio e não de pessoas |
| Preços, descontos, comissões, custos, margem, câmbio | Valores |
| Perda | Só a categoria e o preço do concorrente |
| Nome, e-mail e documento do cliente final; nome e e-mail de usuários; textos livres (observação, motivo de aprovação, texto da perda, nome do concorrente); IP, auditoria, chaves | Nunca saem |

O segredo do HMAC (`SEGREDO_PSEUDONIMO`) fica no cofre da função do cliente e nunca é enviado. Os códigos se repetem de um mês para outro, então o diagnóstico acompanha a mesma conta ao longo do tempo sem saber quem ela é. Se a reunião precisar nomear um vendedor, o administrador do cliente vê a correspondência na própria tela.

Pela LGPD, dado pseudonimizado continua sendo dado pessoal: só deixa de ser associado a alguém sem uma informação adicional que o controlador guarda separada ([art. 13, § 4º](https://www.ufrgs.br/proprivacidade/?p=6792)). Por isso o envio fica coberto pelo acordo de tratamento de dados, e a chave fica só com o cliente.

**Formato do pacote (`pacote-diagnostico/1`).** Um ZIP por mês de competência. Os cabeçalhos dos CSV usam os nomes de campo do diagnóstico, então a tela de carga atual já sugere o mapeamento certo.

| Arquivo | Conteúdo | Destino no diagnóstico |
| --- | --- | --- |
| `manifesto.json` | Versão do contrato, código pseudônimo da instância, competência, data de geração, versão do motor, modo de conta, linhas e soma de preço por arquivo, hash SHA-256 de cada arquivo | Conferência de integridade |
| `transacoes.csv` | Uma linha por cotação aceita: `data`, `nota_fiscal` (número da cotação), `produto`, `conta`, `canal`, `quantidade`, `preco_lista`, `preco_faturado`, `desc_comercial`, `desc_promocional`, todos unitários | Bloco `transacoes` |
| `custos.csv` | Custo unitário médio por produto e mês, já em reais | Bloco `custos` |
| `produtos.csv` | Código, descrição, categoria, linha | Bloco `produtos` |
| `contas.csv` | Conta, segmento, porte e região (quando configurados), vendedor | Bloco `contas` |
| `custos_servir.csv` | Comissão efetiva de cada canal e custos variáveis, em % do faturado | Bloco `custos_servir` |
| `cotacoes.csv` | Todas as emitidas no mês, inclusive perdidas e expiradas: desconto, margem, comissão do vendedor, status, categoria de perda, preço do concorrente, câmbio usado e de equilíbrio, veredito, alçada, piloto e braço | Bloco `propostas` do P5, por mapeamento fixo; piloto e braço vão para a medição (P7) |

O código de produto do pacote junta o produto com os valores das dimensões de categoria (por exemplo, `LISBOA|ALTA|DUPLO`), para o custo ficar estável no mês; dimensões numéricas, como passageiros, viram quantidade.

**Três jeitos de enviar o mesmo pacote:**

1. **Automático:** fluxo n8n `10-envio-diagnostico`, no dia 2 de cada mês, gera e envia o mês anterior. Se falhar, avisa o administrador e a consultoria e tenta de novo no dia seguinte.
2. **Sob demanda:** botão "Enviar agora", para a carga inicial (12 a 24 meses, um pacote por mês) ou para reenviar um mês.
3. **Manual:** "Baixar pacote"; o consultor carrega os CSV na tela de carga do diagnóstico. Funciona hoje, antes de o lado receptor existir, e atende o cliente que não autoriza conexão de saída.

**Lado do cliente (este ajuste):**

- **Tela "Envio ao diagnóstico"**, só para administrador com segundo fator: liga e desliga, modo de conta, prévia das 10 primeiras linhas de cada arquivo, histórico com hash e recibo, baixar e enviar agora.
- **Banco:** tabela `envios_diagnostico` (competência, versão do contrato, linhas, hash, status `gerado`, `enviado`, `confirmado` ou `falhou`, recibo, quem acionou); o ZIP fica no Storage do próprio cliente; cada geração e envio vai para a auditoria.
- **API:** `POST /envio-diagnostico/gerar`, `GET /envio-diagnostico/:id/baixar` (link assinado) e `POST /envio-diagnostico/:id/enviar`, também acionáveis pela chave de automação do n8n.
- **Configuração:** `organizacao.config.envioDiagnostico` com `ativo`, `destino`, `modoConta` (`pseudonimo` ou `agregado`) e `diaDoMes`; segredos `CHAVE_ENVIO_DIAGNOSTICO` e `SEGREDO_PSEUDONIMO` no cofre da função.
- **Desligado por padrão:** nada sai até o administrador do cliente ligar o envio, e o ato fica registrado.

**Lado do diagnóstico (especificado no P6 revisto do outro documento):**

- Função `receber-pacote`: aceita só chave de envio válida, que deposita pacotes de um único cliente e não lê nada; confere versão do contrato, hashes e contagens; guarda o ZIP em armazenamento privado e registra em `extratos_cliente`; devolve recibo.
- Mesmo hash na mesma competência não muda nada; hash novo vira nova versão, e a anterior fica marcada como substituída.
- Tela do consultor "Pacotes recebidos": carrega um pacote em um diagnóstico com mapeamento fixo, sem a etapa de de-para, e roda a validação. Perfis de cliente do diagnóstico não veem pacotes.
- Aceita a versão atual do contrato e a anterior, para os dois sistemas poderem ser atualizados em datas diferentes.

**Por que continuam independentes.** Não há banco compartilhado, credencial da consultoria na instância do cliente nem dependência em tempo real. Se o diagnóstico estiver fora do ar, o pacote espera. Se o cliente cancelar, ele desliga o envio, e a consultoria elimina os pacotes recebidos, como já previsto na saída do cliente. O único acoplamento é o contrato `pacote-diagnostico/1`, versionado.

Aceite:

- Um teste procura, dentro do ZIP, todos os nomes, e-mails e documentos reais do banco de demonstração e não encontra nenhum.
- O mesmo cliente final recebe o mesmo código em dois meses; com outro `SEGREDO_PSEUDONIMO`, recebe outro.
- Os CSV entram na tela de carga atual do diagnóstico com o mapeamento sugerido, sem ajuste manual.
- A soma de `preco_faturado` × `quantidade` em `transacoes.csv` é igual à receita aceita do mês no painel.
- Com o envio desligado, nada sai, nem pelo n8n.
- A chave de envio não lê nada no diagnóstico nem deposita pacote em nome de outro cliente.

## Migrações de banco e compatibilidade

Sete migrações novas, todas aditivas, no mesmo padrão de nome das existentes. As migrações 0100 a 0400 e a 0700 entram com a demonstração; a 0500 e a 0600, no primeiro cliente.

| Arquivo | Ajuste | Conteúdo |
| --- | --- | --- |
| `20261118000100_segredos_demo.sql` | A0 | RLS ligado e revogação em `app.segredos_demo` |
| `20261118000200_cambio.sql` | A2, A8 | `cambios_referencia`, `cambios_mercado`, `parametros_custo.moeda`, `cotacao_versoes.cambios`, políticas de RLS |
| `20261118000300_desfecho.sql` | A3 | Colunas de categoria e concorrente, gatilho novo, preenchimento de `outro` nas perdas antigas |
| `20261118000400_comissao_vendedor_e_painel.sql` | A4, A5 | `cotacao_versoes.comissao_vendedor_valor` e nova versão de `app.indicadores` |
| `20261118000500_simulador_comissao.sql` | A7 | Função `simular_comissao_vendedor` |
| `20261118000600_pilotos.sql` | A9 | Tabela `pilotos`, colunas `piloto_id` e `braco`, restrição de um piloto ativo por membro |
| `20261118000700_envio_diagnostico.sql` | A10 | Tabela `envios_diagnostico`, visões internas do pacote (`v_pacote_*`), bucket privado e políticas de RLS |

A tabela `cambios_mercado` nasce em A2, vazia, para o painel já ter onde ler quando A8 entrar.

Regras de compatibilidade:

- **Nenhuma versão de cotação gravada é alterada.** Colunas novas em `cotacao_versoes` têm padrão (zero ou nulo); o resultado em JSON das versões antigas fica como está, e a tela trata a ausência de `comissaoVendedor` e `exposicaoCambial`.
- **Configurações antigas calculam igual.** Sem `moeda` nos custos, sem `comissaoVendedor` e sem `folgaCambialMinimaPct`, o motor 1.1.0 devolve exatamente o que o 1.0.0 devolvia. Os 5 casos de referência atuais provam isso.
- **A versão do motor fica gravada** em cada cotação nova (`motor_versao` = 1.1.0), como já acontece.
- **Gatilhos substituídos, não editados:** cada migração que muda um gatilho faz `create or replace` da função e mantém a regra antiga (motivo obrigatório) dentro da nova.
- **Funções com `search_path` fixo**, como na migração `20261116000700`.
- **No projeto Supabase de homologação:** aplicar as migrações, republicar a função (A0) e rodar `/demo/repor` com a configuração de turismo. A empresa Aurora e suas cotações sintéticas saem; nenhum dado real é afetado, porque o projeto só tem dado fictício.

## Ordem de execução no Claude Code

Dez etapas, cada uma terminando com os testes passando e um commit próprio. As oito primeiras fecham a demonstração; a nona é a homologação; a décima fica para o primeiro cliente.

1. **A0:** repositório privado, função republicada com o código dentro, segredos fechados, senhas trocadas.
2. **A2 e A4 no motor:** tipos, cálculo, veredito, versão 1.1.0 e testes. As duas mudanças tocam os mesmos arquivos, por isso vão juntas.
3. **A2 e A4 no banco, na API e nas telas:** migrações 0200 e 0400 (só a coluna), `carregarRegras`, rotas de câmbio, bloco de comissão no formulário.
4. **A3:** migração 0300, rota de desfecho, tela de detalhe.
5. **A1:** `demo-turismo.json` calibrado, casos de referência, gerador de dados sintéticos, troca em `demo-configs.ts`.
6. **A5:** nova versão de `app.indicadores` e blocos do painel.
7. **A10:** migração 0700, gerador do pacote com pseudonimização, rotas e tela de envio, fluxo n8n 10. Enquanto o lado que recebe não existir no diagnóstico, o envio automático fica desligado e o pacote é baixado.
8. **A6:** roteiro de 20 minutos e capturas, já com o envio ao diagnóstico no passo 7.
9. **Homologação:** migrações no projeto Supabase, reposição da demonstração, roteiro rodado contra o projeto real (hoje ele só rodou no emulador local) e um pacote do mês carregado no projeto `diagnostico_pricing` pela tela de carga.
10. **Primeiro cliente:** A7, A8 e A9, nessa ordem.

### Instrução para a fase de demonstração

Exporte este documento em Markdown para `sistema-pricing/docs/ajustes-v3.md` e abra uma sessão do Claude Code no repositório com o texto abaixo.

```text
Você vai ajustar o sistema de cotação em sistema-pricing/ seguindo docs/ajustes-v3.md.
Nesta sessão, faça só as etapas 1 a 9 (ajustes A0 a A6 e A10). A7 a A9 ficam para depois.

Antes de começar:
- Leia docs/ajustes-v3.md inteiro, depois README.md, docs/adaptacao-por-cliente.md e docs/pendencias.md.
- Rode pnpm test e anote o resultado (hoje: 33 testes do motor e 65 da API).

Regras:
- Trabalhe só dentro de sistema-pricing/. Não leia nem reaproveite nada da aplicação que está na raiz do repositório.
- Toda mudança é aditiva. Nenhuma versão de cotação gravada muda, e configurações sem os campos novos calculam exatamente como antes.
- O motor continua puro: sem banco, relógio ou rede. O câmbio entra como dado em ConjuntoRegras.
- Campos internos (exposicaoCambial, comissaoVendedor) nunca aparecem no ResultadoPublico nem para o perfil canal. Escreva um teste de RLS e um de API para isso.
- Migrações novas com os nomes da seção de migrações do documento, funções com search_path fixo, RLS em toda tabela nova.
- A configuração demo-turismo tem de reproduzir a tabela de calibração de A1 centavo a centavo; isso entra como caso de referência.
- O pacote de A10 nunca leva nome, e-mail, documento ou texto livre. Escreva o teste que procura esses valores reais dentro do ZIP. O segredo de pseudonimização nunca é enviado, e o envio começa desligado.
- Os cabeçalhos dos CSV do pacote usam exatamente os nomes de campo de diagnostico-pricing (blocos transacoes, custos, produtos, contas, custos_servir). Não altere nada dentro de diagnostico-pricing/ nesta sessão.
- Uma etapa por commit, com os testes passando. Se um teste antigo quebrar, pare e explique antes de alterá-lo.

Na etapa 1, não torne o repositório privado antes de a função api da demonstração estar publicada com o código dentro; hoje ela importa o código de raw.githubusercontent.com.

Ao terminar:
- Atualize docs/pendencias.md (o que foi verificado e o que não foi), docs/adaptacao-por-cliente.md (campos novos de configuração) e o README.
- Rode o roteiro de 20 minutos e informe quantas conferências passaram, local e no projeto Supabase.
- Gere o pacote de um mês da demonstração e informe se ele carregou na tela do diagnóstico sem ajuste de colunas.
- Liste qualquer decisão que você tomou e que não estava no documento.
```

### Instrução para o primeiro cliente

```text
Siga docs/ajustes-v3.md, etapa 10: ajustes A7, A8 e A9, nessa ordem, um commit por ajuste, com as mesmas regras da fase de demonstração.
Para A8, o fluxo 09-cambio.json usa a API PTAX do Banco Central (recurso CotacaoMoedaDia, cotação de venda do boletim de fechamento); teste o fluxo importado em um n8n de verdade, não só o JSON.
Para A9, confirme com o gestor qual critério de grupo o cliente usará antes de criar a tela; piloto e braço passam a sair no cotacoes.csv do pacote de A10.
Quando o diagnóstico tiver a função receber-pacote, configure o destino e a chave de envio e ligue o envio automático.
```

## Critérios de aceite

A fase de demonstração está pronta quando todos os itens abaixo estiverem marcados. Cada um se confere por teste automático ou pelo roteiro.

- [ ] Os 98 testes atuais continuam passando sem alteração (33 do motor, 65 da API e RLS).
- [ ] Os 5 casos de referência atuais dão o mesmo resultado com o motor 1.1.0.
- [ ] O caso Lisboa dá preço de R$ 9.900,00, margem de R$ 587,00, câmbio de equilíbrio de R$ 6,59 por euro e comissão do vendedor de R$ 58,70.
- [ ] Com 5% de desconto, o mesmo caso dá margem de R$ 181,10, comissão de R$ 18,11 e semáforo amarelo; com 8%, vermelho.
- [ ] Custo em moeda sem câmbio vigente devolve `CAMBIO_AUSENTE`, sem gravar nada.
- [ ] O perfil canal não recebe câmbio, exposição cambial nem comissão do vendedor, pela API nem pela leitura direta no banco.
- [ ] Perda sem categoria é recusada; categoria `outro` sem texto é recusada.
- [ ] O painel mostra os quatro blocos novos com os dados sintéticos de turismo, e o vendedor que dá mais desconto aparece no topo de `porVendedor`.
- [ ] Nenhuma versão de cotação gravada antes da migração mudou (contagem e soma de `preco_final` iguais antes e depois).
- [ ] O pacote do mês da demonstração é gerado sem nenhum nome, e-mail ou documento real, e seus CSV entram na tela de carga do diagnóstico sem ajuste de colunas.
- [ ] Com o envio desligado, nenhum pacote sai, nem pelo n8n; cada geração e envio aparece na auditoria do cliente.
- [ ] O roteiro de 20 minutos passa inteiro no ambiente local e no projeto Supabase, este pela primeira vez no navegador.
- [ ] A demonstração funciona com o repositório já privado, e a senha antiga não entra.
- [ ] `docs/pendencias.md` e `docs/adaptacao-por-cliente.md` descrevem os campos e os limites novos.

## Riscos e pendências

Sete decisões são suas antes da etapa 2; para todas há uma proposta neste documento, que o Claude Code usa se nada for dito.

| Decisão | Proposta usada | Por que importa |
| --- | --- | --- |
| Base da comissão do vendedor na demonstração | 10% da margem, informativa (sem deduzir) | Muda os números do passo 2 do roteiro |
| Lista padrão de motivos de perda | As 6 categorias de A3 | Vira o padrão de todo cliente novo |
| Folga cambial mínima da operadora fictícia | 5% | Decide se o pacote padrão fica verde ou amarelo |
| Cotação PTAX usada nos alertas | Venda, boletim de fechamento | Custo a pagar em moeda é compra de moeda pela operadora |
| Curva de câmbio futuro da B3 | Fora até decidir a licença (pendência do ajustamento do diagnóstico) | A Nota usa Focus e curva futura; o sistema de cotação usa só o câmbio de referência e a PTAX |
| Modo de conta no pacote da operadora fictícia | Pseudônimo por cliente final; agregado como alternativa, por vender a pessoa física | Pseudônimo permite medir dispersão por cliente; agregado reduz dado pessoal, mas zera as métricas por conta |
| Lado que recebe o pacote no diagnóstico | Antecipar do P6 a função receber-pacote e a tela de pacotes recebidos; até lá, carga manual | Sem ela o envio automático não tem destino; o pacote baixado já funciona com a tela atual |

Riscos:

| Risco | Efeito | Mitigação |
| --- | --- | --- |
| Fechar o repositório antes de republicar a função | Demonstração fora do ar | Ordem explícita na etapa 1 e na instrução |
| Comissão do vendedor lida como regra de remuneração pronta | Expectativa trabalhista ou contratual no cliente | Tela e PDF tratam como simulação; a regra real é decisão do cliente com RH e jurídico |
| Preço diferente para grupos no piloto (A9) | Reclamação de canal ou cliente | Critério por unidade ou vendedor, nunca por cliente final; comunicação prévia ao time |
| Conversão por faixa de desconto lida como elasticidade | Decisão tomada com amostra pequena ou enviesada | Aviso de amostra pequena; a análise de elasticidade fica no diagnóstico |
| Escopo crescer além do mínimo da Fase 0 do v3 | Atraso na primeira venda | A7 a A9 só no primeiro cliente; nada novo em portal, API ou SSO |
| Dado pessoal sair no pacote por erro de configuração ou campo novo | Incidente de dados entre cliente e consultoria | Lista fechada de colunas por arquivo, teste que procura valores reais no ZIP, envio desligado por padrão e prévia na tela do administrador |

Pendências herdadas que este documento não resolve: custo de infraestrutura por cliente, onde roda o n8n, PITR como padrão, limite de responsabilidade e exigências da Susep (todas em `docs/pendencias.md`).

## Fontes

- Código: repositório `Fedrumer/Calculadora_Pricing_00001`, pasta `sistema-pricing/`, lido em 18/11/2026.
- [Plano de negócio v3](https://claude.ai/artifact/HXb2ioY5yvwFvHMkiY7NfJ)
- [Ajustamento do sistema de diagnóstico ao plano v3](https://claude.ai/artifact/PcVRGmBvcp4ZwbZBzfxSVy)
- [Escopo das análises de decisão](https://claude.ai/artifact/3aKbyT5wHCcFCiAQJQvm33)
- [Nota de Decisão nº 01](https://claude.ai/artifact/XvmR8CEAoiVCLfV7gZ4aZL) e [nº 02](https://claude.ai/artifact/KdpGbnTutJdMc85rCHVXXw)
- [Arquitetura do Sistema de Pricing](https://claude.ai/artifact/9VoyWHC8vtvDYCqVNZoFRh)
- [Banco Central: boletim PTAX, cotação de moeda por data](https://dadosabertos.bcb.gov.br/dataset/taxas-de-cambio-todos-os-boletins-diarios/resource/db9b40bf-9b8f-47c4-a82d-3a3afab52e90)
- Código do diagnóstico: pasta `diagnostico-pricing/` do mesmo repositório (blocos de carga e nomes de campo), lido em 18/11/2026.
- [LGPD, art. 13, § 4º (pseudonimização), no Pró-Privacidade da UFRGS](https://www.ufrgs.br/proprivacidade/?p=6792)
