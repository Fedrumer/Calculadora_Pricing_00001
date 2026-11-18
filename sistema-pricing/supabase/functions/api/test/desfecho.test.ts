import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Ambiente, PESSOAS, cliente, criarAmbiente, pedidoAuto } from './apoio.ts';

// A3: motivo de perda em lista, com categoria obrigatória na API e no banco.
let a: Ambiente;
beforeAll(async () => {
  a = await criarAmbiente();
});
afterAll(() => a.fechar());

async function emitida(como: string = PESSOAS.vendedor) {
  const c = await a.chamar('POST', '/cotacoes', { como, corpo: { pedido: pedidoAuto(), cliente } });
  expect(c.status, JSON.stringify(c.corpo)).toBe(201);
  const e = await a.chamar('POST', `/cotacoes/${c.corpo.id}/emitir`, { como });
  expect(e.status, JSON.stringify(e.corpo)).toBe(200);
  return c.corpo.id as string;
}

describe('motivo de perda em lista', () => {
  it('perda sem categoria é recusada', async () => {
    const id = await emitida();
    const r = await a.chamar('POST', `/cotacoes/${id}/desfecho`, { como: PESSOAS.vendedor, corpo: { resultado: 'perdida', motivo: 'Cliente achou caro.' } });
    expect(r.status).toBe(422);
    expect(r.corpo.erro.codigo).toBe('CATEGORIA_OBRIGATORIA');
  });

  it('categoria inexistente é recusada; "outro" exige texto de 10 caracteres', async () => {
    const id = await emitida();
    expect((await a.chamar('POST', `/cotacoes/${id}/desfecho`, { como: PESSOAS.vendedor, corpo: { resultado: 'perdida', categoria: 'clima' } })).corpo.erro.codigo).toBe('CATEGORIA_INVALIDA');
    expect((await a.chamar('POST', `/cotacoes/${id}/desfecho`, { como: PESSOAS.vendedor, corpo: { resultado: 'perdida', categoria: 'outro' } })).corpo.erro.codigo).toBe('TEXTO_OBRIGATORIO');
    expect((await a.chamar('POST', `/cotacoes/${id}/desfecho`, { como: PESSOAS.vendedor, corpo: { resultado: 'perdida', categoria: 'outro', motivo: 'curto' } })).corpo.erro.codigo).toBe('TEXTO_OBRIGATORIO');
    const ok = await a.chamar('POST', `/cotacoes/${id}/desfecho`, { como: PESSOAS.vendedor, corpo: { resultado: 'perdida', categoria: 'outro', motivo: 'Cliente fechou com o grupo dele.' } });
    expect(ok.status, JSON.stringify(ok.corpo)).toBe(200);
  });

  it('perda por preço guarda o concorrente; o texto é opcional', async () => {
    const id = await emitida();
    const r = await a.chamar('POST', `/cotacoes/${id}/desfecho`, {
      como: PESSOAS.vendedor,
      corpo: { resultado: 'perdida', categoria: 'preco_concorrente', concorrente: { nome: 'Assistência Concorrente S.A.', preco: 399.9 } },
    });
    expect(r.status, JSON.stringify(r.corpo)).toBe(200);
    const [c] = await a.sql<{ status: string; desfecho_categoria: string; desfecho_motivo: string | null; concorrente_nome: string; concorrente_preco: number }[]>`
      select status, desfecho_categoria, desfecho_motivo, concorrente_nome, concorrente_preco from public.cotacoes where id = ${id}`;
    expect(c).toMatchObject({ status: 'perdida', desfecho_categoria: 'preco_concorrente', desfecho_motivo: null, concorrente_nome: 'Assistência Concorrente S.A.', concorrente_preco: 399.9 });
  });

  it('concorrente informado em categoria que não pede é ignorado', async () => {
    const id = await emitida();
    await a.chamar('POST', `/cotacoes/${id}/desfecho`, { como: PESSOAS.vendedor, corpo: { resultado: 'perdida', categoria: 'prazo', concorrente: { nome: 'X', preco: 1 } } });
    const [c] = await a.sql<{ concorrente_nome: string | null; concorrente_preco: number | null }[]>`select concorrente_nome, concorrente_preco from public.cotacoes where id = ${id}`;
    expect(c).toEqual({ concorrente_nome: null, concorrente_preco: null });
  });

  it('o banco também recusa perda sem categoria e "outro" sem texto', async () => {
    const id = await emitida();
    await expect(a.sql`update public.cotacoes set status = 'perdida', desfecho_motivo = 'Preço' where id = ${id}`).rejects.toThrow(/categoria do motivo da perda é obrigatória/);
    await expect(a.sql`update public.cotacoes set status = 'perdida', desfecho_categoria = 'outro' where id = ${id}`).rejects.toThrow(/exige o texto/);
  });

  it('a lista vem da configuração da organização e o administrador pode trocá-la', async () => {
    const id = await emitida();
    const nova = [
      { codigo: 'preco_concorrente', nome: 'Preço', pedeTexto: false, pedeConcorrente: true, ativo: true },
      { codigo: 'prazo', nome: 'Prazo', pedeTexto: false, pedeConcorrente: false, ativo: false },
      { codigo: 'outro', nome: 'Outro', pedeTexto: true, pedeConcorrente: false, ativo: true },
    ];
    const put = await a.chamar('PUT', '/organizacao/config', { como: PESSOAS.admin, corpo: { motivosPerda: nova } });
    expect(put.status, JSON.stringify(put.corpo)).toBe(200);
    expect(put.corpo.config.motivosPerda).toEqual(nova);
    expect((await a.chamar('POST', `/cotacoes/${id}/desfecho`, { como: PESSOAS.vendedor, corpo: { resultado: 'perdida', categoria: 'prazo' } })).corpo.erro.codigo).toBe('CATEGORIA_INVALIDA');
    expect((await a.chamar('POST', `/cotacoes/${id}/desfecho`, { como: PESSOAS.vendedor, corpo: { resultado: 'perdida', categoria: 'preco_concorrente' } })).status).toBe(200);
  });

  it('o canal registra perda só nas próprias cotações', async () => {
    const minha = await emitida(PESSOAS.canal);
    const alheia = await emitida(PESSOAS.vendedor);
    expect((await a.chamar('POST', `/cotacoes/${alheia}/desfecho`, { como: PESSOAS.canal, corpo: { resultado: 'perdida', categoria: 'outro', motivo: 'Teste de escopo do canal.' } })).status).toBe(403);
    expect((await a.chamar('POST', `/cotacoes/${minha}/desfecho`, { como: PESSOAS.canal, corpo: { resultado: 'perdida', categoria: 'preco_concorrente' } })).status).toBe(200);
  });
});

