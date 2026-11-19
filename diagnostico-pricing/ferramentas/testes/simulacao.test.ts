// P2 Simulação (plano v3, seções 4, 13.1 a 13.4 e 13.10).
// O serviço TypeScript sorteia; o banco entrega a base e grava o resultado. Casos de referência conferidos à mão:
//   - paridade com motor.simular na empresa fictícia de distribuição (P10 = P50 = P90 no cenário base);
//   - equilíbrio: margem de 30% e desconto de 5% pede +20% de volume; 10% pede +50%; reajuste de 5% tolera −14,3%;
//     serviço de R$ 20 mil com margem de R$ 80 pede 250 vendas; Nota nº 02 com desconto de 5%: margem de R$ 587 para
//     R$ 181,10 (9.405 × 0,82 − 7.531) e +224%; com todos os custos fixos, R$ 92 (9.405 − 9.313) e +538%;
//   - elasticidade constante: ε = −1,2 e reajuste de 3% dão 1,03^−1,2 − 1 = −3,49%; reajuste de 5% com ε de −0,5,
//     −1,2 e −2,0 dá −2,41%, −5,69% e −9,30%;
//   - Nota nº 02, 100 lugares com câmbio travado: margem por passageiro 9.900 × 0,82 − 150 − 1.210 × 6,1915 = 476,29;
//     há prejuízo quando se vendem 81 ou menos (476,29 v − 3.745,79 × (85 − v) − 25.000 < 0 ⇔ v < 81,3), o que, com a
//     procura triangular (70; 105; 160) arredondada, acontece com chance (81,5 − 70)² ÷ (90 × 35) = 4,20%.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import * as S from '@diagnostico/simulacao';
import { carregar, claims, criarUsuario, instalarDemo } from '../src/apoio.ts';
import { type Sql, conectar, recriarBanco } from '../src/banco.ts';
import { chamar, chamarComErro } from '../src/emulador.ts';

const URL_BANCO = process.env.DATABASE_URL_TESTE_SIMULACAO ?? 'postgresql://pricing:pricing@127.0.0.1:5432/diagnostico_teste_simulacao';
let sql: Sql;
let consultor: string, leitor: string, diag: string;
let base: any;

