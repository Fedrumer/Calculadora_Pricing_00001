import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Ambiente, PESSOAS, cliente, criarAmbiente, pedidoAuto } from './apoio.ts';

// Teste de autorização no banco: tenta ler e gravar como cada perfil, do jeito
// que o navegador faria (papel "authenticated" + declarações do token).
let a: Ambiente;
let cotVendedor: string;
let cotCanal: string;

beforeAll(async () => {
  a = await criarAmbiente();
  const v = await a.chamar('POST', '/cotacoes', { como: PESSOAS.vendedor, corpo: { pedido: pedidoAuto({ canal: 'corretora-alfa' }), cliente } });
  const k = await a.chamar('POST', '/cotacoes', { como: PESSOAS.canal, corpo: { pedido: pedidoAuto(), cliente } });
  cotVendedor = v.corpo.id;
  cotCanal = k.corpo.id;
  await a.chamar('POST', `/cotacoes/${cotVendedor}/emitir`, { como: PESSOAS.vendedor });
});
afterAll(() => a.fechar());

type Linhas = Record<string, unknown>[];

async function como<T>(email: string | null, aal: 'aal1' | 'aal2', consulta: (tx: any) => Promise<T>): Promise<T> {
  let saida!: T;
  await a.sql
    .begin(async (tx) => {
      const sub = email ? a.usuarios.get(email) : null;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify(sub ? { sub, role: 'authenticated', aal } : { role: 'anon' })}, true)`;
      await tx.unsafe(`set local role ${sub ? 'authenticated' : 'anon'}`);
      saida = await consulta(tx);
      throw new Error('desfazer');
    })
    .catch((e: Error) => {
      if (e.message !== 'desfazer') throw e;
    });
  return saida;
}

const conta = async (email: string | null, aal: 'aal1' | 'aal2', tabela: string): Promise<number> =>
  como(email, aal, async (tx) => ((await tx.unsafe(`select count(*)::int as n from public.${tabela}`)) as { n: number }[])[0]!.n);

describe('estrutura', () => {
  it('RLS está ativo em 100% das tabelas', async () => {
    const sem = await a.sql<{ relname: string }[]>`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`;
    expect(sem.map((s) => s.relname)).toEqual([]);
  });

  it('nenhuma tabela aceita escrita do navegador', async () => {
    const grants = await a.sql<{ table_name: string; privilege_type: string }[]>`
      select table_name, privilege_type from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type <> 'SELECT'`;
    expect(grants).toEqual([]);
    const anon = await a.sql`select 1 from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon'`;
    expect(anon).toHaveLength(0);
  });

  it('toda tabela com dados da organização tem org_id', async () => {
    const sem = await a.sql<{ table_name: string }[]>`
      select t.table_name from information_schema.tables t
      where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
        and t.table_name not in ('limites_requisicao', 'metricas_api')
        and not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = t.table_name and c.column_name = 'org_id')`;
    expect(sem.map((s) => s.table_name)).toEqual([]);
  });
});

describe('visitante sem sessão', () => {
  it('não lê nada', async () => {
    for (const tabela of ['cotacoes', 'produtos', 'usuarios', 'politicas']) {
      await expect(conta(null, 'aal1', tabela), tabela).rejects.toThrow(/permission denied/);
    }
  });
});

