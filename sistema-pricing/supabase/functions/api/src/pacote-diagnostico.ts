import { VERSAO_MOTOR } from '@pricing/motor';
import { strToU8, zipSync } from 'fflate';
import type { Sql, Tx } from './contexto.ts';
import { decifrar, hmac, sha256, soDigitos } from './cripto.ts';

// Pacote mensal para o diagnóstico (contrato pacote-diagnostico/1, ajuste A10).
//
// O que sai: códigos pseudônimos de cliente final e de vendedor, códigos e
// nomes do cadastro (produto, dimensão, canal) e valores (preço, desconto,
// comissão, custo, margem, câmbio). O que nunca sai: nome, e-mail e documento
// do cliente final, nome e e-mail de usuários, textos livres (observação,
// motivo de aprovação, texto da perda, nome do concorrente), IP, auditoria e
// chaves. O segredo do HMAC fica só no servidor do cliente.
//
// Os cabeçalhos dos CSV usam os nomes de campo do diagnóstico (blocos
// transacoes, custos, produtos, contas e custos_servir), para a tela de carga
// sugerir o mapeamento certo sem ajuste.

export const CONTRATO_PACOTE = 'pacote-diagnostico/1';
export type ModoConta = 'pseudonimo' | 'agregado';
export const CONTA_AGREGADA = 'C-AGREGADO';

export interface OpcoesPacote {
  orgId: string;
  /** Mês de competência, AAAA-MM. */
  competencia: string;
  segredo: string;
  chaveCifra: string;
  modoConta: ModoConta;
  agora: Date;
}

export interface ArquivoPacote {
  nome: string;
  cabecalhos: string[];
  linhas: (string | number | null)[][];
}

export interface Pacote {
  arquivos: ArquivoPacote[];
  manifesto: Record<string, unknown>;
  zip: Uint8Array;
  hash: string;
  linhas: Record<string, number>;
}

const CABECALHOS = {
  transacoes: ['data', 'nota_fiscal', 'produto', 'conta', 'canal', 'quantidade', 'preco_lista', 'preco_faturado', 'desc_comercial', 'desc_promocional'],
  custos: ['produto', 'custo_unitario', 'vigencia_inicio'],
  produtos: ['codigo', 'descricao', 'categoria', 'linha'],
  contas: ['codigo', 'segmento', 'porte', 'regiao', 'vendedor'],
  custos_servir: ['tipo', 'canal', 'conta', 'percentual'],
  cotacoes: [
    'numero', 'data', 'status', 'produto', 'conta', 'canal', 'vendedor', 'quantidade', 'preco_lista', 'preco_faturado', 'receita',
    'desconto_pct', 'desconto_valor', 'campanha_valor', 'comissao_canal_pct', 'comissao_canal_valor', 'comissao_vendedor_valor',
    'margem_valor', 'margem_pct', 'veredito', 'nivel_alcada', 'categoria_perda', 'preco_concorrente',
    'moeda_custo', 'cambio_usado', 'cambio_equilibrio', 'folga_cambial_pct', 'motor_versao', 'piloto', 'braco',
  ],
} as const;

/** Venda direta (sem canal) aparece com este código no pacote. */
export const CANAL_DIRETO = 'direto';

interface LinhaCotacao {
  id: string;
  numero: number;
  data: string;
  status: string;
  dono_id: string | null;
  desfecho_categoria: string | null;
  concorrente_preco: string | number | null;
  produto: string;
  canal: string | null;
  dimensoes: Record<string, unknown> | null;
  quantidade: string | number;
  preco_base: string | number;
  preco_final: string | number;
  desconto_pct: string | number;
  desconto_valor: string | number;
  campanha_valor: string | number;
  comissao_pct: string | number;
  comissao_valor: string | number;
  margem_valor: string | number;
  margem_pct: string | number;
  veredito: string;
  nivel_alcada: number | null;
  comissao_vendedor_valor: string | number;
  comissao_vendedor_deduzida: boolean;
  detalhamento: { etapa?: string; valor?: number; percentual?: number }[];
  cambios: { moeda: string; taxa: number; cambioEquilibrio: number | null; folgaPct: number | null }[] | null;
  motor_versao: string;
  identificacao_nome: string;
  identificacao_documento: string | null;
}

