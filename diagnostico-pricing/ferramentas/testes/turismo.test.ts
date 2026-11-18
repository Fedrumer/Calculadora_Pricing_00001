// Caso de referência de turismo (P1 do plano v3): uma operadora pequena, com cada número conferido à mão.
//
// Período de 01/01/2025 a 31/12/2026. Comissão de 10% sobre o faturado no canal Agencia; canal Direto sem custo de servir.
// Reservas (q = passageiros; custo unitário na moeda do fornecedor):
//   R1 01/03/26, serviço 10/07/26, LIS, F1, q2, lista 10.000, faturado 9.900, 1.300 EUR, câmbio venda 6,00, pagamento 6,20 (Agencia)
//   R2 15/04/26, serviço 20/07/26, LIS, F1, q3, lista e faturado 10.000, 1.300 EUR, venda 6,05, pagamento 6,20 (Agencia)
//   R3 10/05/26, serviço 05/09/26, ORL, F2, q4, lista 8.000, faturado 7.600, 900 USD, venda 5,50, sem pagamento (projetado), over R$ 50 (Direto)
//   R4 01/04/25, serviço 10/07/25, LIS, F1, q3, lista e faturado 9.500, 1.250 EUR, venda 5,90, pagamento 5,80 (Agencia)
//   R8 01/08/26, serviço 20/08/26, GRA, F3, q2, lista e faturado 3.000, custo R$ 2.000 (Direto)
//   e três fora do cálculo: R5 cancelada (q2, R$ 20.000), R6 com serviço antes da venda, R7 com moeda "EU".
//
//   linha  faturado  comissão  pocket   custo em moeda   custo em R$                    resultado cambial
//   R1     19.800    1.980     17.820   2.600 EUR        2.600 × 6,20 = 16.120          2.600 × (6,00 − 6,20) = −520
//   R2     30.000    3.000     27.000   3.900 EUR        3.900 × 6,20 = 24.180          3.900 × (6,05 − 6,20) = −585
//   R3     30.400    —         30.400   3.600 USD        3.600 × 5,50 − 4 × 50 = 19.600 0 (projetado com o câmbio da venda)
//   R4     28.500    2.850     25.650   3.750 EUR        3.750 × 5,80 = 21.750          3.750 × (5,90 − 5,80) = +375
//   R8      6.000    —          6.000   4.000 BRL        4.000                          — (custo em reais)
//   total 114.700              106.870                  85.650                         −730
//
//   Margem por passageiro = (106.870 − 85.650) ÷ 14 = 1.515,71
//   Markup = 21.220 ÷ 85.650 = 24,78%; F1 8.420 ÷ 62.050 = 13,57%; F2 10.800 ÷ 19.600 = 55,10%; F3 2.000 ÷ 4.000 = 50%
//   Resultado cambial = −730 ÷ 114.700 = −0,6364%
//   Câmbio de equilíbrio LIS = 70.470 ÷ 10.250 EUR = 6,8751; câmbio de venda médio = 61.320 ÷ 10.250 = 5,9824; folga 14,92%
//   Câmbio de equilíbrio ORL = (30.400 + 200) ÷ 3.600 USD = 8,50; venda 5,50; folga 54,55%. A métrica é a menor folga: 14,92%
//
// Bloqueios (data de referência = fim do período, 31/12/2026):
//   B1 LIS 10 contratados, 5 vendidos, devolução 01/06/26 (vencida), sem multa, 1.300 EUR
//   B2 ORL  6 contratados, 4 vendidos, devolução 15/01/27 (não vencida: 2 lugares em risco), multa R$ 500
//   B3 GRA  4 contratados, 2 vendidos, devolução 01/08/26 (vencida), multa R$ 300
//   B4 LIS  3 contratados, 5 vendidos: inválido, fora das métricas
//   Ocupação = 11 ÷ 20 = 55%
//   Custo do lugar em B1 = 1.300 EUR × câmbio médio de custo das reservas LIS em EUR (62.050 ÷ 10.250 = 6,0537) = 7.869,76
//   Custo de lugar não vendido = 5 × 7.869,76 + 2 × 300 = 39.348,78 + 600 = 39.948,78
//
// Curva (serviços de 2026 contra 2025): 11 passageiros contra 3, variação de +266,67%.
//   Antecedência: R1 131 dias, R2 96, R3 118, R8 19; R4 100.
//   ≥180: 0 e 0; ≥120: 2 e 0; ≥90: 9 e 3; ≥60: 9 e 3; ≥30: 9 e 3; ≥0: 11 e 3.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { carregar, claims, criarUsuario, instalarDemoTurismo } from '../src/apoio.ts';
import { type Sql, conectar, recriarBanco } from '../src/banco.ts';
import { chamar } from '../src/emulador.ts';

