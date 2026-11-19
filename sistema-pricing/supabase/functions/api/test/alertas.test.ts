import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Ambiente, SEGREDO_AUTOMACAO, cliente, criarAmbiente } from './apoio.ts';

// A8: alertas de margem e de câmbio, sobre a operadora de turismo (custos em euro,
// câmbio de referência R$ 6,10, folga mínima de 5%, meta de margem de 5%).
let a: Ambiente;
const automacao = { 'x-automacao-segredo': SEGREDO_AUTOMACAO };
const T = { vera: 'vendedor@operadora.demo', gerente: 'gerente@operadora.demo', pricing: 'pricing@operadora.demo' };
const hojeIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

beforeAll(async () => {
  a = await criarAmbiente({ config: 'demo-turismo.json' });
  // Lisboa com 5% de desconto: margem de R$ 181,10 (1,93%), aprovada pelo gerente e aceita
  const c = await a.chamar('POST', '/cotacoes', {
    como: T.vera,
    corpo: { pedido: { produto: 'LISBOA', dimensoes: { temporada: 'alta', acomodacao: 'duplo', passageiros: 1 }, canal: 'agencia-horizonte', descontoPct: 5 }, cliente },
  });
  expect(c.status, JSON.stringify(c.corpo)).toBe(201);
  expect((await a.chamar('POST', `/cotacoes/${c.corpo.id}/aprovacao`, { como: T.vera, corpo: { acao: 'pedir', motivo: 'Grupo de julho fecha com 5% de desconto.' } })).status).toBe(201);
  const ap = await a.chamar('POST', `/cotacoes/${c.corpo.id}/aprovacao`, { como: T.gerente, corpo: { acao: 'aprovar' } });
  expect(ap.status, JSON.stringify(ap.corpo)).toBe(200);
  expect((await a.chamar('POST', `/cotacoes/${c.corpo.id}/emitir`, { como: T.vera })).status).toBe(200);
  expect((await a.chamar('POST', `/cotacoes/${c.corpo.id}/desfecho`, { como: T.vera, corpo: { resultado: 'aceita' } })).status).toBe(200);
});
afterAll(() => a.fechar());

describe('alertas de margem', () => {
  it('avisa o gestor quando a margem das aceitas do mês fica abaixo da meta, uma vez por dia', async () => {
    const r = await a.chamar('POST', '/automacao/alertas-negocio', { cabecalhos: automacao, corpo: {} });
    expect(r.status, JSON.stringify(r.corpo)).toBe(200);
    expect(r.corpo.alertas.map((x: any) => x.tipo)).toEqual(['margem_abaixo_da_meta']);
    expect(r.corpo.alertas[0].dados).toMatchObject({ margemPct: 1.93, metaPct: 5, aceitas: 1 });
    expect(r.corpo.para).toEqual(['pricing@operadora.demo']);
    const de_novo = await a.chamar('POST', '/automacao/alertas-negocio', { cabecalhos: automacao, corpo: {} });
    expect(de_novo.corpo).toMatchObject({ alertas: [], repetidosHoje: 1, para: [] });
    const [n] = await a.sql<{ n: number }[]>`select count(*)::int as n from public.eventos_saida where tipo = 'alerta.margem_abaixo_da_meta'`;
    expect(n!.n).toBe(1);
  });

  it('avisa quando o desconto médio do mês passa a linha de base do diagnóstico', async () => {
    await a.sql`update public.organizacoes set config = config || '{"linhaDeBase": {"descontoMedioPct": 1.2}}'::jsonb where id = ${a.orgId}`;
    const r = await a.chamar('POST', '/automacao/alertas-negocio', { cabecalhos: automacao, corpo: {} });
    expect(r.corpo.alertas.map((x: any) => x.tipo)).toEqual(['desconto_acima_da_base']);
    expect(r.corpo.alertas[0].dados).toMatchObject({ descontoMedioPct: 5, linhaDeBasePct: 1.2 });
    expect(r.corpo.repetidosHoje).toBe(1);
  });

  it('só a credencial de automação chama', async () => {
    expect((await a.chamar('POST', '/automacao/alertas-negocio', { cabecalhos: { 'x-automacao-segredo': 'errado' }, corpo: {} })).status).toBe(401);
    expect((await a.chamar('POST', '/automacao/alertas-negocio', { como: T.pricing, corpo: {} })).status).toBe(401);
  });
});

