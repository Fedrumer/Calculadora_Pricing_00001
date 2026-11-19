import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { montarPacote } from '../src/pacote-diagnostico.ts';
import { type Ambiente, SEGREDO_PSEUDONIMO, cliente, criarAmbiente } from './apoio.ts';

// A9: piloto com grupo de controle, sobre a operadora de turismo. A regra
// alternativa é uma tabela com Lisboa 5% mais barata; Vera fica no tratamento e
// Rui no controle; Sara fica fora do piloto.
let a: Ambiente;
const T = { pricing: 'pricing@operadora.demo', vera: 'vendedor@operadora.demo', rui: 'vendedor2@operadora.demo', sara: 'vendedor3@operadora.demo', canal: 'canal@agencia-horizonte.demo' };
const hojeIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const daqui = (dias: number) => new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);
const lisboa = { produto: 'LISBOA', dimensoes: { temporada: 'alta', acomodacao: 'duplo', passageiros: 1 }, canal: 'agencia-horizonte' };
let tabelaAlternativa: string;
let piloto: string;
let cotacaoControle: string;

async function cotar(como: string) {
  const c = await a.chamar('POST', '/cotacoes', { como, corpo: { pedido: lisboa, cliente } });
  expect(c.status, JSON.stringify(c.corpo)).toBe(201);
  const [x] = await a.sql<{ piloto_id: string | null; braco: string | null }[]>`select piloto_id, braco from public.cotacoes where id = ${c.corpo.id}`;
  return { id: c.corpo.id as string, preco: c.corpo.resultado.precoFinal as number, ...x! };
}

const corpoPiloto = (extra: Record<string, unknown> = {}) => ({
  nome: 'Lisboa 5% mais barata',
  notaReferencia: 'Nota de Decisão nº 03',
  inicio: hojeIso(),
  fim: daqui(60),
  tabelaId: tabelaAlternativa,
  criterio: 'vendedor',
  tratamento: [a.usuarios.get(T.vera)],
  controle: [a.usuarios.get(T.rui)],
  ...extra,
});

beforeAll(async () => {
  a = await criarAmbiente({ config: 'demo-turismo.json' });
  const t = await a.chamar('POST', '/regras/tabelas', { como: T.pricing, corpo: { nome: 'Tabela do piloto' } });
  expect(t.status, JSON.stringify(t.corpo)).toBe(201);
  tabelaAlternativa = t.corpo.id;
  await a.sql`update public.itens_tabela i set preco_base = round(i.preco_base * 0.95, 2)
              from public.produtos p where p.id = i.produto_id and p.codigo = 'LISBOA' and i.tabela_id = ${tabelaAlternativa}`;
});
afterAll(() => a.fechar());