const URL_BANCO = process.env.DATABASE_URL_TESTE ?? 'postgresql://pricing:pricing@127.0.0.1:5432/diagnostico_teste_turismo';
let sql: Sql;
let consultor: string;
let leitor: string;
let diag: string;
let painel: any;

const perto = (obtido: number, esperado: number, tolerancia = 0.01) =>
  assert.ok(Math.abs(obtido - esperado) <= tolerancia, `esperado ${esperado}, obtido ${obtido}`);
const metrica = (codigo: string) => painel.metricas.find((m: any) => m.codigo === codigo);

before(async () => {
  await recriarBanco(URL_BANCO);
  sql = conectar(URL_BANCO);
  consultor = await criarUsuario(sql, { email: 'consultor@teste.local', senha: 'Senha-de-teste-1', nome: 'Consultor', perfil: 'consultor' });
  const cliente = await chamar<string>(sql, claims(consultor), 'criar_cliente', { p_nome: 'Operadora de referência', p_setor: 'operadora' });
  leitor = await criarUsuario(sql, { email: 'leitor@teste.local', senha: 'Senha-de-teste-1', nome: 'Leitor', perfil: 'cliente_leitor', cliente });
  diag = await chamar<string>(sql, claims(consultor), 'criar_diagnostico', { p_cliente: cliente, p_nome: 'Turismo', p_inicio: '2025-01-01', p_fim: '2026-12-31' });

  const reserva = (o: Record<string, unknown>) => ({
    nota_fiscal: null, canal: 'Agencia', desc_comercial: null, over_unitario: null, cambio_pagamento: null, status_reserva: 'confirmada', ...o,
  });
  await carregar(sql, consultor, diag, 'transacoes', [
    reserva({ data: '2026-03-01', data_servico: '2026-07-10', produto: 'LIS', conta: 'A1', fornecedor: 'F1', quantidade: 2, preco_lista: 10000, preco_faturado: 9900, desc_comercial: 100, custo_unitario_moeda: 1300, moeda_custo: 'eur', cambio_venda: 6.0, cambio_pagamento: 6.2 }),
    reserva({ data: '2026-04-15', data_servico: '2026-07-20', produto: 'LIS', conta: 'A2', fornecedor: 'F1', quantidade: 3, preco_lista: 10000, preco_faturado: 10000, custo_unitario_moeda: 1300, moeda_custo: 'EUR', cambio_venda: 6.05, cambio_pagamento: 6.2 }),
    reserva({ data: '2026-05-10', data_servico: '2026-09-05', produto: 'ORL', conta: 'A1', canal: 'Direto', fornecedor: 'F2', quantidade: 4, preco_lista: 8000, preco_faturado: 7600, desc_comercial: 400, custo_unitario_moeda: 900, moeda_custo: 'USD', cambio_venda: 5.5, over_unitario: 50 }),
    reserva({ data: '2025-04-01', data_servico: '2025-07-10', produto: 'LIS', conta: 'A1', fornecedor: 'F1', quantidade: 3, preco_lista: 9500, preco_faturado: 9500, custo_unitario_moeda: 1250, moeda_custo: 'EUR', cambio_venda: 5.9, cambio_pagamento: 5.8 }),
    reserva({ data: '2026-02-01', data_servico: '2026-06-01', produto: 'LIS', conta: 'A2', fornecedor: 'F1', quantidade: 2, preco_lista: 10000, preco_faturado: 10000, custo_unitario_moeda: 1300, moeda_custo: 'EUR', cambio_venda: 5.97, cambio_pagamento: 6.1, status_reserva: 'Cancelada' }),
    reserva({ data: '2026-06-01', data_servico: '2026-05-01', produto: 'LIS', conta: 'A2', fornecedor: 'F1', quantidade: 1, preco_lista: 10000, preco_faturado: 10000, custo_unitario_moeda: 1300, moeda_custo: 'EUR', cambio_venda: 6.1, cambio_pagamento: 6.1 }),
    reserva({ data: '2026-06-02', data_servico: '2026-08-01', produto: 'PAR', conta: 'A2', fornecedor: 'F1', quantidade: 1, preco_lista: 9000, preco_faturado: 9000, custo_unitario_moeda: 1400, moeda_custo: 'EU', cambio_venda: 6.1 }),
    reserva({ data: '2026-08-01', data_servico: '2026-08-20', produto: 'GRA', conta: 'A2', canal: 'Direto', fornecedor: 'F3', quantidade: 2, preco_lista: 3000, preco_faturado: 3000, custo_unitario_moeda: 2000, moeda_custo: 'BRL' }),
  ]);
  await carregar(sql, consultor, diag, 'custos_servir', [{ tipo: 'comissao', canal: 'Agencia', percentual: 10 }]);
  await carregar(sql, consultor, diag, 'bloqueios', [
    { produto: 'LIS', fornecedor: 'F1', data_servico: '2026-07-15', lugares_contratados: 10, lugares_vendidos: 5, data_devolucao: '2026-06-01', multa_por_lugar: null, custo_unitario_moeda: 1300, moeda: 'EUR' },
    { produto: 'ORL', fornecedor: 'F2', data_servico: '2027-02-10', lugares_contratados: 6, lugares_vendidos: 4, data_devolucao: '2027-01-15', multa_por_lugar: 500, custo_unitario_moeda: 900, moeda: 'USD' },
    { produto: 'GRA', fornecedor: 'F3', data_servico: '2026-08-20', lugares_contratados: 4, lugares_vendidos: 2, data_devolucao: '2026-08-01', multa_por_lugar: 300, custo_unitario_moeda: 2000, moeda: 'BRL' },
    { produto: 'LIS', fornecedor: 'F1', data_servico: '2026-09-01', lugares_contratados: 3, lugares_vendidos: 5, data_devolucao: '2026-07-01', multa_por_lugar: null, custo_unitario_moeda: 1300, moeda: 'EUR' },
  ]);

  const r = await chamar(sql, claims(consultor), 'calcular_diagnostico', { p_diagnostico: diag });
  assert.equal(r.calculado, true, JSON.stringify(r));
  painel = await chamar(sql, claims(consultor), 'painel', { p_diagnostico: diag });
});
after(async () => sql?.end());

