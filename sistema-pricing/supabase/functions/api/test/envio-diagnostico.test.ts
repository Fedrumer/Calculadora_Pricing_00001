import { strFromU8, unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gerarHistorico } from '../../_shared/instalacao/historico.ts';
import { decifrar, hmac } from '../src/cripto.ts';
import { CONTA_AGREGADA, montarPacote } from '../src/pacote-diagnostico.ts';
import { type Ambiente, SEGREDO_AUTOMACAO, SEGREDO_PSEUDONIMO, criarAmbiente, lerConfig } from './apoio.ts';

// A10: pacote mensal pseudonimizado para o diagnóstico, sobre a operadora de
// turismo fictícia com dois meses e meio de cotações sintéticas e algumas
// cotações feitas pela API com nome, e-mail, documento e textos livres.
let a: Ambiente;
const T = {
  admin: 'admin@operadora.demo',
  pricing: 'pricing@operadora.demo',
  vera: 'vendedor@operadora.demo',
  gerente: 'gerente@operadora.demo',
  canal: 'canal@agencia-horizonte.demo',
};
const automacao = { 'x-automacao-segredo': SEGREDO_AUTOMACAO };
const hojeIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const mes = (deslocamento: number) => {
  const [y, m] = hojeIso().split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + deslocamento, 1)).toISOString().slice(0, 7);
};
const lisboa = (descontoPct = 0) => ({ produto: 'LISBOA', dimensoes: { temporada: 'alta', acomodacao: 'duplo', passageiros: 2 }, descontoPct });

/** Chamadas de rede feitas pela API (o envio usa deps.buscar). */
let chamadas: { url: string; init: RequestInit }[] = [];
let respostaDestino: () => Response = () => new Response(JSON.stringify({ recibo: 'R-0001', status: 'recebido' }), { status: 201 });

function abrir(zip: Uint8Array): Record<string, string> {
  return Object.fromEntries(Object.entries(unzipSync(zip)).map(([nome, bytes]) => [nome, strFromU8(bytes)]));
}
function csv(texto: string): { cabecalhos: string[]; linhas: string[][] } {
  const [cab, ...linhas] = texto.replace(/^﻿/, '').trimEnd().split('\n').map((l) => l.split(';'));
  return { cabecalhos: cab!, linhas };
}
async function pacote(competencia: string, segredo = SEGREDO_PSEUDONIMO, modoConta: 'pseudonimo' | 'agregado' = 'pseudonimo') {
  return montarPacote(a.sql, { orgId: a.orgId, competencia, segredo, chaveCifra: a.deps.config.chaveCifra, modoConta, agora: new Date() });
}

beforeAll(async () => {
  a = await criarAmbiente({ config: 'demo-turismo.json' });
  a.deps.buscar = (async (url: string | URL | Request, init: RequestInit = {}) => {
    chamadas.push({ url: String(url), init });
    return respostaDestino();
  }) as typeof fetch;
  await gerarHistorico(a.sql, a.orgId, lerConfig('demo-turismo.json'), { dias: 75 });

  // cotações com dado pessoal e texto livre, feitas pela tela
  const pessoas = [
    { nome: 'Joaquina Pereira de Albuquerque', email: 'joaquina.albuquerque@exemplo.test', documento: '529.982.247-25' },
    { nome: 'Benedito Ramalho Turismo Ltda', email: 'compras@ramalho-turismo.test', documento: '11.444.777/0001-61' },
    { nome: 'Cliente Sem Documento Teixeira', email: 'teixeira.semdoc@exemplo.test' },
  ];
  for (const [i, cliente] of pessoas.entries()) {
    const c = await a.chamar('POST', '/cotacoes', {
      como: T.vera,
      corpo: { pedido: lisboa(i === 0 ? 1 : 0), cliente, observacao: `Observação reservada número ${i}: cliente prefere janela.` },
    });
    expect(c.status, JSON.stringify(c.corpo)).toBe(201);
    expect((await a.chamar('POST', `/cotacoes/${c.corpo.id}/emitir`, { como: T.vera })).status).toBe(200);
    const corpo =
      i === 0
        ? { resultado: 'aceita' }
        : i === 1
          ? { resultado: 'perdida', categoria: 'preco_concorrente', concorrente: { nome: 'Viagens Concorrente Exclusiva S.A.', preco: 9000 } }
          : { resultado: 'perdida', categoria: 'outro', motivo: 'Família adiou a viagem por motivo de saúde.' };
    expect((await a.chamar('POST', `/cotacoes/${c.corpo.id}/desfecho`, { como: T.vera, corpo })).status).toBe(200);
  }
  // pedido de exceção com motivo em texto livre
  const ex = await a.chamar('POST', '/cotacoes', { como: T.vera, corpo: { pedido: lisboa(4), cliente: pessoas[0] } });
  expect((await a.chamar('POST', `/cotacoes/${ex.corpo.id}/aprovacao`, { como: T.vera, corpo: { acao: 'pedir', motivo: 'Motivo sigiloso: cliente fiel há doze anos.' } })).status).toBe(201);
  expect((await a.chamar('POST', `/cotacoes/${ex.corpo.id}/aprovacao`, { como: T.gerente, corpo: { acao: 'aprovar', motivo: 'Decisão reservada do gerente comercial.' } })).status).toBe(200);
  expect((await a.chamar('POST', `/cotacoes/${ex.corpo.id}/emitir`, { como: T.vera })).status).toBe(200);
});
afterAll(() => a.fechar());

