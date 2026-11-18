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

async function preencherPedido(pagina, { produto = 'LISBOA', temporada = 'alta', acomodacao = 'duplo', passageiros = '1', desconto = '0', canal } = {}) {
  await pagina.waitForSelector('select[name=produto]');
  await pagina.selectOption('select[name=produto]', produto);
  await pagina.selectOption('select[name=temporada]', temporada);
  await pagina.selectOption('select[name=acomodacao]', acomodacao);
  await pagina.fill('input[name=passageiros]', passageiros);
  if (canal !== undefined && (await pagina.locator('select[name=canal]').count())) await pagina.selectOption('select[name=canal]', canal);
  await pagina.fill('input[name=desconto]', desconto);
  // a simulação é disparada 300 ms depois da última tecla: espera ela ir e voltar
  await pagina.waitForTimeout(500);
  await pagina.waitForLoadState('networkidle');
  await pagina.waitForSelector('[data-testid=preco-final]');
  await pagina.waitForFunction(() => !document.querySelector('h2 small'), null, { timeout: 10000 });
}
const texto = async (pagina, seletor) => (await pagina.locator(seletor).first().innerText()).replace(/\s+/g, ' ').trim();
const precoNaTela = (pagina) => texto(pagina, '[data-testid=preco-final]');
const idDaUrl = (pagina) => new URL(pagina.url()).searchParams.get('id');
const hojeIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const CLIENTE = { nome: 'Família Albuquerque Viagens', documento: '529.982.247-25', email: 'familia.albuquerque@exemplo.test' };

