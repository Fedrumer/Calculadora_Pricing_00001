import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lerCsvTabela } from '../src/rotas/regras.ts';
import { type Ambiente, PESSOAS, cliente, criarAmbiente, pedidoAuto } from './apoio.ts';

let a: Ambiente;
beforeAll(async () => {
  a = await criarAmbiente();
});
afterAll(() => a.fechar());

const hojeIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

async function itensDaTabela(tabelaId: string) {
  const linhas = await a.sql<{ produto: string; componente: string | null; dimensoes: Record<string, string>; preco_base: number }[]>`
    select p.codigo as produto, k.codigo as componente, i.dimensoes, i.preco_base
    from public.itens_tabela i join public.produtos p on p.id = i.produto_id left join public.componentes k on k.id = i.componente_id
    where i.tabela_id = ${tabelaId}`;
  return linhas.map((l) => ({ produto: l.produto, componente: l.componente, dimensoes: l.dimensoes, precoBase: l.preco_base }));
}

describe('tabela de preço: rascunho, impacto e publicação', () => {
  let emitidaAntes: { id: string; preco: number };
  let rascunho: string;

  it('só o gestor de pricing altera regras', async () => {
    for (const como of [PESSOAS.vendedor, PESSOAS.admin, PESSOAS.diretoria, PESSOAS.canal]) {
      expect((await a.chamar('POST', '/regras/tabelas', { como, corpo: {} })).status, como).toBe(403);
    }
  });

  it('cria rascunho copiando a tabela vigente e edita os preços', async () => {
    const c = await a.chamar('POST', '/cotacoes', { como: PESSOAS.vendedor, corpo: { pedido: pedidoAuto(), cliente } });
    await a.chamar('POST', `/cotacoes/${c.corpo.id}/emitir`, { como: PESSOAS.vendedor });
    emitidaAntes = { id: c.corpo.id, preco: c.corpo.resultado.precoFinal };

    const r = await a.chamar('POST', '/regras/tabelas', { como: PESSOAS.pricing, corpo: { nome: 'Tabela reajustada' } });
    expect(r.status, JSON.stringify(r.corpo)).toBe(201);
    expect(r.corpo).toMatchObject({ versao: 2, status: 'rascunho' });
    rascunho = r.corpo.id;

    const itens = (await itensDaTabela(rascunho)).map((i) => ({ ...i, precoBase: Math.round(i.precoBase * 110) / 100 }));
    expect(itens).toHaveLength(13);
    const put = await a.chamar('PUT', `/regras/tabelas/${rascunho}`, { como: PESSOAS.pricing, corpo: { itens } });
    expect(put.status, JSON.stringify(put.corpo)).toBe(200);

    const invalido = await a.chamar('PUT', `/regras/tabelas/${rascunho}`, { como: PESSOAS.pricing, corpo: { itens: [{ produto: 'NAO-EXISTE', componente: null, dimensoes: {}, precoBase: 1 }] } });
    expect(invalido.status).toBe(422);
    expect((await itensDaTabela(rascunho)).length).toBe(13);
  });

  it('simula o impacto antes de publicar', async () => {
    const r = await a.chamar('POST', `/regras/${rascunho}/impacto`, { como: PESSOAS.pricing });
    expect(r.status, JSON.stringify(r.corpo)).toBe(200);
    expect(r.corpo.validacao.erros).toEqual([]);
    expect(r.corpo.casosReferencia.reprovados).toBeGreaterThan(0);
    expect(r.corpo.impacto.amostra).toBeGreaterThan(0);
    expect(r.corpo.impacto.variacaoPrecoPct).toBeCloseTo(10, 0);
    expect(r.corpo.impacto.margemPctDepois).toBeGreaterThan(r.corpo.impacto.margemPctAntes);
  });

  it('casos de referência reprovados seguram a publicação, salvo com motivo registrado', async () => {
    const data = hojeIso();
    const passado = await a.chamar('POST', `/regras/${rascunho}/publicar`, { como: PESSOAS.pricing, corpo: { vigenciaInicio: '2020-01-01' } });
    expect(passado.corpo.erro.codigo).toBe('VIGENCIA_NO_PASSADO');

    const barrado = await a.chamar('POST', `/regras/${rascunho}/publicar`, { como: PESSOAS.pricing, corpo: { vigenciaInicio: data } });
    expect(barrado.status).toBe(409);
    expect(barrado.corpo.erro.codigo).toBe('CASOS_DE_REFERENCIA_REPROVADOS');

    const ok = await a.chamar('POST', `/regras/${rascunho}/publicar`, { como: PESSOAS.pricing, corpo: { vigenciaInicio: data, forcar: true, motivo: 'Reajuste anual de 10% aprovado pela diretoria.' } });
    expect(ok.status, JSON.stringify(ok.corpo)).toBe(200);
    expect(ok.corpo).toMatchObject({ status: 'publicada', versao: 2 });

    const vigencias = await a.sql<{ versao: number; status: string; inicio: string; fim: string | null }[]>`
      select versao, status, vigencia_inicio::text as inicio, vigencia_fim::text as fim from public.tabelas_preco order by versao`;
    expect(vigencias[0]).toMatchObject({ versao: 1, status: 'publicada', inicio: '2025-11-01' });
    expect(vigencias[0]!.fim).not.toBeNull();
    expect(vigencias[1]).toMatchObject({ versao: 2, status: 'publicada', inicio: data, fim: null });

    const [evento] = await a.sql<{ novo: { forcado: boolean; motivo: string } }[]>`select novo from public.eventos_auditoria where acao = 'regra.publicada' order by id desc limit 1`;
    expect(evento!.novo).toMatchObject({ forcado: true, motivo: 'Reajuste anual de 10% aprovado pela diretoria.' });
  });

  it('gera a planilha de contingência a cada publicação', async () => {
    const planilha = [...a.arquivos.entries()].find(([k]) => k.startsWith('contingencia/'));
    expect(planilha).toBeDefined();
    expect(Array.from(planilha![1].conteudo.slice(0, 2))).toEqual([0x50, 0x4b]); // "PK": arquivo .xlsx (zip)
    const link = await a.chamar('GET', '/regras/contingencia', { como: PESSOAS.vendedor });
    expect(link.status).toBe(200);
  });

  it('a tabela nova vale para cotações novas; a cotação já emitida mantém o preço', async () => {
    const nova = await a.chamar('POST', '/cotacoes/simular', { como: PESSOAS.vendedor, corpo: pedidoAuto() });
    // 38,39 x 12 = 460,68; +8% = 497,53; -4% = 477,63
    expect(nova.corpo.resultado.precoFinal).toBe(477.63);
    expect(nova.corpo.resultado.versoes.tabela.versao).toBe(2);
    const [antiga] = await a.sql<{ preco_final: number; status: string }[]>`
      select v.preco_final, c.status from public.cotacoes c join public.cotacao_versoes v on v.id = c.versao_atual_id where c.id = ${emitidaAntes.id}`;
    expect(antiga).toMatchObject({ preco_final: emitidaAntes.preco, status: 'emitida' });
  });

  it('versão publicada é imutável, pela API e direto no banco', async () => {
    const put = await a.chamar('PUT', `/regras/tabelas/${rascunho}`, { como: PESSOAS.pricing, corpo: { nome: 'Outro nome' } });
    expect(put.corpo.erro.codigo).toBe('VERSAO_IMUTAVEL');
    expect((await a.chamar('DELETE', `/regras/${rascunho}`, { como: PESSOAS.pricing })).status).toBe(409);
    await expect(a.sql`update public.itens_tabela set preco_base = 1 where tabela_id = ${rascunho}`).rejects.toThrow(/já foi publicada/);
    await expect(a.sql`update public.tabelas_preco set nome = 'x' where id = ${rascunho}`).rejects.toThrow(/imutável/);
    await expect(a.sql`delete from public.tabelas_preco where id = ${rascunho}`).rejects.toThrow(/não pode ser excluída/);
  });

  it('o banco não aceita duas tabelas publicadas vigentes na mesma data', async () => {
    const r = await a.chamar('POST', '/regras/tabelas', { como: PESSOAS.pricing, corpo: {} });
    await expect(a.sql`update public.tabelas_preco set status = 'publicada', vigencia_inicio = current_date where id = ${r.corpo.id}`).rejects.toThrow(/tabela_unica_por_data/);
    const mesmaData = await a.chamar('POST', `/regras/${r.corpo.id}/publicar`, { como: PESSOAS.pricing, corpo: { vigenciaInicio: hojeIso(), forcar: true, motivo: 'Tentativa de publicar na mesma data.' } });
    expect(mesmaData.corpo.erro.codigo).toBe('VIGENCIA_SOBREPOSTA');
    expect((await a.chamar('DELETE', `/regras/${r.corpo.id}`, { como: PESSOAS.pricing })).status).toBe(200);
  });
});