describe('pacote do diagnóstico', () => {
  it('os cabeçalhos dos CSV usam exatamente os nomes de campo do diagnóstico', async () => {
    const p = abrir((await pacote(mes(0))).zip);
    expect(Object.keys(p).sort()).toEqual(['contas.csv', 'cotacoes.csv', 'custos.csv', 'custos_servir.csv', 'manifesto.json', 'produtos.csv', 'transacoes.csv']);
    expect(csv(p['transacoes.csv']!).cabecalhos).toEqual(['data', 'nota_fiscal', 'produto', 'conta', 'canal', 'quantidade', 'preco_lista', 'preco_faturado', 'desc_comercial', 'desc_promocional']);
    expect(csv(p['custos.csv']!).cabecalhos).toEqual(['produto', 'custo_unitario', 'vigencia_inicio']);
    expect(csv(p['produtos.csv']!).cabecalhos).toEqual(['codigo', 'descricao', 'categoria', 'linha']);
    expect(csv(p['contas.csv']!).cabecalhos).toEqual(['codigo', 'segmento', 'porte', 'regiao', 'vendedor']);
    expect(csv(p['custos_servir.csv']!).cabecalhos).toEqual(['tipo', 'canal', 'conta', 'percentual']);
    // o código do produto junta o produto com as dimensões de categoria; passageiros viram quantidade
    const t = csv(p['transacoes.csv']!);
    expect(t.linhas.some((l) => l[2] === 'LISBOA|ALTA|DUPLO' && l[5] === '2')).toBe(true);
    // todo produto vendido tem custo e cadastro
    const comCusto = new Set(csv(p['custos.csv']!).linhas.map((l) => l[0]));
    const cadastrados = new Set(csv(p['produtos.csv']!).linhas.map((l) => l[0]));
    for (const l of t.linhas) {
      expect(comCusto.has(l[2]!), l[2]).toBe(true);
      expect(cadastrados.has(l[2]!), l[2]).toBe(true);
    }
    // lista menos descontos fecha com o faturado, como o diagnóstico confere
    for (const l of t.linhas) expect(Math.abs(Number(l[6]) - Number(l[8]) - Number(l[9]) - Number(l[7]))).toBeLessThan(Number(l[6]) * 0.01);
  });

  it('não leva nome, e-mail, documento nem texto livre do banco', async () => {
    const valores = new Set<string>();
    const juntar = (lista: (string | null)[]) => lista.forEach((v) => v && v.trim().length >= 5 && valores.add(v.trim()));
    juntar((await a.sql<{ v: string }[]>`select cliente_nome as v from public.cotacoes`).map((x) => x.v));
    juntar((await a.sql<{ v: string }[]>`select cliente_email as v from public.cotacoes`).map((x) => x.v));
    juntar((await a.sql<{ v: string }[]>`select observacao as v from public.cotacoes`).map((x) => x.v));
    juntar((await a.sql<{ v: string }[]>`select desfecho_motivo as v from public.cotacoes`).map((x) => x.v));
    juntar((await a.sql<{ v: string }[]>`select concorrente_nome as v from public.cotacoes`).map((x) => x.v));
    juntar((await a.sql<{ v: string }[]>`select nome as v from public.usuarios union select email from public.usuarios`).map((x) => x.v));
    juntar((await a.sql<{ v: string }[]>`select motivo as v from public.aprovacoes union select decisao_motivo from public.aprovacoes`).map((x) => x.v));
    const documentos = await a.sql<{ c: string; h: string }[]>`select documento_cifrado as c, documento_hash as h from public.cotacao_dados_pessoais`;
    expect(documentos.length).toBeGreaterThanOrEqual(2);
    for (const d of documentos) {
      const digitos = await decifrar(a.deps.config.chaveCifra, d.c);
      valores.add(digitos);
      valores.add(d.h);
    }
    valores.add('529.982.247-25');
    valores.add('11.444.777/0001-61');
    expect(valores.size).toBeGreaterThan(40);

    for (const competencia of [mes(-2), mes(-1), mes(0)]) {
      const p = await pacote(competencia);
      const textos = abrir(p.zip);
      const tudo = Object.values(textos).join('\n') + new TextDecoder('latin1').decode(p.zip);
      const achados = [...valores].filter((v) => tudo.includes(v));
      expect(achados, competencia).toEqual([]);
      // nem o segredo
      expect(tudo.includes(SEGREDO_PSEUDONIMO)).toBe(false);
    }
  });

  it('o mesmo cliente tem o mesmo código em dois meses; com outro segredo, outro código', async () => {
    // um cliente da carga sintética que comprou nos dois meses
    const [x] = await a.sql<{ nome: string }[]>`
      select cliente_nome as nome from public.cotacoes
      where status in ('emitida', 'aceita', 'perdida', 'expirada')
      group by 1 having count(distinct date_trunc('month', criado_em)) filter (where criado_em >= ${`${mes(-1)}-01`}::date) >= 2
      limit 1`;
    expect(x).toBeTruthy();
    const normal = x!.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const codigo = `C-${(await hmac(SEGREDO_PSEUDONIMO, `nome:${normal}`)).slice(0, 16).toUpperCase()}`;
    for (const competencia of [mes(-1), mes(0)]) {
      expect(csv(abrir((await pacote(competencia)).zip)['contas.csv']!).linhas.map((l) => l[0]), competencia).toContain(codigo);
    }
    const outro = csv(abrir((await pacote(mes(0), 'outro-segredo-de-pseudonimo-com-mais-de-32-caracteres')).zip)['contas.csv']!).linhas.map((l) => l[0]);
    expect(outro).not.toContain(codigo);
    // cliente com documento: o código vem do documento, não do nome
    const doc = `C-${(await hmac(SEGREDO_PSEUDONIMO, '52998224725')).slice(0, 16).toUpperCase()}`;
    expect(csv(abrir((await pacote(mes(0))).zip)['transacoes.csv']!).linhas.map((l) => l[3])).toContain(doc);
  });

  it('a soma de preço faturado × quantidade é a receita aceita do mês no painel', async () => {
    for (const competencia of [mes(-2), mes(-1), mes(0)]) {
      const p = await pacote(competencia);
      const t = csv(abrir(p.zip)['transacoes.csv']!);
      const soma = t.linhas.reduce((s, l) => s + Number(l[5]) * Number(l[7]), 0);
      const fim = new Date(Date.UTC(Number(competencia.slice(0, 4)), Number(competencia.slice(5, 7)), 0)).toISOString().slice(0, 10);
      const [i] = await a.sql<{ v: number }[]>`select (app.indicadores(${a.orgId}, ${`${competencia}-01`}::date, ${fim}::date) #>> '{resumo,volumeAceito}')::numeric as v`;
      expect(t.linhas.length, competencia).toBeGreaterThan(0);
      expect(Math.round(soma * 100) / 100, competencia).toBe(Number(i!.v));
      const manifesto = p.manifesto as { arquivos: { nome: string; somaPreco: number | null; linhas: number }[] };
      expect(manifesto.arquivos.find((x) => x.nome === 'transacoes.csv')).toMatchObject({ somaPreco: Number(i!.v), linhas: t.linhas.length });
    }
  });

  it('o manifesto traz contrato, instância pseudônima, hashes e o modo de conta; o modo agregado usa um código único', async () => {
    const p = await pacote(mes(0));
    const m = JSON.parse(abrir(p.zip)['manifesto.json']!);
    expect(m).toMatchObject({ contrato: 'pacote-diagnostico/1', competencia: mes(0), modoConta: 'pseudonimo', motorVersao: '1.1.0' });
    expect(m.instancia).toMatch(/^I-[0-9A-F]{16}$/);
    expect(m.instancia).not.toContain(a.orgId);
    expect(m.arquivos).toHaveLength(6);
    const ag = csv(abrir((await pacote(mes(0), SEGREDO_PSEUDONIMO, 'agregado')).zip)['contas.csv']!);
    expect(ag.linhas.map((l) => l[0])).toEqual([CONTA_AGREGADA]);
    // mesmo dado, mesmo hash de conteúdo
    expect((await pacote(mes(0))).manifesto.hashConteudo).toBe(m.hashConteudo);
  });
});