describe('piloto com grupo de controle', () => {
  it('só o gestor de pricing cria piloto', async () => {
    for (const quem of [T.vera, T.canal]) expect((await a.chamar('POST', '/pilotos', { como: quem, corpo: corpoPiloto() })).status, quem).toBe(403);
    const r = await a.chamar('POST', '/pilotos', { como: T.pricing, corpo: corpoPiloto() });
    expect(r.status, JSON.stringify(r.corpo)).toBe(201);
    piloto = r.corpo.id;
  });

  it('a tela lista os candidatos por critério: só vendedores ativos entre os usuários', async () => {
    const r = await a.chamar('GET', '/pilotos/candidatos', { como: T.pricing });
    expect(r.status).toBe(200);
    const nomes = r.corpo.vendedor.map((v: any) => v.nome);
    expect(nomes).toEqual(expect.arrayContaining(['Vera Vendedora', 'Rui Rebaixa', 'Sara Segura']));
    expect(nomes).not.toContain('Paulo Pricing');
    expect(r.corpo.canal.length).toBe(2);
    expect((await a.chamar('GET', '/pilotos/candidatos', { como: T.vera })).status).toBe(403);
  });

  it('o mesmo membro não entra nos dois braços', async () => {
    const r = await a.chamar('POST', '/pilotos', { como: T.pricing, corpo: corpoPiloto({ controle: [a.usuarios.get(T.vera)] }) });
    expect(r.status).toBe(422);
  });

  it('em rascunho o piloto não muda preço de ninguém', async () => {
    expect((await cotar(T.vera)).preco).toBe(9900);
  });

  it('ativado, tratamento e controle cotam o mesmo pedido com preços diferentes, cada um com o braço gravado', async () => {
    const r = await a.chamar('POST', `/pilotos/${piloto}/ativar`, { como: T.pricing });
    expect(r.status, JSON.stringify(r.corpo)).toBe(200);
    const vera = await cotar(T.vera);
    const rui = await cotar(T.rui);
    const sara = await cotar(T.sara);
    expect(vera).toMatchObject({ preco: 9405, piloto_id: piloto, braco: 'tratamento' });
    expect(rui).toMatchObject({ preco: 9900, piloto_id: piloto, braco: 'controle' });
    cotacaoControle = rui.id;
    expect(sara).toMatchObject({ preco: 9900, piloto_id: null, braco: null });
    // a simulação na tela também mostra o preço do braço
    const s = await a.chamar('POST', '/cotacoes/simular', { como: T.vera, corpo: lisboa });
    expect(s.corpo.resultado.precoFinal).toBe(9405);
  });

  it('a tabela alternativa fica congelada e não vira a vigente de todos', async () => {
    const [t] = await a.sql<{ status: string; vigente: string }[]>`
      select t.status, app.tabela_vigente(${a.orgId}, current_date) as vigente from public.tabelas_preco t where t.id = ${tabelaAlternativa}`;
    expect(t!.status).toBe('piloto');
    expect(t!.vigente).not.toBe(tabelaAlternativa);
    await expect(a.sql`update public.itens_tabela set preco_base = 1 where tabela_id = ${tabelaAlternativa}`).rejects.toThrow();
  });

  it('um vendedor não entra em dois pilotos ativos', async () => {
    const outro = await a.chamar('POST', '/pilotos', {
      como: T.pricing,
      corpo: corpoPiloto({ nome: 'Outro piloto', tratamento: [a.usuarios.get(T.vera)], controle: [a.usuarios.get(T.sara)] }),
    });
    expect(outro.status).toBe(201);
    const r = await a.chamar('POST', `/pilotos/${outro.corpo.id}/ativar`, { como: T.pricing });
    expect(r.status).toBe(409);
    expect(r.corpo.erro.codigo).toBe('MEMBRO_EM_OUTRO_PILOTO');
    const [p] = await a.sql<{ status: string }[]>`select status from public.pilotos where id = ${outro.corpo.id}`;
    expect(p!.status).toBe('rascunho');
    expect((await a.chamar('DELETE', `/pilotos/${outro.corpo.id}`, { como: T.pricing })).status).toBe(200);
  });

  it('ativo é imutável; o banco também recusa mudança', async () => {
    expect((await a.chamar('PUT', `/pilotos/${piloto}`, { como: T.pricing, corpo: corpoPiloto({ nome: 'Mudado' }) })).corpo.erro.codigo).toBe('STATUS_INVALIDO');
    await expect(a.sql`update public.pilotos set fim = fim + 10 where id = ${piloto}`).rejects.toThrow(/imutável/);
    await expect(a.sql`delete from public.pilotos where id = ${piloto}`).rejects.toThrow(/não pode ser excluído/);
  });

  it('o painel compara tratamento e controle, antes e durante', async () => {
    let painel: any;
    await a.sql
      .begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: a.usuarios.get(T.pricing), role: 'authenticated', aal: 'aal2' })}, true)`;
        await tx.unsafe('set local role authenticated');
        // as cotações só contam quando emitidas; aqui o teste as marca direto (a do tratamento,
        // com margem menor, pediria aprovação), sem os gatilhos de transição
        await tx.unsafe('reset role');
        await tx.unsafe('set local session_replication_role = replica');
        await tx`update public.cotacoes set status = 'emitida', emitida_em = now(), validade = current_date + 15 where status = 'rascunho'`;
        await tx.unsafe('set local role authenticated');
        painel = (await tx<{ p: any }[]>`select public.painel_indicadores(current_date - 30, current_date) as p`)[0]!.p;
        throw new Error('desfazer');
      })
      .catch((e: Error) => {
        if (e.message !== 'desfazer') throw e;
      });
    expect(painel.pilotos).toHaveLength(1);
    const p = painel.pilotos[0];
    expect(p).toMatchObject({ id: piloto, nome: 'Lisboa 5% mais barata', criterio: 'vendedor', status: 'ativo' });
    const t = p.bracos.find((b: any) => b.braco === 'tratamento');
    const c = p.bracos.find((b: any) => b.braco === 'controle');
    // Vera: a cotação de antes de ativar (em rascunho do piloto) e a de depois, ambas no período do piloto
    expect(t.durante.emitidas).toBe(2);
    expect(c.durante.emitidas).toBe(1);
  });

  it('encerrado, o vendedor volta à regra vigente e fica livre para outro piloto', async () => {
    expect((await a.chamar('POST', `/pilotos/${piloto}/encerrar`, { como: T.pricing, corpo: { motivo: 'Tempo de medição atingido.' } })).status).toBe(200);
    expect(await cotar(T.vera)).toMatchObject({ preco: 9900, piloto_id: null, braco: null });
    const [m] = await a.sql<{ n: number }[]>`select count(*)::int as n from public.piloto_membros where ativo`;
    expect(m!.n).toBe(0);
  });

  it('piloto e braço saem no cotacoes.csv do pacote ao diagnóstico, pelo identificador', async () => {
    expect((await a.chamar('POST', `/cotacoes/${cotacaoControle}/emitir`, { como: T.rui })).status).toBe(200);
    const p = await montarPacote(a.sql, { orgId: a.orgId, competencia: hojeIso().slice(0, 7), segredo: SEGREDO_PSEUDONIMO, chaveCifra: a.deps.config.chaveCifra, modoConta: 'pseudonimo', agora: new Date() });
    const csv = strFromU8(unzipSync(p.zip)['cotacoes.csv']!).replace(/^\uFEFF/, '').trim().split('\n').map((l) => l.split(';'));
    const [cab, ...linhas] = csv;
    const linha = linhas.find((l) => l[cab!.indexOf('piloto')] === piloto);
    expect(linha?.[cab!.indexOf('braco')]).toBe('controle');
    expect(strFromU8(unzipSync(p.zip)['cotacoes.csv']!)).not.toContain('Lisboa 5% mais barata');
  });
});
