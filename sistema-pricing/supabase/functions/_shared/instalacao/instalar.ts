import type { Sql } from '../../api/src/contexto.ts';
import { type CasoReferencia, type ConjuntoRegras, executarCasos, validarRegras } from '../motor/src/index.ts';

export type { Sql };

/** Formato dos arquivos em config/clientes/*.json */
export interface ConfigCliente {
  organizacao: { nome: string; slug: string; config: Record<string, unknown> };
  unidades: { codigo: string; nome: string }[];
  canais: { codigo: string; nome: string; tipo: string; permiteConvite?: boolean }[];
  dimensoes: ConjuntoRegras['dimensoes'];
  produtos: (ConjuntoRegras['produtos'][number] & { descricao?: string })[];
  tabela: { nome: string; moeda: string; vigenciaInicio: string; itens: ConjuntoRegras['tabela']['itens']; fatores: ConjuntoRegras['tabela']['fatores'] };
  politica: Omit<ConjuntoRegras['politica'], 'id' | 'versao'> & { vigenciaInicio: string; custos: ConjuntoRegras['custos'] };
  campanhas: ConjuntoRegras['campanhas'];
  /** Câmbio de referência inicial, por moeda (só quando há custo em moeda estrangeira). */
  cambios?: { moeda: string; taxa: number; vigenteDe: string }[];
  usuarios?: {
    email: string;
    nome: string;
    limiteAlcada?: number;
    papeis: { papel: string; unidade?: string; canal?: string; validoDias?: number }[];
    /** Só para os dados sintéticos da demonstração. */
    demo?: { perfilDesconto?: 'baixo' | 'medio' | 'alto' };
  }[];
  /** Parâmetros dos dados sintéticos da demonstração (ignorados na instalação de cliente). */
  demo?: {
    reajustePct?: number;
    trajetoriaCambio?: Record<string, { centro: number; amplitude: number }>;
    multiplicadores?: Record<string, number[]>;
    probabilidadeCanal?: number;
    sazonalidade?: Record<string, number>;
  };
  casosReferencia: CasoReferencia[];
}

export const PAPEIS_PADRAO = [
  { codigo: 'admin', nome: 'Administrador', descricao: 'Gerencia usuários, canais e integrações. Não cota nem altera regra de preço.', exigeMfa: true },
  { codigo: 'gestor_pricing', nome: 'Gestor de pricing', descricao: 'Altera tabelas e política, cota e aprova até a sua alçada.', exigeMfa: true },
  { codigo: 'aprovador', nome: 'Aprovador', descricao: 'Decide pedidos de exceção até a sua alçada.', exigeMfa: true },
  { codigo: 'vendedor', nome: 'Vendedor', descricao: 'Cota no seu escopo e vê a margem das próprias cotações.', exigeMfa: false },
  { codigo: 'canal', nome: 'Usuário de canal', descricao: 'Cota pelo próprio canal; vê preço final e a própria comissão.', exigeMfa: false },
  { codigo: 'leitura', nome: 'Leitura (financeiro, auditoria)', descricao: 'Consulta painel, cotações e auditoria, sem alterar nada.', exigeMfa: true },
  { codigo: 'suporte', nome: 'Suporte da consultoria', descricao: 'Acesso nominal com prazo, renovado pelo administrador do cliente.', exigeMfa: true },
] as const;

export function regrasDaConfig(c: ConfigCliente): ConjuntoRegras {
  const { custos, vigenciaInicio: _v, ...politica } = c.politica;
  return {
    dimensoes: c.dimensoes,
    produtos: c.produtos,
    tabela: { id: 'config', versao: 1, moeda: c.tabela.moeda, itens: c.tabela.itens, fatores: c.tabela.fatores },
    politica: { id: 'config', versao: 1, ...politica },
    custos,
    campanhas: c.campanhas,
    cambios: (c.cambios ?? []).map((x) => ({ ...x, origem: 'politica' as const })),
  };
}

export interface OpcoesInstalacao {
  /** Cria o usuário no serviço de autenticação e devolve o id. Sem isto, os usuários da configuração são ignorados. */
  criarUsuarioAuth?: (dados: { email: string; nome: string }) => Promise<string>;
  /** Dispensa o segundo fator obrigatório (só para ambientes de teste automatizado). */
  semMfa?: boolean;
}

