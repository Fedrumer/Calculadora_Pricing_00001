import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ServicoIA } from '../src/contexto.ts';
import { mascararTexto } from '../src/ia.ts';
import { type Ambiente, PESSOAS, SEGREDO_AUTOMACAO, cliente, criarAmbiente, pedidoAuto } from './apoio.ts';

let a: Ambiente;
const enviadoParaIA: string[] = [];
const iaFalsa: ServicoIA = {
  disponivel: true,
  modelo: 'modelo-de-teste',
  async gerar({ sistema, mensagem }) {
    enviadoParaIA.push(mensagem);
    if (sistema.includes('contrapropostas')) {
      return {
        texto: JSON.stringify({
          sugestoes: [
            { titulo: 'Desconto dentro do limite', justificativa: 'Fica na emissão direta.', pedido: { ...pedidoAuto({ descontoPct: 5 }) } },
            { titulo: 'Produto inexistente', justificativa: 'Deve ser descartada pelo motor.', pedido: { produto: 'AUTO24', dimensoes: { plano: 'ouro' } } },
          ],
        }),
      };
    }
    if (sistema.includes('rascunho')) {
      return { texto: '```json\n' + JSON.stringify({ pedido: { produto: 'PET', componentes: [], dimensoes: { plano: 'premium', regiao: 'sul', unidades: 2, meses: 12 } }, duvidas: ['Confirmar a raça dos animais.'] }) + '\n```' };
    }
    return { texto: 'O preço partiu da tabela e recebeu o fator de idade do veículo.', tokensEntrada: 100, tokensSaida: 20 };
  },
};

beforeAll(async () => {
  a = await criarAmbiente({ ia: iaFalsa });
});
afterAll(() => a.fechar());

const automacao = { 'x-automacao-segredo': SEGREDO_AUTOMACAO };

