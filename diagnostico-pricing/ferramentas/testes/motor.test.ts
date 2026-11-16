// Caso de referência do motor: uma base pequena, com todos os números conferidos à mão.
//
// Produto P1: lista 100, custo 60. Seis contas, uma venda cada:
//   C1 1000 un a 90 · C2 500 a 88 · C3 200 a 92 · C4 100 a 85 · C5 50 a 80 · C6 10 a 70
// Produto P2: lista 50, custo 45. C1 compra 100 un a 40, em junho.
// Frete de 5% sobre o faturado para todos. Rebate de 4.500 para C1 em janeiro (5% dos 90.000 do mês).
//
//   Receita de lista   186.000 + 5.000              = 191.000
//   Receita faturada   165.600 + 4.000              = 169.600
//   Fora da fatura                                     4.500
//   Frete              5% de 169.600                =   8.480
//   Receita pocket     169.600 - 4.500 - 8.480      = 156.620
//   Vazamento          (191.000 - 156.620)/191.000  = 18,00%
//   Custo              111.600 + 4.500              = 116.100
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { carregar, claims, criarUsuario } from '../src/apoio.ts';
import { type Sql, conectar, recriarBanco } from '../src/banco.ts';
import { chamar } from '../src/emulador.ts';

const URL_BANCO = process.env.DATABASE_URL_TESTE ?? 'postgresql://pricing:pricing@127.0.0.1:5432/diagnostico_teste_motor';
let sql: Sql;
let consultor: string;
let diag: string;
let painel: any;

const perto = (obtido: number, esperado: number, tolerancia = 0.01) =>
  assert.ok(Math.abs(obtido - esperado) <= tolerancia, `esperado ${esperado}, obtido ${obtido}`);
const metrica = (codigo: string) => painel.metricas.find((m: any) => m.codigo === codigo);

before(async () => {
  await recriarBanco(URL_BANCO);
  sql = conectar(URL_BANCO);
  consultor = await criarUsuario(sql, { email: 'consultor@teste.local', senha: 'Senha-de-teste-1', nome: 'Consultor', perfil: 'consultor' });
  const cliente = await chamar<string>(sql, claims(consultor), 'criar_cliente', { p_nome: 'Cliente de referência', p_setor: 'distribuicao' });
  diag = await chamar<string>(sql, claims(consultor), 'criar_diagnostico', { p_cliente: cliente, p_nome: 'Referência', p_inicio: '2026-01-01', p_fim: '2026-12-31' });

  const venda = (data: string, produto: string, conta: string, quantidade: number, lista: number, faturado: number) =>
    ({ data, nota_fiscal: null, produto, conta, canal: 'Direto', quantidade, preco_lista: lista, preco_faturado: faturado, desc_comercial: lista - faturado });
  await carregar(sql, consultor, diag, 'transacoes', [
    venda('2026-01-01', 'P1', 'C1', 1000, 100, 90),
    venda('2026-03-10', 'P1', 'C2', 500, 100, 88),
    venda('2026-04-10', 'P1', 'C3', 200, 100, 92),
    venda('2026-05-10', 'P1', 'C4', 100, 100, 85),
    venda('2026-07-10', 'P1', 'C5', 50, 100, 80),
    venda('2026-12-31', 'P1', 'C6', 10, 100, 70),
    venda('2026-06-15', 'P2', 'C1', 100, 50, 40),
    // linhas que a validação tira do cálculo
    venda('2026-08-01', 'P1', 'C2', -5, 100, 88), // devolução
    venda('2027-02-01', 'P1', 'C2', 10, 100, 88), // fora do período
    { data: '2026-08-02', produto: 'P1', conta: 'C2', quantidade: 3, preco_lista: 100, preco_faturado: null }, // preço vazio
  ]);
  await carregar(sql, consultor, diag, 'custos', [{ produto: 'P1', custo_unitario: 60 }, { produto: 'P2', custo_unitario: 45 }]);
  await carregar(sql, consultor, diag, 'custos_servir', [{ tipo: 'frete', percentual: 5 }]);
  await carregar(sql, consultor, diag, 'descontos_fora_fatura', [{ conta: 'C1', mes: '2026-01-01', tipo: 'rebate', valor: 4500 }]);

  const r = await chamar(sql, claims(consultor), 'calcular_diagnostico', { p_diagnostico: diag });
  assert.equal(r.calculado, true);
  painel = await chamar(sql, claims(consultor), 'painel', { p_diagnostico: diag });
});
after(async () => sql?.end());

