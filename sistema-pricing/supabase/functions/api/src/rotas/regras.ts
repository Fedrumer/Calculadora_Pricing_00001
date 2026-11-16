import { type CasoReferencia, type ConjuntoRegras, ErroMotor, type PedidoCotacao, VERSAO_MOTOR, calcular, executarCasos, validarRegras } from '@pricing/motor';
import { z } from 'zod';
import { type Requisicao, type Rota, validar } from '../app.ts';
import { hoje, somarDias } from '../contexto.ts';
import { conflito, invalido, naoEncontrado } from '../erros.ts';
import { planilhaContingencia } from '../planilha.ts';
import { type OpcoesRegras, carregarRegras } from '../regras.ts';

const codigo = z.string().trim().min(1).max(60).regex(/^[\w.+-]+$/, 'Use letras, números, ponto, hífen ou sublinhado.');
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD.');

const esquemaItem = z.object({
  produto: codigo,
  componente: codigo.nullable(),
  dimensoes: z.record(z.string().max(60)),
  precoBase: z.number().min(0).finite(),
});
const esquemaFator = z.object({
  codigo,
  nome: z.string().trim().min(1).max(120),
  dimensao: codigo,
  valor: z.string().max(60),
  tipo: z.enum(['percentual', 'valor']),
  ajuste: z.number().finite(),
  produto: codigo.nullish(),
  grupo: z.string().max(60).nullish(),
});
const esquemaBase = z.object({ de: z.string().max(60), menos: z.array(z.string().max(60)).optional() });
const esquemaEtapa = z
  .object({
    id: codigo,
    nome: z.string().max(120).optional(),
    tipo: z.enum(['preco_base', 'fatores', 'campanha', 'desconto', 'comissao', 'impostos', 'custos', 'arredondamento', 'extensao']),
    composicao: z.enum(['multiplicativa', 'aditiva']).optional(),
    grupo: z.string().max(60).optional(),
    base: esquemaBase.optional(),
    modo: z.enum(['deduz_da_margem', 'acrescenta_ao_preco']).optional(),
    funcao: z.string().max(60).optional(),
    parametros: z.record(z.unknown()).optional(),
  })
  .superRefine((e, ctx) => {
    if (e.tipo === 'fatores' && !e.composicao) ctx.addIssue({ code: 'custom', message: 'Etapa de fatores exige a composição.' });
    if (['comissao', 'impostos', 'custos'].includes(e.tipo) && !e.base) ctx.addIssue({ code: 'custom', message: `Etapa de ${e.tipo} exige a base de incidência.` });
    if (e.tipo === 'comissao' && !e.modo) ctx.addIssue({ code: 'custom', message: 'Etapa de comissão exige o modo.' });
    if (e.tipo === 'extensao' && !e.funcao) ctx.addIssue({ code: 'custom', message: 'Etapa de extensão exige a função.' });
  });
const pct = z.number().min(0).max(100);
const esquemaRegrasPolitica = z.object({
  etapas: z.array(esquemaEtapa).min(1).max(30),
  arredondamento: z.object({ casas: z.number().int().min(0).max(4), modo: z.enum(['meio_para_cima', 'meio_par', 'para_cima', 'para_baixo']) }),
  limites: z.object({ descontoLivrePct: pct, descontoMaximoPct: pct, margemMinimaPct: z.number().min(-100).max(100), margemMetaPct: z.number().min(-100).max(100) }),
  alcadas: z.array(z.object({ nivel: z.number().int().min(1).max(9), nome: z.string().trim().min(1).max(80), descontoAtePct: pct, margemMinimaPct: z.number().min(-100).max(100).optional(), permiteComissaoForaTabela: z.boolean().optional() })).max(9),
  comissoes: z.array(z.object({ canal: codigo, produto: codigo.nullish(), pct })).max(500),
  validadeDias: z.number().int().min(1).max(365),
  prazoAprovacaoHoras: z.number().int().min(1).max(720),
});
const esquemaCusto = z.object({
  codigo,
  nome: z.string().trim().min(1).max(120),
  categoria: z.enum(['imposto', 'cobranca', 'custo_variavel']),
  tipo: z.enum(['percentual', 'valor_fixo', 'valor_por_unidade']),
  valor: z.number().min(0).finite(),
  produto: codigo.nullish(),
  base: esquemaBase.nullish(),
});

