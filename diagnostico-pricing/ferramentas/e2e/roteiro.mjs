// Roteiro de ponta a ponta no navegador, contra o ambiente local (pnpm local + aplicação web no ar).
//   node ferramentas/e2e/roteiro.mjs ./capturas
// Percorre o fluxo do documento: abertura, entrada de variáveis pela tela, validação, cálculo,
// premissas, publicação e a visão do cliente. Cada conferência que falha encerra com erro.
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// o Playwright vem do ambiente (instalação global), não das dependências do projeto
const { chromium } = createRequire(import.meta.url)('playwright');

const APP = process.env.URL_APLICACAO ?? 'http://localhost:3100';
const SENHA = process.env.DEMO_SENHA ?? 'Demonstracao2026';
const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const ARQUIVOS = process.env.ARQUIVOS_DEMO ?? join(RAIZ, '.local/arquivos-demo');
const capturas = resolve(process.argv[2] ?? join(RAIZ, 'capturas'));
mkdirSync(capturas, { recursive: true });

let conferidas = 0;
function conferir(ok, descricao) {
  if (!ok) throw new Error(`FALHOU: ${descricao}`);
  conferidas++;
  console.log(`  ok  ${descricao}`);
}

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: Number(process.env.ESCALA ?? 1) });
const erros = [];
pagina.on('pageerror', (e) => erros.push(e.message));
const foto = (nome) => pagina.screenshot({ path: join(capturas, `${nome}.png`), fullPage: true });
const texto = (t) => pagina.getByText(t, { exact: false }).first();
const aba = (nome) => pagina.getByRole('tab', { name: nome }).click();

async function entrar(email) {
  await pagina.goto(`${APP}/entrar`);
  await pagina.fill('input[name=email]', email);
  await pagina.fill('input[name=senha]', SENHA);
  await pagina.click('button:has-text("Entrar")');
  await pagina.waitForSelector('h1:has-text("Diagnósticos")');
}
async function sair() {
  await pagina.click('button:has-text("Sair")');
  await pagina.waitForSelector('h1:has-text("Entrar")');
}
async function enviar(bloco, arquivo) {
  await pagina.click(`[data-bloco=${bloco}] button`);
  await pagina.setInputFiles('input[name=arquivo]', join(ARQUIVOS, arquivo));
  await pagina.waitForSelector('text=Confira de qual coluna vem cada campo');
  conferir((await pagina.locator('text=Falta indicar a coluna').count()) === 0, `${arquivo}: todas as colunas obrigatórias foram reconhecidas`);
  await pagina.click('button:has-text("Confirmar e enviar")');
  await pagina.waitForSelector('[role=dialog]', { state: 'detached', timeout: 60000 });
  await pagina.waitForSelector(`[data-bloco=${bloco}] >> text=${arquivo}`);
}

