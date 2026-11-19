# Diagnóstico de Pricing

MVP (Fase 1) do sistema descrito no documento **Arquitetura — Sistema de Avaliação e Diagnóstico de Pricing**:
recebe os dados brutos de um cliente e devolve onde a margem vaza, quais ajustes fazer e quanto cada ajuste
vale em reais por ano.

Está instalado e homologado no projeto Supabase `diagnostico_pricing`. O ajuste ao plano v3 segue
`docs/ajustamento-v3.md`, em pacotes; o andamento de cada um está em `docs/pendencias.md`.

Esta pasta é independente de `sistema-pricing` (o sistema de cotação): nada é compartilhado em tempo de execução.

## O que a Fase 1 entrega

| Etapa do documento | O que está pronto |
| --- | --- |
| Abertura | Cliente e diagnóstico (setor, período, preços líquidos ou não de impostos) |
| Entrada de variáveis | Carga de CSV pela tela, com de-para de colunas sugerido e confirmado pelo consultor. Seis blocos: transações e custos (obrigatórios), cadastro de produtos, cadastro de clientes, custos de servir e descontos fora da fatura |
| Validação | 12 checagens, linhas inválidas fora do cálculo e nota de qualidade por bloco |
| Cálculo das métricas | Três dimensões: realização de preço, margem e dispersão (10 métricas), por total e por canal, segmento, categoria, região, vendedor, produto e conta |
| Pontuação e achados | Nota de 0 a 100 por faixa de limiar do catálogo; nota geral parcial (3 de 7 dimensões); 6 regras de achado com evidência e valor exposto |
| Simulação de ajustes | Duas alavancas (contenção de descontos e reajuste seletivo), em cascata, nos cenários conservador, base e agressivo, com premissas editáveis |
| Publicação | Versão publicada imutável; o cliente vê só o que foi publicado |
| Dashboard | Resumo executivo, realização de preço (cascata), oportunidades e dados e premissas |

### Turismo (pacote P1 do plano v3)

Operadoras e consolidadoras usam o mesmo fluxo: uma reserva é uma transação, com colunas opcionais de reserva
(data do serviço, fornecedor, custo unitário na moeda, câmbio da venda e do pagamento, over e status). Quando a
reserva traz custo em moeda, o custo sai dela e a tabela de custos deixa de ser obrigatória. Há um bloco novo,
bloqueios, e sete métricas no catálogo versão 2 (margem por passageiro, markup por fornecedor, resultado cambial,
folga até o câmbio de equilíbrio, ocupação dos bloqueios, custo de lugar não vendido e reservas contra o ano
anterior), informativas até a definição dos limiares. Cada diagnóstico tem um segmento, que escolhe as métricas e
os pesos da nota geral.

### Simulação (pacote P2 do plano v3)

O serviço `servicos/simulacao` troca os três cenários fixos por uma distribuição de 10.000 sorteios: o banco entrega
a base agregada (`motor.base_simulacao`), o serviço em TypeScript sorteia as premissas pela faixa do catálogo
(P10 conservador, P50 base, P90 agressivo), roda as alavancas em sequência e grava média, P10, P50, P90, chance de
ganho, contribuição de cada alavanca e o tornado. Também traz premissas correlacionadas, varredura com ponto de
virada, regra de escolha entre opções, capacidade no sorteio e os modelos das Notas nº 01 e nº 02. Publicado como
Edge Function `simular`; no ambiente local, o emulador atende a mesma rota. `motor.simular` fica como referência:
o teste de paridade confere os dois ao centavo.

Ficam para a Fase 2, como no roadmap: as outras quatro dimensões, as outras cinco alavancas, elasticidade
estimada, narrativa por IA, simulador com controles deslizantes e exportação em PDF. Veja `docs/pendencias.md`.

## Como está organizado

| Pasta | Conteúdo |
| --- | --- |
| `servicos/simulacao` | Serviço de simulação de Monte Carlo (TypeScript puro), empacotado em `supabase/functions/simular` |
| `supabase/migrations` | Tudo o que roda em produção fora da tela: esquema, catálogos versão 1 e 2, motor de cálculo em SQL, funções da aplicação e RLS. O de-para com as versões registradas no projeto está em `docs/migracoes.md` |
| `apps/web` | Aplicação web (Next.js). Chama funções do banco e exibe o resultado; não calcula métrica |
| `ferramentas` | Ambiente local sem Docker (emulador do Supabase), as duas empresas fictícias (distribuidora e operadora de turismo), testes do motor, do turismo e do isolamento, roteiro no navegador |
| `docs` | Plano v3 (`ajustamento-v3.md`), pendências e o que foi verificado, de-para das migrações e capturas das telas |

Decisões do documento (seção 12) adotadas: piloto em venda de produtos com preço de lista (distribuição,
indústria, varejo B2B); o consultor insere os dados; aplicação web própria; cálculo em SQL no Postgres;
Supabase gerenciado.

## Como o cálculo funciona

