// Leitura dos arquivos do cliente no navegador: separa colunas, sugere o de-para para o esquema
// padrão e converte número e data do formato brasileiro. Nada aqui calcula métrica.

export type Tipo = 'texto' | 'numero' | 'data';
export interface Campo { campo: string; rotulo: string; tipo: Tipo; obrigatorio?: boolean; reserva?: boolean; sinonimos: string[] }

export const CAMPOS: Record<string, Campo[]> = {
  transacoes: [
    { campo: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true, sinonimos: ['dataemissao', 'dtemissao', 'emissao', 'datavenda', 'datanf', 'data'] },
    { campo: 'nota_fiscal', rotulo: 'Nota fiscal ou localizador', tipo: 'texto', sinonimos: ['notafiscal', 'numeronf', 'nf', 'localizador', 'nota', 'documento', 'pedido'] },
    { campo: 'produto', rotulo: 'Código do produto', tipo: 'texto', obrigatorio: true, sinonimos: ['codproduto', 'codigoproduto', 'codpacote', 'produto', 'pacote', 'sku', 'coditem', 'item'] },
    { campo: 'conta', rotulo: 'Código do cliente', tipo: 'texto', obrigatorio: true, sinonimos: ['codcliente', 'codigocliente', 'codagencia', 'cliente', 'codconta', 'conta', 'agencia'] },
    { campo: 'canal', rotulo: 'Canal', tipo: 'texto', sinonimos: ['canalvenda', 'canal'] },
    { campo: 'quantidade', rotulo: 'Quantidade (ou passageiros)', tipo: 'numero', obrigatorio: true, sinonimos: ['quantidade', 'qtde', 'qtd', 'passageiros', 'pax', 'volume'] },
    { campo: 'preco_lista', rotulo: 'Preço de lista (unitário)', tipo: 'numero', obrigatorio: true, sinonimos: ['precotabela', 'precolista', 'precodelista', 'precocheio', 'tarifa', 'tabela'] },
    { campo: 'preco_faturado', rotulo: 'Preço faturado (unitário)', tipo: 'numero', obrigatorio: true, sinonimos: ['precounitnf', 'precofaturado', 'precounitario', 'precoliquido', 'precovenda', 'precopraticado', 'valorvendido', 'precounit'] },
    { campo: 'desc_comercial', rotulo: 'Desconto comercial (unitário)', tipo: 'numero', sinonimos: ['desccomercial', 'descontocomercial', 'desconto'] },
    { campo: 'desc_volume', rotulo: 'Desconto por volume (unitário)', tipo: 'numero', sinonimos: ['descvolume', 'descontovolume', 'descontoporvolume'] },
    { campo: 'desc_promocional', rotulo: 'Desconto promocional (unitário)', tipo: 'numero', sinonimos: ['descpromocional', 'descpromo', 'descontopromocional'] },
    { campo: 'desc_financeiro', rotulo: 'Desconto financeiro (unitário)', tipo: 'numero', sinonimos: ['descfinanceiro', 'descontofinanceiro'] },
    // reserva (turismo): todos opcionais; com custo em moeda, o custo vem da própria reserva
    { campo: 'data_servico', rotulo: 'Data do serviço (embarque)', tipo: 'data', reserva: true, sinonimos: ['dataservico', 'dataembarque', 'embarque', 'checkin', 'datasaida'] },
    { campo: 'fornecedor', rotulo: 'Fornecedor', tipo: 'texto', reserva: true, sinonimos: ['fornecedor', 'receptivo'] },
    { campo: 'custo_unitario_moeda', rotulo: 'Custo unitário na moeda do fornecedor', tipo: 'numero', reserva: true, sinonimos: ['custounitariomoeda', 'customoeda', 'custofornecedor'] },
    { campo: 'moeda_custo', rotulo: 'Moeda do custo (EUR, USD, BRL)', tipo: 'texto', reserva: true, sinonimos: ['moedacusto', 'moeda'] },
    { campo: 'cambio_venda', rotulo: 'Câmbio da venda', tipo: 'numero', reserva: true, sinonimos: ['cambiovenda', 'cambiodavenda'] },
    { campo: 'cambio_pagamento', rotulo: 'Câmbio do pagamento ao fornecedor', tipo: 'numero', reserva: true, sinonimos: ['cambiopagamento', 'cambiodopagamento'] },
    { campo: 'data_pagamento_fornecedor', rotulo: 'Data do pagamento ao fornecedor', tipo: 'data', reserva: true, sinonimos: ['datapagamentofornecedor', 'datapagamento'] },
    { campo: 'over_unitario', rotulo: 'Over por unidade (R$)', tipo: 'numero', reserva: true, sinonimos: ['overunitario', 'over', 'incentivofornecedor'] },
    { campo: 'status_reserva', rotulo: 'Status da reserva', tipo: 'texto', reserva: true, sinonimos: ['statusreserva', 'status', 'situacao'] },
  ],
  custos: [
    { campo: 'produto', rotulo: 'Código do produto', tipo: 'texto', obrigatorio: true, sinonimos: ['codproduto', 'codigoproduto', 'produto', 'sku', 'item'] },
    { campo: 'custo_unitario', rotulo: 'Custo unitário', tipo: 'numero', obrigatorio: true, sinonimos: ['custounitario', 'custounit', 'custo', 'cmv'] },
    { campo: 'vigencia_inicio', rotulo: 'Início da vigência', tipo: 'data', sinonimos: ['vigenciainicio', 'vigencia', 'apartirde', 'data'] },
  ],
  produtos: [
    { campo: 'codigo', rotulo: 'Código do produto', tipo: 'texto', obrigatorio: true, sinonimos: ['codproduto', 'codigoproduto', 'codpacote', 'codigo', 'sku', 'produto', 'pacote'] },
    { campo: 'descricao', rotulo: 'Descrição', tipo: 'texto', sinonimos: ['descricao', 'nome'] },
    { campo: 'categoria', rotulo: 'Categoria (ou destino)', tipo: 'texto', sinonimos: ['categoria', 'destino', 'familia', 'grupo'] },
    { campo: 'linha', rotulo: 'Linha', tipo: 'texto', sinonimos: ['linha'] },
  ],
  contas: [
    { campo: 'codigo', rotulo: 'Código do cliente', tipo: 'texto', obrigatorio: true, sinonimos: ['codcliente', 'codigocliente', 'codagencia', 'codigo', 'cliente', 'conta', 'agencia'] },
    { campo: 'nome', rotulo: 'Nome', tipo: 'texto', sinonimos: ['razaosocial', 'nomefantasia', 'nome'] },
    { campo: 'segmento', rotulo: 'Segmento', tipo: 'texto', sinonimos: ['segmento', 'ramo'] },
    { campo: 'porte', rotulo: 'Porte', tipo: 'texto', sinonimos: ['porte', 'tamanho'] },
    { campo: 'regiao', rotulo: 'Região', tipo: 'texto', sinonimos: ['regiao', 'uf', 'estado'] },
    { campo: 'vendedor', rotulo: 'Vendedor', tipo: 'texto', sinonimos: ['vendedor', 'executivodecontas', 'executivo', 'representante', 'responsavel'] },
  ],
  custos_servir: [
    { campo: 'tipo', rotulo: 'Tipo (frete, comissão, prazo, outros)', tipo: 'texto', obrigatorio: true, sinonimos: ['tipo'] },
    { campo: 'canal', rotulo: 'Canal (vazio = todos)', tipo: 'texto', sinonimos: ['canal'] },
    { campo: 'conta', rotulo: 'Código do cliente (vazio = todos)', tipo: 'texto', sinonimos: ['codcliente', 'codigocliente', 'codagencia', 'cliente', 'conta', 'agencia'] },
    { campo: 'percentual', rotulo: 'Percentual sobre o faturado', tipo: 'numero', obrigatorio: true, sinonimos: ['percentual', 'perc', 'aliquota', 'taxa'] },
  ],
  descontos_fora_fatura: [
    { campo: 'conta', rotulo: 'Código do cliente', tipo: 'texto', obrigatorio: true, sinonimos: ['codcliente', 'codigocliente', 'codagencia', 'cliente', 'conta', 'agencia'] },
    { campo: 'mes', rotulo: 'Mês', tipo: 'data', obrigatorio: true, sinonimos: ['mes', 'competencia', 'periodo', 'data'] },
    { campo: 'tipo', rotulo: 'Tipo (rebate, bonificação, verba)', tipo: 'texto', sinonimos: ['tipo'] },
    { campo: 'valor', rotulo: 'Valor total', tipo: 'numero', obrigatorio: true, sinonimos: ['valor', 'total'] },
  ],
  bloqueios: [
    { campo: 'produto', rotulo: 'Código do produto', tipo: 'texto', obrigatorio: true, sinonimos: ['codproduto', 'codpacote', 'produto', 'pacote'] },
    { campo: 'fornecedor', rotulo: 'Fornecedor', tipo: 'texto', sinonimos: ['fornecedor', 'receptivo'] },
    { campo: 'data_servico', rotulo: 'Data do serviço (saída)', tipo: 'data', sinonimos: ['dataservico', 'dataembarque', 'datasaida', 'embarque', 'saida'] },
    { campo: 'lugares_contratados', rotulo: 'Lugares contratados', tipo: 'numero', obrigatorio: true, sinonimos: ['lugarescontratados', 'contratados', 'lugares'] },
    { campo: 'lugares_vendidos', rotulo: 'Lugares vendidos', tipo: 'numero', obrigatorio: true, sinonimos: ['lugaresvendidos', 'vendidos'] },
    { campo: 'data_devolucao', rotulo: 'Prazo de devolução', tipo: 'data', sinonimos: ['datadevolucao', 'prazodevolucao', 'devolucao'] },
    { campo: 'multa_por_lugar', rotulo: 'Multa por lugar (R$)', tipo: 'numero', sinonimos: ['multaporlugar', 'multa'] },
    { campo: 'custo_unitario_moeda', rotulo: 'Custo do lugar na moeda do fornecedor', tipo: 'numero', sinonimos: ['custounitariomoeda', 'customoeda', 'custolugar', 'custo'] },
    { campo: 'moeda', rotulo: 'Moeda (EUR, USD, BRL)', tipo: 'texto', sinonimos: ['moeda'] },
  ],
};