describe('inclusão de usuário por convite', () => {
  let link: string;
  it('o administrador convida com papel e escopo; o banco guarda só o hash do token', async () => {
    expect((await a.chamar('POST', '/usuarios/convites', { como: PESSOAS.vendedor, corpo: { email: 'x@y.com', papel: 'vendedor' } })).status).toBe(403);
    expect((await a.chamar('POST', '/usuarios/convites', { como: PESSOAS.admin, corpo: { email: 'x@y.com', papel: 'canal' } })).status).toBe(422);

    const r = await a.chamar('POST', '/usuarios/convites', { como: PESSOAS.admin, corpo: { email: 'Novo.Vendedor@Aurora.demo', nome: 'Nina Nova', papel: 'vendedor', unidade: 'sul' } });
    expect(r.status, JSON.stringify(r.corpo)).toBe(201);
    link = r.corpo.link;
    const token = new URL(link).searchParams.get('token')!;
    const [c] = await a.sql<{ token_hash: string; horas: number; email: string }[]>`
      select token_hash, round(extract(epoch from (expira_em - criado_em)) / 3600)::int as horas, email from public.convites where id = ${r.corpo.id}`;
    expect(c!.token_hash).not.toBe(token);
    expect(c!.horas).toBe(72);
    expect(c!.email).toBe('novo.vendedor@aurora.demo');
    const [saida] = await a.sql<{ carga: { link: string } }[]>`select carga from public.eventos_saida where tipo = 'convite.criado' order by id desc limit 1`;
    expect(saida!.carga.link).toBe(link);
  });

  it('o convidado define a senha, aceita os termos e entra já com o papel', async () => {
    const token = new URL(link).searchParams.get('token')!;
    const ver = await a.chamar('GET', `/convites/${token}`);
    expect(ver.corpo).toMatchObject({ email: 'novo.vendedor@aurora.demo', papel: 'Vendedor', exigeSegundoFator: false });

    const fraca = await a.chamar('POST', '/convites/aceitar', { corpo: { token, nome: 'Nina Nova', senha: 'curta', aceiteTermos: true } });
    expect(fraca.status).toBe(422);
    const semTermos = await a.chamar('POST', '/convites/aceitar', { corpo: { token, nome: 'Nina Nova', senha: 'SenhaBemForte2026', aceiteTermos: false } });
    expect(semTermos.status).toBe(422);

    const ok = await a.chamar('POST', '/convites/aceitar', { corpo: { token, nome: 'Nina Nova', senha: 'SenhaBemForte2026', aceiteTermos: true } });
    expect(ok.status, JSON.stringify(ok.corpo)).toBe(201);
    const [u] = await a.sql<{ id: string; aceite_termos_em: Date; papel: string; unidade: string }[]>`
      select u.id, u.aceite_termos_em, up.papel, n.codigo as unidade
      from public.usuarios u join public.usuario_papel up on up.usuario_id = u.id join public.unidades n on n.id = up.unidade_id
      where u.email = 'novo.vendedor@aurora.demo'`;
    expect(u).toMatchObject({ papel: 'vendedor', unidade: 'sul' });
    expect(u!.aceite_termos_em).toBeInstanceOf(Date);
    a.usuarios.set('nina', u!.id);

    // token de uso único
    expect((await a.chamar('POST', '/convites/aceitar', { corpo: { token, nome: 'Outra', senha: 'SenhaBemForte2026', aceiteTermos: true } })).status).toBe(404);
    expect((await a.chamar('GET', `/convites/${token}`)).status).toBe(404);
    expect((await a.chamar('POST', '/cotacoes/simular', { como: 'nina', corpo: pedidoAuto() })).status).toBe(200);

    const trilha = await a.sql<{ acao: string }[]>`select acao from public.eventos_auditoria where acao like 'usuario.%' order by id`;
    expect(trilha.map((t) => t.acao)).toEqual(expect.arrayContaining(['usuario.convidado', 'usuario.convite_aceito']));
  });

  it('convite vencido não entra', async () => {
    const r = await a.chamar('POST', '/usuarios/convites', { como: PESSOAS.admin, corpo: { email: 'atrasado@aurora.demo', papel: 'leitura' } });
    await a.sql`update public.convites set expira_em = now() - interval '1 minute' where id = ${r.corpo.id}`;
    const token = new URL(r.corpo.link).searchParams.get('token')!;
    expect((await a.chamar('POST', '/convites/aceitar', { corpo: { token, nome: 'Atrasado', senha: 'SenhaBemForte2026', aceiteTermos: true } })).status).toBe(404);
  });

  it('responsável de canal convida só para o próprio canal, e só se habilitado', async () => {
    const proprio = await a.chamar('POST', '/usuarios/convites', { como: PESSOAS.canal, corpo: { email: 'colega@corretora-alfa.demo', papel: 'canal', canal: 'corretora-alfa' } });
    expect(proprio.status, JSON.stringify(proprio.corpo)).toBe(201);
    expect((await a.chamar('POST', '/usuarios/convites', { como: PESSOAS.canal, corpo: { email: 'z@z.com', papel: 'canal', canal: 'agencia-beta' } })).status).toBe(403);
    expect((await a.chamar('POST', '/usuarios/convites', { como: PESSOAS.canal, corpo: { email: 'z@z.com', papel: 'vendedor' } })).status).toBe(403);
    // Agência Beta não tem convite habilitado
    expect((await a.chamar('POST', '/usuarios/convites', { como: PESSOAS.canalBeta, corpo: { email: 'z@z.com', papel: 'canal', canal: 'agencia-beta' } })).status).toBe(403);
  });
});

