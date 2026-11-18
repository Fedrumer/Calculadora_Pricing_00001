import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Ambiente, PESSOAS, cliente, criarAmbiente, pedidoAuto } from './apoio.ts';

// Câmbio de referência e comissão do vendedor de ponta a ponta, sobre a empresa
// de assistência: o gestor cria uma política com um custo em euro e a comissão
// do vendedor, publica o câmbio e a política, e cada perfil vê só o que pode.
let a: Ambiente;
const hojeIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

async function como(email: string, aal: 'aal1' | 'aal2', consulta: (tx: any) => Promise<Record<string, unknown>[]>): Promise<Record<string, unknown>[]> {
  let saida: Record<string, unknown>[] = [];
  await a.sql
    .begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: a.usuarios.get(email), role: 'authenticated', aal })}, true)`;
      await tx.unsafe('set local role authenticated');
      saida = await consulta(tx);
      throw new Error('desfazer');
    })
    .catch((e: Error) => {
      if (e.message !== 'desfazer') throw e;
    });
  return saida;
}

beforeAll(async () => {
  a = await criarAmbiente();
});
afterAll(() => a.fechar());

describe('câmbio de referência e comissão do vendedor', () => {
  let politica: string;

  it('a política aceita custo em moeda estrangeira e a regra de comissão do vendedor', async () => {
    const r = await a.chamar('POST', '/regras/politicas', { como: PESSOAS.pricing, corpo: {} });
    expect(r.status, JSON.stringify(r.corpo)).toBe(201);
    politica = r.corpo.id;
    const [p] = await a.sql<{ regras: any }[]>`select regras from public.politicas where id = ${politica}`;
    const custos = (await a.sql<any[]>`
      select p.codigo, p.nome, p.categoria, p.tipo, p.valor, p.base, pr.codigo as produto
      from public.parametros_custo p left join public.produtos pr on pr.id = p.produto_id where p.politica_id = ${politica}`).map((c) => ({
      codigo: c.codigo, nome: c.nome, categoria: c.categoria, tipo: c.tipo, valor: Number(c.valor), ...(c.base ? { base: c.base } : {}), ...(c.produto ? { produto: c.produto } : {}),
    }));
    custos.push({ codigo: 'rede-europa', nome: 'Rede de prestadores na Europa', categoria: 'custo_variavel', tipo: 'valor_por_unidade', valor: 1.5, moeda: 'EUR' } as any);
    const regras = { ...p!.regras, limites: { ...p!.regras.limites, folgaCambialMinimaPct: 5 }, comissaoVendedor: { base: 'margem', pct: 10, deduzDaMargem: false } };
    const put = await a.chamar('PUT', `/regras/politicas/${politica}`, { como: PESSOAS.pricing, corpo: { regras, custos } });
    expect(put.status, JSON.stringify(put.corpo)).toBe(200);
    const [eur] = await a.sql<{ moeda: string }[]>`select moeda from public.parametros_custo where politica_id = ${politica} and codigo = 'rede-europa'`;
    expect(eur!.moeda).toBe('EUR');
  });

  it('sem câmbio vigente a política com custo em euro não publica', async () => {
    const r = await a.chamar('POST', `/regras/${politica}/publicar`, { como: PESSOAS.pricing, corpo: { vigenciaInicio: hojeIso(), forcar: true, motivo: 'Teste de custo em euro.' } });
    expect(r.corpo.erro.codigo).toBe('REGRAS_INVALIDAS');
    expect(JSON.stringify(r.corpo.erro.detalhes)).toMatch(/EUR, sem câmbio/);
  });

  it('só o gestor publica câmbio; a simulação não grava', async () => {
    for (const quem of [PESSOAS.vendedor, PESSOAS.admin, PESSOAS.diretoria, PESSOAS.canal]) {
      expect((await a.chamar('POST', '/regras/cambios', { como: quem, corpo: { moeda: 'EUR', taxa: 6.1, vigenteDe: hojeIso() } })).status, quem).toBe(403);
    }
    expect((await a.chamar('POST', '/regras/cambios', { como: PESSOAS.pricing, aal: 'aal1', corpo: { moeda: 'EUR', taxa: 6.1, vigenteDe: hojeIso() } })).corpo.erro.codigo).toBe('MFA_OBRIGATORIO');
    const sim = await a.chamar('POST', '/regras/cambios', { como: PESSOAS.pricing, corpo: { moeda: 'EUR', taxa: 6.1, vigenteDe: hojeIso(), simular: true } });
    expect(sim.status, JSON.stringify(sim.corpo)).toBe(200);
    expect(sim.corpo.simulado).toBe(true);
    expect((await a.sql`select 1 from public.cambios_referencia`).length).toBe(0);
    expect((await a.chamar('POST', '/regras/cambios', { como: PESSOAS.pricing, corpo: { moeda: 'EUR', taxa: 6.1, vigenteDe: '2020-01-01' } })).corpo.erro.codigo).toBe('VIGENCIA_NO_PASSADO');
    const ok = await a.chamar('POST', '/regras/cambios', { como: PESSOAS.pricing, corpo: { moeda: 'EUR', taxa: 6.1, vigenteDe: hojeIso(), observacao: 'Referência inicial' } });
    expect(ok.status, JSON.stringify(ok.corpo)).toBe(201);
    await expect(a.sql`update public.cambios_referencia set taxa = 7`).rejects.toThrow(/imutável/);
    const lista = await a.chamar('GET', '/regras/cambios', { como: PESSOAS.financeiro });
    expect(lista.corpo.vigentes).toEqual([{ moeda: 'EUR', taxa: 6.1, vigente_de: hojeIso(), origem: 'politica' }]);
  });

  it('com o câmbio publicado a política publica e a cotação ganha exposição cambial e comissão do vendedor', async () => {
    const pub = await a.chamar('POST', `/regras/${politica}/publicar`, { como: PESSOAS.pricing, corpo: { vigenciaInicio: hojeIso(), forcar: true, motivo: 'Custo europeu e comissão do vendedor.' } });
    expect(pub.status, JSON.stringify(pub.corpo)).toBe(200);
    const r = await a.chamar('POST', '/cotacoes/simular', { como: PESSOAS.vendedor, corpo: pedidoAuto() });
    expect(r.status, JSON.stringify(r.corpo)).toBe(200);
    const x = r.corpo.resultado;
    // 1,5 € × 12 meses × 6,10 = R$ 109,80
    expect(x.exposicaoCambial).toEqual([expect.objectContaining({ moeda: 'EUR', valorMoeda: 18, taxa: 6.1, valorConvertido: 109.8 })]);
    expect(x.exposicaoCambial[0].cambioEquilibrio).toBeGreaterThan(6.1);
    expect(x.comissaoVendedor).toEqual({ base: 'margem', pct: 10, valor: Math.round(x.margemValor * 10) / 100, deduzidaDaMargem: false });
    expect(x.versoes.motor).toBe('1.1.0');
  });

  it('a versão gravada guarda as taxas usadas e a comissão do vendedor', async () => {
    const c = await a.chamar('POST', '/cotacoes', { como: PESSOAS.vendedor, corpo: { pedido: pedidoAuto(), cliente } });
    expect(c.status).toBe(201);
    const [v] = await a.sql<{ cambios: any[]; comissao_vendedor_valor: number; motor_versao: string }[]>`
      select cambios, comissao_vendedor_valor, motor_versao from public.cotacao_versoes where cotacao_id = ${c.corpo.id}`;
    expect(v!.cambios).toEqual([expect.objectContaining({ moeda: 'EUR', taxa: 6.1, vigenteDe: hojeIso(), origem: 'politica' })]);
    expect(v!.comissao_vendedor_valor).toBe(c.corpo.resultado.comissaoVendedor.valor);
    expect(v!.motor_versao).toBe('1.1.0');
  });

  it('o canal não recebe câmbio, exposição cambial nem comissão do vendedor pela API', async () => {
    const r = await a.chamar('POST', '/cotacoes/simular', { como: PESSOAS.canal, corpo: pedidoAuto() });
    expect(r.status).toBe(200);
    expect(r.corpo.resultado).not.toHaveProperty('exposicaoCambial');
    expect(r.corpo.resultado).not.toHaveProperty('comissaoVendedor');
    expect(JSON.stringify(r.corpo)).not.toMatch(/EUR|cambio|câmbio|comissaoVendedor|Comissão do vendedor|folga/i);
    const c = await a.chamar('POST', '/cotacoes', { como: PESSOAS.canal, corpo: { pedido: pedidoAuto(), cliente } });
    expect(JSON.stringify(c.corpo)).not.toMatch(/EUR|cambio|comissaoVendedor|folga/i);
  });

  it('nem pela leitura direta no banco', async () => {
    const versoes = await como(PESSOAS.canal, 'aal1', (tx) => tx`select * from public.v_cotacao_versoes`);
    expect(versoes.length).toBeGreaterThan(0);
    for (const v of versoes) {
      expect(Object.keys(v)).not.toEqual(expect.arrayContaining(['cambios']));
      expect(Object.keys(v)).not.toContain('comissao_vendedor_valor');
      expect(JSON.stringify(v)).not.toMatch(/EUR|exposicaoCambial|comissaoVendedor|folga/i);
    }
    expect(await como(PESSOAS.canal, 'aal1', (tx) => tx`select comissao_vendedor_valor, cambios from public.cotacao_versoes`)).toEqual([]);
    expect(await como(PESSOAS.canal, 'aal1', (tx) => tx`select * from public.cambios_referencia`)).toEqual([]);
    expect(await como(PESSOAS.vendedor, 'aal1', (tx) => tx`select * from public.cambios_referencia`)).toEqual([]);
    expect((await como(PESSOAS.pricing, 'aal2', (tx) => tx`select * from public.cambios_referencia`)).length).toBe(1);
  });

  it('custo em moeda sem câmbio vigente devolve CAMBIO_AUSENTE, sem gravar nada', async () => {
    const [pv] = await a.sql<{ id: string }[]>`select app.politica_vigente(${a.orgId}, current_date) as id`;
    await a.sql.begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      await tx`insert into public.parametros_custo (org_id, politica_id, codigo, nome, categoria, tipo, valor, moeda)
               values (${a.orgId}, ${pv!.id}, 'franquia-eua', 'Franquia nos EUA', 'custo_variavel', 'valor_fixo', 10, 'USD')`;
    });
    const antes = await a.sql<{ n: number }[]>`select count(*)::int as n from public.cotacoes`;
    const sim = await a.chamar('POST', '/cotacoes/simular', { como: PESSOAS.vendedor, corpo: pedidoAuto() });
    expect(sim.status).toBe(422);
    expect(sim.corpo.erro).toMatchObject({ codigo: 'CAMBIO_AUSENTE', detalhes: { moeda: 'USD' } });
    const criar = await a.chamar('POST', '/cotacoes', { como: PESSOAS.vendedor, corpo: { pedido: pedidoAuto(), cliente } });
    expect(criar.corpo.erro.codigo).toBe('CAMBIO_AUSENTE');
    expect((await a.sql<{ n: number }[]>`select count(*)::int as n from public.cotacoes`)[0]!.n).toBe(antes[0]!.n);
  });
});