const perto = (a: number, b: number, tol: number, msg?: string) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} ≠ ${b} (±${tol})`);
const ctx = (usuario: string) => ({ rpc: (f: string, a: Record<string, unknown>) => chamarComErro(sql, claims(usuario), f, a), agora: () => performance.now() });

before(async () => {
  await recriarBanco(URL_BANCO);
  sql = conectar(URL_BANCO);
  consultor = await criarUsuario(sql, { email: 'consultor@teste.local', senha: 'Senha-de-teste-1', nome: 'Consultor', perfil: 'consultor' });
  const demo = await instalarDemo(sql, consultor, { publicar: true });
  diag = demo.diagnostico;
  leitor = await criarUsuario(sql, { email: 'leitor@teste.local', senha: 'Senha-de-teste-1', nome: 'Leitor', perfil: 'cliente_leitor', cliente: demo.cliente });
  base = await chamar(sql, claims(consultor), 'base_simulacao', { p_diagnostico: diag });
});
after(async () => sql?.end());

const modeloBase = () => S.modeloDiagnostico(base);
/** Premissas do catálogo com P10 = P50 = P90 no valor de um cenário. */
function premissasFixas(cenario: 'p10' | 'p50' | 'p90'): S.Premissa[] {
  return S.premissasDoCatalogo(base.premissas).map((p) => {
    const d = p.distribuicao as Extract<S.Distribuicao, { tipo: 'quantis' }>;
    return { ...p, distribuicao: { ...d, p10: d[cenario], p50: d[cenario], p90: d[cenario] } };
  });
}

// ---------------------------------------------------------------- seção 4
test('paridade: com P10 = P50 = P90 o serviço dá o ganho de motor.simular ao centavo, por alavanca, nos três cenários', async () => {
  const cenarios = { p10: 'conservador', p50: 'base', p90: 'agressivo' } as const;
  for (const [q, cenario] of Object.entries(cenarios) as [keyof typeof cenarios, string][]) {
    const premissas = premissasFixas(q);
    const r = S.simular({ modelo: modeloBase(), premissas, opcoes: [{ codigo: 'ajustes' }], semente: 1, sorteios: 100, sensibilidade: false });
    const o = r.opcoes[0]!;
    const sqlPremissas: Record<string, Record<string, number>> = {};
    for (const p of premissas) {
      const [alavanca, chave] = p.chave.split('.') as [string, string];
      (sqlPremissas[alavanca] ??= {})[chave] = (p.distribuicao as any).p50;
    }
    const ref = await chamar(sql, claims(consultor), 'simular', { p_diagnostico: diag, p_premissas: sqlPremissas });
    for (const a of ref.alavancas) {
      const c = o.contribuicoes.find((x) => x.alavanca === a.alavanca)!;
      assert.equal(Math.round(c.media * 100) / 100, Number(a.ganho_anual), `${cenario} ${a.alavanca}`);
    }
    assert.equal(Math.round(o.medidas.margem!.p10 * 100) / 100, Number(ref.ganho_total_anual));
    assert.equal(o.medidas.margem!.p10, o.medidas.margem!.p90, 'sem incerteza não há faixa');
  }
  // e os três cenários do painel continuam os mesmos
  const painel = await chamar(sql, claims(consultor), 'painel', { p_diagnostico: diag });
  assert.deepEqual(painel.cenarios.map((c: any) => Math.round(c.ganho_total_anual)), [18031, 52147, 108883]);
});

let tempo10mil = 0;
test('mesma semente, mesmo resultado; outra semente, P50 do total a menos de 1% com 10.000 sorteios', () => {
  const premissas = S.premissasDoCatalogo(base.premissas);
  const rodar = (semente: number) => S.simular({ modelo: modeloBase(), premissas, opcoes: [{ codigo: 'ajustes' }], semente, sorteios: 10_000, sensibilidade: false });
  const t0 = performance.now();
  const a = rodar(42);
  tempo10mil = performance.now() - t0;
  const b = rodar(42), c = rodar(4242);
  assert.deepEqual(a, b);
  const pa = a.opcoes[0]!.medidas.margem!.p50, pc = c.opcoes[0]!.medidas.margem!.p50;
  assert.ok(Math.abs(pa / pc - 1) < 0.01, `${pa} contra ${pc}`);
  // faixa coerente: o P50 do total fica entre os ganhos dos cenários conservador e agressivo
  assert.ok(pa > 18031 && pa < 108883, String(pa));
});

test('a soma das contribuições médias das alavancas é a média do total', () => {
  const r = S.simular({ modelo: modeloBase(), premissas: S.premissasDoCatalogo(base.premissas), opcoes: [{ codigo: 'ajustes' }], semente: 7, sorteios: 2000 });
  const o = r.opcoes[0]!;
  const soma = o.contribuicoes.reduce((s, c) => s + c.media, 0);
  perto(soma, o.medidas.margem!.media, 1e-6 * Math.abs(soma));
  assert.deepEqual(o.contribuicoes.map((c) => c.alavanca), ['contencao_descontos', 'reajuste_seletivo']);
  // tornado: oito premissas, em ordem de amplitude
  const t = r.sensibilidade;
  assert.equal(t.length, 8);
  for (let i = 1; i < t.length; i++) assert.ok(t[i - 1]!.amplitude >= t[i]!.amplitude);
});

test('tempo de 10.000 sorteios na base de demonstração (registrado em docs/pendencias.md)', () => {
  console.log(`# 10.000 sorteios na distribuidora fictícia (${base.pares.length} pares conta e produto): ${Math.round(tempo10mil)} ms`);
  assert.ok(tempo10mil > 0 && tempo10mil < 20_000);
});

// ---------------------------------------------------------------- 13.1 premissas correlacionadas
const quantisFixos: S.Premissa[] = [
  { chave: 'a', distribuicao: { tipo: 'quantis', p10: 10, p50: 20, p90: 40 } },
  { chave: 'b', distribuicao: { tipo: 'quantis', p10: -2, p50: -1.2, p90: -0.6 } },
  { chave: 'c', distribuicao: { tipo: 'quantis', p10: 0, p50: 0.5, p90: 1 } },
];
const soma: S.Modelo = { codigo: 'soma', avaliar: (v) => ({ margem: Number(v.a) + Number(v.b) }) };

test('correlação zero dá o mesmo resultado da simulação sem correlação, com a mesma semente', () => {
  const sem = S.simular({ modelo: soma, premissas: quantisFixos, opcoes: [{ codigo: 'x' }], semente: 9, sorteios: 5000 });
  const zero = S.simular({ modelo: soma, premissas: quantisFixos, correlacoes: [{ a: 'a', b: 'b', rho: 0 }], opcoes: [{ codigo: 'x' }], semente: 9, sorteios: 5000 });
  assert.deepEqual(sem, zero);
});