describe('usuário de canal', () => {
  it('não alcança custo, margem, política nem tabela de preço', async () => {
    for (const tabela of ['cotacao_versoes', 'parametros_custo', 'politicas', 'tabelas_preco', 'itens_tabela', 'fatores', 'campanhas', 'casos_referencia', 'eventos_auditoria']) {
      expect(await conta(PESSOAS.canal, 'aal1', tabela), tabela).toBe(0);
    }
  });

  it('lê as próprias cotações pela visão sem colunas de margem', async () => {
    expect(await conta(PESSOAS.canal, 'aal1', 'cotacoes')).toBe(1);
    const linhas = await como(PESSOAS.canal, 'aal1', (tx) => tx`select * from public.v_cotacao_versoes` as Promise<Linhas>);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.cotacao_id).toBe(cotCanal);
    expect(Object.keys(linhas[0]!)).not.toEqual(expect.arrayContaining(['margem_valor', 'margem_pct', 'resultado_publico']));
    expect(JSON.stringify(linhas[0])).not.toMatch(/margem|custosValor|impostosValor|Imposto|Custo/i);
  });

  it('enxerga só o próprio canal e o catálogo para cotar', async () => {
    const canais = await como(PESSOAS.canal, 'aal1', (tx) => tx`select codigo from public.canais` as Promise<Linhas>);
    expect(canais.map((c) => c.codigo)).toEqual(['corretora-alfa']);
    expect(await conta(PESSOAS.canal, 'aal1', 'produtos')).toBe(3);
    expect(await conta(PESSOAS.canal, 'aal1', 'usuarios')).toBe(1);
  });

  it('não grava em nenhuma tabela nem chama o painel', async () => {
    await expect(como(PESSOAS.canal, 'aal1', (tx) => tx`update public.cotacoes set status = 'emitida' where id = ${cotCanal}`)).rejects.toThrow(/permission denied/);
    await expect(como(PESSOAS.canal, 'aal1', (tx) => tx`insert into public.eventos_auditoria (acao) values ('x')`)).rejects.toThrow(/permission denied/);
    await expect(como(PESSOAS.canal, 'aal1', (tx) => tx`select public.painel_indicadores(current_date - 30, current_date)`)).rejects.toThrow(/Sem permissão/);
    await expect(como(PESSOAS.canal, 'aal1', (tx) => tx`select app.registrar_evento(${a.orgId}, 'x', 'y', 'z')`)).rejects.toThrow(/permission denied/);
    await expect(como(PESSOAS.canal, 'aal1', (tx) => tx`select * from public.convites`)).rejects.toThrow(/permission denied/);
    await expect(como(PESSOAS.canal, 'aal1', (tx) => tx`select * from public.cotacao_dados_pessoais`)).rejects.toThrow(/permission denied/);
    await expect(como(PESSOAS.canal, 'aal1', (tx) => tx`select * from public.chaves_api`)).rejects.toThrow(/permission denied/);
  });
});

describe('vendedor', () => {
  it('vê só as próprias cotações, com a margem delas, e nunca os parâmetros de custo', async () => {
    const cotacoes = await como(PESSOAS.vendedor, 'aal1', (tx) => tx`select id from public.cotacoes` as Promise<Linhas>);
    expect(cotacoes.map((c) => c.id)).toEqual([cotVendedor]);
    const versoes = await como(PESSOAS.vendedor, 'aal1', (tx) => tx`select cotacao_id, margem_pct from public.cotacao_versoes` as Promise<Linhas>);
    expect(versoes).toHaveLength(1);
    expect(versoes[0]!.margem_pct).toBeGreaterThan(0);
    expect(await conta(PESSOAS.vendedor, 'aal1', 'parametros_custo')).toBe(0);
    expect(await conta(PESSOAS.vendedor, 'aal1', 'politicas')).toBe(0);
    expect(await conta(PESSOAS.vendedor, 'aal1', 'tabelas_preco')).toBe(1);
    expect(await conta(PESSOAS.vendedorSul, 'aal1', 'cotacoes')).toBe(0);
  });

  it('acompanha a linha do tempo da própria cotação, sem valores internos', async () => {
    const linha = await como(PESSOAS.vendedor, 'aal1', (tx) => tx`select acao, ator_nome, resumo from public.v_linha_do_tempo order by ocorrido_em, id` as Promise<Linhas>);
    expect(linha.map((l) => l.acao)).toEqual(['cotacao.criada', 'cotacao.emitida']);
    expect(linha[0]!.ator_nome).toBe('Vera Vendedora');
    expect(await conta(PESSOAS.vendedorSul, 'aal1', 'v_linha_do_tempo')).toBe(0);
  });
});

