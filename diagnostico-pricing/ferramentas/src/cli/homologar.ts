// Homologação em um projeto Supabase de verdade, pela mesma porta que o navegador usa:
// login no Supabase Auth e chamadas de função pelo PostgREST, com a chave publicável.
//
//   SUPABASE_URL=... SUPABASE_CHAVE=... SENHA=... pnpm homologar
//
// Precisa de dois usuários já criados no Auth: consultor@demo.local (registrado como consultor)
// e cliente@demo.local (o script o liga ao cliente da demonstração). Na primeira execução instala
// a empresa fictícia; nas seguintes reaproveita o que existe. Cada conferência que falha encerra com erro.
import { atender as simularLocal } from '@diagnostico/simulacao';
import { type Demo, NOMES_ARQUIVO, PERIODO, gerarDemo } from '../demo.ts';
import { type DemoTurismo, NOMES_ARQUIVO_TURISMO, PERIODO_TURISMO, gerarDemoTurismo } from '../demo-turismo.ts';

const URL_BASE = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const CHAVE = process.env.SUPABASE_CHAVE ?? '';
const SENHA = process.env.SENHA ?? '';
const CONSULTOR = process.env.EMAIL_CONSULTOR ?? 'consultor@demo.local';
const CLIENTE = process.env.EMAIL_CLIENTE ?? 'cliente@demo.local';
if (!URL_BASE || !CHAVE || !SENHA) throw new Error('Informe SUPABASE_URL, SUPABASE_CHAVE (publicável) e SENHA.');

let conferidas = 0;
function conferir(ok: unknown, descricao: string) {
  if (!ok) throw new Error(`FALHOU: ${descricao}`);
  conferidas++;
  console.log(`  ok  ${descricao}`);
}

async function entrar(email: string): Promise<string> {
  const r = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: CHAVE, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: SENHA }),
  });
  const corpo = (await r.json()) as { access_token?: string; msg?: string; error_description?: string };
  if (!r.ok || !corpo.access_token) throw new Error(`Login de ${email} falhou (${r.status}): ${corpo.msg ?? corpo.error_description ?? ''}`);
  return corpo.access_token;
}