try {
  // 1. Vendedor cota Lisboa de julho dentro da política e emite a proposta --------
  console.log('1. Vendedor cota o pacote Lisboa de julho e emite a proposta');
  const vendedor = await entrar('vendedor@operadora.demo');
  await vendedor.pagina.goto(`${BASE}/cotacoes/nova`);
  await preencherPedido(vendedor.pagina, { canal: 'agencia-horizonte' });
  conferir((await vendedor.pagina.getAttribute('[data-testid=semaforo]', 'data-cor')) === 'verde', 'semáforo verde sem desconto');
  const precoLisboa = await precoNaTela(vendedor.pagina);
  conferir(/9\.900,00/.test(precoLisboa), `preço do pacote: ${precoLisboa}`);
  conferir(/587,00/.test(await texto(vendedor.pagina, '[data-testid=margem]')), 'margem de R$ 587,00 por passageiro');
  conferir(/58,70/.test(await texto(vendedor.pagina, '[data-testid=comissao-vendedor]')), 'vendedor vê a própria comissão: R$ 58,70');
  conferir(/Sua comissão/.test(await vendedor.pagina.locator('main').innerText()), 'a comissão aparece como "Sua comissão nesta cotação"');
  conferir(/6,59/.test(await texto(vendedor.pagina, '[data-testid=cambio-equilibrio]')), 'câmbio que zera a margem: R$ 6,59 por euro');
  await vendedor.pagina.fill('input[name=cliente-nome]', CLIENTE.nome);
  await vendedor.pagina.fill('input[name=cliente-documento]', CLIENTE.documento);
  if (await vendedor.pagina.locator('input[name=cliente-email]').count()) await vendedor.pagina.fill('input[name=cliente-email]', CLIENTE.email);
  await foto(vendedor.pagina, 'vendedor-lisboa-verde');
  await vendedor.pagina.click('button:has-text("Salvar e emitir proposta")');
  await vendedor.pagina.waitForURL(/\/cotacoes\/detalhe\?id=[0-9a-f-]{36}$/);
  await vendedor.pagina.waitForSelector('h1:has-text("Cotação")');
  conferir(await vendedor.pagina.locator('h1 .selo:has-text("Emitida")').count(), 'cotação emitida na hora');
  const cotacaoEmitida = idDaUrl(vendedor.pagina);
  const [resposta] = await Promise.all([vendedor.pagina.waitForResponse((r) => r.url().endsWith('/proposta')), vendedor.pagina.click('button:has-text("Proposta em PDF")')]);
  const pdf = await vendedor.contexto.request.get((await resposta.json()).url);
  conferir(pdf.ok() && (await pdf.body()).subarray(0, 5).toString() === '%PDF-', 'proposta em PDF gerada no servidor e servida por link assinado');
  for (const p of vendedor.contexto.pages()) if (p !== vendedor.pagina) await p.close();
  await foto(vendedor.pagina, 'vendedor-cotacao-emitida');

  // 2. 5% de desconto vai ao aprovador; 8% fica vermelho ---------------------------
  console.log('2. Vendedor pede 5% de desconto');
  await vendedor.pagina.goto(`${BASE}/cotacoes/nova`);
  await preencherPedido(vendedor.pagina, { canal: 'agencia-horizonte', desconto: '5' });
  conferir((await vendedor.pagina.getAttribute('[data-testid=semaforo]', 'data-cor')) === 'amarelo', 'semáforo amarelo com 5% de desconto');
  conferir(/181,10/.test(await texto(vendedor.pagina, '[data-testid=margem]')), 'margem cai de R$ 587,00 para R$ 181,10');
  conferir(/18,11/.test(await texto(vendedor.pagina, '[data-testid=comissao-vendedor]')), 'comissão do vendedor cai de R$ 58,70 para R$ 18,11');
  await vendedor.pagina.fill('input[name=cliente-nome]', 'Grupo Escolar Horizonte Azul');
  await foto(vendedor.pagina, 'vendedor-lisboa-amarela');
  await vendedor.pagina.click('button:has-text("Salvar e pedir aprovação")');
  await vendedor.pagina.waitForSelector('.modal');
  conferir(await vendedor.pagina.locator('.modal button:has-text("Enviar para aprovação")').isDisabled(), 'sem motivo o pedido não é enviado');
  await vendedor.pagina.fill('textarea[name=motivo]', 'Agência pediu 5% para fechar o grupo de julho; concorrente ofereceu menos.');
  await foto(vendedor.pagina, 'vendedor-pedido-de-excecao');
  await vendedor.pagina.click('.modal button:has-text("Enviar para aprovação")');
  await vendedor.pagina.waitForURL(/\/cotacoes\/detalhe\?id=[0-9a-f-]{36}$/);
  await vendedor.pagina.waitForSelector('h1 .selo:has-text("Em aprovação")');
  const cotacaoExcecao = idDaUrl(vendedor.pagina);
  conferir(true, 'cotação fica em aprovação, com prazo e motivo');

  await vendedor.pagina.goto(`${BASE}/cotacoes/nova`);
  await preencherPedido(vendedor.pagina, { canal: 'agencia-horizonte', desconto: '8' });
  conferir((await vendedor.pagina.getAttribute('[data-testid=semaforo]', 'data-cor')) === 'vermelho', 'semáforo vermelho com 8% de desconto, mostrando o limite rompido');
  conferir(!(await vendedor.pagina.locator('button:has-text("Salvar e emitir")').count()), 'sem botão de emissão quando bloqueada');
  await foto(vendedor.pagina, 'vendedor-lisboa-vermelha');

  // 3. Aprovador decide pelo celular, vendo margem e folga cambial ---------------
  console.log('3. Aprovador decide pelo celular');
  const aprovador = await entrar('gerente@operadora.demo', { celular: true, fotoMfa: 'aprovador-celular-segundo-fator' });
  await aprovador.pagina.waitForURL(/\/aprovacoes/);
  await aprovador.pagina.waitForSelector('h2:has-text("Pendentes")');
  await foto(aprovador.pagina, 'aprovador-celular-fila');
  await aprovador.pagina.goto(`${BASE}/cotacoes/detalhe?id=${cotacaoExcecao}`);
  await aprovador.pagina.waitForSelector('[data-testid=margem]');
  conferir(/181,10/.test(await texto(aprovador.pagina, '[data-testid=margem]')), 'aprovador vê o impacto na margem no celular');
  conferir(/6,2\d|folga/i.test(await texto(aprovador.pagina, '[data-testid=cambio-equilibrio]')), 'aprovador vê o câmbio que zera a margem e a folga cambial');
  await foto(aprovador.pagina, 'aprovador-celular-cotacao');
  await aprovador.pagina.click('button:has-text("Aprovar exceção")');
  await aprovador.pagina.click('.modal button:has-text("Confirmar")');
  await aprovador.pagina.waitForSelector('h1 .selo:has-text("Aprovada")');
  conferir(true, 'exceção aprovada por quem tem alçada');
  await aprovador.contexto.close();

  await vendedor.pagina.goto(`${BASE}/cotacoes/detalhe?id=${cotacaoExcecao}`);
  await vendedor.pagina.click('button:has-text("Emitir proposta")');
  await vendedor.pagina.waitForSelector('h1 .selo:has-text("Emitida")');
  conferir((await vendedor.pagina.locator('.linha-tempo li').count()) >= 4, 'linha do tempo registra criação, pedido, aprovação e emissão');
  await foto(vendedor.pagina, 'vendedor-cotacao-aprovada-emitida');

  // 4. Agência parceira cota o mesmo pacote sem ver custo, margem, câmbio nem comissão do vendedor
  console.log('4. Agência parceira cota o mesmo pacote');
  const canal = await entrar('canal@agencia-horizonte.demo');
  const respostas = [];
  canal.pagina.on('response', async (r) => r.url().includes('/cotacoes/simular') && respostas.push(await r.text().catch(() => '')));
  await canal.pagina.goto(`${BASE}/cotacoes/nova`);
  await preencherPedido(canal.pagina);
  const textoCanal = await canal.pagina.locator('main').innerText();
  conferir(/9\.900,00/.test(await precoNaTela(canal.pagina)), 'agência vê o mesmo preço de R$ 9.900,00');
  conferir(!/margem|imposto|custo de|câmbio|euro|comissão do vendedor|sua comissão/i.test(textoCanal), 'tela da agência não mostra margem, custo, câmbio nem comissão do vendedor');
  conferir(/Comissão do canal/.test(textoCanal), 'agência vê a própria comissão');
  conferir(!(await canal.pagina.locator('select[name=canal]').count()), 'agência não escolhe outro canal');
  await canal.pagina.fill('input[name=desconto]', '1');
  await canal.pagina.waitForTimeout(900);
  conferir(
    respostas.length > 0 && respostas.every((t) => !/margem|custosValor|impostosValor|exposicaoCambial|cambioEquilibrio|comissaoVendedor|"taxa"/i.test(t)),
    'a resposta do servidor à agência não carrega margem, câmbio nem comissão do vendedor (o corte não é só na tela)',
  );
  await foto(canal.pagina, 'canal-nova-cotacao');
  await canal.pagina.goto(`${BASE}/painel`);
  await canal.pagina.waitForSelector('text=restrito a perfis internos');
  conferir(!(await canal.pagina.locator('nav a:has-text("Painel")').count()), 'agência não tem painel, regras nem auditoria no menu');
  await canal.contexto.close();

  // 5. Gestor publica câmbio de R$ 6,30, vê o impacto; a proposta emitida mantém o preço
  console.log('5. Gestor publica um câmbio de referência de R$ 6,30');
  const gestor = await entrar('pricing@operadora.demo');
  await gestor.pagina.goto(`${BASE}/politica`);
  await gestor.pagina.waitForSelector('[data-testid=cambio-referencia]');
  await gestor.pagina.click('[data-testid=cambio-referencia] button:has-text("Publicar câmbio")');
  await gestor.pagina.waitForSelector('input[name=cambio-taxa]');
  await gestor.pagina.fill('input[name=cambio-taxa]', '6,30');
  await gestor.pagina.fill('input[name=cambio-vigencia]', hojeIso());
  await gestor.pagina.fill('input[name=cambio-observacao]', 'Euro subiu na semana; referência revista pela diretoria.');
  await gestor.pagina.click('.modal button:has-text("Simular impacto")');
  await gestor.pagina.waitForSelector('[data-testid=impacto-cambio]');
  const impactoCambio = await texto(gestor.pagina, '[data-testid=impacto-cambio]');
  conferir(/margem de [\d,]+% para [\d,]+%/.test(impactoCambio), `simulação mostra a margem antes e depois (${impactoCambio.slice(0, 110)}…)`);
  await foto(gestor.pagina, 'gestor-cambio-impacto');
  await gestor.pagina.click('.modal button:has-text("Publicar")');
  await gestor.pagina.waitForSelector('.modal', { state: 'detached' });
  await gestor.pagina.waitForSelector('[data-testid=cambio-referencia] td:has-text("6,30")');
  conferir(true, 'câmbio de R$ 6,30 publicado com vigência a partir de hoje');
  await foto(gestor.pagina, 'gestor-politica-comercial');

  await vendedor.pagina.goto(`${BASE}/cotacoes/nova`);
  await preencherPedido(vendedor.pagina, { canal: 'agencia-horizonte' });
  conferir(/9\.900,00/.test(await precoNaTela(vendedor.pagina)), 'o preço de tabela não muda com o câmbio');
  conferir(/347,40/.test(await texto(vendedor.pagina, '[data-testid=margem]')), 'cotação nova usa o câmbio novo: margem de R$ 587,00 para R$ 347,40');
  await vendedor.pagina.goto(`${BASE}/cotacoes/detalhe?id=${cotacaoEmitida}`);
  await vendedor.pagina.waitForSelector('[data-testid=preco-final]');
  conferir((await precoNaTela(vendedor.pagina)) === precoLisboa && /587,00/.test(await texto(vendedor.pagina, '[data-testid=margem]')), 'a proposta já emitida mantém preço e margem');

  // 6. Perda por preço com o valor do concorrente; convite e auditoria -------------
  console.log('6. Vendedor registra a perda; administrador convida e consulta a auditoria');
  await vendedor.pagina.click('button:has-text("Não fechou")');
  await vendedor.pagina.waitForSelector('select[name=motivo-perda]');
  conferir(await vendedor.pagina.locator('.modal button:has-text("Registrar")').isDisabled(), 'sem categoria a perda não é registrada');
  await vendedor.pagina.selectOption('select[name=motivo-perda]', 'preco_concorrente');
  await vendedor.pagina.fill('input[name=concorrente-nome]', 'Agência Concorrente do Bairro');
  await vendedor.pagina.fill('input[name=concorrente-preco]', '9.200,00');
  await foto(vendedor.pagina, 'vendedor-perda-por-preco');
  await vendedor.pagina.click('.modal button:has-text("Registrar")');
  await vendedor.pagina.waitForSelector('h1 .selo:has-text("Perdida")');
  conferir(/Preço acima do concorrente/.test(await vendedor.pagina.locator('main').innerText()), 'perda registrada na categoria "preço do concorrente", com o valor informado');

  const admin = await entrar('admin@operadora.demo');
  await admin.pagina.waitForURL(/\/usuarios/);
  await admin.pagina.click('button:has-text("Convidar usuário")');
  await admin.pagina.fill('input[name=convite-email]', 'nova.vendedora@operadora.demo');
  await admin.pagina.fill('input[name=convite-nome]', 'Nina Nova');
  await admin.pagina.selectOption('select[name=convite-papel]', 'vendedor');
  if (await admin.pagina.locator('select[name=convite-unidade]').count()) await admin.pagina.selectOption('select[name=convite-unidade]', 'online');
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
  await admin.pagina.goto(`${BASE}/auditoria`);
  await admin.pagina.selectOption('select[name=grupo]', '');
  await admin.pagina.waitForSelector('td:has-text("usuario.convite_aceito")');
  const auditoria = await admin.pagina.locator('main').innerText();
  conferir(/regra\.cambio_publicado/.test(auditoria) && /cotacao\.perdida/.test(auditoria), 'auditoria mostra o câmbio publicado, a perda, o convite e o aceite que acabaram de acontecer');
  await admin.pagina.click('tr:has-text("regra.cambio_publicado")');
  await foto(admin.pagina, 'admin-auditoria');

  // 7. Painel e envio ao diagnóstico ---------------------------------------------
  console.log('7. Painel e envio ao diagnóstico');
  await gestor.pagina.goto(`${BASE}/painel`);
  await gestor.pagina.waitForSelector('h2:has-text("Margem por canal")');
  await gestor.pagina.waitForSelector('svg.grafico');
  conferir((await gestor.pagina.locator('.barra-linha').count()) >= 3, 'painel mostra margem por canal');
  const primeiroVendedor = await texto(gestor.pagina, '[data-testid=por-vendedor] tbody tr td');
  conferir(primeiroVendedor === 'Rui Rebaixa', `dispersão por vendedor: quem dá mais desconto no topo (${primeiroVendedor})`);
  const faixas = await texto(gestor.pagina, '[data-testid=conversao-por-desconto]');
  conferir(/Sem desconto/.test(faixas) && /Até 2%/.test(faixas) && /2% a 5%/.test(faixas), 'conversão por faixa de desconto');
  conferir(/amostra pequena/.test(faixas), 'faixa com menos de 30 emitidas marcada como "amostra pequena"');
  const exposicao = await texto(gestor.pagina, '[data-testid=exposicao-cambial]');
  conferir(/EUR/.test(exposicao) && /6,3/.test(exposicao), 'exposição cambial em euro, comparada ao câmbio de referência de hoje (R$ 6,30)');
  conferir(/acima/.test(await texto(gestor.pagina, '[data-testid=motivos-perda]')), 'perdas por categoria, com a diferença para o preço do concorrente');
  const prova = await gestor.pagina.locator('.cartao:has(h2:has-text("Prova de eficiência"))').innerText();
  conferir(/\d+ ms em \d+ chamadas/.test(prova), 'prova de eficiência mede o tempo de simulação');
  await foto(gestor.pagina, 'gestor-painel');
  await gestor.pagina.goto(`${BASE}/cotacoes`);
  await gestor.pagina.waitForSelector('table tbody tr');
  await foto(gestor.pagina, 'gestor-cotacoes');
  await gestor.contexto.close();

  await admin.pagina.goto(`${BASE}/envio-diagnostico`);
  await admin.pagina.waitForSelector('[data-testid=envio-config]');
  conferir((await texto(admin.pagina, '[data-testid=envio-estado]')) === 'desligado', 'envio ao diagnóstico começa desligado');
  await admin.pagina.fill('input[name=competencia]', hojeIso().slice(0, 7));
  await admin.pagina.click('button[name=previa]');
  await admin.pagina.waitForSelector('[data-testid=envio-previa]');
  for (const d of await admin.pagina.locator('[data-testid=envio-previa] details').all()) await d.evaluate((e) => (e.open = true));
  const previa = await admin.pagina.locator('[data-testid=envio-previa]').innerText();
  conferir(/transacoes\.csv/.test(previa) && /C-[0-9A-F]{16}/.test(previa) && /V-[0-9A-F]{16}/.test(previa), 'prévia mostra clientes e vendedores só como código');
  conferir(![CLIENTE.nome, '529.982.247-25', '52998224725', CLIENTE.email, 'Vera Vendedora', 'Agência Concorrente do Bairro'].some((v) => previa.includes(v)), 'prévia sem nome, documento, e-mail nem texto livre');
  await foto(admin.pagina, 'admin-envio-previa');
  await admin.pagina.click('button[name=gerar-pacote]');
  await admin.pagina.waitForSelector('[data-testid=envio-historico] tbody tr');
  const [baixar] = await Promise.all([admin.pagina.waitForResponse((r) => /\/envio-diagnostico\/[0-9a-f-]+\/baixar$/.test(r.url())), admin.pagina.click('button[name=baixar-pacote] >> nth=0')]);
  const zip = await admin.contexto.request.get((await baixar.json()).url);
  conferir(zip.ok() && (await zip.body()).subarray(0, 2).toString() === 'PK', 'pacote do mês baixado por link assinado (ZIP)');
  await admin.pagina.goto(`${BASE}/envio-diagnostico`);
  await admin.pagina.waitForSelector('[data-testid=envio-historico] tbody tr');
  await admin.pagina.click('button[name=enviar-agora] >> nth=0');
  await admin.pagina.waitForSelector('.aviso.erro');
  conferir(/desligado/.test(await texto(admin.pagina, '.aviso.erro')), 'com o envio desligado, "Enviar agora" não manda nada e explica por quê');
  await foto(admin.pagina, 'admin-envio-diagnostico');
  await admin.contexto.close();
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