type Tipo = 'tabela' | 'politica';
interface Regra {
  tipo: Tipo;
  id: string;
  versao: number;
  status: string;
  vigencia_inicio: string | null;
}

async function localizar(r: Requisicao, id: string, travar = true): Promise<Regra> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw naoEncontrado('Versão de regra não encontrada.');
  const [t] = await r.tx<Regra[]>`
    select 'tabela' as tipo, id, versao, status, vigencia_inicio::text from public.tabelas_preco where id = ${id} and org_id = ${r.ator.orgId} ${travar ? r.tx`for update` : r.tx``}`;
  if (t) return t;
  const [p] = await r.tx<Regra[]>`
    select 'politica' as tipo, id, versao, status, vigencia_inicio::text from public.politicas where id = ${id} and org_id = ${r.ator.orgId} ${travar ? r.tx`for update` : r.tx``}`;
  if (p) return p;
  throw naoEncontrado('Versão de regra não encontrada.');
}

function exigirRascunho(regra: Regra) {
  if (regra.status !== 'rascunho') throw conflito('Esta versão já foi publicada e é imutável. Crie uma nova versão para alterar.', 'VERSAO_IMUTAVEL');
}

async function mapas(r: Requisicao) {
  const produtos = await r.tx<{ id: string; codigo: string }[]>`select id, codigo from public.produtos where org_id = ${r.ator.orgId}`;
  const componentes = await r.tx<{ id: string; produto_id: string; codigo: string }[]>`select id, produto_id, codigo from public.componentes where org_id = ${r.ator.orgId}`;
  return {
    produto: new Map(produtos.map((p) => [p.codigo, p.id])),
    componente: new Map(componentes.map((c) => [`${c.produto_id}/${c.codigo}`, c.id])),
  };
}

async function gravarItens(r: Requisicao, tabelaId: string, itens: z.infer<typeof esquemaItem>[], fatores?: z.infer<typeof esquemaFator>[]) {
  const { tx, ator } = r;
  const m = await mapas(r);
  const erros: string[] = [];
  const linhas = itens.map((item, i) => {
    const produtoId = m.produto.get(item.produto);
    if (!produtoId) erros.push(`Linha ${i + 1}: produto "${item.produto}" não existe.`);
    const componenteId = item.componente ? m.componente.get(`${produtoId}/${item.componente}`) : null;
    if (item.componente && produtoId && !componenteId) erros.push(`Linha ${i + 1}: componente "${item.componente}" não existe em "${item.produto}".`);
    return { org_id: ator.orgId, tabela_id: tabelaId, produto_id: produtoId ?? '', componente_id: componenteId ?? null, dimensoes: item.dimensoes, preco_base: item.precoBase };
  });
  const chaves = new Set<string>();
  linhas.forEach((l, i) => {
    const chave = `${l.produto_id}/${l.componente_id}/${JSON.stringify(Object.entries(l.dimensoes).sort())}`;
    if (chaves.has(chave)) erros.push(`Linha ${i + 1}: combinação repetida.`);
    chaves.add(chave);
  });
  const linhasFator = (fatores ?? []).map((f) => {
    const produtoId = f.produto ? m.produto.get(f.produto) : null;
    if (f.produto && !produtoId) erros.push(`Fator "${f.codigo}": produto "${f.produto}" não existe.`);
    return { org_id: ator.orgId, tabela_id: tabelaId, codigo: f.codigo, nome: f.nome, dimensao: f.dimensao, valor: f.valor, tipo: f.tipo, ajuste: f.ajuste, produto_id: produtoId ?? null, grupo: f.grupo ?? null };
  });
  if (erros.length > 0) throw invalido('A tabela tem linhas inválidas; nada foi gravado.', erros.slice(0, 100), 'TABELA_INVALIDA');

  await tx`delete from public.itens_tabela where tabela_id = ${tabelaId}`;
  for (let i = 0; i < linhas.length; i += 500) {
    await tx`insert into public.itens_tabela ${tx(linhas.slice(i, i + 500).map((l) => ({ ...l, dimensoes: tx.json(l.dimensoes) })) as never)}`;
  }
  if (fatores) {
    await tx`delete from public.fatores where tabela_id = ${tabelaId}`;
    if (linhasFator.length > 0) await tx`insert into public.fatores ${tx(linhasFator as never)}`;
  }
}

