import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Ambiente, PESSOAS, cliente, criarAmbiente, pedidoAuto } from './apoio.ts';

let a: Ambiente;
beforeAll(async () => {
  a = await criarAmbiente();
});
afterAll(() => a.fechar());

const criar = async (como: string, pedido: Record<string, unknown>) => {
  const r = await a.chamar('POST', '/cotacoes', { como, corpo: { pedido, cliente } });
  expect(r.status, JSON.stringify(r.corpo)).toBe(201);
  return r.corpo as { id: string; numero: number; resultado: any };
};

describe('simulação e corte por perfil', () => {
  it('vendedor vê preço, margem e detalhamento completo', async () => {
    const r = await a.chamar('POST', '/cotacoes/simular', { como: PESSOAS.vendedor, corpo: pedidoAuto() });
    expect(r.status).toBe(200);
    // 34,90 x 12 = 418,80; +8% idade = 452,30; -4% prazo = 434,21
    expect(r.corpo.resultado.precoFinal).toBe(434.21);
    expect(r.corpo.resultado.margemPct).toBeGreaterThan(0);
    expect(r.corpo.resultado.veredito.cor).toBe('verde');
    expect(r.corpo.resultado.detalhamento.some((l: any) => l.interno)).toBe(true);
  });

  it('usuário de canal cota só pelo próprio canal e não recebe custo nem margem', async () => {
    const r = await a.chamar('POST', '/cotacoes/simular', { como: PESSOAS.canal, corpo: pedidoAuto() });
    expect(r.status).toBe(200);
    expect(r.corpo.resultado.canal).toBe('corretora-alfa');
    expect(r.corpo.resultado.comissaoPct).toBe(20);
    const texto = JSON.stringify(r.corpo);
    expect(texto).not.toMatch(/margem|custosValor|impostosValor|receitaLiquida|Imposto|Custo/i);

    const outro = await a.chamar('POST', '/cotacoes/simular', { como: PESSOAS.canal, corpo: pedidoAuto({ canal: 'agencia-beta' }) });
    expect(outro.status).toBe(403);
    const comissao = await a.chamar('POST', '/cotacoes/simular', { como: PESSOAS.canal, corpo: pedidoAuto({ comissaoPct: 30 }) });
    expect(comissao.status).toBe(403);
  });

  it('administrador, aprovador e leitura não cotam', async () => {
    for (const como of [PESSOAS.admin, PESSOAS.diretoria, PESSOAS.financeiro]) {
      const r = await a.chamar('POST', '/cotacoes/simular', { como, corpo: pedidoAuto() });
      expect(r.status, como).toBe(403);
    }
  });

  it('recusa sessão inválida e entrada malformada', async () => {
    expect((await a.chamar('POST', '/cotacoes/simular', { corpo: pedidoAuto() })).status).toBe(401);
    const r = await a.chamar('POST', '/cotacoes/simular', { como: PESSOAS.vendedor, corpo: { produto: 'AUTO24', dimensoes: { plano: 'completo' } } });
    expect(r.status).toBe(422);
    expect(r.corpo.erro.codigo).toBe('DIMENSAO_AUSENTE');
    const semCorpo = await a.chamar('POST', '/cotacoes/simular', { como: PESSOAS.vendedor, corpo: { dimensoes: {} } });
    expect(semCorpo.status).toBe(422);
    expect(semCorpo.corpo.erro.codigo).toBe('ENTRADA_INVALIDA');
  });

  it('perfil com segundo fator obrigatório é barrado em sessão de um fator', async () => {
    const r = await a.chamar('POST', '/cotacoes/simular', { como: PESSOAS.pricing, aal: 'aal1', corpo: pedidoAuto() });
    expect(r.status).toBe(403);
    expect(r.corpo.erro.codigo).toBe('MFA_OBRIGATORIO');
    expect((await a.chamar('POST', '/cotacoes/simular', { como: PESSOAS.pricing, corpo: pedidoAuto() })).status).toBe(200);
  });
});