try {
  console.log('Consultor: a empresa fictícia já diagnosticada');
  await entrar('consultor@demo.local');
  conferir(await texto('Distribuidora Horizonte').isVisible(), 'a lista mostra o diagnóstico da empresa fictícia');
  await pagina.click('tr.clicavel');
  await pagina.waitForSelector('text=Nota geral');
  conferir(await texto('Parcial: 3 de 7 dimensões').isVisible(), 'a nota geral aparece marcada como parcial');
  conferir(await texto('Ganho potencial por ano').isVisible(), 'o resumo mostra a faixa de ganho');
  conferir((await pagina.locator('.achado').count()) >= 3, 'o resumo lista os maiores achados');
  await foto('01-resumo');

  await aba('Realização de preço');
  await pagina.waitForSelector('svg.grafico');
  conferir((await pagina.locator('svg.grafico rect[rx]').count()) >= 8, 'a cascata tem os degraus da lista ao pocket price');
  await pagina.selectOption('select[name=recorte]', 'vendedor');
  conferir(await texto('Gustavo').isVisible(), 'o recorte por vendedor lista os vendedores');
  await foto('02-realizacao');

  await aba('Oportunidades');
  conferir(await texto('Contenção de descontos').isVisible() && await texto('Reajuste seletivo').isVisible(), 'as duas alavancas aparecem');
  conferir((await pagina.locator('.barra-cenario').count()) === 6, 'cada alavanca tem os três cenários');
  await pagina.click('.achado button:has-text("Ver evidência")');
  conferir((await pagina.locator('.achado table tbody tr').count()) > 0, 'o achado abre a evidência com exemplos');
  await foto('03-oportunidades');

  await aba('Dados e premissas');
  conferir(await texto('Linhas com quantidade ou preço zerados ou negativos').isVisible(), 'as checagens mostram as devoluções encontradas');
  conferir(await texto('vendas-12-meses.csv').isVisible(), 'a tela mostra de qual arquivo veio cada bloco');
  await foto('04-dados');

  console.log('Consultor: um diagnóstico novo, com os arquivos enviados pela tela');
  await pagina.click('a:has-text("Diagnósticos")');
  await pagina.click('button:has-text("Novo diagnóstico")');
  await pagina.selectOption('select[name=cliente]', 'novo');
  await pagina.fill('input[name=novo_cliente]', 'Piloto do roteiro');
  await pagina.fill('input[name=nome]', 'Diagnóstico pela tela');
  await pagina.fill('input[name=inicio]', '2025-11-01');
  await pagina.fill('input[name=fim]', '2026-10-31');
  await pagina.click('button:has-text("Criar diagnóstico")');
  await pagina.waitForSelector('h1:has-text("Diagnóstico pela tela")');
  await pagina.waitForSelector('[data-bloco=transacoes]');
  conferir(await texto('ainda não foi calculado').count() === 0, 'diagnóstico novo abre direto em Dados e premissas');

  await pagina.click('button:has-text("Calcular diagnóstico")');
  await pagina.waitForSelector('.aviso.erro');
  conferir(await texto('Envie o arquivo de transações').isVisible(), 'sem dados, o cálculo é recusado e diz o que falta');

  await enviar('transacoes', 'vendas-12-meses.csv');
  await enviar('custos', 'custos.csv');
  await pagina.click('button:has-text("Validar dados")');
  await pagina.waitForSelector('text=Dados validados. Confira');
  conferir(await texto('Qualidade').isVisible(), 'a validação dá nota de qualidade aos blocos');
  await foto('05-carga-validada');

  await pagina.click('button:has-text("Calcular diagnóstico")');
  await pagina.waitForSelector('text=Diagnóstico calculado.', { timeout: 60000 });
  await pagina.waitForSelector('text=Nota geral');
  conferir(await texto('Vazamento de preço').isVisible(), 'o diagnóstico mínimo (transações e custos) calcula');

  await aba('Oportunidades');
  const antes = await pagina.locator('.indicador .valor').nth(1).innerText();
  await pagina.fill('input[name="base|reajuste_seletivo|aumento_pct"]', '8');
  await pagina.click('button:has-text("Salvar e recalcular")');
  await pagina.waitForSelector('text=Premissas salvas');
  await pagina.waitForFunction((a) => document.querySelectorAll('.indicador .valor')[1]?.textContent !== a, antes);
  conferir(await texto('informada').isVisible(), 'a premissa alterada fica marcada como informada e o cenário base muda');

  await pagina.click('button:has-text("Publicar para o cliente")');
  await pagina.waitForSelector('text=Publicado. O cliente passa a ver');
  conferir(true, 'o diagnóstico é publicado');
  await sair();

  console.log('Cliente: só o painel publicado da própria empresa');
  await entrar('cliente@demo.local');
  conferir((await pagina.locator('tr.clicavel').count()) === 1, 'o cliente vê só o diagnóstico da própria empresa');
  conferir((await pagina.locator('button:has-text("Novo diagnóstico")').count()) === 0, 'o cliente não cria diagnóstico');
  await pagina.click('tr.clicavel');
  await pagina.waitForSelector('text=Nota geral');
  conferir(await texto('versão 1, publicada em').isVisible(), 'o painel do cliente informa a versão publicada');
  conferir((await pagina.locator('button:has-text("Recalcular"), button:has-text("Publicar")').count()) === 0, 'o cliente não recalcula nem publica');
  await aba('Oportunidades');
  conferir((await pagina.locator('button:has-text("Salvar e recalcular")').count()) === 0, 'o cliente não altera premissas');
  await aba('Dados e premissas');
  conferir((await pagina.locator('button:has-text("Substituir")').count()) === 0, 'o cliente não envia arquivo');
  await foto('06-cliente');

  conferir(erros.length === 0, `nenhum erro de script nas telas${erros.length ? `: ${erros.join(' | ')}` : ''}`);
  console.log(`\n${conferidas} conferências passaram. Capturas em ${capturas}`);
} catch (e) {
  await foto('falha').catch(() => undefined);
  console.error(`\n${e.message}`);
  process.exitCode = 1;
} finally {
  await navegador.close();
}