async function rpc<T = any>(token: string | null, funcao: string, args: Record<string, unknown> = {}): Promise<{ status: number; dados: T }> {
  const r = await fetch(`${URL_BASE}/rest/v1/rpc/${funcao}`, {
    method: 'POST', headers: { apikey: CHAVE, 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(args),
  });
  const texto = await r.text();
  return { status: r.status, dados: (texto ? JSON.parse(texto) : null) as T };
}
async function ok<T = any>(token: string, funcao: string, args: Record<string, unknown> = {}): Promise<T> {
  const r = await rpc<T>(token, funcao, args);
  if (r.status >= 300) throw new Error(`${funcao} respondeu ${r.status}: ${JSON.stringify(r.dados)}`);
  return r.dados;
}
async function tabela(token: string | null, nome: string): Promise<{ status: number; linhas: number }> {
  const r = await fetch(`${URL_BASE}/rest/v1/${nome}?select=*&limit=5`, { headers: { apikey: CHAVE, ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  const corpo = await r.json().catch(() => null);
  return { status: r.status, linhas: Array.isArray(corpo) ? corpo.length : 0 };
}

console.log('Visitante sem sessão');
conferir((await rpc(null, 'listar_diagnosticos')).status === 401, 'não executa função');
conferir((await tabela(null, 'transacoes')).status === 401, 'não lê tabela');

console.log('Consultor');
const consultor = await entrar(CONSULTOR);
conferir((await ok(consultor, 'meu_acesso')).perfil === 'consultor', 'login pelo Supabase Auth e perfil de consultor');

let lista = await ok<any[]>(consultor, 'listar_diagnosticos');
let diag = lista.find((d) => d.cliente.startsWith('Distribuidora Horizonte'))?.id as string | undefined;
let idCliente: string;
if (!diag) {
  const demo = gerarDemo();
  idCliente = await ok<string>(consultor, 'criar_cliente', { p_nome: 'Distribuidora Horizonte (fictícia)', p_setor: 'distribuicao' });
  diag = await ok<string>(consultor, 'criar_diagnostico', { p_cliente: idCliente, p_nome: 'Diagnóstico de pricing 2026', p_inicio: PERIODO.inicio, p_fim: PERIODO.fim, p_precos_liquidos: true });
  for (const bloco of Object.keys(demo) as (keyof Demo)[]) {
    const upload = await ok<string>(consultor, 'iniciar_upload', { p_diagnostico: diag, p_bloco: bloco, p_nome_arquivo: NOMES_ARQUIVO[bloco], p_mapeamento: {} });
    for (let i = 0; i < demo[bloco].length; i += 2000) await ok(consultor, 'enviar_linhas', { p_upload: upload, p_linhas: demo[bloco].slice(i, i + 2000) });
    await ok(consultor, 'concluir_upload', { p_upload: upload });
  }
  conferir(true, `empresa fictícia carregada pela API (${demo.transacoes.length} linhas de venda, seis blocos)`);
}
const inicio = Date.now();
const calculo = await ok(consultor, 'calcular_diagnostico', { p_diagnostico: diag });
conferir(calculo.calculado === true, `diagnóstico calculado no banco em ${((Date.now() - inicio) / 1000).toFixed(1)} s`);

const painel = await ok(consultor, 'painel', { p_diagnostico: diag });
idCliente = painel.diagnostico.cliente.id;
const nota = (d: string) => painel.pontuacoes.find((p: any) => p.dimensao === d)?.nota;
conferir(['realizacao', 'margem', 'dispersao', 'geral'].every((d) => nota(d) >= 0 && nota(d) <= 100), `notas calculadas (geral ${nota('geral')}, parcial)`);
const quedas = painel.cascata.filter((c: any) => c.tipo === 'queda').reduce((s: number, c: any) => s + c.valor, 0);
conferir(Math.abs(painel.cascata[0].valor - quedas - painel.cascata.at(-1).valor) < 1, 'a cascata fecha do preço de lista ao pocket price');
conferir(painel.achados.length >= 4, `${painel.achados.length} achados com evidência`);
const ganhos = painel.cenarios.map((c: any) => c.ganho_total_anual);
conferir(ganhos.length === 3 && ganhos[0] > 0 && ganhos[0] < ganhos[1] && ganhos[1] < ganhos[2], `três cenários em ordem crescente de ganho (${ganhos.map((g: number) => Math.round(g)).join(' < ')})`);
const v = Object.fromEntries(painel.validacoes.map((x: any) => [x.regra, x.ocorrencias]));
conferir(v.valor_zerado_ou_negativo === 40 && v.campos_obrigatorios === 10, 'a validação contou as devoluções e as linhas com preço vazio');

const simulado = await ok(consultor, 'simular', { p_diagnostico: diag, p_premissas: { reajuste_seletivo: { aumento_pct: 8 } } });
conferir(simulado.ganho_total_anual > ganhos[1], 'a simulação com outra premissa responde pela função do banco');
conferir((await tabela(consultor, 'transacoes')).linhas === 5, 'o consultor lê a base pelo PostgREST');
const escrita = await fetch(`${URL_BASE}/rest/v1/metricas_resultado?diagnostico_id=eq.${diag}`, {
  method: 'PATCH', headers: { apikey: CHAVE, authorization: `Bearer ${consultor}`, 'content-type': 'application/json' }, body: JSON.stringify({ valor: 0 }),
});
conferir(escrita.status === 403, 'nem o consultor escreve direto em tabela');

console.log('Simulação (P2): Edge Function simular');
async function funcao(token: string | null, nome: string, corpo: unknown) {
  const r = await fetch(`${URL_BASE}/functions/v1/${nome}`, {
    method: 'POST', headers: { apikey: CHAVE, 'content-type': 'application/json', authorization: `Bearer ${token ?? CHAVE}` }, body: JSON.stringify(corpo),
  });
  return { status: r.status, dados: (await r.json().catch(() => null)) as any };
}
const pedido = { diagnostico_id: diag, semente: 20261119, sorteios: 10000 };
const t0 = Date.now();
const remoto = await funcao(consultor, 'simular', pedido);
conferir(remoto.status === 200, `a função simula 10.000 cenários no projeto (${remoto.dados?.duracao_ms} ms de cálculo, ${Date.now() - t0} ms de ida e volta)`);
// o mesmo pedido no pacote do repositório, com a base lida do projeto: o código publicado é o do repositório
const local = (await simularLocal(pedido, { rpc: (f, a) => (f === 'gravar_simulacao' ? Promise.resolve('local') : ok(consultor, f, a)), agora: () => performance.now() })) as { corpo: any };
const m = (r: any) => r.resultado.opcoes[0].medidas.margem;
conferir(m(remoto.dados).p50 === m(local.corpo).p50 && m(remoto.dados).p10 === m(local.corpo).p10, `mesmo resultado da função publicada e do pacote local (P50 de R$ ${Math.round(m(local.corpo).p50)})`);
const gravada = await ok(consultor, 'simulacao_do_diagnostico', { p_diagnostico: diag });
conferir(gravada.id === remoto.dados.id && gravada.sensibilidade.length === 8, 'a simulação ficou gravada, com o tornado das oito premissas');
const ganhosBase = painel.cenarios.find((c: any) => c.codigo === 'base').alavancas;
conferir(m(local.corpo).p50 > ganhos[0] && m(local.corpo).p50 < ganhos[2] && ganhosBase.length === 2, 'o P50 fica entre os cenários conservador e agressivo');

const versao = await ok<number>(consultor, 'publicar_diagnostico', { p_diagnostico: diag });
conferir(versao >= 1, `publicado como versão ${versao}`);
await ok(consultor, 'definir_usuario', { p_email: CLIENTE, p_nome: 'Diretora comercial (cliente)', p_perfil: 'cliente_leitor', p_cliente: idCliente });

console.log('Operadora de turismo');
conferir(painel.diagnostico.segmento === 'distribuicao' && painel.diagnostico.versao_catalogo === 2 && nota('geral') === 66.4,
  'a distribuidora segue com nota 66,4 no catálogo versão 2');
lista = await ok<any[]>(consultor, 'listar_diagnosticos');
let turismo = lista.find((d) => d.cliente.startsWith('Atlântica Viagens'))?.id as string | undefined;
if (!turismo) {
  const demo = gerarDemoTurismo();
  const cliente = await ok<string>(consultor, 'criar_cliente', { p_nome: 'Atlântica Viagens (fictícia)', p_setor: 'operadora' });
  turismo = await ok<string>(consultor, 'criar_diagnostico', { p_cliente: cliente, p_nome: 'Diagnóstico de pricing 2026', p_inicio: PERIODO_TURISMO.inicio, p_fim: PERIODO_TURISMO.fim, p_precos_liquidos: true, p_segmento: 'operadora' });
  for (const bloco of Object.keys(demo) as (keyof DemoTurismo)[]) {
    const upload = await ok<string>(consultor, 'iniciar_upload', { p_diagnostico: turismo, p_bloco: bloco, p_nome_arquivo: NOMES_ARQUIVO_TURISMO[bloco], p_mapeamento: {} });
    for (let i = 0; i < demo[bloco].length; i += 2000) await ok(consultor, 'enviar_linhas', { p_upload: upload, p_linhas: demo[bloco].slice(i, i + 2000) });
    await ok(consultor, 'concluir_upload', { p_upload: upload });
  }
  conferir(true, `operadora fictícia carregada pela API (${demo.transacoes.length} reservas)`);
}
conferir((await ok(consultor, 'calcular_diagnostico', { p_diagnostico: turismo })).calculado === true, 'a operadora calcula sem arquivo de custos');
const pt = await ok(consultor, 'painel', { p_diagnostico: turismo });
const mt = (c: string) => pt.metricas.find((x: any) => x.codigo === c);
const lisboa = mt('margem_passageiro').detalhe.por_produto.find((x: any) => x.produto === 'LIS-JUL');
conferir(lisboa.passageiros === 34 && Math.abs(lisboa.margem_passageiro - 586.98) < 0.01, 'bloqueio de Lisboa com 34 passageiros e R$ 586,98 por passageiro');
conferir(['resultado_cambial_pct', 'cambio_equilibrio', 'ocupacao_bloqueio_pct', 'custo_lugar_nao_vendido'].every((c) => mt(c).valor !== null), 'métricas de câmbio e capacidade calculadas');
await ok(consultor, 'publicar_diagnostico', { p_diagnostico: turismo });

console.log('Cliente (leitura)');
const cliente = await entrar(CLIENTE);
conferir((await ok(cliente, 'meu_acesso')).perfil === 'cliente_leitor', 'login e perfil de leitura');
lista = await ok<any[]>(cliente, 'listar_diagnosticos');
conferir(lista.length === 1 && lista[0].id === diag, 'vê só o diagnóstico publicado da própria empresa');
const publicado = await ok(cliente, 'painel', { p_diagnostico: diag });
conferir(publicado.publicacao.versao === versao && publicado.cenarios.length === 3, 'recebe o painel da versão publicada');
for (const t of ['transacoes', 'custos', 'metricas_resultado', 'achados', 'regras_achado', 'auditoria']) {
  conferir((await tabela(cliente, t)).linhas === 0, `não lê ${t}`);
}
conferir((await funcao(cliente, 'simular', { diagnostico_id: diag })).status === 403, 'não executa a função simular');
conferir((await funcao(null, 'simular', { diagnostico_id: diag })).status === 401, 'visitante sem sessão não chama a função simular');
for (const t of ['simulacoes', 'simulacao_resultado', 'premissas_distribuicao', 'capacidade']) conferir((await tabela(cliente, t)).linhas === 0, `não lê ${t}`);
for (const [f, args] of [['calcular_diagnostico', { p_diagnostico: diag }], ['publicar_diagnostico', { p_diagnostico: diag }], ['simular', { p_diagnostico: diag, p_premissas: {} }], ['criar_cliente', { p_nome: 'x' }]] as const) {
  conferir((await rpc(cliente, f, args)).status === 403, `não executa ${f}`);
}

console.log(`\n${conferidas} conferências passaram em ${URL_BASE}`);