describe('alertas de câmbio (PTAX)', () => {
  it('o fluxo pergunta quais moedas buscar: as dos custos da política vigente', async () => {
    const r = await a.chamar('GET', '/automacao/cambios-mercado', { cabecalhos: automacao });
    expect(r.corpo).toMatchObject({ moedas: ['EUR'], ultimas: [] });
  });

  it('grava a PTAX e avisa quando passa a referência mais a folga e quando aceitas ficam sem margem', async () => {
    const dia = hojeIso();
    // referência R$ 6,10 + 5% = R$ 6,405; a aceita de 5% zera a margem em R$ 6,2512
    const r = await a.chamar('POST', '/automacao/cambios-mercado', { cabecalhos: automacao, corpo: { cotacoes: [{ moeda: 'EUR', data: dia, taxaCompra: 6.4994, taxaVenda: 6.5 }] } });
    expect(r.status, JSON.stringify(r.corpo)).toBe(200);
    expect(r.corpo.gravadas).toBe(1);
    const tipos = r.corpo.alertas.map((x: any) => x.tipo).sort();
    expect(tipos).toEqual(['aceitas_sem_margem_na_ptax', 'ptax_acima_da_referencia']);
    const ptax = r.corpo.alertas.find((x: any) => x.tipo === 'ptax_acima_da_referencia');
    expect(ptax.dados).toMatchObject({ moeda: 'EUR', ptax: 6.5, referencia: 6.1, folgaMinimaPct: 5, limite: 6.405 });
    expect(r.corpo.alertas.find((x: any) => x.tipo === 'aceitas_sem_margem_na_ptax').dados).toMatchObject({ cotacoes: 1, valorMoeda: 1197.96 });
    expect(r.corpo.para).toEqual(['pricing@operadora.demo']);

    // o mesmo boletim de novo: nada gravado, nada repetido no mesmo dia
    const de_novo = await a.chamar('POST', '/automacao/cambios-mercado', { cabecalhos: automacao, corpo: { cotacoes: [{ moeda: 'EUR', data: dia, taxaVenda: 6.5 }] } });
    expect(de_novo.corpo).toMatchObject({ gravadas: 0, alertas: [], repetidosHoje: 2 });
  });

  it('a PTAX não muda preço nem a referência: só o gestor publica câmbio', async () => {
    const [ref] = await a.sql<{ n: number }[]>`select count(*)::int as n from public.cambios_referencia`;
    expect(ref!.n).toBe(1);
    const s = await a.chamar('POST', '/cotacoes/simular', {
      como: T.vera,
      corpo: { produto: 'LISBOA', dimensoes: { temporada: 'alta', acomodacao: 'duplo', passageiros: 1 }, canal: 'agencia-horizonte' },
    });
    expect(s.corpo.resultado.margemValor).toBe(587);
    expect(s.corpo.resultado.exposicaoCambial[0].taxa).toBe(6.1);
  });

  it('PTAX abaixo do limite não avisa', async () => {
    const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    await a.sql`delete from public.cambios_mercado`;
    await a.sql`delete from public.eventos_saida where tipo like 'alerta.%'`;
    const r = await a.chamar('POST', '/automacao/cambios-mercado', { cabecalhos: automacao, corpo: { cotacoes: [{ moeda: 'EUR', data: ontem, taxaVenda: 6.15 }] } });
    expect(r.corpo).toMatchObject({ gravadas: 1, alertas: [] });
  });

  it('cotação de mercado inválida é recusada', async () => {
    const r = await a.chamar('POST', '/automacao/cambios-mercado', { cabecalhos: automacao, corpo: { cotacoes: [{ moeda: 'euro', data: '2026-11-18', taxaVenda: -1 }] } });
    expect(r.status).toBe(422);
  });
});
