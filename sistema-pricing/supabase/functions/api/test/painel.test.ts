import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Ambiente, cliente, criarAmbiente } from './apoio.ts';

// A5: o painel ganha desconto por vendedor, conversão por faixa de desconto,
// perdas por categoria e exposição cambial, lidos das versões gravadas.
// Roda sobre a operadora de turismo fictícia, que tem custo em euro.
let a: Ambiente;
const T = {
  pricing: 'pricing@operadora.demo',
  vera: 'vendedor@operadora.demo',
  rui: 'vendedor2@operadora.demo',
  sara: 'vendedor3@operadora.demo',
  canal: 'canal@agencia-horizonte.demo',
};
const hojeIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const lisboa = (descontoPct: number) => ({ produto: 'LISBOA', dimensoes: { temporada: 'alta', acomodacao: 'duplo', passageiros: 2 }, descontoPct });

async function emitida(como: string, descontoPct: number) {
  const c = await a.chamar('POST', '/cotacoes', { como, corpo: { pedido: lisboa(descontoPct), cliente } });
  expect(c.status, JSON.stringify(c.corpo)).toBe(201);
  const e = await a.chamar('POST', `/cotacoes/${c.corpo.id}/emitir`, { como });
  expect(e.status, JSON.stringify(e.corpo)).toBe(200);
  return { id: c.corpo.id as string };
}