describe('ciclo dentro da política', () => {
  it('cria em rascunho, emite com PDF e validade, registra a trilha', async () => {
    const c = await criar(PESSOAS.vendedor, pedidoAuto({ descontoPct: 5 }));
    expect(c.numero).toBeGreaterThan(0);
    const e = await a.chamar('POST', `/cotacoes/${c.id}/emitir`, { como: PESSOAS.vendedor });
    expect(e.status, JSON.stringify(e.corpo)).toBe(200);
    expect(e.corpo.status).toBe('emitida');
    expect(e.corpo.validade).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const pdf = [...a.arquivos.entries()].find(([k]) => k.includes(c.id));
    expect(pdf).toBeDefined();
    expect(new TextDecoder().decode(pdf![1].conteudo.slice(0, 5))).toBe('%PDF-');
    const link = await a.chamar('GET', `/cotacoes/${c.id}/proposta`, { como: PESSOAS.vendedor });
    expect(link.corpo.url).toContain('propostas/');

    const eventos = await a.sql<{ acao: string; ator_id: string }[]>`
      select acao, ator_id from public.eventos_auditoria where tabela = 'cotacoes' and registro_id = ${c.id} and acao like 'cotacao.%' order by id`;
    expect(eventos.map((x) => x.acao)).toEqual(['cotacao.criada', 'cotacao.emitida']);
    expect(eventos[0]!.ator_id).toBe(a.usuarios.get(PESSOAS.vendedor));
  });

  it('o documento do cliente fica cifrado e fora da versão', async () => {
    const c = await criar(PESSOAS.vendedor, pedidoAuto());
    const [p] = await a.sql<{ documento_cifrado: string; documento_hash: string }[]>`select documento_cifrado, documento_hash from public.cotacao_dados_pessoais where cotacao_id = ${c.id}`;
    expect(p!.documento_cifrado).toMatch(/^v1\./);
    expect(p!.documento_cifrado).not.toContain('12345678909');
    const [v] = await a.sql<{ tudo: string }[]>`select (entrada::text || resultado::text) as tudo from public.cotacao_versoes where cotacao_id = ${c.id}`;
    expect(v!.tudo).not.toMatch(/12345678909|Cliente de Teste/);
  });

  it('outro vendedor não emite nem lê a cotação alheia', async () => {
    const c = await criar(PESSOAS.vendedor, pedidoAuto());
    expect((await a.chamar('POST', `/cotacoes/${c.id}/emitir`, { como: PESSOAS.vendedorSul })).status).toBe(403);
    expect((await a.chamar('GET', `/cotacoes/${c.id}/proposta`, { como: PESSOAS.vendedorSul })).status).toBe(404);
  });

  it('a chave de idempotência evita cotação duplicada', async () => {
    const chave = `teste-${Date.now()}-idem`;
    const corpo = { pedido: pedidoAuto(), cliente };
    const um = await a.chamar('POST', '/cotacoes', { como: PESSOAS.vendedor, corpo, cabecalhos: { 'idempotency-key': chave } });
    const dois = await a.chamar('POST', '/cotacoes', { como: PESSOAS.vendedor, corpo, cabecalhos: { 'idempotency-key': chave } });
    expect(um.status).toBe(201);
    expect(dois.status).toBe(201);
    expect(dois.corpo.id).toBe(um.corpo.id);
  });
});