/** Lê CSV de planilha: produto;componente;<dimensões...>;preco_base */
export function lerCsvTabela(csv: string): { itens: z.infer<typeof esquemaItem>[]; erros: string[] } {
  const erros: string[] = [];
  const linhas = csv.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (linhas.length < 2) return { itens: [], erros: ['A planilha precisa de cabeçalho e pelo menos uma linha.'] };
  const sep = (linhas[0]!.match(/;/g)?.length ?? 0) >= (linhas[0]!.match(/,/g)?.length ?? 0) ? ';' : ',';
  const dividir = (l: string) => l.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, '$1'));
  const cab = dividir(linhas[0]!).map((c) => c.toLowerCase());
  const iProduto = cab.indexOf('produto');
  const iComponente = cab.indexOf('componente');
  const iPreco = cab.findIndex((c) => c === 'preco_base' || c === 'preço base' || c === 'preco base' || c === 'preco');
  if (iProduto < 0 || iPreco < 0) return { itens: [], erros: ['Cabeçalho precisa das colunas "produto" e "preco_base".'] };
  const dims = cab.map((c, i) => ({ c, i })).filter(({ i }) => i !== iProduto && i !== iComponente && i !== iPreco);
  const itens: z.infer<typeof esquemaItem>[] = [];
  linhas.slice(1).forEach((linha, n) => {
    const cel = dividir(linha);
    const bruto = (cel[iPreco] ?? '').replace(/[R$\s]/g, '');
    const texto = sep === ';' || /,\d{1,4}$/.test(bruto) ? bruto.replace(/\./g, '').replace(',', '.') : bruto;
    const preco = Number(texto);
    if (!cel[iProduto]) return void erros.push(`Linha ${n + 2}: produto vazio.`);
    if (bruto === '' || !Number.isFinite(preco) || preco < 0) return void erros.push(`Linha ${n + 2}: preço "${cel[iPreco] ?? ''}" inválido.`);
    const dimensoes: Record<string, string> = {};
    for (const { c, i } of dims) {
      const valor = cel[i] ?? '';
      if (valor !== '' && valor !== '*' && valor !== '(qualquer)') dimensoes[c] = valor;
    }
    itens.push({ produto: cel[iProduto]!, componente: iComponente >= 0 && cel[iComponente] ? cel[iComponente]! : null, dimensoes, precoBase: preco });
  });
  return { itens, erros };
}

async function casosAtivos(r: Requisicao): Promise<CasoReferencia[]> {
  return await r.tx<CasoReferencia[]>`select nome, pedido, esperado from public.casos_referencia where org_id = ${r.ator.orgId} and ativo order by nome`;
}

/** Regras para avaliar um rascunho: ele próprio mais o outro lado vigente na data. */
async function regrasComRascunho(r: Requisicao, regra: Regra, data: string): Promise<ConjuntoRegras | null> {
  const opcoes: OpcoesRegras = regra.tipo === 'tabela' ? { tabelaId: regra.id } : { politicaId: regra.id };
  try {
    return (await carregarRegras(r.tx, r.ator.orgId, data, opcoes)).regras;
  } catch (e) {
    const cod = (e as { codigo?: string }).codigo;
    if (cod === 'SEM_TABELA_VIGENTE' || cod === 'SEM_POLITICA_VIGENTE') return null;
    throw e;
  }
}