test('o segmento vem do cliente e o diagnóstico usa o catálogo versão 2', () => {
  assert.equal(painel.diagnostico.segmento, 'operadora');
  assert.equal(painel.diagnostico.tipo, 'diagnostico');
  assert.equal(painel.diagnostico.versao_catalogo, 2);
});

test('validações de reserva: cancelada à parte, serviço antes da venda, moeda inválida e câmbio projetado', () => {
  const v = Object.fromEntries(painel.validacoes.map((x: any) => [x.regra, x]));
  assert.equal(v.reservas_canceladas.ocorrencias, 1);
  assert.match(v.reservas_canceladas.mensagem, /2 passageiros, R\$ 20\.000 faturados/);
  assert.equal(v.servico_antes_da_venda.ocorrencias, 1);
  assert.equal(v.moeda_ou_cambio_invalido.ocorrencias, 1);
  assert.equal(v.cambio_projetado.ocorrencias, 1);
  assert.equal(v.vendidos_acima_dos_contratados.ocorrencias, 1);
  assert.equal(painel.base.linhas, 5);
  // cancelada não conta como erro de dado: 5 válidas de 7, menos 10 pontos por cobrir 5 meses
  const q = Object.fromEntries(painel.qualidade.map((x: any) => [x.bloco, x]));
  perto(q.transacoes.nota, 61.4, 0.05);
  assert.equal(q.custos.obrigatorio, false, 'com custo na reserva, a tabela de custos deixa de ser obrigatória');
  assert.equal(q.bloqueios.nota, 75);
});