describe('alçadas de aprovação', () => {
  it('fora da política só emite com exceção aprovada por quem tem alçada', async () => {
    const c = await criar(PESSOAS.vendedor, pedidoAuto({ descontoPct: 8 }));
    expect(c.resultado.veredito).toMatchObject({ status: 'exige_aprovacao', cor: 'amarelo', nivelAlcada: 1 });

    const direto = await a.chamar('POST', `/cotacoes/${c.id}/emitir`, { como: PESSOAS.vendedor });
    expect(direto.status).toBe(409);
    expect(direto.corpo.erro.codigo).toBe('EXIGE_APROVACAO');

    const semMotivo = await a.chamar('POST', `/cotacoes/${c.id}/aprovacao`, { como: PESSOAS.vendedor, corpo: { acao: 'pedir', motivo: 'curto' } });
    expect(semMotivo.status).toBe(422);

    const pedido = await a.chamar('POST', `/cotacoes/${c.id}/aprovacao`, { como: PESSOAS.vendedor, corpo: { acao: 'pedir', motivo: 'Cliente tem proposta concorrente 8% abaixo.' } });
    expect(pedido.status, JSON.stringify(pedido.corpo)).toBe(201);
    expect(pedido.corpo.status).toBe('em_aprovacao');

    // quem pediu não decide; vendedor não aprova
    expect((await a.chamar('POST', `/cotacoes/${c.id}/aprovacao`, { como: PESSOAS.vendedor, corpo: { acao: 'aprovar' } })).status).toBe(403);
    // enquanto aguarda decisão a cotação não muda
    expect((await a.chamar('POST', `/cotacoes/${c.id}/versoes`, { como: PESSOAS.vendedor, corpo: { pedido: pedidoAuto({ descontoPct: 9 }) } })).status).toBe(409);

    const ok = await a.chamar('POST', `/cotacoes/${c.id}/aprovacao`, { como: PESSOAS.gestor, corpo: { acao: 'aprovar' } });
    expect(ok.status, JSON.stringify(ok.corpo)).toBe(200);
    expect(ok.corpo.status).toBe('aprovada');
    expect((await a.chamar('POST', `/cotacoes/${c.id}/emitir`, { como: PESSOAS.vendedor })).status).toBe(200);
  });

  it('alçada insuficiente é barrada; o nível certo decide', async () => {
    const c = await criar(PESSOAS.vendedor, pedidoAuto({ descontoPct: 15 }));
    expect(c.resultado.veredito.nivelAlcada).toBe(2);
    await a.chamar('POST', `/cotacoes/${c.id}/aprovacao`, { como: PESSOAS.vendedor, corpo: { acao: 'pedir', motivo: 'Renovação de frota com volume garantido.' } });
    const baixo = await a.chamar('POST', `/cotacoes/${c.id}/aprovacao`, { como: PESSOAS.gestor, corpo: { acao: 'aprovar' } });
    expect(baixo.status).toBe(403);
    expect(baixo.corpo.erro.codigo).toBe('ALCADA_INSUFICIENTE');
    const semMotivo = await a.chamar('POST', `/cotacoes/${c.id}/aprovacao`, { como: PESSOAS.diretoria, corpo: { acao: 'recusar' } });
    expect(semMotivo.status).toBe(422);
    const recusa = await a.chamar('POST', `/cotacoes/${c.id}/aprovacao`, { como: PESSOAS.diretoria, corpo: { acao: 'recusar', motivo: 'Margem insuficiente para este canal.' } });
    expect(recusa.corpo.status).toBe('recusada');
    expect((await a.chamar('POST', `/cotacoes/${c.id}/emitir`, { como: PESSOAS.vendedor })).status).toBe(409);
  });

  it('substituto designado decide na ausência do aprovador', async () => {
    const c = await criar(PESSOAS.vendedor, pedidoAuto({ descontoPct: 15 }));
    await a.chamar('POST', `/cotacoes/${c.id}/aprovacao`, { como: PESSOAS.vendedor, corpo: { acao: 'pedir', motivo: 'Contrato de dois anos com reajuste.' } });
    const ausencia = await a.chamar('PATCH', `/usuarios/${a.usuarios.get(PESSOAS.diretoria)}`, {
      como: PESSOAS.admin,
      corpo: { substitutoId: a.usuarios.get(PESSOAS.gestor), ausenteAte: '2099-12-31' },
    });
    expect(ausencia.status, JSON.stringify(ausencia.corpo)).toBe(200);
    const r = await a.chamar('POST', `/cotacoes/${c.id}/aprovacao`, { como: PESSOAS.gestor, corpo: { acao: 'aprovar' } });
    expect(r.status, JSON.stringify(r.corpo)).toBe(200);
    await a.chamar('PATCH', `/usuarios/${a.usuarios.get(PESSOAS.diretoria)}`, { como: PESSOAS.admin, corpo: { substitutoId: null, ausenteAte: null } });
  });

  it('ninguém aprova a própria cotação, mesmo tendo alçada', async () => {
    const c = await criar(PESSOAS.pricing, pedidoAuto({ descontoPct: 8 }));
    await a.chamar('POST', `/cotacoes/${c.id}/aprovacao`, { como: PESSOAS.pricing, corpo: { acao: 'pedir', motivo: 'Teste de segregação de funções.' } });
    const r = await a.chamar('POST', `/cotacoes/${c.id}/aprovacao`, { como: PESSOAS.pricing, corpo: { acao: 'aprovar' } });
    expect(r.status).toBe(403);
    expect(r.corpo.erro.codigo).toBe('PROPRIA_COTACAO');
  });

  it('cotação bloqueada não emite nem pede exceção', async () => {
    const c = await criar(PESSOAS.vendedor, pedidoAuto({ descontoPct: 25 }));
    expect(c.resultado.veredito.cor).toBe('vermelho');
    expect((await a.chamar('POST', `/cotacoes/${c.id}/emitir`, { como: PESSOAS.vendedor })).corpo.erro.codigo).toBe('BLOQUEADA_PELA_POLITICA');
    expect((await a.chamar('POST', `/cotacoes/${c.id}/aprovacao`, { como: PESSOAS.vendedor, corpo: { acao: 'pedir', motivo: 'Tentativa de liberar bloqueio.' } })).status).toBe(409);
  });
});