describe('ciclo de vida do usuário', () => {
  it('desativar exige indicar quem assume as cotações em aberto; o acesso cai na hora', async () => {
    const c = await a.chamar('POST', '/cotacoes', { como: PESSOAS.vendedorSul, corpo: { pedido: pedidoAuto(), cliente } });
    const id = a.usuarios.get(PESSOAS.vendedorSul)!;
    const sem = await a.chamar('PATCH', `/usuarios/${id}`, { como: PESSOAS.admin, corpo: { status: 'desativado', motivo: 'Desligamento' } });
    expect(sem.status).toBe(409);
    expect(sem.corpo.erro.codigo).toBe('TRANSFERENCIA_NECESSARIA');

    const ok = await a.chamar('PATCH', `/usuarios/${id}`, { como: PESSOAS.admin, corpo: { status: 'desativado', motivo: 'Desligamento', transferirPara: a.usuarios.get(PESSOAS.vendedor) } });
    expect(ok.status, JSON.stringify(ok.corpo)).toBe(200);
    const [cot] = await a.sql<{ dono_id: string }[]>`select dono_id from public.cotacoes where id = ${c.corpo.id}`;
    expect(cot!.dono_id).toBe(a.usuarios.get(PESSOAS.vendedor));
    expect((await a.chamar('POST', '/cotacoes/simular', { como: PESSOAS.vendedorSul, corpo: pedidoAuto() })).status).toBe(401);
    // o histórico permanece: usuário nunca é excluído
    await expect(a.sql`delete from public.usuarios where id = ${id}`).rejects.toThrow(/não são excluídos/);
  });

  it('mudança de papel é auditada com o valor anterior', async () => {
    const id = a.usuarios.get(PESSOAS.financeiro)!;
    const r = await a.chamar('PATCH', `/usuarios/${id}`, { como: PESSOAS.admin, corpo: { papeis: [{ papel: 'leitura' }, { papel: 'aprovador' }], limiteAlcada: 1 } });
    expect(r.status, JSON.stringify(r.corpo)).toBe(200);
    const [e] = await a.sql<{ anterior: any[]; novo: any[] }[]>`select anterior, novo from public.eventos_auditoria where acao = 'usuario.papeis_alterados' order by id desc limit 1`;
    expect(e!.anterior.map((p) => p.papel)).toEqual(['leitura']);
    expect(e!.novo.map((p) => p.papel)).toEqual(['leitura', 'aprovador']);
  });

  it('ninguém altera o próprio acesso e a instalação nunca fica sem administrador', async () => {
    const id = a.usuarios.get(PESSOAS.admin)!;
    expect((await a.chamar('PATCH', `/usuarios/${id}`, { como: PESSOAS.admin, corpo: { status: 'desativado' } })).corpo.erro.codigo).toBe('PROPRIO_ACESSO');
    await a.sql`insert into public.usuario_papel (org_id, usuario_id, papel) values (${a.orgId}, ${a.usuarios.get(PESSOAS.pricing)!}, 'admin')`;
    const r = await a.chamar('PATCH', `/usuarios/${id}`, { como: PESSOAS.pricing, corpo: { papeis: [{ papel: 'leitura' }] } });
    expect(r.status).toBe(200);
    const ultimo = await a.chamar('PATCH', `/usuarios/${a.usuarios.get(PESSOAS.pricing)}`, { como: PESSOAS.admin, aal: 'aal2', corpo: { status: 'desativado' } });
    expect(ultimo.status).toBe(403); // o antigo admin já não é admin
    await a.sql`insert into public.usuario_papel (org_id, usuario_id, papel) values (${a.orgId}, ${id}, 'admin')`;
  });

  it('acesso da consultoria tem prazo e é renovado pelo administrador do cliente', async () => {
    const id = a.usuarios.get(PESSOAS.suporte)!;
    await a.sql`update public.usuario_papel set valido_ate = now() - interval '1 day' where usuario_id = ${id}`;
    expect((await a.chamar('POST', '/regras/casos-referencia/executar', { como: PESSOAS.suporte, corpo: {} })).status).toBe(403);
    expect((await a.chamar('POST', `/usuarios/${id}/renovar-acesso`, { como: PESSOAS.admin, corpo: { dias: 30 } })).status).toBe(200);
    expect((await a.chamar('POST', '/regras/casos-referencia/executar', { como: PESSOAS.suporte, corpo: {} })).status).toBe(200);
  });
});