async function simularImpacto(r: Requisicao, regra: Regra) {
  const { tx, ator, deps } = r;
  const data = hoje(deps);
  const novas = await regrasComRascunho(r, regra, data);
  if (!novas) return { amostra: 0, aviso: 'Ainda não há tabela e política vigentes para comparar.' };
  let atuais: ConjuntoRegras | null = null;
  try {
    atuais = (await carregarRegras(tx, ator.orgId, data)).regras;
  } catch {
    atuais = null;
  }
  const amostra = await tx<{ entrada: PedidoCotacao }[]>`
    select v.entrada from public.cotacoes c join public.cotacao_versoes v on v.id = c.versao_atual_id
    where c.org_id = ${ator.orgId} and c.criado_em > now() - interval '90 days'
      and c.status in ('emitida', 'aceita', 'perdida', 'expirada', 'aprovada', 'em_aprovacao')
    order by c.criado_em desc limit 300`;

  let n = 0;
  let semPreco = 0;
  const soma = { precoAntes: 0, precoDepois: 0, margemAntes: 0, margemDepois: 0 };
  const vereditos: Record<string, number> = {};
  const opcoes = { extensoes: deps.extensoes };
  for (const { entrada } of amostra) {
    const pedido = { ...entrada, data };
    try {
      const depois = calcular(pedido, novas, opcoes);
      const antes = atuais ? calcular(pedido, atuais, opcoes) : null;
      n += 1;
      soma.precoDepois += depois.precoFinal;
      soma.margemDepois += depois.margemValor;
      if (antes) {
        soma.precoAntes += antes.precoFinal;
        soma.margemAntes += antes.margemValor;
        const chave = `${antes.veredito.status}>${depois.veredito.status}`;
        vereditos[chave] = (vereditos[chave] ?? 0) + 1;
      }
    } catch (e) {
      if (!(e instanceof ErroMotor)) throw e;
      semPreco += 1;
    }
  }
  const arred = (v: number, c = 2) => Math.round(v * 10 ** c) / 10 ** c;
  const pctMargem = (m: number, p: number) => (p > 0 ? arred((m / p) * 100) : null);
  return {
    amostra: n,
    naoCalculadas: semPreco,
    criterio: 'Cotações dos últimos 90 dias recalculadas com as regras atuais e com o rascunho, na data de hoje.',
    precoMedioAntes: n && atuais ? arred(soma.precoAntes / n) : null,
    precoMedioDepois: n ? arred(soma.precoDepois / n) : null,
    variacaoPrecoPct: atuais && soma.precoAntes > 0 ? arred(((soma.precoDepois - soma.precoAntes) / soma.precoAntes) * 100) : null,
    margemPctAntes: atuais ? pctMargem(soma.margemAntes, soma.precoAntes) : null,
    margemPctDepois: pctMargem(soma.margemDepois, soma.precoDepois),
    mudancasDeVeredito: Object.entries(vereditos)
      .filter(([k]) => k.split('>')[0] !== k.split('>')[1])
      .map(([k, quantidade]) => ({ de: k.split('>')[0], para: k.split('>')[1], quantidade })),
  };
}

const GESTOR = ['gestor_pricing'] as const;