describe('versionamento', () => {
  it('a aprovação vale só para a versão aprovada; versões são imutáveis', async () => {
    const c = await criar(PESSOAS.vendedor, pedidoAuto({ descontoPct: 8 }));
    await a.chamar('POST', `/cotacoes/${c.id}/aprovacao`, { como: PESSOAS.vendedor, corpo: { acao: 'pedir', motivo: 'Cliente estratégico da região.' } });
    await a.chamar('POST', `/cotacoes/${c.id}/aprovacao`, { como: PESSOAS.gestor, corpo: { acao: 'aprovar' } });

    const v2 = await a.chamar('POST', `/cotacoes/${c.id}/versoes`, { como: PESSOAS.vendedor, corpo: { pedido: pedidoAuto({ descontoPct: 9 }) } });
    expect(v2.status, JSON.stringify(v2.corpo)).toBe(201);
    expect(v2.corpo).toMatchObject({ versao: 2, status: 'rascunho' });
    // a aprovação da versão 1 não libera a versão 2
    expect((await a.chamar('POST', `/cotacoes/${c.id}/emitir`, { como: PESSOAS.vendedor })).corpo.erro.codigo).toBe('EXIGE_APROVACAO');

    const versoes = await a.sql<{ versao: number; desconto_pct: number }[]>`select versao, desconto_pct from public.cotacao_versoes where cotacao_id = ${c.id} order by versao`;
    expect(versoes.map((v) => [v.versao, v.desconto_pct])).toEqual([[1, 8], [2, 9]]);
    await expect(a.sql`update public.cotacao_versoes set preco_final = 1 where cotacao_id = ${c.id}`).rejects.toThrow(/imutáveis/);
    await expect(a.sql`delete from public.cotacao_versoes where cotacao_id = ${c.id}`).rejects.toThrow(/imutáveis/);
  });

  it('cotação emitida aceita nova versão; a encerrada não', async () => {
    const c = await criar(PESSOAS.vendedor, pedidoAuto());
    await a.chamar('POST', `/cotacoes/${c.id}/emitir`, { como: PESSOAS.vendedor });
    const v2 = await a.chamar('POST', `/cotacoes/${c.id}/versoes`, { como: PESSOAS.vendedor, corpo: { pedido: pedidoAuto({ descontoPct: 3 }) } });
    expect(v2.status).toBe(201);
    await a.chamar('POST', `/cotacoes/${c.id}/emitir`, { como: PESSOAS.vendedor });

    const semMotivo = await a.chamar('POST', `/cotacoes/${c.id}/desfecho`, { como: PESSOAS.vendedor, corpo: { resultado: 'perdida' } });
    expect(semMotivo.status).toBe(422);
    const aceita = await a.chamar('POST', `/cotacoes/${c.id}/desfecho`, { como: PESSOAS.vendedor, corpo: { resultado: 'aceita' } });
    expect(aceita.corpo.status).toBe('aceita');
    expect((await a.chamar('POST', `/cotacoes/${c.id}/versoes`, { como: PESSOAS.vendedor, corpo: { pedido: pedidoAuto() } })).status).toBe(409);
    await expect(a.sql`update public.cotacoes set status = 'rascunho' where id = ${c.id}`).rejects.toThrow(/Transição de status inválida/);
  });

  it('o banco recusa emissão sem aprovação mesmo por fora da API', async () => {
    const c = await criar(PESSOAS.vendedor, pedidoAuto({ descontoPct: 8 }));
    await expect(a.sql`update public.cotacoes set status = 'emitida', validade = current_date + 5 where id = ${c.id}`).rejects.toThrow(/não está dentro da política/);
  });
});