describe('automações (n8n)', () => {
  it('exigem a credencial própria', async () => {
    expect((await a.chamar('POST', '/automacao/expirar-cotacoes')).status).toBe(401);
    expect((await a.chamar('POST', '/automacao/expirar-cotacoes', { cabecalhos: { 'x-automacao-segredo': 'errado' } })).status).toBe(401);
    expect((await a.chamar('POST', '/automacao/expirar-cotacoes', { como: PESSOAS.admin })).status).toBe(401);
  });

  it('expira cotações vencidas e avisa aprovações fora do prazo, com escalonamento', async () => {
    const c = await a.chamar('POST', '/cotacoes', { como: PESSOAS.vendedor, corpo: { pedido: pedidoAuto(), cliente } });
    await a.chamar('POST', `/cotacoes/${c.corpo.id}/emitir`, { como: PESSOAS.vendedor });
    await a.sql`update public.cotacoes set validade = current_date - 3 where id = ${c.corpo.id}`;
    const exp = await a.chamar('POST', '/automacao/expirar-cotacoes', { cabecalhos: automacao });
    expect(exp.corpo.numeros).toContain(c.corpo.numero);

    const p = await a.chamar('POST', '/cotacoes', { como: PESSOAS.vendedor, corpo: { pedido: pedidoAuto({ descontoPct: 8 }), cliente } });
    await a.chamar('POST', `/cotacoes/${p.corpo.id}/aprovacao`, { como: PESSOAS.vendedor, corpo: { acao: 'pedir', motivo: 'Pedido que vai atrasar.' } });
    await a.sql`update public.aprovacoes set criado_em = now() - interval '30 hours', prazo = now() - interval '6 hours' where cotacao_id = ${p.corpo.id}`;
    const l1 = await a.chamar('POST', '/automacao/lembretes-aprovacao', { cabecalhos: automacao });
    const lembrete = l1.corpo.avisos.find((x: any) => x.cotacaoId === p.corpo.id);
    expect(lembrete.tipo).toBe('lembrete');
    expect(lembrete.para).toEqual(expect.arrayContaining(['gestor@aurora.demo', 'diretoria@aurora.demo']));
    await a.sql`update public.aprovacoes set criado_em = now() - interval '80 hours', prazo = now() - interval '56 hours' where cotacao_id = ${p.corpo.id}`;
    const l2 = await a.chamar('POST', '/automacao/lembretes-aprovacao', { cabecalhos: automacao });
    const escalonado = l2.corpo.avisos.find((x: any) => x.cotacaoId === p.corpo.id);
    expect(escalonado.tipo).toBe('escalonamento');
    expect(escalonado.para).toEqual(['diretoria@aurora.demo']);
    expect((await a.chamar('POST', '/automacao/lembretes-aprovacao', { cabecalhos: automacao })).corpo.avisos).toEqual([]);
  });

  it('suspende contas inativas, entrega a caixa de saída e registra o backup', async () => {
    await a.sql`update public.usuarios set ultimo_acesso = now() - interval '120 days' where email = 'canal@agencia-beta.demo'`;
    const r = await a.chamar('POST', '/automacao/inatividade', { cabecalhos: automacao });
    expect(r.corpo.suspensos.map((s: any) => s.email)).toEqual(['canal@agencia-beta.demo']);
    expect((await a.chamar('POST', '/cotacoes/simular', { como: PESSOAS.canalBeta, corpo: pedidoAuto() })).status).toBe(401);

    const ev = await a.chamar('GET', '/automacao/eventos', { cabecalhos: automacao });
    expect(ev.corpo.eventos.length).toBeGreaterThan(0);
    const ids = ev.corpo.eventos.map((e: any) => e.id);
    await a.chamar('POST', '/automacao/eventos/confirmar', { cabecalhos: automacao, corpo: { ids } });
    expect((await a.chamar('GET', '/automacao/eventos', { cabecalhos: automacao })).corpo.eventos).toEqual([]);

    const saude1 = await a.chamar('GET', '/automacao/saude', { cabecalhos: automacao });
    expect(saude1.corpo.alertas.join(' ')).toMatch(/cópia externa/);
    await a.chamar('POST', '/automacao/registro-backup', { cabecalhos: automacao, corpo: { tipo: 'copia_externa', status: 'ok', duracaoSegundos: 12, tamanhoBytes: 123456, destino: 's3://cliente/copia.sql.gz.enc' } });
    const saude2 = await a.chamar('GET', '/automacao/saude', { cabecalhos: automacao });
    expect(saude2.corpo.alertas.join(' ')).not.toMatch(/cópia externa/);
  });

  it('monta o relatório mensal e a revisão de acessos', async () => {
    const rel = await a.chamar('GET', '/automacao/relatorio-mensal?ia=nao', { cabecalhos: automacao });
    expect(rel.status, JSON.stringify(rel.corpo)).toBe(200);
    expect(rel.corpo.indicadores.resumo.emitidas).toBeGreaterThan(0);
    expect(rel.corpo.para.length).toBeGreaterThan(0);
    const rev = await a.chamar('GET', '/automacao/revisao-acessos', { cabecalhos: automacao });
    expect(rev.corpo.usuarios.length).toBeGreaterThan(5);
  });
});