export interface Planilha { cabecalhos: string[]; linhas: string[][] }

/** Lê o arquivo como UTF-8 e, se vier com caracteres quebrados, como Windows-1252 (padrão de ERP e Excel). */
export async function lerArquivo(arquivo: File): Promise<string> {
  const bytes = await arquivo.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  return (utf8.includes('�') ? new TextDecoder('windows-1252').decode(bytes) : utf8).replace(/^﻿/, '');
}

export function lerCsv(texto: string): Planilha {
  const primeira = texto.slice(0, texto.search(/\r?\n/) === -1 ? undefined : texto.search(/\r?\n/));
  const contar = (s: string) => primeira.split(s).length;
  const sep = contar(';') >= contar(',') && contar(';') >= contar('\t') ? ';' : contar('\t') > contar(',') ? '\t' : ',';
  const linhas: string[][] = [];
  let linha: string[] = [];
  let celula = '';
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]!;
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { celula += '"'; i++; }
      else if (c === '"') aspas = false;
      else celula += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(celula); celula = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(celula); celula = '';
      if (linha.some((x) => x.trim() !== '')) linhas.push(linha);
      linha = [];
    } else celula += c;
  }
  linha.push(celula);
  if (linha.some((x) => x.trim() !== '')) linhas.push(linha);
  const [cabecalhos = [], ...resto] = linhas;
  return { cabecalhos: cabecalhos.map((c) => c.trim()), linhas: resto };
}