export const rotasRegras: Rota[] = [
  {
    metodo: 'POST',
    caminho: '/regras/tabelas',
    auth: 'usuario',
    papeis: [...GESTOR],
    async handler(r) {
      const { tx, ator } = r;
      const d = validar(z.object({ nome: z.string().trim().min(2).max(120).optional(), baseId: z.string().uuid().optional() }), r.corpo ?? {});
      const baseId = d.baseId ?? (await tx<{ id: string | null }[]>`select app.tabela_vigente(${ator.orgId}, ${hoje(r.deps)}::date) as id`)[0]?.id ?? null;
      const [base] = baseId ? await tx<{ id: string; nome: string; moeda: string }[]>`select id, nome, moeda from public.tabelas_preco where id = ${baseId} and org_id = ${ator.orgId}` : [];
      if (baseId && !base) throw naoEncontrado('Tabela de origem não encontrada.');
      const [nova] = await tx<{ id: string; versao: number }[]>`
        insert into public.tabelas_preco (org_id, nome, versao, moeda, origem, criado_por)
        select ${ator.orgId}, ${d.nome ?? base?.nome ?? 'Tabela de preços'}, coalesce(max(versao), 0) + 1, ${base?.moeda ?? 'BRL'}, ${base ? 'copia' : 'tela'}, ${ator.id}
        from public.tabelas_preco where org_id = ${ator.orgId}
        returning id, versao`;
      if (base) {
        await tx`insert into public.itens_tabela (org_id, tabela_id, produto_id, componente_id, dimensoes, preco_base)
                 select org_id, ${nova!.id}, produto_id, componente_id, dimensoes, preco_base from public.itens_tabela where tabela_id = ${base.id}`;
        await tx`insert into public.fatores (org_id, tabela_id, codigo, nome, dimensao, valor, tipo, ajuste, produto_id, grupo)
                 select org_id, ${nova!.id}, codigo, nome, dimensao, valor, tipo, ajuste, produto_id, grupo from public.fatores where tabela_id = ${base.id}`;
      }
      await r.auditar('regra.rascunho_criado', 'tabelas_preco', nova!.id, { novo: { versao: nova!.versao, copiaDe: base?.id ?? null } });
      return { status: 201, corpo: { id: nova!.id, versao: nova!.versao, status: 'rascunho' } };
    },
  },
  {
    metodo: 'PUT',
    caminho: '/regras/tabelas/:id',
    auth: 'usuario',
    papeis: [...GESTOR],
    async handler(r) {
      const d = validar(
        z.object({ nome: z.string().trim().min(2).max(120).optional(), observacao: z.string().max(1000).nullish(), itens: z.array(esquemaItem).max(20000).optional(), fatores: z.array(esquemaFator).max(2000).optional() }),
        r.corpo,
      );
      const regra = await localizar(r, r.params.id!);
      if (regra.tipo !== 'tabela') throw naoEncontrado('Tabela não encontrada.');
      exigirRascunho(regra);
      if (d.nome !== undefined || d.observacao !== undefined) {
        await r.tx`update public.tabelas_preco set nome = coalesce(${d.nome ?? null}, nome), observacao = ${d.observacao ?? null} where id = ${regra.id}`;
      }
      if (d.itens) await gravarItens(r, regra.id, d.itens, d.fatores);
      else if (d.fatores) await gravarItensSoFatores(r, regra.id, d.fatores);
      return { corpo: { id: regra.id, versao: regra.versao, status: 'rascunho', itens: d.itens?.length, fatores: d.fatores?.length } };
    },
  },
  {
    metodo: 'POST',
    caminho: '/regras/tabelas/:id/importar',
    auth: 'usuario',
    papeis: [...GESTOR],
    async handler(r) {
      const d = validar(z.object({ csv: z.string().min(10).max(1_500_000) }), r.corpo);
      const regra = await localizar(r, r.params.id!);
      if (regra.tipo !== 'tabela') throw naoEncontrado('Tabela não encontrada.');
      exigirRascunho(regra);
      const { itens, erros } = lerCsvTabela(d.csv);
      if (erros.length > 0) throw invalido('A planilha tem linhas inválidas; nada foi carregado.', erros.slice(0, 100), 'PLANILHA_INVALIDA');
      await gravarItens(r, regra.id, validar(z.array(esquemaItem).max(20000), itens));
      await r.tx`update public.tabelas_preco set origem = 'planilha' where id = ${regra.id}`;
      await r.auditar('regra.planilha_importada', 'tabelas_preco', regra.id, { novo: { itens: itens.length } });
      return { corpo: { id: regra.id, importados: itens.length, status: 'rascunho' } };
    },
  },
  {
    metodo: 'POST',
    caminho: '/regras/politicas',
    auth: 'usuario',
    papeis: [...GESTOR],
    async handler(r) {
      const { tx, ator } = r;
      const d = validar(z.object({ baseId: z.string().uuid().optional() }), r.corpo ?? {});
      const baseId = d.baseId ?? (await tx<{ id: string | null }[]>`select app.politica_vigente(${ator.orgId}, ${hoje(r.deps)}::date) as id`)[0]?.id ?? null;
      if (!baseId) throw conflito('Não há política vigente para copiar; instale a configuração inicial.', 'SEM_POLITICA_VIGENTE');
      const [nova] = await tx<{ id: string; versao: number }[]>`
        insert into public.politicas (org_id, versao, regras, criado_por)
        select ${ator.orgId}, (select coalesce(max(versao), 0) + 1 from public.politicas where org_id = ${ator.orgId}), b.regras, ${ator.id}
        from public.politicas b where b.id = ${baseId} and b.org_id = ${ator.orgId}
        returning id, versao`;
      if (!nova) throw naoEncontrado('Política de origem não encontrada.');
      await tx`insert into public.parametros_custo (org_id, politica_id, codigo, nome, categoria, tipo, valor, produto_id, base)
               select org_id, ${nova.id}, codigo, nome, categoria, tipo, valor, produto_id, base from public.parametros_custo where politica_id = ${baseId}`;
      await r.auditar('regra.rascunho_criado', 'politicas', nova.id, { novo: { versao: nova.versao, copiaDe: baseId } });
      return { status: 201, corpo: { id: nova.id, versao: nova.versao, status: 'rascunho' } };
    },
  },
  {
    metodo: 'PUT',
    caminho: '/regras/politicas/:id',
    auth: 'usuario',
    papeis: [...GESTOR],
    async handler(r) {
      const { tx, ator } = r;
      const d = validar(z.object({ regras: esquemaRegrasPolitica.optional(), custos: z.array(esquemaCusto).max(500).optional(), observacao: z.string().max(1000).nullish() }), r.corpo);
      const regra = await localizar(r, r.params.id!);
      if (regra.tipo !== 'politica') throw naoEncontrado('Política não encontrada.');
      exigirRascunho(regra);
      if (d.regras) await tx`update public.politicas set regras = ${tx.json(d.regras as never)}, observacao = ${d.observacao ?? null} where id = ${regra.id}`;
      if (d.custos) {
        const m = await mapas(r);
        const linhas = d.custos.map((c) => {
          const produtoId = c.produto ? m.produto.get(c.produto) : null;
          if (c.produto && !produtoId) throw invalido(`Parâmetro "${c.codigo}": produto "${c.produto}" não existe.`);
          return { org_id: ator.orgId, politica_id: regra.id, codigo: c.codigo, nome: c.nome, categoria: c.categoria, tipo: c.tipo, valor: c.valor, produto_id: produtoId ?? null, base: c.base ? tx.json(c.base) : null };
        });
        await tx`delete from public.parametros_custo where politica_id = ${regra.id}`;
        if (linhas.length > 0) await tx`insert into public.parametros_custo ${tx(linhas as never)}`;
      }
      return { corpo: { id: regra.id, versao: regra.versao, status: 'rascunho' } };
    },
  },
  {
    metodo: 'DELETE',
    caminho: '/regras/:id',
    auth: 'usuario',
    papeis: [...GESTOR],
    async handler(r) {
      const regra = await localizar(r, r.params.id!);
      exigirRascunho(regra);
      if (regra.tipo === 'tabela') await r.tx`delete from public.tabelas_preco where id = ${regra.id}`;
      else await r.tx`delete from public.politicas where id = ${regra.id}`;
      return { corpo: { id: regra.id, excluido: true } };
    },
  },
  {
    metodo: 'POST',
    caminho: '/regras/casos-referencia/executar',
    auth: 'usuario',
    papeis: ['gestor_pricing', 'admin', 'leitura', 'suporte', 'aprovador'],
    async handler(r) {
      const d = validar(z.object({ tabelaId: z.string().uuid().optional(), politicaId: z.string().uuid().optional() }), r.corpo ?? {});
      const { regras } = await carregarRegras(r.tx, r.ator.orgId, hoje(r.deps), d);
      const relatorio = executarCasos(await casosAtivos(r), regras, { extensoes: r.deps.extensoes });
      return { corpo: { ...relatorio, tabelaVersao: regras.tabela.versao, politicaVersao: regras.politica.versao, motor: VERSAO_MOTOR } };
    },
  },
  {
    metodo: 'PUT',
    caminho: '/regras/casos-referencia',
    auth: 'usuario',
    papeis: [...GESTOR],
    async handler(r) {
      const d = validar(
        z.object({ casos: z.array(z.object({ nome: z.string().trim().min(3).max(200), pedido: z.record(z.unknown()), esperado: z.record(z.unknown()), ativo: z.boolean().default(true) })).min(1).max(500) }),
        r.corpo,
      );
      for (const c of d.casos) {
        await r.tx`insert into public.casos_referencia (org_id, nome, pedido, esperado, ativo)
                   values (${r.ator.orgId}, ${c.nome}, ${r.tx.json(c.pedido as never)}, ${r.tx.json(c.esperado as never)}, ${c.ativo})
                   on conflict (org_id, nome) do update set pedido = excluded.pedido, esperado = excluded.esperado, ativo = excluded.ativo`;
      }
      return { corpo: { gravados: d.casos.length } };
    },
  },
  {
    metodo: 'POST',
    caminho: '/regras/:id/impacto',
    auth: 'usuario',
    papeis: [...GESTOR],
    async handler(r) {
      const regra = await localizar(r, r.params.id!, false);
      const data = hoje(r.deps);
      const regras = await regrasComRascunho(r, regra, data);
      const validacao = regras ? validarRegras(regras) : { erros: [], avisos: ['Sem o outro lado vigente, a coerência não pôde ser conferida.'] };
      const casos = regras ? executarCasos(await casosAtivos(r), regras, { extensoes: r.deps.extensoes }) : null;
      return { corpo: { id: regra.id, tipo: regra.tipo, versao: regra.versao, validacao, casosReferencia: casos, impacto: await simularImpacto(r, regra) } };
    },
  },
  {
    metodo: 'POST',
    caminho: '/regras/:id/publicar',
    auth: 'usuario',
    papeis: [...GESTOR],
    async handler(r) {
      const { tx, ator, deps } = r;
      const d = validar(z.object({ vigenciaInicio: dataIso, forcar: z.boolean().optional(), motivo: z.string().trim().max(500).optional() }), r.corpo);
      const regra = await localizar(r, r.params.id!);
      exigirRascunho(regra);
      const data = hoje(deps);
      if (d.vigenciaInicio < data) throw invalido('A vigência não pode começar no passado: cotações já emitidas não mudam.', undefined, 'VIGENCIA_NO_PASSADO');

      const regras = await regrasComRascunho(r, regra, d.vigenciaInicio);
      let relatorio = null;
      if (regras) {
        const validacao = validarRegras(regras);
        if (validacao.erros.length > 0) throw invalido('As regras têm erros e não podem ser publicadas.', validacao.erros, 'REGRAS_INVALIDAS');
        relatorio = executarCasos(await casosAtivos(r), regras, { extensoes: deps.extensoes });
        if (relatorio.reprovados > 0 && !(d.forcar && (d.motivo ?? '').length >= 10)) {
          throw conflito(
            `${relatorio.reprovados} de ${relatorio.total} casos de referência não batem. Revise as regras ou atualize os casos; para publicar mesmo assim, informe o motivo.`,
            'CASOS_DE_REFERENCIA_REPROVADOS',
            relatorio.casos.filter((c) => !c.passou),
          );
        }
      }

      const tabela = regra.tipo === 'tabela' ? tx`public.tabelas_preco` : tx`public.politicas`;
      const anteriores = await tx<{ id: string; versao: number; vigencia_inicio: string }[]>`
        select id, versao, vigencia_inicio::text from ${tabela}
        where org_id = ${ator.orgId} and status = 'publicada' and (vigencia_fim is null or vigencia_fim >= ${d.vigenciaInicio}::date)
        for update`;
      for (const a of anteriores) {
        if (a.vigencia_inicio >= d.vigenciaInicio) {
          throw conflito(`A versão ${a.versao} já está publicada com início em ${a.vigencia_inicio}; escolha uma data posterior.`, 'VIGENCIA_SOBREPOSTA');
        }
        await tx`update ${tabela} set vigencia_fim = ${somarDias(d.vigenciaInicio, -1)}::date where id = ${a.id}`;
      }
      await tx`update ${tabela} set status = 'publicada', vigencia_inicio = ${d.vigenciaInicio}::date, publicado_por = ${ator.id}, publicado_em = now() where id = ${regra.id}`;

      let contingencia: string | null = null;
      if (regras) {
        const [org] = await tx<{ nome: string }[]>`select nome from public.organizacoes where id = ${ator.orgId}`;
        const arquivo = planilhaContingencia(regras, { organizacao: org?.nome ?? '', geradaEm: data, vigenciaInicio: d.vigenciaInicio });
        contingencia = `${ator.orgId}/contingencia-${d.vigenciaInicio}-tabela-v${regras.tabela.versao}-politica-v${regras.politica.versao}.xlsx`;
        await deps.armazenamento.salvar('contingencia', contingencia, arquivo, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        await tx`insert into public.registros_backup (org_id, tipo, status, tamanho_bytes, destino, detalhes)
                 values (${ator.orgId}, 'planilha_contingencia', 'ok', ${arquivo.length}, ${`contingencia/${contingencia}`},
                         ${tx.json({ tabelaVersao: regras.tabela.versao, politicaVersao: regras.politica.versao, vigenciaInicio: d.vigenciaInicio })})`;
      }
      await r.auditar('regra.publicada', regra.tipo === 'tabela' ? 'tabelas_preco' : 'politicas', regra.id, {
        resumo: `${regra.tipo === 'tabela' ? 'Tabela' : 'Política'} versão ${regra.versao} publicada com vigência a partir de ${d.vigenciaInicio}.`,
        novo: { versao: regra.versao, vigenciaInicio: d.vigenciaInicio, casosReferencia: relatorio && { total: relatorio.total, reprovados: relatorio.reprovados }, forcado: !!d.forcar, motivo: d.motivo ?? null },
      });
      await r.emitir('regra.publicada', { tipo: regra.tipo, id: regra.id, versao: regra.versao, vigenciaInicio: d.vigenciaInicio, contingencia });
      return { corpo: { id: regra.id, tipo: regra.tipo, versao: regra.versao, status: 'publicada', vigenciaInicio: d.vigenciaInicio, casosReferencia: relatorio, contingencia } };
    },
  },
  {
    metodo: 'GET',
    caminho: '/regras/contingencia',
    auth: 'usuario',
    papeis: ['gestor_pricing', 'admin', 'vendedor', 'aprovador', 'suporte'],
    async handler(r) {
      const [b] = await r.tx<{ destino: string; iniciado_em: Date }[]>`
        select destino, iniciado_em from public.registros_backup
        where org_id = ${r.ator.orgId} and tipo = 'planilha_contingencia' and status = 'ok' order by iniciado_em desc limit 1`;
      if (!b) throw naoEncontrado('Ainda não há planilha de contingência; ela é gerada a cada publicação de regra.');
      const caminho = b.destino.replace(/^contingencia\//, '');
      return { corpo: { geradaEm: b.iniciado_em, url: await r.deps.armazenamento.urlAssinada('contingencia', caminho, 300) } };
    },
  },
];

async function gravarItensSoFatores(r: Requisicao, tabelaId: string, fatores: z.infer<typeof esquemaFator>[]) {
  const m = await mapas(r);
  const linhas = fatores.map((f) => {
    const produtoId = f.produto ? m.produto.get(f.produto) : null;
    if (f.produto && !produtoId) throw invalido(`Fator "${f.codigo}": produto "${f.produto}" não existe.`);
    return { org_id: r.ator.orgId, tabela_id: tabelaId, codigo: f.codigo, nome: f.nome, dimensao: f.dimensao, valor: f.valor, tipo: f.tipo, ajuste: f.ajuste, produto_id: produtoId ?? null, grupo: f.grupo ?? null };
  });
  await r.tx`delete from public.fatores where tabela_id = ${tabelaId}`;
  if (linhas.length > 0) await r.tx`insert into public.fatores ${r.tx(linhas as never)}`;
}
