import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Ambiente, cliente, criarAmbiente } from './apoio.ts';

// A7: simulador da regra de comissão do vendedor, sobre a operadora de turismo.
let a: Ambiente;
const T = { pricing: 'pricing@operadora.demo', admin: 'admin@operadora.demo', leitura: 'financeiro@operadora.demo', vera: 'vendedor@operadora.demo', rui: 'vendedor2@operadora.demo', canal: 'canal@agencia-horizonte.demo' };
const lisboa = (descontoPct = 0) => ({ produto: 'LISBOA', dimensoes: { temporada: 'alta', acomodacao: 'duplo', passageiros: 1 }, canal: 'agencia-horizonte', descontoPct });

async function aceita(como: string, descontoPct = 0) {
  const c = await a.chamar('POST', '/cotacoes', { como, corpo: { pedido: lisboa(descontoPct), cliente } });
  expect(c.status, JSON.stringify(c.corpo)).toBe(201);
  const e = await a.chamar('POST', `/cotacoes/${c.corpo.id}/emitir`, { como });
  expect(e.status, JSON.stringify(e.corpo)).toBe(200);
  expect((await a.chamar('POST', `/cotacoes/${c.corpo.id}/desfecho`, { como, corpo: { resultado: 'aceita' } })).status).toBe(200);
}

async function simular(email: string, regraA: unknown, regraB: unknown, aal: 'aal1' | 'aal2' = 'aal2'): Promise<any> {
  let saida: any;
  await a.sql
    .begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: a.usuarios.get(email), role: 'authenticated', aal })}, true)`;
      await tx.unsafe('set local role authenticated');
      const [r] = await tx<{ r: any }[]>`select public.simular_comissao_vendedor(${tx.json(regraA as never)}, ${tx.json(regraB as never)}, current_date - 30, current_date) as r`;
      saida = r!.r;
      throw new Error('desfazer');
    })
    .catch((e: Error) => {
      if (e.message !== 'desfazer') throw e;
    });
  return saida;
}

beforeAll(async () => {
  a = await criarAmbiente({ config: 'demo-turismo.json' });
  // duas Lisboa da Vera e uma do Rui, sem desconto (margem R$ 587,00 cada)
  await aceita(T.vera);
  await aceita(T.vera);
  await aceita(T.rui);
});
afterAll(() => a.fechar());

describe('simulador da regra de comissão', () => {
  it('compara as duas regras por vendedor com preço e margem gravados', async () => {
    const r = await simular(T.pricing, { base: 'margem', pct: 10 }, { base: 'receita', pct: 2 });
    const vera = r.porVendedor.find((v: any) => v.vendedor === 'Vera Vendedora');
    expect(vera).toMatchObject({ aceitas: 2 });
    expect(Number(vera.receita)).toBe(19800);
    expect(Number(vera.margem)).toBe(1174);
    expect(Number(vera.comissaoA)).toBe(117.4); // 10% de 587,00, duas vezes: o mesmo que a cotação gravou
    expect(Number(vera.comissaoB)).toBe(396); // 2% de 9.900, duas vezes
    expect(Number(vera.diferenca)).toBe(278.6);
    // a regra A igual à da política reproduz a comissão gravada em cada cotação
    const [g] = await a.sql<{ s: string }[]>`select sum(v.comissao_vendedor_valor) as s from public.cotacoes c join public.cotacao_versoes v on v.id = c.versao_atual_id where c.status = 'aceita'`;
    expect(Number(r.total.comissaoA)).toBe(Number(g!.s));
    expect(r.total.aceitas).toBe(3);
  });

  it('respeita a margem mínima da regra, como o motor', async () => {
    // margem de 5,93% em cada Lisboa: abaixo de 6% a regra não paga
    const r = await simular(T.pricing, { base: 'margem', pct: 10, margemMinimaPct: 6 }, { base: 'margem', pct: 10, margemMinimaPct: 5 });
    expect(Number(r.total.comissaoA)).toBe(0);
    expect(Number(r.total.comissaoB)).toBeGreaterThan(0);
  });

  it('não grava nada', async () => {
    const antes = await a.sql`select count(*)::int as n from public.cotacao_versoes`;
    await simular(T.pricing, { base: 'margem', pct: 10 }, { base: 'receita', pct: 2 });
    expect(await a.sql`select count(*)::int as n from public.cotacao_versoes`).toEqual(antes);
  });

  it('só gestor, administrador e leitura, com segundo fator; regra inválida é recusada', async () => {
    expect((await simular(T.admin, { base: 'receita', pct: 2 }, { base: 'margem', pct: 10 })).total.aceitas).toBe(3);
    expect((await simular(T.leitura, { base: 'receita', pct: 2 }, { base: 'margem', pct: 10 })).total.aceitas).toBe(3);
    await expect(simular(T.vera, { base: 'receita', pct: 2 }, { base: 'margem', pct: 10 })).rejects.toThrow(/Sem permissão/);
    await expect(simular(T.canal, { base: 'receita', pct: 2 }, { base: 'margem', pct: 10 })).rejects.toThrow(/Sem permissão/);
    await expect(simular(T.pricing, { base: 'receita', pct: 2 }, { base: 'margem', pct: 10 }, 'aal1')).rejects.toThrow(/Sem permissão/);
    await expect(simular(T.pricing, { base: 'lucro', pct: 2 }, { base: 'margem', pct: 10 })).rejects.toThrow(/Regra de comissão inválida/);
    await expect(simular(T.pricing, { base: 'receita', pct: 120 }, { base: 'margem', pct: 10 })).rejects.toThrow(/Regra de comissão inválida/);
  });
});