describe('importação de planilha', () => {
  it('lê CSV com ponto e vírgula e preço em formato brasileiro', () => {
    const { itens, erros } = lerCsvTabela('produto;componente;plano;preco_base\nAUTO24;base;essencial;R$ 1.234,50\nPET;;premium;69,90\n');
    expect(erros).toEqual([]);
    expect(itens).toEqual([
      { produto: 'AUTO24', componente: 'base', dimensoes: { plano: 'essencial' }, precoBase: 1234.5 },
      { produto: 'PET', componente: null, dimensoes: { plano: 'premium' }, precoBase: 69.9 },
    ]);
    expect(lerCsvTabela('produto,plano,preco_base\nPET,premium,69.90').itens[0]!.precoBase).toBe(69.9);
    expect(lerCsvTabela('produto;preco_base\nPET;abc').erros).toHaveLength(1);
  });

  it('carrega em rascunho só se a planilha inteira for válida', async () => {
    const r = await a.chamar('POST', '/regras/tabelas', { como: PESSOAS.pricing, corpo: {} });
    const id = r.corpo.id as string;
    const ruim = await a.chamar('POST', `/regras/tabelas/${id}/importar`, { como: PESSOAS.pricing, corpo: { csv: 'produto;componente;plano;preco_base\nAUTO24;base;essencial;21,90\nXYZ;;essencial;1,00\n' } });
    expect(ruim.status).toBe(422);
    expect((await itensDaTabela(id)).length).toBe(13);
    const boa = await a.chamar('POST', `/regras/tabelas/${id}/importar`, { como: PESSOAS.pricing, corpo: { csv: 'produto;componente;plano;preco_base\nAUTO24;base;essencial;21,90\nAUTO24;base;completo;37,90\n' } });
    expect(boa.status, JSON.stringify(boa.corpo)).toBe(200);
    expect(boa.corpo.importados).toBe(2);
    // faltam produtos ativos na tabela: a validação segura a publicação
    const pub = await a.chamar('POST', `/regras/${id}/publicar`, { como: PESSOAS.pricing, corpo: { vigenciaInicio: '2099-01-01' } });
    expect(pub.corpo.erro.codigo).toBe('REGRAS_INVALIDAS');
    await a.chamar('DELETE', `/regras/${id}`, { como: PESSOAS.pricing });
  });
});