test('base de cálculo: custo da própria reserva, câmbio, over e resultado cambial por linha', async () => {
  const linhas = await sql`select produto, quantidade, rec_faturada, rec_pocket, custo, moeda, custo_moeda, cambio_custo, cambio_projetado, over_total, resultado_cambial
                             from motor.fato where diagnostico_id = ${diag} order by data`;
  const [r4, r1, r2, r3, r8] = linhas as any[];
  perto(r1.custo, 16120); perto(r1.resultado_cambial, -520); assert.equal(r1.moeda, 'EUR');
  perto(r2.custo, 24180); perto(r2.resultado_cambial, -585);
  perto(r3.custo, 19600); perto(r3.over_total, 200); perto(r3.cambio_custo, 5.5); assert.equal(r3.cambio_projetado, true); perto(r3.resultado_cambial, 0);
  perto(r4.custo, 21750); perto(r4.resultado_cambial, 375);
  perto(r8.custo, 4000); assert.equal(r8.resultado_cambial, null); assert.equal(r8.cambio_projetado, false);
  perto(r1.rec_pocket, 17820); perto(r3.rec_pocket, 30400);
});

test('margem por passageiro e markup sobre o fornecedor', () => {
  perto(metrica('margem_passageiro').valor, 21220 / 14);
  assert.equal(metrica('margem_passageiro').detalhe.passageiros, 14);
  perto(metrica('markup_fornecedor_pct').valor, (100 * 21220) / 85650);
  const f = Object.fromEntries(metrica('markup_fornecedor_pct').detalhe.por_fornecedor.map((x: any) => [x.fornecedor, x.markup_pct]));
  perto(f.F1, (100 * 8420) / 62050);
  perto(f.F2, (100 * 10800) / 19600);
  perto(f.F3, 50);
});

test('resultado cambial e folga até o câmbio de equilíbrio', () => {
  perto(metrica('resultado_cambial_pct').valor, (100 * -730) / 114700, 0.0001);
  assert.equal(metrica('resultado_cambial_pct').detalhe.reservas_projetadas, 1);
  perto(metrica('cambio_equilibrio').valor, 100 * (70470 / 61320 - 1));
  const p = Object.fromEntries(metrica('cambio_equilibrio').detalhe.por_produto.map((x: any) => [x.produto, x]));
  perto(p.LIS.cambio_equilibrio, 70470 / 10250, 0.0001);
  perto(p.LIS.cambio_venda_medio, 61320 / 10250, 0.0001);
  perto(p.ORL.cambio_equilibrio, 8.5, 0.0001);
  perto(p.ORL.folga_pct, 100 * (8.5 / 5.5 - 1));
});

test('ocupação dos bloqueios e custo de lugar não vendido', () => {
  perto(metrica('ocupacao_bloqueio_pct').valor, 55);
  perto(metrica('custo_lugar_nao_vendido').valor, 5 * 1300 * (62050 / 10250) + 2 * 300);
  assert.equal(metrica('custo_lugar_nao_vendido').detalhe.lugares_em_risco, 2);
  assert.equal(metrica('ocupacao_bloqueio_pct').detalhe.bloqueios.length, 3);
});

