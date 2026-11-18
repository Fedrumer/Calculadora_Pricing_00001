// Isolamento por cliente e por perfil, exercitado como o navegador faria: com o papel
// authenticated (ou anon) e o JWT de cada usuário, contra o RLS de verdade.
// A base é a empresa fictícia inteira, então o teste também confere a demonstração.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { carregar, claims, criarUsuario, instalarDemo } from '../src/apoio.ts';
import { type Sql, conectar, recriarBanco } from '../src/banco.ts';
import { chamar } from '../src/emulador.ts';

const URL_BANCO = process.env.DATABASE_URL_TESTE ?? 'postgresql://pricing:pricing@127.0.0.1:5432/diagnostico_teste_acesso';
let sql: Sql;
let consultor: string, leitor: string, editor: string, leitorOutro: string;
let diag: string, cliente: string, outroCliente: string;

/** Consulta direta a uma tabela, como o navegador faria pelo PostgREST. */
async function ler(usuario: string | null, texto: string): Promise<any[]> {
  let linhas: any[] = [];
  await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify(usuario ? claims(usuario) : { role: 'anon' })}, true)`;
    await tx.unsafe(`set local role ${usuario ? 'authenticated' : 'anon'}`);
    linhas = await tx.unsafe(texto);
  });
  return linhas;
}
const negado = (p: Promise<unknown>, padrao = /permission denied|Apenas o consultor/) => assert.rejects(p, padrao);

before(async () => {
  await recriarBanco(URL_BANCO);
  sql = conectar(URL_BANCO);
  consultor = await criarUsuario(sql, { email: 'consultor@teste.local', senha: 'Senha-de-teste-1', nome: 'Consultor', perfil: 'consultor' });
  ({ diagnostico: diag, cliente } = await instalarDemo(sql, consultor));
  outroCliente = await chamar<string>(sql, claims(consultor), 'criar_cliente', { p_nome: 'Outro cliente' });
  leitor = await criarUsuario(sql, { email: 'leitor@teste.local', senha: 'Senha-de-teste-1', nome: 'Leitor', perfil: 'cliente_leitor', cliente });
  editor = await criarUsuario(sql, { email: 'editor@teste.local', senha: 'Senha-de-teste-1', nome: 'Editor', perfil: 'cliente_editor', cliente });
  leitorOutro = await criarUsuario(sql, { email: 'leitor@outro.local', senha: 'Senha-de-teste-1', nome: 'Leitor de fora', perfil: 'cliente_leitor', cliente: outroCliente });
});
after(async () => sql?.end());

test('a demonstração calcula as três dimensões, gera achados e três cenários com ganho', async () => {
  const p = await chamar(sql, claims(consultor), 'painel', { p_diagnostico: diag });
  for (const d of ['realizacao', 'margem', 'dispersao', 'geral']) {
    const nota = p.pontuacoes.find((x: any) => x.dimensao === d)?.nota;
    assert.ok(nota >= 0 && nota <= 100, `${d}: ${nota}`);
  }
  const regras = p.achados.map((a: any) => a.regra);
  for (const r of ['contas_pequenas_desconto_alto', 'preco_abaixo_do_piso', 'margem_negativa', 'margem_baixa', 'desconto_sem_relacao_com_volume']) assert.ok(regras.includes(r), `faltou o achado ${r}`);
  for (const a of p.achados) if (a.alavanca) assert.ok(a.valor_exposto > 0, a.regra);
  const ganhos = p.cenarios.map((c: any) => c.ganho_total_anual);
  assert.ok(ganhos[0] > 0 && ganhos[0] < ganhos[1] && ganhos[1] < ganhos[2], ganhos.join(' < '));
  // números de referência da empresa fictícia (plano v3, seção 2): não podem mudar entre pacotes
  assert.equal(p.pontuacoes.find((x: any) => x.dimensao === 'geral').nota, 66.4);
  assert.deepEqual(ganhos.map((g: number) => Math.round(g)), [18031, 52147, 108883]);
  assert.equal(p.diagnostico.segmento, 'distribuicao');
  assert.equal(p.diagnostico.versao_catalogo, 2);
  assert.equal(p.pontuacoes.find((x: any) => x.dimensao === 'geral').detalhe.dimensoes_do_catalogo, 7);
  assert.ok(!p.metricas.some((m: any) => ['cambio', 'capacidade'].includes(m.dimensao)), 'métrica de turismo apareceu na distribuição');
  for (const c of p.cenarios) assert.equal(c.alavancas.length, 2);
  // a cascata fecha
  const lista = p.cascata[0].valor, pocket = p.cascata.at(-1).valor;
  const quedas = p.cascata.filter((c: any) => c.tipo === 'queda').reduce((s: number, c: any) => s + c.valor, 0);
  assert.ok(Math.abs(lista - quedas - pocket) < 1, `${lista} - ${quedas} != ${pocket}`);
  // a sujeira dos arquivos foi contada
  const v = Object.fromEntries(p.validacoes.map((x: any) => [x.regra, x.ocorrencias]));
  assert.equal(v.valor_zerado_ou_negativo, 40);
  assert.equal(v.campos_obrigatorios, 10);
  assert.ok(v.duplicatas >= 25);
  assert.ok(v.produto_sem_custo > 0);
});

test('visitante sem sessão não executa função nem lê tabela', async () => {
  await negado(chamar(sql, null, 'listar_diagnosticos'));
  await negado(chamar(sql, null, 'painel', { p_diagnostico: diag }));
  await negado(ler(null, 'select count(*) from public.transacoes'));
});

test('antes da publicação o cliente não vê nada', async () => {
  assert.equal(await chamar(sql, claims(leitor), 'painel', { p_diagnostico: diag }), null);
  assert.deepEqual(await chamar(sql, claims(leitor), 'listar_diagnosticos'), []);
});

test('publicado: o leitor vê o painel do próprio cliente e só ele', async () => {
  assert.equal(await chamar(sql, claims(consultor), 'publicar_diagnostico', { p_diagnostico: diag }), 1);
  const p = await chamar(sql, claims(leitor), 'painel', { p_diagnostico: diag });
  assert.equal(p.publicacao.versao, 1);
  assert.equal(p.diagnostico.status, 'publicado');
  assert.ok(p.cenarios.length === 3 && p.cascata.length > 3);
  assert.equal((await chamar(sql, claims(leitor), 'listar_diagnosticos')).length, 1);

  assert.equal(await chamar(sql, claims(leitorOutro), 'painel', { p_diagnostico: diag }), null);
  assert.deepEqual(await chamar(sql, claims(leitorOutro), 'listar_diagnosticos'), []);
});

test('perfis do cliente não leem a base, o resultado bruto nem o catálogo direto nas tabelas', async () => {
  for (const u of [leitor, editor, leitorOutro]) {
    for (const t of ['transacoes', 'custos', 'contas', 'metricas_resultado', 'achados', 'cenario_resultado', 'regras_achado', 'auditoria']) {
      assert.equal((await ler(u, `select count(*)::int as n from public.${t}`))[0].n, 0, `${t}`);
    }
  }
  assert.equal((await ler(leitorOutro, 'select count(*)::int as n from public.publicacoes'))[0].n, 0);
  assert.equal((await ler(leitor, 'select count(*)::int as n from public.publicacoes'))[0].n, 1);
  assert.equal((await ler(leitor, 'select count(*)::int as n from public.clientes'))[0].n, 1);
  assert.equal((await ler(leitor, 'select count(*)::int as n from public.uploads'))[0].n, 0);
  assert.equal((await ler(editor, 'select count(*)::int as n from public.uploads'))[0].n, 6);
  assert.ok((await ler(consultor, 'select count(*)::int as n from public.transacoes'))[0].n > 10000);
});

test('ninguém escreve direto nas tabelas, nem o consultor', async () => {
  await negado(ler(consultor, `update public.metricas_resultado set valor = 0`));
  await negado(ler(consultor, `delete from public.auditoria`));
  await negado(ler(leitor, `insert into public.clientes (nome) values ('x')`));
  await negado(ler(consultor, `select * from motor.fato limit 1`));
});

test('perfis do cliente não carregam, calculam, simulam nem publicam', async () => {
  for (const u of [leitor, editor]) {
    await negado(chamar(sql, claims(u), 'calcular_diagnostico', { p_diagnostico: diag }));
    await negado(chamar(sql, claims(u), 'iniciar_upload', { p_diagnostico: diag, p_bloco: 'custos', p_nome_arquivo: 'x.csv' }));
    await negado(chamar(sql, claims(u), 'simular', { p_diagnostico: diag, p_premissas: {} }));
    await negado(chamar(sql, claims(u), 'publicar_diagnostico', { p_diagnostico: diag }));
    await negado(chamar(sql, claims(u), 'criar_cliente', { p_nome: 'x' }));
  }
});

test('recarga e recálculo não mudam a versão publicada; publicar de novo gera a versão 2', async () => {
  const antes = await chamar(sql, claims(leitor), 'painel', { p_diagnostico: diag });
  // nova carga de custos, 30% mais altos: a margem cai no cálculo corrente
  const custos = await ler(consultor, `select produto, custo_unitario * 1.3 as custo_unitario, vigencia_inicio from public.custos where diagnostico_id = '${diag}'`);
  await carregar(sql, consultor, diag, 'custos', custos);
  assert.equal((await ler(consultor, `select status from public.diagnosticos where id = '${diag}'`))[0].status, 'publicado');
  await chamar(sql, claims(consultor), 'calcular_diagnostico', { p_diagnostico: diag });

  const margem = (p: any) => p.metricas.find((m: any) => m.codigo === 'margem_pocket_pct').valor;
  const corrente = await chamar(sql, claims(consultor), 'painel', { p_diagnostico: diag });
  const publicado = await chamar(sql, claims(leitor), 'painel', { p_diagnostico: diag });
  assert.ok(margem(corrente) < margem(antes) - 5);
  assert.equal(margem(publicado), margem(antes));
  assert.equal(publicado.publicacao.versao, 1);

  assert.equal(await chamar(sql, claims(consultor), 'publicar_diagnostico', { p_diagnostico: diag }), 2);
  assert.equal(margem(await chamar(sql, claims(leitor), 'painel', { p_diagnostico: diag })), margem(corrente));
});

test('toda carga, cálculo, alteração de premissa e publicação fica na auditoria', async () => {
  const acoes = (await ler(consultor, `select acao, count(*)::int as n from public.auditoria where diagnostico_id = '${diag}' group by acao`));
  const n = Object.fromEntries(acoes.map((a) => [a.acao, a.n]));
  assert.equal(n.carga_concluida, 7);
  assert.equal(n.calculo, 2);
  assert.equal(n.publicacao, 2);
  assert.equal(n.diagnostico_criado, 1);
});