describe('integração de canal por chave de API', () => {
  it('cota e emite no escopo do canal, sem custo nem margem; chave revogada cai na hora', async () => {
    const nova = await a.chamar('POST', '/integracoes/chaves', { como: PESSOAS.admin, corpo: { nome: 'Portal da Corretora Alfa', canal: 'corretora-alfa' } });
    expect(nova.status, JSON.stringify(nova.corpo)).toBe(201);
    const chave = nova.corpo.chave as string;
    const [guardada] = await a.sql<{ hash: string; prefixo: string }[]>`select hash, prefixo from public.chaves_api where id = ${nova.corpo.id}`;
    expect(guardada!.hash).not.toContain(chave);
    expect(chave.startsWith(guardada!.prefixo)).toBe(true);

    const r = await a.chamar('POST', '/v1/cotacoes', { cabecalhos: { 'x-api-key': chave }, corpo: { pedido: pedidoAuto(), cliente: { nome: 'Segurado Final' }, emitir: true } });
    expect(r.status, JSON.stringify(r.corpo)).toBe(201);
    expect(r.corpo.status).toBe('emitida');
    expect(r.corpo.resultado.canal).toBe('corretora-alfa');
    expect(JSON.stringify(r.corpo)).not.toMatch(/margem|custosValor|impostosValor/i);
    expect((await a.chamar('GET', `/v1/cotacoes/${r.corpo.id}`, { cabecalhos: { 'x-api-key': chave } })).corpo.numero).toBe(r.corpo.numero);

    // usuário humano do mesmo canal não enxerga pela API de chave de outro dono
    expect((await a.chamar('POST', '/v1/cotacoes/simular', { cabecalhos: { 'x-api-key': 'pk_invalida' }, corpo: pedidoAuto() })).status).toBe(401);
    await a.chamar('POST', `/integracoes/chaves/${nova.corpo.id}/revogar`, { como: PESSOAS.admin });
    expect((await a.chamar('POST', '/v1/cotacoes/simular', { cabecalhos: { 'x-api-key': chave }, corpo: pedidoAuto() })).status).toBe(401);
  });
});

describe('trilha de auditoria', () => {
  it('só aceita inserção', async () => {
    await expect(a.sql`update public.eventos_auditoria set acao = 'x'`).rejects.toThrow(/só aceita inserção/);
    await expect(a.sql`delete from public.eventos_auditoria`).rejects.toThrow(/só aceita inserção/);
    await expect(a.sql`truncate public.eventos_auditoria`).rejects.toThrow(/só aceita inserção/);
  });
  it('a duração das chamadas fica registrada', async () => {
    await new Promise((r) => setTimeout(r, 200));
    const [m] = await a.sql<{ n: number; p95: number }[]>`
      select count(*)::int as n, percentile_cont(0.95) within group (order by duracao_ms)::float as p95
      from public.metricas_api where rota = 'POST /cotacoes/simular' and status = 200`;
    expect(m!.n).toBeGreaterThan(0);
    expect(m!.p95).toBeLessThan(1000);
  });
});