test('validação tira do cálculo devolução, linha fora do período e preço vazio', () => {
  assert.equal(painel.base.linhas, 7);
  const regras = Object.fromEntries(painel.validacoes.map((v: any) => [v.regra, v.ocorrencias]));
  assert.equal(regras.valor_zerado_ou_negativo, 1);
  assert.equal(regras.fora_do_periodo, 1);
  assert.equal(regras.campos_obrigatorios, 1);
  const transacoes = painel.qualidade.find((q: any) => q.bloco === 'transacoes');
  assert.equal(transacoes.linhas, 10);
  perto(transacoes.nota, 60); // 7 de 10 válidas (70) menos 10 pontos por cobrir menos de 12 meses
});

test('cascata de preço fecha da lista ao pocket price', () => {
  const degrau = (d: string) => painel.cascata.find((c: any) => c.degrau === d)?.valor;
  perto(degrau('lista'), 191000);
  perto(degrau('d_comercial'), 21400);
  perto(degrau('faturado'), 169600);
  perto(degrau('fora_fatura'), 4500);
  perto(degrau('cs_frete'), 8480);
  perto(degrau('pocket'), 156620);
  const quedas = painel.cascata.filter((c: any) => c.tipo === 'queda').reduce((s: number, c: any) => s + c.valor, 0);
  perto(degrau('lista') - quedas, degrau('pocket'));
});

test('métricas de realização e margem', () => {
  perto(metrica('vazamento_pct').valor, 18.0);
  perto(metrica('desconto_fatura_pct').valor, (100 * 21400) / 191000);
  perto(metrica('margem_contribuicao_pct').valor, (100 * (169600 - 116100)) / 169600);
  perto(metrica('margem_pocket_pct').valor, (100 * (156620 - 116100)) / 156620);
  // só o par C1 e P2 tem pocket margin negativa: 3.800 de pocket contra 4.500 de custo
  perto(metrica('receita_margem_negativa_pct').valor, (100 * 4000) / 169600);
});

test('banda de preço: percentis 10, 50 e 90 do preço por conta', () => {
  // preços de P1 por conta: 70, 80, 85, 88, 90, 92 -> p10 = 75, p50 = 86,5, p90 = 91
  perto(metrica('dispersao_banda_pct').valor, (100 * (91 - 75)) / 86.5);
  assert.equal(metrica('correlacao_desconto_volume').valor, null); // menos de 10 contas: indisponível, não estimada
  assert.match(metrica('correlacao_desconto_volume').detalhe.indisponivel, /10 contas/);
});

test('pontuação por faixa de limiar, nota geral parcial', () => {
  const nota = (d: string) => painel.pontuacoes.find((p: any) => p.dimensao === d);
  // vazamento 18,0 entre bom 15 e ruim 40 -> 88,0; desconto em fatura 11,204 entre 8 e 30 -> 85,44; pesos 2 e 1
  perto(nota('realizacao').nota, (2 * 88 + (100 * (30 - (100 * 21400) / 191000)) / 22) / 3, 0.06);
  assert.equal(nota('geral').parcial, true);
  assert.equal(nota('geral').detalhe.dimensoes_calculadas, 3);
  assert.equal(nota('geral').detalhe.dimensoes_do_catalogo, 7);
});

