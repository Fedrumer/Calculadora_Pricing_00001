import { type Sql } from './banco.ts';
import { type Demo, type Linha, NOMES_ARQUIVO, PERIODO, gerarDemo } from './demo.ts';
import { type DemoTurismo, NOMES_ARQUIVO_TURISMO, PERIODO_TURISMO, gerarDemoTurismo } from './demo-turismo.ts';
import { chamar, criarUsuarioAuth } from './emulador.ts';

export const claims = (id: string) => ({ sub: id, role: 'authenticated' });

/** Cria o usuário de autenticação e o perfil no sistema (o primeiro consultor nasce por SQL, como na instalação). */
export async function criarUsuario(sql: Sql, o: { email: string; senha: string; nome: string; perfil: string; cliente?: string | null }): Promise<string> {
  const id = await criarUsuarioAuth(sql, o.email, o.senha, o.nome);
  await sql`insert into public.usuarios (id, nome, email, perfil, cliente_id) values (${id}, ${o.nome}, ${o.email.toLowerCase()}, ${o.perfil}, ${o.cliente ?? null})`;
  return id;
}

/** Envia um bloco pelas mesmas funções que a tela usa. */
export async function carregar(sql: Sql, consultor: string, diagnostico: string, bloco: string, linhas: Linha[], arquivo = `${bloco}.csv`) {
  const upload = await chamar<string>(sql, claims(consultor), 'iniciar_upload', { p_diagnostico: diagnostico, p_bloco: bloco, p_nome_arquivo: arquivo, p_mapeamento: {} });
  for (let i = 0; i < linhas.length; i += 4000) {
    await chamar(sql, claims(consultor), 'enviar_linhas', { p_upload: upload, p_linhas: linhas.slice(i, i + 4000) });
  }
  await chamar(sql, claims(consultor), 'concluir_upload', { p_upload: upload });
}

/** Instala a empresa fictícia inteira: cliente, diagnóstico, os seis blocos, cálculo e publicação. */
export async function instalarDemo(sql: Sql, consultor: string, o: { publicar?: boolean } = {}) {
  const demo = gerarDemo();
  const cliente = await chamar<string>(sql, claims(consultor), 'criar_cliente', { p_nome: 'Distribuidora Horizonte (fictícia)', p_setor: 'distribuicao' });
  const diagnostico = await chamar<string>(sql, claims(consultor), 'criar_diagnostico', {
    p_cliente: cliente, p_nome: 'Diagnóstico de pricing 2026', p_inicio: PERIODO.inicio, p_fim: PERIODO.fim, p_precos_liquidos: true,
  });
  for (const bloco of Object.keys(demo) as (keyof Demo)[]) await carregar(sql, consultor, diagnostico, bloco, demo[bloco], NOMES_ARQUIVO[bloco]);
  const calculo = await chamar<{ calculado: boolean; bloqueio?: string }>(sql, claims(consultor), 'calcular_diagnostico', { p_diagnostico: diagnostico });
  if (!calculo.calculado) throw new Error(`A demonstração não calculou: ${calculo.bloqueio}`);
  if (o.publicar) await chamar(sql, claims(consultor), 'publicar_diagnostico', { p_diagnostico: diagnostico });
  return { cliente, diagnostico, demo };
}

/** Instala a operadora de turismo fictícia: cliente do segmento operadora, reservas, bloqueios e cálculo. */
export async function instalarDemoTurismo(sql: Sql, consultor: string, o: { publicar?: boolean } = {}) {
  const demo = gerarDemoTurismo();
  const cliente = await chamar<string>(sql, claims(consultor), 'criar_cliente', { p_nome: 'Atlântica Viagens (fictícia)', p_setor: 'operadora' });
  const diagnostico = await chamar<string>(sql, claims(consultor), 'criar_diagnostico', {
    p_cliente: cliente, p_nome: 'Diagnóstico de pricing 2026', p_inicio: PERIODO_TURISMO.inicio, p_fim: PERIODO_TURISMO.fim, p_precos_liquidos: true, p_segmento: 'operadora',
  });
  for (const bloco of Object.keys(demo) as (keyof DemoTurismo)[]) await carregar(sql, consultor, diagnostico, bloco, demo[bloco], NOMES_ARQUIVO_TURISMO[bloco]);
  const calculo = await chamar<{ calculado: boolean; bloqueio?: string }>(sql, claims(consultor), 'calcular_diagnostico', { p_diagnostico: diagnostico });
  if (!calculo.calculado) throw new Error(`A operadora fictícia não calculou: ${calculo.bloqueio}`);
  if (o.publicar) await chamar(sql, claims(consultor), 'publicar_diagnostico', { p_diagnostico: diagnostico });
  return { cliente, diagnostico, demo };
}