async function painel(email: string, aal: 'aal1' | 'aal2' = 'aal2'): Promise<any> {
  let saida: any;
  await a.sql
    .begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: a.usuarios.get(email), role: 'authenticated', aal })}, true)`;
      await tx.unsafe('set local role authenticated');
      const [p] = await tx<{ p: any }[]>`select public.painel_indicadores(current_date - 30, current_date) as p`;
      saida = p!.p;
      throw new Error('desfazer');
    })
    .catch((e: Error) => {
      if (e.message !== 'desfazer') throw e;
    });
  return saida;
}

beforeAll(async () => {
  a = await criarAmbiente({ config: 'demo-turismo.json' });
  // Rui dá 2% em tudo, Sara 1% numa e nada na outra, Vera não dá desconto
  const rui = [await emitida(T.rui, 2), await emitida(T.rui, 2), await emitida(T.rui, 1.5)];
  const sara = [await emitida(T.sara, 1), await emitida(T.sara, 0)];
  const vera = [await emitida(T.vera, 0), await emitida(T.vera, 0)];
  const desfecho = (como: string, id: string, corpo: unknown) => a.chamar('POST', `/cotacoes/${id}/desfecho`, { como, corpo });
  for (const [como, c] of [[T.rui, rui[0]!], [T.sara, sara[0]!], [T.vera, vera[0]!]] as const) expect((await desfecho(como, c.id, { resultado: 'aceita' })).status).toBe(200);
  // duas perdas por preço com o preço do concorrente anotado, uma sem
  const [p1] = await a.sql<{ preco_final: string }[]>`select v.preco_final from public.cotacoes c join public.cotacao_versoes v on v.id = c.versao_atual_id where c.id = ${vera[1]!.id}`;
  const precoVera = Number(p1!.preco_final);
  expect((await desfecho(T.vera, vera[1]!.id, { resultado: 'perdida', categoria: 'preco_concorrente', concorrente: { preco: Math.round((precoVera / 1.1) * 100) / 100 } })).status).toBe(200);
  const [p2] = await a.sql<{ preco_final: string }[]>`select v.preco_final from public.cotacoes c join public.cotacao_versoes v on v.id = c.versao_atual_id where c.id = ${sara[1]!.id}`;
  const precoSara = Number(p2!.preco_final);
  expect((await desfecho(T.sara, sara[1]!.id, { resultado: 'perdida', categoria: 'preco_concorrente', concorrente: { preco: Math.round((precoSara / 1.05) * 100) / 100 } })).status).toBe(200);
  expect((await desfecho(T.rui, rui[1]!.id, { resultado: 'perdida', categoria: 'preco_concorrente' })).status).toBe(200);
  expect((await desfecho(T.rui, rui[2]!.id, { resultado: 'perdida', categoria: 'prazo' })).status).toBe(200);
});
afterAll(() => a.fechar());

describe('painel por vendedor, por desconto e de câmbio', () => {
  it('o vendedor que dá mais desconto aparece no topo de porVendedor', async () => {
    const p = await painel(T.pricing);
    const nomes = p.porVendedor.map((v: any) => v.vendedor);
    expect(nomes[0]).toBe('Rui Rebaixa');
    expect(nomes.at(-1)).toBe('Vera Vendedora');
    const rui = p.porVendedor[0];
    expect(rui).toMatchObject({ emitidas: 3, aceitas: 1, conversaoPct: 33.3 });
    expect(Number(rui.descontoMedioPct)).toBeCloseTo(1.83, 2);
    expect(Number(rui.descontoDesvioPct)).toBeCloseTo(0.29, 2);
    expect(Number(rui.descontoMaximoPct)).toBe(2);
    // comissão do vendedor: soma das fechadas, como gravada na versão
    const [c] = await a.sql<{ s: string }[]>`
      select sum(v.comissao_vendedor_valor) as s from public.cotacoes c join public.cotacao_versoes v on v.id = c.versao_atual_id
      join public.usuarios u on u.id = c.dono_id where c.status = 'aceita' and u.email = ${T.rui}`;
    expect(Number(c!.s)).toBeGreaterThan(0);
    expect(Number(rui.comissaoVendedor)).toBe(Number(c!.s));
  });

  it('conversão por faixa de desconto usa as faixas da configuração e marca amostra pequena', async () => {
    const p = await painel(T.pricing);
    const faixas = p.conversaoPorDesconto.map((f: any) => [f.rotulo, f.emitidas, f.aceitas, f.amostraPequena]);
    expect(faixas).toEqual([
      ['Sem desconto', 3, 1, true],
      ['Até 2%', 4, 2, true],
    ]);
    expect(p.conversaoPorDesconto[0].conversaoPct).toBe(33.3);
    expect(p.conversaoPorDesconto[1].conversaoPct).toBe(50);
  });

  it('motivos de perda vêm por categoria, com a diferença para o preço do concorrente', async () => {
    const p = await painel(T.pricing);
    const preco = p.motivosPerda.find((m: any) => m.categoria === 'preco_concorrente');
    expect(preco).toMatchObject({ motivo: 'Preço acima do concorrente', quantidade: 3, comPrecoConcorrente: 2 });
    // nosso preço 10% e 5% acima do concorrente: média de 7,5%
    expect(Number(preco.diferencaMediaPct)).toBeCloseTo(7.5, 1);
    const prazo = p.motivosPerda.find((m: any) => m.categoria === 'prazo');
    expect(prazo).toMatchObject({ quantidade: 1, comPrecoConcorrente: 0, diferencaMediaPct: null });
  });

  it('a exposição cambial soma as aceitas em euro e compara com o câmbio de referência de hoje', async () => {
    let p = await painel(T.pricing);
    expect(p.exposicaoCambial).toHaveLength(1);
    const eur = p.exposicaoCambial[0];
    expect(eur).toMatchObject({ moeda: 'EUR', cotacoes: 3, semMargemNaReferencia: 0 });
    expect(Number(eur.cambioReferencia)).toBe(6.1);
    // 2 pax em Lisboa alta duplo: 2 × 1.197,96 € por cotação
    expect(Number(eur.valorMoeda)).toBeCloseTo(3 * 2 * 1197.96, 2);
    expect(Number(eur.cambioEquilibrioMedio)).toBeGreaterThan(6.1);
    expect(Number(eur.folgaMediaPct)).toBeGreaterThan(0);

    // o gestor publica um euro bem mais caro para hoje: as aceitas passam a ficar sem margem nele
    const pub = await a.chamar('POST', '/regras/cambios', { como: T.pricing, corpo: { moeda: 'EUR', taxa: 9, vigenteDe: hojeIso(), observacao: 'Teste do painel.' } });
    expect(pub.status, JSON.stringify(pub.corpo)).toBe(201);
    p = await painel(T.pricing);
    expect(p.exposicaoCambial[0]).toMatchObject({ semMargemNaReferencia: 3 });
    expect(Number(p.exposicaoCambial[0].cambioReferencia)).toBe(9);
    expect(Number(p.exposicaoCambial[0].folgaMediaPct)).toBeLessThan(0);
  });

  it('quem vê o painel continua igual: canal e interno sem segundo fator não veem', async () => {
    await expect(painel(T.canal, 'aal1')).rejects.toThrow(/Sem permissão/);
    await expect(painel(T.pricing, 'aal1')).rejects.toThrow(/Sem permissão/);
  });
});