test('com ρs = 0,8 a correlação de Spearman amostral fica entre 0,77 e 0,83 e as faixas de cada premissa não mudam', () => {
  const colunas = S.sortearValores(quantisFixos, [{ a: 'a', b: 'b', rho: 0.8 }], 11, 10_000) as number[][];
  const r = S.spearman(colunas[0]!, colunas[1]!);
  assert.ok(r >= 0.77 && r <= 0.83, String(r));
  quantisFixos.forEach((p, k) => {
    const d = p.distribuicao as Extract<S.Distribuicao, { tipo: 'quantis' }>;
    const s = Float64Array.from(colunas[k]!).sort();
    for (const [q, v] of [[0.1, d.p10], [0.5, d.p50], [0.9, d.p90]] as const) {
      const amostral = S.quantilAmostral(s, q);
      perto(amostral, v, 0.01 * Math.max(Math.abs(v), Math.abs(d.p90 - d.p10)), `${p.chave} P${q * 100}`);
    }
  });
  assert.ok(Math.abs(S.rhoNormal(0.8) - 2 * Math.sin((Math.PI * 0.8) / 6)) < 1e-15);
});

test('matriz que não é positiva definida é recusada, com o par incoerente apontado', () => {
  assert.throws(
    () => S.sortearValores(quantisFixos, [{ a: 'a', b: 'b', rho: 0.9 }, { a: 'b', b: 'c', rho: 0.9 }, { a: 'a', b: 'c', rho: -0.9 }], 1, 100),
    (e: Error) => e instanceof S.MatrizIncoerente && e.message.includes('a e c'),
  );
});

test('a reação da concorrência entra na cópula pela sua uniforme e pode ser correlacionada', () => {
  const premissas: S.Premissa[] = [
    { chave: 'reacao', distribuicao: { tipo: 'reacao', chance: 0.4, tipos: { copiar: 0.6, contra_atacar: 0.4 } } },
    { chave: 'demanda', distribuicao: { tipo: 'quantis', p10: 80, p50: 100, p90: 120 } },
  ];
  const col = S.sortearValores(premissas, [{ a: 'reacao', b: 'demanda', rho: -0.7 }], 3, 20_000);
  const reage = col[0]!.map((x) => x !== 'ignorar');
  const media = (f: (i: number) => boolean) => { let s = 0, n = 0; col[1]!.forEach((v, i) => { if (f(i)) { s += Number(v); n++; } }); return s / n; };
  perto(reage.filter(Boolean).length / 20_000, 0.4, 0.01, 'chance de reação');
  assert.ok(media((i) => reage[i]!) > media((i) => !reage[i]!) + 10, 'com ρ negativo, reação (uniforme baixa) anda com demanda alta');
  const copiar = col[0]!.filter((x) => x === 'copiar').length / 20_000;
  perto(copiar, 0.24, 0.01, 'copiar = 0,4 × 0,6');
});

// ---------------------------------------------------------------- 13.2 e 13.3 ponto de virada e regra de escolha
test('Nota nº 01 refeita: chance de ganho a até 2 pontos da Nota original e virada entre 30% e 40%', () => {
  const referencia: Record<number, [number, number]> = { 0: [32, 76], 0.2: [39, 60], 0.4: [48, 45], 0.6: [57, 30] };
  for (const [rc, [reaj, taxa]] of Object.entries(referencia)) {
    const n = S.notaEntrega24h({ chanceReacao: Number(rc) });
    const r = S.simular({ modelo: S.modeloServicoAdicional(n.dados), premissas: n.premissas, opcoes: n.opcoes, semente: 20261117, criterio: n.criterio, sensibilidade: false });
    perto(r.opcoes[0]!.medidas.margem!.prob_positivo * 100, reaj, 2, `reajuste, reação ${rc}`);
    perto(r.opcoes[1]!.medidas.margem!.prob_positivo * 100, taxa, 2, `taxa, reação ${rc}`);
  }
  const n = S.notaEntrega24h();
  const v = S.varrer({ modelo: S.modeloServicoAdicional(n.dados), premissas: n.premissas, opcoes: n.opcoes, semente: 20261117, criterio: n.criterio }, n.varredura.alvo, n.varredura.valores, n.varredura.rotulo);
  assert.equal(v.virada?.de, 'taxa');
  assert.equal(v.virada?.para, 'embutir');
  assert.ok(v.virada!.valor > 0.3 && v.virada!.valor < 0.4, String(v.virada!.valor));
  assert.match(v.frase!, /^a recomendação muda se a chance de reação do concorrente passar de \d+%/);
  // a varredura usa os mesmos sorteios: 13 valores × 2 opções
  assert.equal(v.pontos.length, 26);
});