describe('perfis com segundo fator obrigatório', () => {
  it('com um fator só, não enxergam nada; com dois, enxergam o que o perfil permite', async () => {
    for (const email of [PESSOAS.admin, PESSOAS.pricing, PESSOAS.diretoria, PESSOAS.financeiro]) {
      expect(await conta(email, 'aal1', 'cotacoes'), email).toBe(0);
      expect(await conta(email, 'aal1', 'usuarios'), email).toBe(0);
      expect(await conta(email, 'aal1', 'v_cotacao_versoes'), email).toBe(0);
      expect(await conta(email, 'aal2', 'cotacoes'), email).toBe(2);
    }
    expect(await conta(PESSOAS.pricing, 'aal2', 'parametros_custo')).toBe(6);
    expect(await conta(PESSOAS.pricing, 'aal1', 'parametros_custo')).toBe(0);
    await expect(como(PESSOAS.pricing, 'aal1', (tx) => tx`select public.painel_indicadores(current_date - 30, current_date)`)).rejects.toThrow(/Sem permissão/);
  });

  it('auditoria só para administrador, leitura e suporte', async () => {
    expect(await conta(PESSOAS.admin, 'aal2', 'eventos_auditoria')).toBeGreaterThan(10);
    expect(await conta(PESSOAS.financeiro, 'aal2', 'eventos_auditoria')).toBeGreaterThan(10);
    expect(await conta(PESSOAS.pricing, 'aal2', 'eventos_auditoria')).toBe(0);
    expect(await conta(PESSOAS.diretoria, 'aal2', 'eventos_auditoria')).toBe(0);
  });

  it('nem o gestor de pricing grava regra direto no banco', async () => {
    await expect(como(PESSOAS.pricing, 'aal2', (tx) => tx`update public.politicas set regras = '{}'::jsonb`)).rejects.toThrow(/permission denied/);
    await expect(como(PESSOAS.admin, 'aal2', (tx) => tx`insert into public.usuario_papel (org_id, usuario_id, papel) values (${a.orgId}, ${a.usuarios.get(PESSOAS.vendedor)!}, 'admin')`)).rejects.toThrow(/permission denied/);
  });

  it('o painel devolve os indicadores para perfis internos', async () => {
    const [p] = await como(PESSOAS.pricing, 'aal2', (tx) => tx`select public.painel_indicadores(current_date - 30, current_date) as p` as Promise<Linhas>);
    const painel = p!.p as { resumo: { emitidas: number }; porCanal: unknown[] };
    expect(painel.resumo.emitidas).toBe(1);
    expect(painel.porCanal).toHaveLength(1);
    const [e] = await como(PESSOAS.admin, 'aal2', (tx) => tx`select public.prova_eficiencia() as e` as Promise<Linhas>);
    expect((e!.e as { foraDaPoliticaSemAprovacao: number }).foraDaPoliticaSemAprovacao).toBe(0);
  });
});

describe('usuário desativado e acesso vencido', () => {
  it('perdem a leitura na hora', async () => {
    await a.sql`update public.usuarios set status = 'suspenso' where email = ${PESSOAS.vendedor}`;
    expect(await conta(PESSOAS.vendedor, 'aal1', 'cotacoes')).toBe(0);
    expect(await conta(PESSOAS.vendedor, 'aal1', 'produtos')).toBe(0);
    await a.sql`update public.usuarios set status = 'ativo' where email = ${PESSOAS.vendedor}`;

    await a.sql`update public.usuario_papel set valido_ate = now() - interval '1 hour' where usuario_id = ${a.usuarios.get(PESSOAS.suporte)!}`;
    expect(await conta(PESSOAS.suporte, 'aal2', 'cotacoes')).toBe(0);
    expect(await conta(PESSOAS.suporte, 'aal2', 'parametros_custo')).toBe(0);
  });
});