describe('envio ao diagnóstico', () => {
  let envioId: string;

  it('só o administrador com segundo fator usa a tela', async () => {
    for (const quem of [T.pricing, T.vera, T.canal]) expect((await a.chamar('GET', '/envio-diagnostico', { como: quem })).status, quem).toBe(403);
    expect((await a.chamar('GET', '/envio-diagnostico', { como: T.admin, aal: 'aal1' })).corpo.erro.codigo).toBe('MFA_OBRIGATORIO');
    const r = await a.chamar('GET', '/envio-diagnostico', { como: T.admin });
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ contrato: 'pacote-diagnostico/1', config: { ativo: false, modoConta: 'pseudonimo', diaDoMes: 2, destino: null }, segredoConfigurado: true, chaveConfigurada: false });
  });

  it('prévia mostra as 10 primeiras linhas e não grava nada', async () => {
    const r = await a.chamar('GET', `/envio-diagnostico/previa?competencia=${mes(-1)}`, { como: T.admin });
    expect(r.status, JSON.stringify(r.corpo)).toBe(200);
    const t = r.corpo.arquivos.find((x: any) => x.nome === 'transacoes.csv');
    expect(t.linhas.length).toBe(Math.min(10, t.total));
    expect((await a.sql`select 1 from public.envios_diagnostico`).length).toBe(0);
  });

  it('gerar grava o ZIP no armazenamento do cliente e o registro; baixar dá link assinado', async () => {
    const r = await a.chamar('POST', '/envio-diagnostico/gerar', { como: T.admin, corpo: { competencia: mes(-1) } });
    expect(r.status, JSON.stringify(r.corpo)).toBe(201);
    envioId = r.corpo.id;
    const [e] = await a.sql<{ arquivo: string; hash: string; status: string }[]>`select arquivo, hash, status from public.envios_diagnostico where id = ${envioId}`;
    expect(e!.status).toBe('gerado');
    expect(a.arquivos.has(`diagnostico/${e!.arquivo}`)).toBe(true);
    const b = await a.chamar('GET', `/envio-diagnostico/${envioId}/baixar`, { como: T.admin });
    expect(b.corpo.url).toMatch(/^memoria:\/\/diagnostico\//);
    const aud = await a.sql`select acao from public.eventos_auditoria where registro_id = ${envioId} order by id`;
    expect(aud.map((x) => x.acao)).toEqual(expect.arrayContaining(['diagnostico.pacote_gerado', 'diagnostico.pacote_baixado']));
  });

  it('com o envio desligado nada sai, nem pela tela nem pelo n8n, e a tentativa fica registrada', async () => {
    chamadas = [];
    const r = await a.chamar('POST', `/envio-diagnostico/${envioId}/enviar`, { como: T.admin });
    expect(r.status).toBe(409);
    expect(r.corpo.erro.codigo).toBe('ENVIO_DESLIGADO');
    const n8n = await a.chamar('POST', '/automacao/envio-diagnostico', { cabecalhos: automacao, corpo: {} });
    expect(n8n.status).toBe(200);
    expect(n8n.corpo.acao).toBe('desligado');
    expect(chamadas).toEqual([]);
    expect((await a.sql`select 1 from public.envios_diagnostico`).length).toBe(1);
    const [n] = await a.sql<{ n: number }[]>`select count(*)::int as n from public.eventos_auditoria where acao = 'diagnostico.envio_bloqueado'`;
    expect(n!.n).toBe(2);
  });

  it('ligar o envio fica registrado; ligado, o pacote vai ao destino com a chave e sem o segredo', async () => {
    const put = await a.chamar('PUT', '/organizacao/config', { como: T.admin, corpo: { envioDiagnostico: { ativo: true, destino: 'https://diagnostico.exemplo.test/functions/v1/receber-pacote' } } });
    expect(put.status, JSON.stringify(put.corpo)).toBe(200);
    expect((await a.sql`select 1 from public.eventos_auditoria where acao = 'diagnostico.envio_ligado'`).length).toBe(1);

    // sem a chave de envio, ainda não sai
    chamadas = [];
    expect((await a.chamar('POST', `/envio-diagnostico/${envioId}/enviar`, { como: T.admin })).corpo.erro.codigo).toBe('ENVIO_SEM_DESTINO');
    expect(chamadas).toEqual([]);

    a.deps.config.chaveEnvioDiagnostico = 'chave-que-so-deposita-para-testes';
    const r = await a.chamar('POST', `/envio-diagnostico/${envioId}/enviar`, { como: T.admin });
    expect(r.status, JSON.stringify(r.corpo)).toBe(200);
    expect(r.corpo).toMatchObject({ status: 'enviado', recibo: { recibo: 'R-0001' } });
    expect(chamadas).toHaveLength(1);
    const c = chamadas[0]!;
    expect(c.url).toBe('https://diagnostico.exemplo.test/functions/v1/receber-pacote');
    const cab = c.init.headers as Record<string, string>;
    expect(cab.authorization).toBe('Bearer chave-que-so-deposita-para-testes');
    expect(cab['x-contrato']).toBe('pacote-diagnostico/1');
    const corpo = c.init.body as Uint8Array;
    expect(Object.keys(unzipSync(corpo))).toContain('manifesto.json');
    expect(JSON.stringify(cab) + new TextDecoder('latin1').decode(corpo)).not.toContain(SEGREDO_PSEUDONIMO);
    const [e] = await a.sql<{ status: string; recibo: unknown }[]>`select status, recibo from public.envios_diagnostico where id = ${envioId}`;
    expect(e).toMatchObject({ status: 'enviado', recibo: { recibo: 'R-0001' } });
  });

  it('o n8n gera e envia o mês anterior uma vez; falha avisa e tenta de novo depois', async () => {
    // o mês anterior já foi enviado pela tela
    chamadas = [];
    const ja = await a.chamar('POST', '/automacao/envio-diagnostico', { cabecalhos: automacao, corpo: {} });
    expect(['ja_enviado', 'aguardando']).toContain(ja.corpo.acao);
    expect(chamadas).toEqual([]);
    // um mês ainda não enviado, com o diagnóstico fora do ar
    respostaDestino = () => new Response('indisponível', { status: 503 });
    const falha = await a.chamar('POST', '/automacao/envio-diagnostico', { cabecalhos: automacao, corpo: { competencia: mes(-2) } });
    expect(falha.corpo).toMatchObject({ acao: 'gerado', envio: { status: 'falhou' } });
    expect(falha.corpo.avisar).toEqual(expect.arrayContaining(['admin@operadora.demo', 'suporte@consultoria.demo']));
    const [ev] = await a.sql<{ n: number }[]>`select count(*)::int as n from public.eventos_saida where tipo = 'diagnostico.envio_falhou'`;
    expect(ev!.n).toBe(1);
    respostaDestino = () => new Response(JSON.stringify({ recibo: 'R-0002' }), { status: 201 });
    const ok = await a.chamar('POST', '/automacao/envio-diagnostico', { cabecalhos: automacao, corpo: { competencia: mes(-2) } });
    expect(ok.corpo).toMatchObject({ acao: 'gerado', envio: { status: 'enviado' } });
  });

  it('a correspondência entre código e vendedor fica só na tela do administrador', async () => {
    expect((await a.chamar('GET', '/envio-diagnostico/correspondencia', { como: T.pricing })).status).toBe(403);
    const r = await a.chamar('GET', '/envio-diagnostico/correspondencia', { como: T.admin });
    const vera = r.corpo.vendedores.find((v: any) => v.nome === 'Vera Vendedora');
    expect(vera.codigo).toMatch(/^V-[0-9A-F]{16}$/);
    const contas = csv(abrir((await pacote(mes(0))).zip)['contas.csv']!);
    expect(contas.linhas.map((l) => l[4])).toContain(vera.codigo);
  });

  it('o histórico só é lido pelo administrador, também direto no banco', async () => {
    const ler = async (email: string) => {
      let n = -1;
      await a.sql
        .begin(async (tx) => {
          await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: a.usuarios.get(email), role: 'authenticated', aal: 'aal2' })}, true)`;
          await tx.unsafe('set local role authenticated');
          n = (await tx`select id from public.envios_diagnostico`).length;
          throw new Error('desfazer');
        })
        .catch((e: Error) => {
          if (e.message !== 'desfazer') throw e;
        });
      return n;
    };
    expect(await ler(T.admin)).toBeGreaterThan(0);
    expect(await ler(T.pricing)).toBe(0);
    expect(await ler(T.canal)).toBe(0);
  });
});