/**
 * Instala uma organização a partir do arquivo de configuração: catálogo, tabela
 * e política publicadas, campanhas, casos de referência e (na demonstração)
 * usuários. Confere as regras e os casos de referência antes de gravar.
 */
export async function instalar(sql: Sql, c: ConfigCliente, opcoes: OpcoesInstalacao = {}) {
  const regras = regrasDaConfig(c);
  const validacao = validarRegras(regras);
  if (validacao.erros.length > 0) throw new Error(`Configuração inválida:\n- ${validacao.erros.join('\n- ')}`);
  const relatorio = executarCasos(c.casosReferencia, regras);
  if (relatorio.reprovados > 0) {
    const falhas = relatorio.casos.filter((x) => !x.passou).map((x) => `${x.nome}: ${JSON.stringify(x.divergencias)}`);
    throw new Error(`Casos de referência não batem com o cálculo:\n- ${falhas.join('\n- ')}`);
  }

  return await sql.begin(async (tx) => {
    await tx`select set_config('app.ator_tipo', 'sistema', true), set_config('app.contexto', ${JSON.stringify({ origem: 'instalacao' })}, true)`;
    const [org] = await tx<{ id: string }[]>`
      insert into public.organizacoes (nome, slug, config) values (${c.organizacao.nome}, ${c.organizacao.slug}, ${tx.json(c.organizacao.config as never)}) returning id`;
    const orgId = org!.id;

    for (const p of PAPEIS_PADRAO) {
      await tx`insert into public.papeis (org_id, codigo, nome, descricao, exige_mfa) values (${orgId}, ${p.codigo}, ${p.nome}, ${p.descricao}, ${opcoes.semMfa ? false : p.exigeMfa})`;
    }
    const unidades = new Map<string, string>();
    for (const u of c.unidades) {
      const [x] = await tx<{ id: string }[]>`insert into public.unidades (org_id, codigo, nome) values (${orgId}, ${u.codigo}, ${u.nome}) returning id`;
      unidades.set(u.codigo, x!.id);
    }
    const canais = new Map<string, string>();
    for (const k of c.canais) {
      const [x] = await tx<{ id: string }[]>`
        insert into public.canais (org_id, codigo, nome, tipo, permite_convite) values (${orgId}, ${k.codigo}, ${k.nome}, ${k.tipo}, ${k.permiteConvite ?? false}) returning id`;
      canais.set(k.codigo, x!.id);
    }
    for (const [i, d] of c.dimensoes.entries()) {
      await tx`insert into public.dimensoes (org_id, codigo, nome, tipo, valores, faixas, ordem)
               values (${orgId}, ${d.codigo}, ${d.nome}, ${d.tipo}, ${tx.json((d.valores ?? []) as never)}, ${tx.json((d.faixas ?? []) as never)}, ${i})`;
    }
    const produtos = new Map<string, string>();
    const componentes = new Map<string, string>();
    for (const [i, p] of c.produtos.entries()) {
      const [x] = await tx<{ id: string }[]>`
        insert into public.produtos (org_id, codigo, nome, descricao, ativo, dimensoes, multiplicadores, ordem)
        values (${orgId}, ${p.codigo}, ${p.nome}, ${p.descricao ?? ''}, ${p.ativo}, ${p.dimensoes}, ${p.multiplicadores}, ${i}) returning id`;
      produtos.set(p.codigo, x!.id);
      for (const [j, k] of p.componentes.entries()) {
        const [y] = await tx<{ id: string }[]>`
          insert into public.componentes (org_id, produto_id, codigo, nome, obrigatorio, ativo, ordem)
          values (${orgId}, ${x!.id}, ${k.codigo}, ${k.nome}, ${k.obrigatorio}, ${k.ativo}, ${j}) returning id`;
        componentes.set(`${p.codigo}/${k.codigo}`, y!.id);
      }
    }

    const [tabela] = await tx<{ id: string }[]>`
      insert into public.tabelas_preco (org_id, nome, versao, moeda, origem) values (${orgId}, ${c.tabela.nome}, 1, ${c.tabela.moeda}, 'configuracao') returning id`;
    for (const item of c.tabela.itens) {
      await tx`insert into public.itens_tabela (org_id, tabela_id, produto_id, componente_id, dimensoes, preco_base)
               values (${orgId}, ${tabela!.id}, ${produtos.get(item.produto)!}, ${item.componente ? componentes.get(`${item.produto}/${item.componente}`)! : null},
                       ${tx.json(item.dimensoes)}, ${item.precoBase})`;
    }
    for (const f of c.tabela.fatores) {
      await tx`insert into public.fatores (org_id, tabela_id, codigo, nome, dimensao, valor, tipo, ajuste, produto_id, grupo)
               values (${orgId}, ${tabela!.id}, ${f.codigo}, ${f.nome}, ${f.dimensao}, ${f.valor}, ${f.tipo}, ${f.ajuste}, ${f.produto ? produtos.get(f.produto)! : null}, ${f.grupo ?? null})`;
    }
    await tx`update public.tabelas_preco set status = 'publicada', vigencia_inicio = ${c.tabela.vigenciaInicio}::date, publicado_em = now() where id = ${tabela!.id}`;

    const { custos, vigenciaInicio, ...regrasPolitica } = c.politica;
    const [politica] = await tx<{ id: string }[]>`
      insert into public.politicas (org_id, versao, regras) values (${orgId}, 1, ${tx.json(regrasPolitica as never)}) returning id`;
    for (const k of custos) {
      await tx`insert into public.parametros_custo (org_id, politica_id, codigo, nome, categoria, tipo, valor, produto_id, base, moeda, condicoes)
               values (${orgId}, ${politica!.id}, ${k.codigo}, ${k.nome}, ${k.categoria}, ${k.tipo}, ${k.valor}, ${k.produto ? produtos.get(k.produto)! : null},
                       ${k.base ? tx.json(k.base as never) : null}, ${k.moeda ?? null}, ${k.condicoes ? tx.json(k.condicoes as never) : null})`;
    }
    await tx`update public.politicas set status = 'publicada', vigencia_inicio = ${vigenciaInicio}::date, publicado_em = now() where id = ${politica!.id}`;
    for (const x of c.cambios ?? []) {
      await tx`insert into public.cambios_referencia (org_id, moeda, taxa, vigente_de, origem, observacao)
               values (${orgId}, ${x.moeda}, ${x.taxa}, ${x.vigenteDe}::date, 'politica', 'Câmbio de referência inicial (instalação)')`;
    }

    for (const k of c.campanhas) {
      await tx`insert into public.campanhas (org_id, codigo, nome, inicio, fim, tipo, valor, produtos, canais, condicoes, acumula_com_desconto, acumula_com_outras)
               values (${orgId}, ${k.codigo}, ${k.nome}, ${k.inicio}::date, ${k.fim}::date, ${k.tipo}, ${k.valor}, ${k.produtos ?? null}, ${k.canais ?? null},
                       ${k.condicoes ? tx.json(k.condicoes) : null}, ${k.acumulaComDesconto}, ${k.acumulaComOutras})`;
    }
    for (const k of c.casosReferencia) {
      await tx`insert into public.casos_referencia (org_id, nome, pedido, esperado) values (${orgId}, ${k.nome}, ${tx.json(k.pedido as never)}, ${tx.json(k.esperado as never)})`;
    }

    const usuarios = new Map<string, string>();
    if (opcoes.criarUsuarioAuth) {
      for (const u of c.usuarios ?? []) {
        const id = await opcoes.criarUsuarioAuth({ email: u.email, nome: u.nome });
        usuarios.set(u.email, id);
        await tx`insert into public.usuarios (id, org_id, nome, email, limite_alcada, aceite_termos_em, ultimo_acesso)
                 values (${id}, ${orgId}, ${u.nome}, ${u.email}, ${u.limiteAlcada ?? null}, now(), now())`;
        for (const p of u.papeis) {
          await tx`insert into public.usuario_papel (org_id, usuario_id, papel, unidade_id, canal_id, valido_ate)
                   values (${orgId}, ${id}, ${p.papel}, ${p.unidade ? unidades.get(p.unidade)! : null}, ${p.canal ? canais.get(p.canal)! : null},
                           ${p.validoDias ? tx`now() + make_interval(days => ${p.validoDias})` : null})`;
        }
      }
    }
    return { orgId, tabelaId: tabela!.id, politicaId: politica!.id, unidades, canais, produtos, usuarios, casosReferencia: relatorio.total, avisos: validacao.avisos };
  });
}