test('curva de reservas contra o ano anterior, por antecedência', () => {
  perto(metrica('curva_reservas_vs_anterior').valor, 100 * (11 / 3 - 1));
  const curva = metrica('curva_reservas_vs_anterior').detalhe.curva.map((c: any) => [c.antecedencia_minima_dias, c.atual, c.anterior]);
  assert.deepEqual(curva, [[180, 0, 0], [120, 2, 0], [90, 9, 3], [60, 9, 3], [30, 9, 3], [0, 11, 3]]);
});

test('turismo entra informativo: câmbio e capacidade sem nota, nota geral parcial', () => {
  const p = Object.fromEntries(painel.pontuacoes.map((x: any) => [x.dimensao, x]));
  assert.equal(p.cambio.nota, null);
  assert.equal(p.capacidade.nota, null);
  assert.equal(p.geral.parcial, true);
  assert.equal(p.geral.detalhe.dimensoes_do_catalogo, 9);
  assert.equal(p.geral.detalhe.setor, 'operadora');
});

test('recorte por fornecedor no painel', () => {
  assert.deepEqual(painel.recortes.fornecedor.map((r: any) => r.valor).sort(), ['F1', 'F2', 'F3']);
});

test('bloqueios: o consultor lê, o cliente não lê nem envia', async () => {
  const ler = async (usuario: string) => {
    let n = 0;
    await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify(claims(usuario))}, true)`;
      await tx.unsafe('set local role authenticated');
      n = (await tx.unsafe('select count(*)::int as n from public.bloqueios'))[0]!.n;
    });
    return n;
  };
  assert.equal(await ler(consultor), 4);
  assert.equal(await ler(leitor), 0);
  await assert.rejects(chamar(sql, claims(leitor), 'iniciar_upload', { p_diagnostico: diag, p_bloco: 'bloqueios', p_nome_arquivo: 'x.csv' }), /Apenas o consultor/);
});

test('operadora fictícia carrega e calcula, com o bloqueio de Lisboa nos números da Nota nº 02', async () => {
  const { diagnostico } = await instalarDemoTurismo(sql, consultor);
  const p = await chamar(sql, claims(consultor), 'painel', { p_diagnostico: diagnostico });
  const m = (codigo: string) => p.metricas.find((x: any) => x.codigo === codigo);
  assert.equal(p.diagnostico.segmento, 'operadora');
  // preço R$ 9.900, comissão de 10%, 1.364,43 EUR pagos a R$ 6,10: 8.910 − 8.323,02 = R$ 586,98 por passageiro
  const lisboa = m('margem_passageiro').detalhe.por_produto.find((x: any) => x.produto === 'LIS-JUL');
  assert.equal(lisboa.passageiros, 34);
  perto(lisboa.margem_passageiro, 586.98);
  const bloqueio = m('ocupacao_bloqueio_pct').detalhe.bloqueios.find((b: any) => b.produto === 'LIS-JUL');
  assert.deepEqual([bloqueio.contratados, bloqueio.vendidos, bloqueio.prazo_vencido], [40, 34, true]);
  for (const c of ['margem_passageiro', 'markup_fornecedor_pct', 'resultado_cambial_pct', 'cambio_equilibrio', 'ocupacao_bloqueio_pct', 'custo_lugar_nao_vendido']) {
    assert.notEqual(m(c).valor, null, `${c} sem valor`);
  }
  assert.ok(m('resultado_cambial_pct').valor < 0, 'o euro e o dólar sobem no ano: o resultado cambial tem de ser negativo');
  assert.match(m('curva_reservas_vs_anterior').detalhe.indisponivel, /24 meses/);
  const ganhos = p.cenarios.map((c: any) => c.ganho_total_anual);
  assert.ok(ganhos[0] > 0 && ganhos[0] < ganhos[1] && ganhos[1] < ganhos[2]);
});