interface ProdutoPacote {
  codigo: string;
  nome: string;
  dimensoes: { codigo: string; nome: string; valores: { codigo: string; nome: string }[] | null }[];
}

const n = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v));
/** Número com até 6 casas, sem zeros à direita e com ponto decimal. */
export function num(v: number, casas = 6): string {
  if (!Number.isFinite(v)) return '';
  const s = v.toFixed(casas);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}
const normalizarNome = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function ultimoDia(competencia: string): string {
  const [a, m] = competencia.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

/** CSV com ponto e vírgula, aspas quando precisa e BOM (o Excel abre em UTF-8). */
export function paraCsv(a: ArquivoPacote): string {
  const celula = (v: string | number | null) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `﻿${[a.cabecalhos, ...a.linhas].map((l) => l.map(celula).join(';')).join('\n')}\n`;
}

/** Códigos pseudônimos: HMAC-SHA256 com o segredo do cliente, 16 caracteres. */
export async function codigoPseudonimo(prefixo: 'C' | 'V' | 'I', segredo: string, valor: string): Promise<string> {
  return `${prefixo}-${(await hmac(segredo, valor)).slice(0, 16).toUpperCase()}`;
}

export async function montarPacote(sql: Sql | Tx, o: OpcoesPacote): Promise<Pacote> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(o.competencia)) throw new Error('Competência no formato AAAA-MM.');
  if (!o.segredo || o.segredo.length < 32) throw new Error('SEGREDO_PSEUDONIMO ausente ou curto.');
  const inicio = `${o.competencia}-01`;
  const fim = ultimoDia(o.competencia);

  // mesmo recorte do painel: cotações criadas no mês, emitidas (inclui aceitas, perdidas e expiradas)
  const cotacoes = await sql<LinhaCotacao[]>`
    select id, numero, data::text as data, status, dono_id, desfecho_categoria, concorrente_preco, produto, canal, dimensoes,
           quantidade, preco_base, preco_final, desconto_pct, desconto_valor, campanha_valor, comissao_pct, comissao_valor,
           margem_valor, margem_pct, veredito, nivel_alcada, comissao_vendedor_valor, comissao_vendedor_deduzida, detalhamento,
           cambios, motor_versao, identificacao_nome, identificacao_documento
    from app.v_pacote_cotacoes
    where org_id = ${o.orgId} and criado_em >= ${inicio}::date and criado_em < ${fim}::date + 1
    order by criado_em, numero`;
  const produtos = await sql<ProdutoPacote[]>`select codigo, nome, dimensoes from app.v_pacote_produtos where org_id = ${o.orgId}`;
  const porCodigo = new Map(produtos.map((p) => [p.codigo, p]));

  // pseudônimos (cache por valor, para não recalcular o HMAC)
  const cache = new Map<string, string>();
  const pseudo = async (prefixo: 'C' | 'V', valor: string) => {
    const k = `${prefixo}:${valor}`;
    if (!cache.has(k)) cache.set(k, await codigoPseudonimo(prefixo, o.segredo, valor));
    return cache.get(k)!;
  };
  const conta = async (c: LinhaCotacao) => {
    if (o.modoConta === 'agregado') return CONTA_AGREGADA;
    if (c.identificacao_documento) {
      const doc = soDigitos(await decifrar(o.chaveCifra, c.identificacao_documento));
      if (doc) return pseudo('C', doc);
    }
    return pseudo('C', `nome:${normalizarNome(c.identificacao_nome ?? '')}`);
  };
  const vendedor = async (c: LinhaCotacao) => (c.dono_id ? pseudo('V', c.dono_id) : '');

  // código do produto no pacote: produto + valores das dimensões de categoria (LISBOA|ALTA|DUPLO)
  const produtosDoPacote = new Map<string, { descricao: string; categoria: string; linha: string }>();
  const codigoProduto = (c: LinhaCotacao) => {
    const p = porCodigo.get(c.produto);
    const valores = (p?.dimensoes ?? []).map((d) => {
      const v = String(c.dimensoes?.[d.codigo] ?? '');
      return { v, nome: d.valores?.find((x) => x.codigo === v)?.nome ?? v };
    });
    const codigo = [c.produto, ...valores.map((x) => x.v.toUpperCase())].filter(Boolean).join('|');
    if (!produtosDoPacote.has(codigo)) {
      produtosDoPacote.set(codigo, { descricao: [p?.nome ?? c.produto, ...valores.map((x) => x.nome)].filter(Boolean).join(' · '), categoria: p?.nome ?? c.produto, linha: c.produto });
    }
    return codigo;
  };

  const transacoes: ArquivoPacote = { nome: 'transacoes.csv', cabecalhos: [...CABECALHOS.transacoes], linhas: [] };
  const linhasCotacoes: ArquivoPacote = { nome: 'cotacoes.csv', cabecalhos: [...CABECALHOS.cotacoes], linhas: [] };
  const custoPorProduto = new Map<string, { custo: number; quantidade: number }>();
  const comissaoPorCanal = new Map<string, { comissao: number; receita: number }>();
  let variavelPct = 0;
  let receitaAceita = 0;
  const contas = new Map<string, string>(); // conta -> vendedor da cotação mais recente
  const versoesMotor = new Set<string>();

  for (const c of cotacoes) {
    const q = n(c.quantidade) || 1;
    const produto = codigoProduto(c);
    const codConta = await conta(c);
    const codVendedor = await vendedor(c);
    const canal = c.canal ?? CANAL_DIRETO;
    contas.set(codConta, codVendedor);
    versoesMotor.add(c.motor_versao);
    // preço de lista = tabela já com os fatores dela (grupo, temporada, acomodação): é o preço antes
    // da negociação. Assim lista − desconto comercial − promocional fecha com o faturado.
    const lista = (n(c.preco_final) + n(c.desconto_valor) + n(c.campanha_valor)) / q;
    const faturado = n(c.preco_final) / q;
    const cambios = c.cambios ?? [];

    linhasCotacoes.linhas.push([
      c.numero, c.data, c.status, produto, codConta, canal, codVendedor, num(q), num(lista), num(faturado), num(n(c.preco_final), 2),
      num(n(c.desconto_pct), 4), num(n(c.desconto_valor), 2), num(n(c.campanha_valor), 2), num(n(c.comissao_pct), 4), num(n(c.comissao_valor), 2),
      num(n(c.comissao_vendedor_valor), 2), num(n(c.margem_valor), 2), num(n(c.margem_pct), 4), c.veredito, c.nivel_alcada,
      c.status === 'perdida' ? c.desfecho_categoria : null, c.concorrente_preco === null ? null : num(n(c.concorrente_preco), 2),
      cambios.map((x) => x.moeda).join('|') || null, cambios.map((x) => num(n(x.taxa))).join('|') || null,
      cambios.map((x) => (x.cambioEquilibrio === null ? '' : num(n(x.cambioEquilibrio)))).join('|') || null,
      cambios.map((x) => (x.folgaPct === null ? '' : num(n(x.folgaPct), 2))).join('|') || null,
      c.motor_versao, null, null,
    ]);

    if (c.status !== 'aceita') continue;
    transacoes.linhas.push([c.data, c.numero, produto, codConta, canal, num(q), num(lista), num(faturado), num(n(c.desconto_valor) / q), num(n(c.campanha_valor) / q)]);
    receitaAceita += n(c.preco_final);

    // custos lidos do detalhamento gravado: valor fixo vira custo unitário; percentual, custo de servir
    let fixo = 0;
    let percentual = 0;
    for (const l of c.detalhamento ?? []) {
      if (l.etapa === 'custos') {
        if (l.percentual !== undefined && l.percentual !== null) percentual += -n(l.valor);
        else fixo += -n(l.valor);
      } else if (l.etapa === 'impostos') percentual += -n(l.valor);
    }
    if (c.comissao_vendedor_deduzida) percentual += n(c.comissao_vendedor_valor);
    variavelPct += percentual;
    const cp = custoPorProduto.get(produto) ?? { custo: 0, quantidade: 0 };
    cp.custo += fixo;
    cp.quantidade += q;
    custoPorProduto.set(produto, cp);
    if (c.canal) {
      const cc = comissaoPorCanal.get(c.canal) ?? { comissao: 0, receita: 0 };
      cc.comissao += n(c.comissao_valor);
      cc.receita += n(c.preco_final);
      comissaoPorCanal.set(c.canal, cc);
    }
  }

  const custos: ArquivoPacote = {
    nome: 'custos.csv',
    cabecalhos: [...CABECALHOS.custos],
    linhas: [...custoPorProduto].sort(([a], [b]) => a.localeCompare(b)).map(([p, x]) => [p, num(x.custo / x.quantidade, 4), inicio]),
  };
  const produtosCsv: ArquivoPacote = {
    nome: 'produtos.csv',
    cabecalhos: [...CABECALHOS.produtos],
    linhas: [...produtosDoPacote].sort(([a], [b]) => a.localeCompare(b)).map(([codigo, p]) => [codigo, p.descricao, p.categoria, p.linha]),
  };
  const contasCsv: ArquivoPacote = {
    nome: 'contas.csv',
    cabecalhos: [...CABECALHOS.contas],
    linhas: [...contas].sort(([a], [b]) => a.localeCompare(b)).map(([codigo, v]) => [codigo, null, null, null, v || null]),
  };
  const custosServir: ArquivoPacote = {
    nome: 'custos_servir.csv',
    cabecalhos: [...CABECALHOS.custos_servir],
    linhas: [
      ...[...comissaoPorCanal].sort(([a], [b]) => a.localeCompare(b)).map(([canal, x]) => ['comissao', canal, null, num((x.comissao / x.receita) * 100, 4)]),
      ...(receitaAceita > 0 ? [['outros', null, null, num((variavelPct / receitaAceita) * 100, 4)]] : []),
    ],
  };

  const arquivos = [transacoes, custos, produtosCsv, contasCsv, custosServir, linhasCotacoes];
  const conteudos = new Map(arquivos.map((a) => [a.nome, paraCsv(a)]));
  const somaPreco = (a: ArquivoPacote) => {
    if (a.nome === 'transacoes.csv') return Math.round(a.linhas.reduce((s, l) => s + n(l[5]) * n(l[7]), 0) * 100) / 100;
    if (a.nome === 'cotacoes.csv') return Math.round(a.linhas.reduce((s, l) => s + n(l[10]), 0) * 100) / 100;
    return null;
  };
  const descricao = await Promise.all(
    arquivos.map(async (a) => ({ nome: a.nome, linhas: a.linhas.length, somaPreco: somaPreco(a), sha256: await sha256(conteudos.get(a.nome)!) })),
  );
  const manifesto = {
    contrato: CONTRATO_PACOTE,
    instancia: await codigoPseudonimo('I', o.segredo, o.orgId),
    competencia: o.competencia,
    periodo: { inicio, fim },
    geradoEm: o.agora.toISOString(),
    motorVersao: VERSAO_MOTOR,
    motorVersoesNasCotacoes: [...versoesMotor].sort(),
    modoConta: o.modoConta,
    canalDireto: CANAL_DIRETO,
    // muda só quando os dados mudam (o ZIP muda a cada geração, pela data)
    hashConteudo: await sha256(descricao.map((d) => `${d.nome}:${d.sha256}`).join('\n')),
    arquivos: descricao,
  };
  // data fixa nos itens do ZIP: o mesmo conteúdo gera os mesmos bytes de arquivo
  const mtime = new Date(`${inicio}T12:00:00Z`);
  const zip = zipSync(
    {
      'manifesto.json': [strToU8(`${JSON.stringify(manifesto, null, 2)}\n`), { mtime }],
      ...Object.fromEntries(arquivos.map((a) => [a.nome, [strToU8(conteudos.get(a.nome)!), { mtime }]])),
    },
    { level: 6 },
  );
  const hash = await sha256Bytes(zip);
  return { arquivos, manifesto, zip, hash, linhas: Object.fromEntries(arquivos.map((a) => [a.nome, a.linhas.length])) };
}

async function sha256Bytes(b: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', b as BufferSource));
  return [...d].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Mês anterior ao da data informada, AAAA-MM. */
export function mesAnterior(hojeIso: string): string {
  const [a, m] = hojeIso.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(a, m - 2, 1));
  return d.toISOString().slice(0, 7);
}