describe('LGPD', () => {
  it('localiza o titular pelo documento, mostra mascarado e anonimiza cotações encerradas', async () => {
    const c = await a.chamar('POST', '/cotacoes', { como: PESSOAS.vendedor, corpo: { pedido: pedidoAuto(), cliente: { nome: 'Maria Titular', email: 'maria@titular.teste', documento: '987.654.321-00' } } });
    expect((await a.chamar('POST', '/lgpd/localizar', { como: PESSOAS.vendedor, corpo: { documento: '98765432100' } })).status).toBe(403);
    const achou = await a.chamar('POST', '/lgpd/localizar', { como: PESSOAS.admin, corpo: { documento: '987.654.321-00' } });
    expect(achou.corpo.total).toBe(1);
    expect(achou.corpo.cotacoes[0]).toMatchObject({ clienteNome: 'Maria Titular', documento: '*********00' });

    const aberta = await a.chamar('POST', '/lgpd/anonimizar', { como: PESSOAS.admin, corpo: { cotacaoIds: [c.corpo.id], motivo: 'Pedido do titular' } });
    expect(aberta.corpo.erro.codigo).toBe('COTACOES_EM_ABERTO');
    await a.chamar('POST', `/cotacoes/${c.corpo.id}/cancelar`, { como: PESSOAS.vendedor });
    const feita = await a.chamar('POST', '/lgpd/anonimizar', { como: PESSOAS.admin, corpo: { cotacaoIds: [c.corpo.id], motivo: 'Pedido do titular' } });
    expect(feita.corpo.anonimizadas).toBe(1);
    const [depois] = await a.sql<{ cliente_nome: string; cliente_email: string | null; n: number; preco: number }[]>`
      select c.cliente_nome, c.cliente_email, (select count(*)::int from public.cotacao_dados_pessoais p where p.cotacao_id = c.id) as n, v.preco_final as preco
      from public.cotacoes c join public.cotacao_versoes v on v.id = c.versao_atual_id where c.id = ${c.corpo.id}`;
    expect(depois).toMatchObject({ cliente_nome: 'Titular anonimizado', cliente_email: null, n: 0 });
    expect(depois!.preco).toBeGreaterThan(0); // os valores ficam para análise
  });
});