- **Pocket price** = preço de lista − descontos em fatura − descontos fora da fatura − custos de servir.
  **Vazamento** = (lista − pocket) ÷ lista.
- **Descontos fora da fatura** entram por conta e mês e são rateados pelas vendas daquela conta no mês.
- **Custo de servir** é um percentual do faturado; a regra mais específica vence (conta, depois canal, depois geral).
- **Custo do produto** segue a vigência: vale o custo mais recente com início até a data da venda.
- **Nota** de cada métrica: 100 no limiar bom, 0 no limiar ruim, linear entre os dois. A nota da dimensão é a
  média ponderada; a nota geral usa os pesos do setor, redistribuídos entre as dimensões calculadas.
- **Ganho de uma alavanca**, por par conta e produto:
  `[(P + ΔP − C) × Q × (1 + ε × ΔP ÷ P) − (P − C) × Q] × captura`, com `C` incluindo custo de servir e descontos
  fora da fatura (o ganho sai em pocket margin) e elasticidade `ε` negativa. O ajuste só entra onde o ganho é positivo.
- **Sem dupla contagem**: as alavancas rodam na ordem do catálogo, cada uma sobre a base já ajustada pela anterior.
- **Ganho anual**: o resultado do período é levado a 12 meses (365 ÷ dias com venda).
- **Métrica indisponível** não é estimada: margem exige custo para pelo menos 50% da receita; banda de preço
  exige produto vendido a 5 contas ou mais; correlação exige 10 contas.

Métricas, limiares, regras, alavancas, pesos e premissas padrão estão nas tabelas de catálogo
(`20261117000200_catalogo.sql`). Adaptar a outro setor é inserir uma nova versão do catálogo.

## Rodar na sua máquina

Precisa de Node 22, pnpm e um Postgres 16 local.

```bash
pnpm install
```

```bash
psql -U postgres -c "create role pricing superuser login password 'pricing'"
```

```bash
pnpm test
```

```bash
pnpm local
```

`pnpm local` recria o banco `diagnostico_local`, instala as duas empresas fictícias já diagnosticadas e publicadas e
imprime as duas variáveis `NEXT_PUBLIC_*` para gravar em `apps/web/.env.local` (acrescente
`NEXT_PUBLIC_AMBIENTE=demonstracao` para ver os acessos de demonstração na tela de entrada). Em outro terminal:

```bash
pnpm dev:web
```

A aplicação abre em `http://localhost:3100`. Os arquivos das empresas fictícias ficam em `.local/arquivos-demo` e
`.local/arquivos-demo-turismo`, no formato em que cada uma os enviaria, para testar a carga pela tela
(`pnpm demo:arquivos -- ./pasta --turismo` grava os da operadora em outra pasta).

`pnpm test` roda 48 testes: o caso de referência do motor, o de turismo, a operadora fictícia, a simulação (paridade, correlação, Notas nº 01 e nº 02, capacidade) e o isolamento por perfil.

Roteiro de ponta a ponta no navegador (40 conferências), com o ambiente local e a aplicação no ar:

```bash
node ferramentas/e2e/roteiro.mjs ./capturas
```

## Instalar em um projeto Supabase

1. Crie o projeto (região São Paulo) e aplique as migrações: `supabase link` e `supabase db push`.
2. Crie o primeiro usuário em Authentication e registre-o como consultor, uma única vez, pelo editor SQL:
   `insert into public.usuarios (id, nome, email, perfil) select id, 'Seu nome', email, 'consultor' from auth.users where email = 'voce@empresa.com.br';`
3. Publique `apps/web` com `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (`DIAGNOSTICO_ESTATICO=1 pnpm build:web` gera a pasta `out/` para hospedagem estática).
4. Confira a instalação pela mesma porta que o navegador usa (27 conferências; instala a empresa fictícia se
   ainda não existir e espera os usuários `consultor@demo.local` e `cliente@demo.local` no Auth):
   `SUPABASE_URL=... SUPABASE_CHAVE=<chave publicável> SENHA=... pnpm homologar`
   (atrás de proxy, acrescente `NODE_USE_ENV_PROXY=1`). A Edge Function `simular` é publicada a partir de
   `supabase/functions/simular/index.js`, gerado por `pnpm --filter @diagnostico/simulacao empacotar`.
5. Para dar acesso a alguém do cliente: crie o usuário em Authentication e chame
   `select public.definir_usuario('pessoa@cliente.com.br', 'Nome', 'cliente_leitor', '<id do cliente>');` logado como consultor.

## Segurança

- RLS em todas as tabelas, negando por padrão. O navegador só lê; toda escrita passa por função que confere o perfil.
- Perfis do cliente não leem a base, o resultado bruto nem o catálogo: recebem só o painel publicado da própria empresa.
- Visitante sem sessão não executa nenhuma função.
- Carga, validação, cálculo, alteração de premissa e publicação ficam em `auditoria`, com usuário e horário.
- Cada cálculo guarda a versão do catálogo usada.