test('Nota nº 02 refeita: regra com risco de até 10% escolhe 100 lugares com câmbio travado; 140 lugares têm P50 negativo', () => {
  const n = S.notaBloqueioLisboa();
  const r = S.simular({ modelo: S.modeloBloqueioCambio(n.dados), premissas: n.premissas, opcoes: n.opcoes, semente: 20261117, criterio: n.criterio });
  assert.equal(r.escolha.opcao, 'travado_100');
  assert.equal(r.escolha.regra, 'max_p50_com_risco');
  const o = (c: string) => r.opcoes.find((x) => x.codigo === c)!.medidas.margem!;
  assert.ok(o('travado_140').p50 < 0 && o('aberto_140').p50 < 0);
  // caso à mão: prejuízo com 100 lugares travados só quando se vendem 81 ou menos (4,20%)
  perto(o('travado_100').prob_prejuizo, 0.042, 0.006);
  perto(o('travado_100').p50, 100 * (9900 * 0.82 - 150 - 1210 * 6.1 * 1.015) - 25_000, 0.01, 'P50 travado: a procura mediana (110) esgota os 100 lugares');
  // a Nota mostra o que cada regra escolheria
  assert.deepEqual(Object.keys(r.escolha.por_regra).sort(), ['max_media', 'max_p50', 'max_p50_com_risco', 'max_prob_ganho']);
  assert.equal(r.escolha.por_regra.max_p50, 'aberto_100');
  // grade com os mesmos sorteios: mais lugares nunca vendem menos
  for (let k = 70; k <= 180; k += 10) assert.ok(r.opcoes.find((x) => x.codigo === `travado_${k}`)!.medidas.volume!.media >= r.opcoes.find((x) => x.codigo === `travado_${k - 10}`)!.medidas.volume!.media);
});

test('Nota nº 02: a escolha passa de 100 para 90 lugares quando a chance de reação passa de cerca de 30%', () => {
  const n = S.notaBloqueioLisboa({ aberto: false });
  const v = S.varrer({ modelo: S.modeloBloqueioCambio(n.dados), premissas: n.premissas, opcoes: n.opcoes, semente: 20261117, criterio: n.criterio }, n.varredura.alvo, n.varredura.valores, n.varredura.rotulo);
  assert.equal(v.virada?.de, 'travado_100');
  assert.equal(v.virada?.para, 'travado_90');
  // cruzamento exato (seção 13.2 e docs/pendencias.md): (0,10 − 0,042) ÷ (0,238 − 0,042) = 29,5%
  assert.ok(v.virada!.valor >= 0.28 && v.virada!.valor <= 0.32, String(v.virada!.valor));
});

test('chance de atingir a meta e as três medidas (margem, faturamento e volume)', () => {
  const n = S.notaBloqueioLisboa({ aberto: false });
  const opcoes = n.opcoes.filter((o) => o.codigo === 'travado_100').map((o) => ({ ...o, meta: { medida: 'margem' as const, valor: 20_000 } }));
  const r = S.simular({ modelo: S.modeloBloqueioCambio(n.dados), premissas: n.premissas, opcoes, semente: 1, sorteios: 5000 });
  const m = r.opcoes[0]!.medidas;
  assert.ok(m.margem && m.faturamento && m.volume);
  assert.ok(m.margem.prob_meta! > 0.5 && m.margem.prob_meta! < 1);
  assert.equal(m.faturamento!.prob_meta, null);
  assert.ok(m.volume!.maximo <= 100);
  assert.match(m.margem.frase, /^em \d+ de cada 100 cenários$/);
  assert.equal(m.margem.histograma.length, 20);
  assert.equal(m.margem.histograma.reduce((s, h) => s + h.n, 0), 5000);
});