describe('camada de IA', () => {
  it('mascara dado pessoal antes do envio', () => {
    const t = mascararTexto('Sou João, CPF 123.456.789-09, joao@empresa.com.br, (11) 98765-4321, CNPJ 12.345.678/0001-90.');
    expect(t).not.toMatch(/123\.456|joao@|98765|12\.345\.678/);
    expect(t).toContain('[CPF]');
    expect(t).toContain('[e-mail]');
    expect(t).toContain('[telefone]');
    expect(t).toContain('[CNPJ]');
  });

  it('explica sem enviar nome nem documento do cliente, e registra a chamada', async () => {
    const c = await a.chamar('POST', '/cotacoes', { como: PESSOAS.vendedor, corpo: { pedido: pedidoAuto({ descontoPct: 8 }), cliente } });
    enviadoParaIA.length = 0;
    const r = await a.chamar('POST', '/ia/explicar', { como: PESSOAS.vendedor, corpo: { cotacaoId: c.corpo.id } });
    expect(r.status, JSON.stringify(r.corpo)).toBe(200);
    expect(r.corpo.explicacao).toContain('tabela');
    expect(enviadoParaIA.join(' ')).not.toMatch(/Cliente de Teste|12345678909|compras@cliente/);
    await new Promise((x) => setTimeout(x, 150));
    const [log] = await a.sql<{ tipo: string; tokens_entrada: number }[]>`select tipo, tokens_entrada from public.chamadas_ia order by id desc limit 1`;
    expect(log).toMatchObject({ tipo: 'explicar', tokens_entrada: 100 });

    // o canal não recebe margem nem na explicação
    const k = await a.chamar('POST', '/cotacoes', { como: PESSOAS.canal, corpo: { pedido: pedidoAuto(), cliente } });
    enviadoParaIA.length = 0;
    await a.chamar('POST', '/ia/explicar', { como: PESSOAS.canal, corpo: { cotacaoId: k.corpo.id } });
    expect(enviadoParaIA.join(' ')).not.toMatch(/margem|custosValor|Imposto/i);
  });

  it('toda sugestão é recalculada pelo motor; a que não calcula é descartada', async () => {
    const c = await a.chamar('POST', '/cotacoes', { como: PESSOAS.vendedor, corpo: { pedido: pedidoAuto({ descontoPct: 8 }), cliente } });
    const r = await a.chamar('POST', '/ia/sugerir', { como: PESSOAS.vendedor, corpo: { cotacaoId: c.corpo.id } });
    expect(r.status, JSON.stringify(r.corpo)).toBe(200);
    expect(r.corpo.sugestoes).toHaveLength(1);
    expect(r.corpo.sugestoes[0].resultado.veredito.status).toBe('dentro');
    expect(r.corpo.sugestoes[0].resultado.precoFinal).toBe(412.5); // 434,21 - 5%
  });

  it('lê um e-mail e devolve rascunho com prévia do motor, sem gravar nada', async () => {
    const antes = await a.sql<{ n: number }[]>`select count(*)::int as n from public.cotacoes`;
    enviadoParaIA.length = 0;
    const r = await a.chamar('POST', '/ia/ler', { como: PESSOAS.vendedor, corpo: { texto: 'Olá, sou a Ana (ana@cliente.com, CPF 111.222.333-44). Quero assistência pet premium para 2 cães, 12 meses, em Curitiba.' } });
    expect(r.status, JSON.stringify(r.corpo)).toBe(200);
    expect(r.corpo.rascunho.produto).toBe('PET');
    expect(r.corpo.previa.precoFinal).toBeGreaterThan(0);
    expect(enviadoParaIA.join(' ')).not.toMatch(/ana@cliente|111\.222/);
    expect((await a.sql<{ n: number }[]>`select count(*)::int as n from public.cotacoes`)[0]!.n).toBe(antes[0]!.n);
  });

  it('com o módulo de IA desligado a cotação segue normal', async () => {
    const off = await a.chamar('PUT', '/organizacao/config', { como: PESSOAS.admin, corpo: { modulos: { ia: false } } });
    expect(off.status, JSON.stringify(off.corpo)).toBe(200);
    const c = await a.chamar('POST', '/cotacoes', { como: PESSOAS.vendedor, corpo: { pedido: pedidoAuto(), cliente } });
    expect(c.status).toBe(201);
    const ia = await a.chamar('POST', '/ia/explicar', { como: PESSOAS.vendedor, corpo: { cotacaoId: c.corpo.id } });
    expect(ia.status).toBe(503);
    expect(ia.corpo.erro.codigo).toBe('IA_DESLIGADA');
    expect((await a.chamar('POST', `/cotacoes/${c.corpo.id}/emitir`, { como: PESSOAS.vendedor })).status).toBe(200);
  });
});