const chave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Sugere, para cada campo do esquema, a coluna do arquivo. O usuário confirma antes de gravar. */
export function sugerirMapeamento(cabecalhos: string[], bloco: string): Record<string, string> {
  const livres = new Map(cabecalhos.map((c) => [chave(c), c]));
  const saida: Record<string, string> = {};
  const campos = CAMPOS[bloco] ?? [];
  for (const exato of [true, false]) {
    for (const campo of campos) {
      if (saida[campo.campo]) continue;
      for (const s of campo.sinonimos) {
        const achou = [...livres.keys()].find((k) => (exato ? k === s : k.includes(s)));
        if (achou) { saida[campo.campo] = livres.get(achou)!; livres.delete(achou); break; }
      }
    }
  }
  return saida;
}

export function paraNumero(bruto: string): number | null {
  let s = bruto.replace(/[R$\s%]/g, '');
  if (s === '') return null;
  const virgula = s.lastIndexOf(','), ponto = s.lastIndexOf('.');
  if (virgula > ponto) s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56
  else if (virgula !== -1) s = s.replace(/,/g, ''); // 1,234.56
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function paraData(bruto: string): string | null {
  const s = bruto.trim();
  let m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/.exec(s);
  if (m) return iso(+m[1]!, +m[2]!, +(m[3] ?? 1));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s);
  if (m) return iso(+m[3]! < 100 ? 2000 + +m[3]! : +m[3]!, +m[2]!, +m[1]!);
  m = /^(\d{1,2})[/.-](\d{4})$/.exec(s); // mm/aaaa
  if (m) return iso(+m[2]!, +m[1]!, 1);
  return null;
}
function iso(a: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Converte as linhas do arquivo para o esquema padrão, segundo o de-para confirmado. */
export function converter(planilha: Planilha, mapeamento: Record<string, string>, bloco: string): Record<string, string | number | null>[] {
  const campos = (CAMPOS[bloco] ?? []).filter((c) => mapeamento[c.campo]);
  const indice = new Map(planilha.cabecalhos.map((c, i) => [c, i]));
  return planilha.linhas.map((l) => {
    const o: Record<string, string | number | null> = {};
    for (const c of campos) {
      const bruto = (l[indice.get(mapeamento[c.campo]!)!] ?? '').trim();
      o[c.campo] = bruto === '' ? null : c.tipo === 'numero' ? paraNumero(bruto) : c.tipo === 'data' ? paraData(bruto) : bruto;
    }
    return o;
  });
}