// ---------------------------------------------------------------- 13.4 capacidade
test('capacidade no sorteio: sem custo extra, nenhum sorteio vende mais que a capacidade livre; com custo extra, a margem cai por ele', () => {
  const dados: S.DadosPreco = { volume: 1000, preco: 100, custo_unitario: 60, capacidade: { recurso: 'expedição', capacidade_mes: 1100, uso_por_venda: 1 } };
  const premissas: S.Premissa[] = [{ chave: 'volume_adicional_pct', distribuicao: { tipo: 'quantis', p10: 0.02, p50: 0.12, p90: 0.3 } }];
  const opcoes = [{ codigo: 'servico' }];
  const corte = S.simular({ modelo: S.modeloPreco(dados), premissas, opcoes, semente: 5, sorteios: 5000 });
  assert.ok(corte.opcoes[0]!.medidas.volume!.maximo <= 100 + 1e-9);
  assert.ok(corte.opcoes[0]!.prob_falta_capacidade > 0.3 && corte.opcoes[0]!.volume_perdido_medio > 0);
  const extra = S.simular({ modelo: S.modeloPreco({ ...dados, capacidade: { ...dados.capacidade!, custo_unidade_extra: 15 } }), premissas, opcoes, semente: 5, sorteios: 5000 });
  assert.ok(extra.opcoes[0]!.medidas.volume!.maximo > 100);
  // sorteio a sorteio: margem = 40 × volume a mais − 15 × unidades além de 1.100
  const m = S.modeloPreco({ ...dados, capacidade: { ...dados.capacidade!, custo_unidade_extra: 15 } });
  assert.equal(m.avaliar({ volume_adicional_pct: 0.25 }, { codigo: 'x' }).margem, 250 * 40 - 150 * 15);
  assert.equal(S.modeloPreco(dados).avaliar({ volume_adicional_pct: 0.25 }, { codigo: 'x' }).margem, 100 * 40);
  // equilíbrio contra a capacidade livre
  assert.match(S.avisoEquilibrioCapacidade(250, dados.capacidade, 1000)!, /não se paga/);
  assert.equal(S.avisoEquilibrioCapacidade(80, dados.capacidade, 1000), null);
});

test('Nota nº 01: a hora extra acima de 1.650 pedidos é cobrada, não cortada', () => {
  const n = S.notaEntrega24h();
  const m = S.modeloServicoAdicional(n.dados);
  const v = { custo_entrega: 14, elasticidade: -1.2, pedidos_a_mais_embutido: 0.15, reacao: 'ignorar' };
  const s = m.avaliar(v, n.opcoes[0]!);
  const q = 1500 * Math.pow(1.03, -1.2) * 1.15;
  perto(s.margem, q * (618 - 396 - 14) - 22_000 - (q - 1650) * 25 - 1500 * 204, 1e-6);
  assert.equal(s.faltouCapacidade, true);
});

// ---------------------------------------------------------------- 13.10 forma de cálculo e equilíbrio
test('elasticidade de forma constante e linear, e casos de equilíbrio da seção 13.6', () => {
  perto(S.fatorVolume('constante', -1.2, 0.03) - 1, -0.0349, 0.0001);
  for (const [e, esperado] of [[-0.5, -0.0241], [-1.2, -0.0569], [-2.0, -0.093]] as const) perto(S.fatorVolume('constante', e, 0.05) - 1, esperado, 0.0001);
  assert.equal(S.fatorVolume('linear', -1.2, 0.03), 1 - 0.036);
  perto(S.equilibrioPreco(0.3, -0.05), 0.2, 1e-12);
  perto(S.equilibrioPreco(0.3, -0.1), 0.5, 1e-12);
  perto(S.equilibrioPreco(0.3, 0.05), -0.142857, 1e-6);
  assert.equal(S.equilibrioCustoFixo(20_000, 80), 250);
  // Nota nº 02: 18% do preço proporcional (comissão e impostos) contra todos os custos fixos por passageiro
  const proporcional: S.DadosPreco = { volume: 100, preco: 9900, custos_proporcionais_pct: 0.18, custo_unitario: 150 + 1210 * 6.1 };
  perto(S.margemUnitaria(proporcional, 0), 587, 1e-9);
  perto(S.margemUnitaria(proporcional, -0.05), 181.1, 1e-9);
  perto(S.equilibrioVolume(proporcional, -0.05)!, 2.2413, 0.0001);
  const fixos: S.DadosPreco = { volume: 100, preco: 9900, custo_unitario: 9313 };
  perto(S.margemUnitaria(fixos, -0.05), 92, 1e-9);
  perto(S.equilibrioVolume(fixos, -0.05)!, 5.3804, 0.0001);
  perto(0.05 / 0.009, 5.556, 0.001); // nota do slide: margem de 5,9% arredondada
  assert.equal(S.cambioEquilibrio(S.DADOS_BLOQUEIO_LISBOA).toFixed(2), '6.59');
});