describe('política comercial', () => {
  it('nova versão de política muda os limites para as próximas cotações', async () => {
    const r = await a.chamar('POST', '/regras/politicas', { como: PESSOAS.pricing, corpo: {} });
    expect(r.status, JSON.stringify(r.corpo)).toBe(201);
    const [atual] = await a.sql<{ regras: any }[]>`select regras from public.politicas where id = ${r.corpo.id}`;
    const regras = { ...atual!.regras, limites: { ...atual!.regras.limites, descontoLivrePct: 2 } };
    expect((await a.chamar('PUT', `/regras/politicas/${r.corpo.id}`, { como: PESSOAS.pricing, corpo: { regras } })).status).toBe(200);

    const incoerente = { ...regras, limites: { ...regras.limites, descontoLivrePct: 50 } };
    await a.chamar('PUT', `/regras/politicas/${r.corpo.id}`, { como: PESSOAS.pricing, corpo: { regras: incoerente } });
    const barrada = await a.chamar('POST', `/regras/${r.corpo.id}/publicar`, { como: PESSOAS.pricing, corpo: { vigenciaInicio: hojeIso(), forcar: true, motivo: 'Tentativa com limites incoerentes.' } });
    expect(barrada.corpo.erro.codigo).toBe('REGRAS_INVALIDAS');

    await a.chamar('PUT', `/regras/politicas/${r.corpo.id}`, { como: PESSOAS.pricing, corpo: { regras } });
    const pub = await a.chamar('POST', `/regras/${r.corpo.id}/publicar`, { como: PESSOAS.pricing, corpo: { vigenciaInicio: hojeIso(), forcar: true, motivo: 'Desconto livre reduzido para 2%.' } });
    expect(pub.status, JSON.stringify(pub.corpo)).toBe(200);
    const sim = await a.chamar('POST', '/cotacoes/simular', { como: PESSOAS.vendedor, corpo: pedidoAuto({ descontoPct: 3 }) });
    expect(sim.corpo.resultado.veredito.status).toBe('exige_aprovacao');
    expect(sim.corpo.resultado.versoes.politica.versao).toBe(2);
  });

  it('executa os casos de referência sob demanda e permite rebaseá-los', async () => {
    const antes = await a.chamar('POST', '/regras/casos-referencia/executar', { como: PESSOAS.pricing, corpo: {} });
    expect(antes.corpo.reprovados).toBeGreaterThan(0);
    const [caso] = await a.sql<{ nome: string; pedido: any }[]>`select nome, pedido from public.casos_referencia order by nome limit 1`;
    const sim = await a.chamar('POST', '/cotacoes/simular', { como: PESSOAS.pricing, corpo: { ...caso!.pedido, data: undefined } });
    expect(sim.status, JSON.stringify(sim.corpo)).toBe(200);
    const put = await a.chamar('PUT', '/regras/casos-referencia', { como: PESSOAS.pricing, corpo: { casos: [{ nome: caso!.nome, pedido: { ...caso!.pedido, data: hojeIso() }, esperado: { precoFinal: sim.corpo.resultado.precoFinal } }] } });
    expect(put.status).toBe(200);
    const depois = await a.chamar('POST', '/regras/casos-referencia/executar', { como: PESSOAS.pricing, corpo: {} });
    expect(depois.corpo.reprovados).toBe(antes.corpo.reprovados - 1);
  });
});