describe('migração das perdas antigas', () => {
  it('perdas gravadas antes da migração recebem a categoria "outro" com o texto preservado', async () => {
    // reproduz o estado anterior: uma perda só com texto, gravada com os gatilhos desligados
    const id = await emitida();
    await a.sql.begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      await tx`update public.cotacoes set status = 'perdida', desfecho_motivo = 'Preço (registro antigo)', desfecho_categoria = null where id = ${id}`;
    });
    const fs = await import('node:fs');
    const sqlMigracao = fs.readFileSync(new URL('../../../migrations/20261118000300_desfecho.sql', import.meta.url), 'utf8');
    const preenchimento = sqlMigracao.slice(sqlMigracao.indexOf('alter table public.cotacoes disable trigger'), sqlMigracao.indexOf('create index'));
    await a.sql.unsafe(preenchimento);
    const [c] = await a.sql<{ desfecho_categoria: string; desfecho_motivo: string }[]>`select desfecho_categoria, desfecho_motivo from public.cotacoes where id = ${id}`;
    expect(c).toEqual({ desfecho_categoria: 'outro', desfecho_motivo: 'Preço (registro antigo)' });
    const [t] = await a.sql<{ ativo: string }[]>`select tgenabled as ativo from pg_trigger where tgname = 'cotacoes_transicao'`;
    expect(t!.ativo).toBe('O');
  });
});