// ---------------------------------------------------------------- serviço, banco e acesso
test('a função simular grava a simulação pelo banco; o cliente não simula nem lê simulações', async () => {
  const r = (await S.atender({ diagnostico_id: diag, semente: 3, sorteios: 2000 }, ctx(consultor))) as { status: number; corpo: any };
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const gravada = await chamar(sql, claims(consultor), 'simulacao_do_diagnostico', { p_diagnostico: diag });
  assert.equal(gravada.id, r.corpo.id);
  assert.equal(gravada.sorteios, 2000);
  const total = gravada.resultado.find((x: any) => x.medida === 'margem' && x.alavanca === null);
  perto(Number(total.p50), r.corpo.resultado.opcoes[0].medidas.margem.p50, 0.01);
  assert.equal(gravada.resultado.filter((x: any) => x.alavanca).length, 2);
  assert.equal(gravada.sensibilidade.length, 8);
  const auditadas = await sql<{ n: number }[]>`select count(*)::int as n from auditoria where acao = 'simulacao_gravada'`;
  assert.equal(auditadas[0]?.n, 1);
  // o cliente não chama a função nem lê as tabelas
  const negado = (await S.atender({ diagnostico_id: diag }, ctx(leitor))) as { status: number };
  assert.equal(negado.status, 403);
  await assert.rejects(chamar(sql, claims(leitor), 'gravar_simulacao', { p_diagnostico: diag, p_dados: { entrada: {}, resultado: { opcoes: [] } } }), /Apenas o consultor/);
  await assert.rejects(chamar(sql, claims(leitor), 'base_simulacao', { p_diagnostico: diag }), /Apenas o consultor/);
  for (const t of ['simulacoes', 'simulacao_resultado', 'simulacao_sensibilidade', 'simulacao_varreduras', 'premissas_distribuicao', 'premissas_correlacao', 'capacidade']) {
    const linhas = await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify(claims(leitor))}, true)`;
      await tx.unsafe('set local role authenticated');
      return tx.unsafe(`select * from public.${t}`);
    });
    assert.equal(linhas.length, 0, t);
  }
  assert.equal(await chamar(sql, claims(leitor), 'simulacao_do_diagnostico', { p_diagnostico: diag }), null);
});

test('premissas_distribuicao nasce de premissas_padrao: P10 conservador, P50 base, P90 agressivo, em ordem', async () => {
  const linhas = await sql`select * from premissas_distribuicao where versao = 2 order by alavanca, chave`;
  assert.equal(linhas.length, 8);
  for (const l of linhas) assert.ok(Number(l.p10) <= Number(l.p50) && Number(l.p50) <= Number(l.p90), `${l.alavanca}.${l.chave}`);
  const e = linhas.find((l) => l.chave === 'elasticidade' && l.alavanca === 'contencao_descontos')!;
  assert.deepEqual([e.p10, e.p50, e.p90].map(Number), [-1, -0.7, -0.4]);
  assert.equal(e.maximo, null);
  // o limite de domínio entra no serviço: elasticidade nunca passa de zero, captura fica entre 0 e 1
  const ps = S.premissasDoCatalogo(base.premissas);
  for (const p of ps) for (let u = 0.001; u < 1; u += 0.01) {
    const v = S.valorPremissa(p, u) as number;
    if (p.chave.endsWith('elasticidade')) assert.ok(v <= 0);
    if (p.chave.endsWith('captura') || p.chave.endsWith('fechamento')) assert.ok(v >= 0 && v <= 1);
  }
});

test('bloco capacidade: carga pela API e leitura pelo serviço', async () => {
  await carregar(sql, consultor, diag, 'capacidade', [{ recurso: 'separação', unidade: 'pedidos', capacidade_mes: '1650', uso_por_venda: '1', custo_unidade_extra: '25' }] as any);
  const b = await chamar(sql, claims(consultor), 'base_simulacao', { p_diagnostico: diag });
  assert.deepEqual(b.capacidade, [{ recurso: 'separação', unidade: 'pedidos', capacidade_mes: 1650, uso_por_venda: 1, custo_unidade_extra: 25 }]);
  await assert.rejects(chamar(sql, claims(consultor), 'iniciar_upload', { p_diagnostico: diag, p_bloco: 'inexistente', p_nome_arquivo: 'x.csv' }), /Bloco desconhecido/);
});
