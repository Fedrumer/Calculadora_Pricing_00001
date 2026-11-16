// Roteiro de demonstração de 20 minutos, executado no navegador de ponta a ponta.
// Pré-requisitos: `pnpm local` no ar e a aplicação web em http://localhost:3000.
//   node ferramentas/e2e/roteiro.mjs [pasta-das-capturas]
import { createHmac } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

// o Playwright pode estar instalado globalmente (NODE_PATH) ou no projeto
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const BASE = process.env.URL_APLICACAO ?? 'http://localhost:3000';
const SENHA = process.env.DEMO_SENHA ?? 'Demonstracao2026';
const PASTA = process.argv[2] ?? './capturas';
mkdirSync(PASTA, { recursive: true });

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function totp(segredo) {
  let bits = '';
  for (const c of segredo) bits += ALFABETO.indexOf(c).toString(2).padStart(5, '0');
  const chave = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac('sha1', chave).update(contador).digest();
  const o = h[h.length - 1] & 0xf;
  return String((((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0');
}

const passos = [];
const segredos = new Map();
let n = 0;
function conferir(cond, descricao) {
  passos.push({ ok: !!cond, descricao });
  console.log(`${cond ? '  ok   ' : '  FALHA'} ${descricao}`);
}
async function foto(pagina, nome) {
  n += 1;
  await pagina.waitForTimeout(350);
  await pagina.screenshot({ path: `${PASTA}/${String(n).padStart(2, '0')}-${nome}.png`, fullPage: true });
}

const navegador = await chromium.launch();
const errosDeConsole = [];

async function entrar(email, opcoes = {}) {
  const contexto = await navegador.newContext(opcoes.celular ? { ...devices['iPhone 13'] } : { viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1 });
  const pagina = await contexto.newPage();
  pagina.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errosDeConsole.push(`${email}: ${m.text()}`));
  pagina.on('pageerror', (e) => errosDeConsole.push(`${email}: ${e.message}`));
  await pagina.goto(`${BASE}/entrar`);
  await pagina.fill('input[name=email]', email);
  await pagina.fill('input[name=senha]', SENHA);
  await pagina.click('button:has-text("Entrar")');
  // perfis com segundo fator obrigatório: cadastra no primeiro acesso, informa o código nos seguintes
  await pagina.waitForSelector('nav.lateral, input[name=codigo]', { timeout: 15000 });
  if (await pagina.locator('input[name=codigo]').count()) {
    const chave = pagina.locator('[data-testid=segredo-totp]');
    if (await chave.count()) segredos.set(email, (await chave.textContent()).trim());
    if (opcoes.fotoMfa) await foto(pagina, opcoes.fotoMfa);
    await pagina.fill('input[name=codigo]', totp(segredos.get(email)));
    await pagina.click('button:has-text("Confirmar")');
    await pagina.waitForSelector('nav.lateral', { timeout: 15000 });
  }
  return { contexto, pagina };
}

async function preencherPedido(pagina, { produto = 'AUTO24', plano = 'completo', regiao = 'sudeste', idade = '3', unidades = '1', meses = '12', desconto = '0', canal } = {}) {
  await pagina.waitForSelector('select[name=produto]');
  await pagina.selectOption('select[name=produto]', produto);
  await pagina.selectOption('select[name=plano]', plano);
  await pagina.selectOption('select[name=regiao]', regiao);
  if (produto === 'AUTO24') await pagina.fill('input[name=idade_veiculo]', idade);
  await pagina.fill('input[name=unidades]', unidades);
  await pagina.fill('input[name=meses]', meses);
  if (canal) await pagina.selectOption('select[name=canal]', canal);
  await pagina.fill('input[name=desconto]', desconto);
  // a simulação é disparada 300 ms depois da última tecla: espera ela ir e voltar
  await pagina.waitForTimeout(500);
  await pagina.waitForLoadState('networkidle');
  await pagina.waitForSelector('[data-testid=preco-final]');
  await pagina.waitForFunction(() => !document.querySelector('h2 small'), null, { timeout: 10000 });
}
const precoNaTela = async (pagina) => (await pagina.locator('[data-testid=preco-final]').textContent()).trim();
const idDaUrl = (pagina) => pagina.url().split('/').pop();

try {
  // 1. Vendedor cota dentro da política e emite a proposta em PDF ----------------
  console.log('1. Vendedor cota dentro da política e emite a proposta');
  const vendedor = await entrar('vendedor@aurora.demo');
  await vendedor.pagina.goto(`${BASE}/cotacoes/nova`);
  await preencherPedido(vendedor.pagina, { desconto: '3' });
  conferir((await vendedor.pagina.getAttribute('[data-testid=semaforo]', 'data-cor')) === 'verde', 'semáforo verde com 3% de desconto');
  conferir(await vendedor.pagina.locator('[data-testid=margem]').count(), 'vendedor vê a margem da própria cotação');
  const precoVerde = await precoNaTela(vendedor.pagina);
  await vendedor.pagina.fill('input[name=cliente-nome]', 'Transportes Boa Viagem Ltda');
  await vendedor.pagina.fill('input[name=cliente-documento]', '12.345.678/0001-90');
  await foto(vendedor.pagina, 'vendedor-nova-cotacao-verde');
  await vendedor.pagina.click('button:has-text("Salvar e emitir proposta")');
  await vendedor.pagina.waitForURL(/\/cotacoes\/[0-9a-f-]{36}$/);
  await vendedor.pagina.waitForSelector('h1:has-text("Cotação")');
  conferir(await vendedor.pagina.locator('h1 .selo:has-text("Emitida")').count(), 'cotação emitida na hora');
  const cotacaoEmitida = idDaUrl(vendedor.pagina);
  const [resposta] = await Promise.all([vendedor.pagina.waitForResponse((r) => r.url().endsWith('/proposta')), vendedor.pagina.click('button:has-text("Proposta em PDF")')]);
  const pdf = await vendedor.contexto.request.get((await resposta.json()).url);
  conferir(pdf.ok() && (await pdf.body()).subarray(0, 5).toString() === '%PDF-', 'proposta em PDF gerada no servidor e servida por link assinado');
  for (const p of vendedor.contexto.pages()) if (p !== vendedor.pagina) await p.close();
  await foto(vendedor.pagina, 'vendedor-cotacao-emitida');

  // 2. Desconto acima do limite: motivo obrigatório, vai ao aprovador -------------
  console.log('2. Vendedor pede desconto acima do limite');
  await vendedor.pagina.goto(`${BASE}/cotacoes/nova`);
  await preencherPedido(vendedor.pagina, { desconto: '8', unidades: '12', meses: '24', plano: 'premium', idade: '8' });
  conferir((await vendedor.pagina.getAttribute('[data-testid=semaforo]', 'data-cor')) === 'amarelo', 'semáforo amarelo com 8% de desconto');
  await vendedor.pagina.fill('input[name=cliente-nome]', 'Locadora Via Rápida S.A.');
  await foto(vendedor.pagina, 'vendedor-nova-cotacao-amarela');
  await vendedor.pagina.click('button:has-text("Salvar e pedir aprovação")');
  await vendedor.pagina.waitForSelector('.modal');
  conferir(await vendedor.pagina.locator('.modal button:has-text("Enviar para aprovação")').isDisabled(), 'sem motivo o pedido não é enviado');
  await vendedor.pagina.fill('textarea[name=motivo]', 'Cliente tem proposta concorrente 8% abaixo e fecha frota de 12 veículos.');
  await foto(vendedor.pagina, 'vendedor-pedido-de-excecao');
  await vendedor.pagina.click('.modal button:has-text("Enviar para aprovação")');
  await vendedor.pagina.waitForURL(/\/cotacoes\/[0-9a-f-]{36}$/);
  await vendedor.pagina.waitForSelector('h1 .selo:has-text("Em aprovação")');
  const cotacaoExcecao = idDaUrl(vendedor.pagina);
  conferir(true, 'cotação fica em aprovação, com prazo e motivo');

  // Vermelho: bloqueio com o limite rompido
  await vendedor.pagina.goto(`${BASE}/cotacoes/nova`);
  await preencherPedido(vendedor.pagina, { desconto: '25', idade: '8' });
  conferir((await vendedor.pagina.getAttribute('[data-testid=semaforo]', 'data-cor')) === 'vermelho', 'semáforo vermelho com 25% de desconto, mostrando o limite rompido');
  conferir(!(await vendedor.pagina.locator('button:has-text("Salvar e emitir")').count()), 'sem botão de emissão quando bloqueada');
  await foto(vendedor.pagina, 'vendedor-nova-cotacao-vermelha');

  // 3. Aprovador decide pelo celular, vendo o impacto na margem -------------------
  console.log('3. Aprovador decide pelo celular');
  const aprovador = await entrar('gestor@aurora.demo', { celular: true, fotoMfa: 'aprovador-celular-segundo-fator' });
  await aprovador.pagina.waitForURL(/\/aprovacoes/);
  await aprovador.pagina.waitForSelector('h2:has-text("Pendentes")');
  await foto(aprovador.pagina, 'aprovador-celular-fila');
  await aprovador.pagina.goto(`${BASE}/cotacoes/${cotacaoExcecao}`);
  await aprovador.pagina.waitForSelector('[data-testid=margem]');
  conferir(true, 'aprovador vê a margem da cotação no celular');
  await foto(aprovador.pagina, 'aprovador-celular-cotacao');
  await aprovador.pagina.click('button:has-text("Aprovar exceção")');
  await aprovador.pagina.click('.modal button:has-text("Confirmar")');
  await aprovador.pagina.waitForSelector('h1 .selo:has-text("Aprovada")');
  conferir(true, 'exceção aprovada por quem tem alçada');
  await aprovador.contexto.close();

  await vendedor.pagina.goto(`${BASE}/cotacoes/${cotacaoExcecao}`);
  await vendedor.pagina.click('button:has-text("Emitir proposta")');
  await vendedor.pagina.waitForSelector('h1 .selo:has-text("Emitida")');
  conferir(await vendedor.pagina.locator('.linha-tempo li').count() >= 4, 'linha do tempo registra criação, pedido, aprovação e emissão');
  await foto(vendedor.pagina, 'vendedor-cotacao-aprovada-emitida');

  // 4. Usuário de canal cota o mesmo produto e não vê custo nem margem ------------
  console.log('4. Usuário de canal cota sem ver custo nem margem');
  const canal = await entrar('canal@corretora-alfa.demo');
  await canal.pagina.goto(`${BASE}/cotacoes/nova`);
  await preencherPedido(canal.pagina, { desconto: '3' });
  const textoCanal = await canal.pagina.locator('main').innerText();
  conferir(!/margem|imposto|custo de/i.test(textoCanal), 'tela do canal não mostra margem, imposto nem custo');
  conferir(/Comissão do canal/.test(textoCanal), 'canal vê a própria comissão');
  conferir(!(await canal.pagina.locator('select[name=canal]').count()), 'canal não escolhe outro canal');
  const respostas = [];
  canal.pagina.on('response', async (r) => r.url().includes('/cotacoes/simular') && respostas.push(await r.text()));
  await canal.pagina.fill('input[name=desconto]', '4');
  await canal.pagina.waitForTimeout(900);
  conferir(respostas.length > 0 && respostas.every((t) => !/margem|custosValor|impostosValor/i.test(t)), 'a resposta do servidor ao canal não carrega margem (o corte não é só na tela)');
  await foto(canal.pagina, 'canal-nova-cotacao');
  await canal.pagina.goto(`${BASE}/painel`);
  await canal.pagina.waitForSelector('text=restrito a perfis internos');
  conferir(!(await canal.pagina.locator('nav a:has-text("Painel")').count()), 'canal não tem painel, regras nem auditoria no menu');
  await canal.contexto.close();

  // 5. Gestor altera a tabela, simula o impacto e publica -------------------------
  console.log('5. Gestor de pricing altera a tabela, simula e publica');
  const gestor = await entrar('pricing@aurora.demo');
  await gestor.pagina.goto(`${BASE}/regras`);
  await gestor.pagina.click('button:has-text("Novo rascunho")');
  await gestor.pagina.waitForSelector('input[name=reajuste]');
  await gestor.pagina.fill('input[name=reajuste]', '5');
  await gestor.pagina.click('button:has-text("Aplicar a todos")');
  await gestor.pagina.click('button:has-text("Salvar rascunho")');
  await gestor.pagina.waitForSelector('text=Rascunho salvo');
  await gestor.pagina.click('button:has-text("Simular impacto")');
  await gestor.pagina.waitForSelector('[data-testid=impacto]');
  const impacto = await gestor.pagina.locator('[data-testid=impacto]').innerText();
  conferir(/\+(4,9\d|5,0\d)%/.test(impacto), 'simulação de impacto mostra cerca de +5% no preço médio das cotações recentes');
  await foto(gestor.pagina, 'gestor-tabela-impacto');
  await gestor.pagina.click('button:has-text("Publicar…")');
  await gestor.pagina.click('.modal button:has-text("Publicar")');
  await gestor.pagina.waitForSelector('.modal .aviso.atencao');
  conferir(true, 'casos de referência seguram a publicação até haver motivo registrado');
  await gestor.pagina.fill('textarea[name=motivo-publicacao]', 'Reajuste de 5% aprovado pela diretoria para o próximo ciclo.');
  await foto(gestor.pagina, 'gestor-publicacao-com-motivo');
  await gestor.pagina.click('.modal button:has-text("Publicar mesmo assim")');
  await gestor.pagina.waitForSelector('.modal', { state: 'detached' });
  await gestor.pagina.waitForSelector('tr:has-text("v3") .selo:has-text("Publicada")');
  conferir(true, 'tabela v3 publicada com vigência a partir de hoje');
  await gestor.pagina.click('button:has-text("Executar agora")');
  await gestor.pagina.waitForSelector('[data-testid=casos-resumo]');
  await foto(gestor.pagina, 'gestor-tabelas-e-regras');

  await vendedor.pagina.goto(`${BASE}/cotacoes/nova`);
  await preencherPedido(vendedor.pagina, { desconto: '3' });
  const precoNovo = await precoNaTela(vendedor.pagina);
  conferir(precoNovo !== precoVerde, `cotação nova usa a tabela nova (${precoVerde} → ${precoNovo})`);
  await vendedor.pagina.goto(`${BASE}/cotacoes/${cotacaoEmitida}`);
  await vendedor.pagina.waitForSelector('[data-testid=preco-final]');
  conferir((await precoNaTela(vendedor.pagina)) === precoVerde, 'a cotação antiga mantém o preço');

  await gestor.pagina.goto(`${BASE}/politica`);
  await gestor.pagina.waitForSelector('h2:has-text("Ordem do cálculo")');
  await foto(gestor.pagina, 'gestor-politica-comercial');

  // 6. Administrador convida um usuário e consulta a auditoria --------------------
  console.log('6. Administrador convida um usuário e consulta a auditoria');
  const admin = await entrar('admin@aurora.demo');
  await admin.pagina.waitForURL(/\/usuarios/);
  await admin.pagina.click('button:has-text("Convidar usuário")');
  await admin.pagina.fill('input[name=convite-email]', 'nova.vendedora@aurora.demo');
  await admin.pagina.fill('input[name=convite-nome]', 'Nina Nova');
  await admin.pagina.selectOption('select[name=convite-papel]', 'vendedor');
  await admin.pagina.selectOption('select[name=convite-unidade]', 'sul');
  await admin.pagina.click('.modal button:has-text("Criar convite")');
  await admin.pagina.waitForSelector('input[name=link-convite]');
  const link = await admin.pagina.inputValue('input[name=link-convite]');
  conferir(/\/convite\?token=/.test(link), 'convite criado com link de uso único');
  await foto(admin.pagina, 'admin-convite-criado');
  await admin.pagina.click('.modal button:has-text("Concluir")');

  const convidada = await navegador.newContext({ viewport: { width: 1360, height: 900 } });
  const pc = await convidada.newPage();
  await pc.goto(link.replace(/^https?:\/\/[^/]+/, BASE));
  await pc.waitForSelector('input[name=senha]');
  await pc.fill('input[name=senha]', 'SenhaDaNina2026Forte');
  await pc.fill('input[name=confirmacao]', 'SenhaDaNina2026Forte');
  await pc.check('input[name=aceite]');
  await foto(pc, 'convidada-aceite-do-convite');
  await pc.click('button:has-text("Criar meu acesso")');
  await pc.waitForSelector('text=Acesso criado');
  await pc.goto(link.replace(/^https?:\/\/[^/]+/, BASE));
  await pc.waitForSelector('text=Convite indisponível');
  conferir(true, 'convidada define a senha e aceita os termos; o link não funciona uma segunda vez');
  await convidada.close();

  await admin.pagina.goto(`${BASE}/cotacoes/nova`);
  await admin.pagina.waitForSelector('text=Seu perfil não cota');
  conferir(true, 'administrador não cota (quem dá acesso não muda preço)');
  await admin.pagina.goto(`${BASE}/usuarios`);
  await admin.pagina.waitForSelector('td:has-text("Nina Nova")');
  await foto(admin.pagina, 'admin-usuarios');
  await admin.pagina.goto(`${BASE}/auditoria`);
  await admin.pagina.selectOption('select[name=grupo]', '');
  await admin.pagina.waitForSelector('td:has-text("usuario.convite_aceito")');
  conferir(await admin.pagina.locator('td:has-text("regra.publicada")').count(), 'auditoria mostra a publicação da tabela, o convite e o aceite que acabaram de acontecer');
  await admin.pagina.click('tr:has-text("regra.publicada")');
  await foto(admin.pagina, 'admin-auditoria');
  await admin.pagina.goto(`${BASE}/configuracoes`);
  await admin.pagina.waitForSelector('h2:has-text("Cópias de segurança")');
  await foto(admin.pagina, 'admin-configuracoes');
  await admin.contexto.close();

  // 7. Painel: margem por canal e prova de eficiência -----------------------------
  console.log('7. Painel de margem');
  await gestor.pagina.goto(`${BASE}/painel`);
  await gestor.pagina.waitForSelector('h2:has-text("Margem por canal")');
  await gestor.pagina.waitForSelector('svg.grafico');
  conferir((await gestor.pagina.locator('.barra-linha').count()) >= 3, 'painel mostra margem por canal');
  const prova = await gestor.pagina.locator('.cartao:has(h2:has-text("Prova de eficiência"))').innerText();
  conferir(/\d+ ms em \d+ chamadas/.test(prova), 'prova de eficiência mede o tempo de simulação');
  conferir(/Último teste de restauração[\s\S]*\(ok/.test(prova), 'prova de eficiência mostra o último teste de restauração');
  await foto(gestor.pagina, 'gestor-painel');
  await gestor.pagina.goto(`${BASE}/cotacoes`);
  await gestor.pagina.waitForSelector('table tbody tr');
  await foto(gestor.pagina, 'gestor-cotacoes');
  await gestor.contexto.close();
  await vendedor.contexto.close();
} catch (e) {
  conferir(false, `roteiro interrompido: ${e.message.split('\n')[0]}`);
  for (const c of navegador.contexts()) for (const p of c.pages()) await p.screenshot({ path: `${PASTA}/erro-${Date.now()}.png`, fullPage: true }).catch(() => {});
} finally {
  await navegador.close();
}

conferir(errosDeConsole.length === 0, `sem erros de JavaScript no navegador${errosDeConsole.length ? `: ${errosDeConsole.slice(0, 5).join(' | ')}` : ''}`);
const falhas = passos.filter((p) => !p.ok);
console.log(`\n${passos.length - falhas.length} de ${passos.length} conferências passaram.`);
process.exit(falhas.length ? 1 : 0);