test('contenção de descontos: fecha a distância até o piso nas contas fora do quartil superior', async () => {
  // piso = mediana (86,5). C1 e C2 são o quartil superior. Abaixo do piso: C4 (85), C5 (80), C6 (70).
  // Sem elasticidade e com captura total: 1,5 x 100 + 6,5 x 50 + 16,5 x 10 = 640
  const r = await chamar(sql, claims(consultor), 'simular', {
    p_diagnostico: diag,
    p_premissas: { contencao_descontos: { percentil_piso: 50, fechamento: 1, elasticidade: 0, captura: 1 }, reajuste_seletivo: { margem_alvo_pct: 10, aumento_pct: 10, elasticidade: 0, captura: 1 } },
  });
  perto(r.fator_anual, 1, 0.0001); // vendas de 01/01 a 31/12: 365 dias
  const [contencao, reajuste] = r.alavancas;
  assert.equal(contencao.alavanca, 'contencao_descontos');
  perto(contencao.ganho_anual, 640);
  assert.equal(contencao.itens, 3);
  // reajuste: só P2 fica abaixo do alvo. 10% sobre 40 = 4 por unidade, 100 unidades
  assert.equal(reajuste.alavanca, 'reajuste_seletivo');
  perto(reajuste.ganho_anual, 400);
  perto(r.ganho_total_anual, 1040);
});

test('elasticidade e captura entram como na fórmula do documento', async () => {
  // Só C6 muda quando o piso é o percentil 20 (80): preço 70, dP = 10 x 0,5 = 5, e = -1, captura 0,5.
  // C = 60 + 5% de 70 = 63,5.  [(75 - 63,5) x 10 x (1 - 5/70) - (70 - 63,5) x 10] x 0,5
  const r = await chamar(sql, claims(consultor), 'simular', {
    p_diagnostico: diag,
    p_premissas: { contencao_descontos: { percentil_piso: 20, fechamento: 0.5, elasticidade: -1, captura: 0.5 }, reajuste_seletivo: { margem_alvo_pct: -100 } },
  });
  perto(r.alavancas[0].ganho_anual, ((75 - 63.5) * 10 * (1 - 5 / 70) - (70 - 63.5) * 10) * 0.5);
  perto(r.alavancas[1].ganho_anual, 0);
});

test('os três cenários ficam gravados e em ordem crescente de ganho', () => {
  assert.deepEqual(painel.cenarios.map((c: any) => c.codigo), ['conservador', 'base', 'agressivo']);
  const [a, b, c] = painel.cenarios.map((x: any) => x.ganho_total_anual);
  assert.ok(a <= b && b <= c, `${a} <= ${b} <= ${c}`);
  assert.ok(c > 0);
});

test('alterar premissa recalcula o cenário e marca a premissa como informada', async () => {
  await chamar(sql, claims(consultor), 'salvar_premissas', { p_diagnostico: diag, p_cenario: 'base', p_premissas: { reajuste_seletivo: { aumento_pct: 8 } } });
  const depois = await chamar(sql, claims(consultor), 'painel', { p_diagnostico: diag });
  const base = depois.cenarios.find((c: any) => c.codigo === 'base');
  assert.equal(base.premissas.find((p: any) => p.alavanca === 'reajuste_seletivo' && p.chave === 'aumento_pct').origem, 'informada');
  assert.ok(base.ganho_total_anual > painel.cenarios[1].ganho_total_anual);
});

test('sem custos o cálculo não roda e diz por quê', async () => {
  const cliente = await chamar<string>(sql, claims(consultor), 'criar_cliente', { p_nome: 'Sem custos' });
  const d = await chamar<string>(sql, claims(consultor), 'criar_diagnostico', { p_cliente: cliente, p_nome: 'X', p_inicio: '2026-01-01', p_fim: '2026-12-31' });
  assert.match((await chamar(sql, claims(consultor), 'calcular_diagnostico', { p_diagnostico: d })).bloqueio, /transações/);
  await carregar(sql, consultor, d, 'transacoes', [{ data: '2026-02-01', produto: 'P1', conta: 'C1', quantidade: 1, preco_lista: 10, preco_faturado: 9 }]);
  const r = await chamar(sql, claims(consultor), 'calcular_diagnostico', { p_diagnostico: d });
  assert.equal(r.calculado, false);
  assert.match(r.bloqueio, /custos/);
});
