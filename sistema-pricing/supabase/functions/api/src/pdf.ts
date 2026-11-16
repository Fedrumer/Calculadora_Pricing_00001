import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from 'pdf-lib';
import type { DefinicaoDimensao, Produto, ResultadoPublico } from '@pricing/motor';

export interface DadosProposta {
  numero: number;
  versao: number;
  emitidaEm: string;
  validade: string;
  cliente: { nome: string; email?: string | null };
  canalNome: string | null;
  vendedorNome: string | null;
  produto: Produto;
  dimensoes: DefinicaoDimensao[];
  entrada: { dimensoes: Record<string, string | number>; componentes?: string[] };
  resultado: ResultadoPublico;
  identidade: { nomeFantasia?: string; corPrimaria?: string; corDestaque?: string; rodapeProposta?: string };
}

const dataBr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

export function moedaBr(valor: number, moeda = 'BRL'): string {
  const [inteiro = '0', fracao = '00'] = Math.abs(valor).toFixed(2).split('.');
  const simbolo = moeda === 'BRL' ? 'R$' : moeda;
  return `${valor < 0 ? '-' : ''}${simbolo} ${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fracao}`;
}

function cor(hex: string | undefined, padrao: [number, number, number]) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? '');
  const [r, g, b] = m ? [m[1]!, m[2]!, m[3]!].map((x) => parseInt(x, 16) / 255) : padrao;
  return rgb(r!, g!, b!);
}

/** As fontes padrão do PDF usam WinAnsi: troca o que não existe nessa tabela. */
const limpar = (texto: string) =>
  texto
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E -ÿ]/g, '?');

function quebrar(texto: string, fonte: PDFFont, tamanho: number, largura: number): string[] {
  const linhas: string[] = [];
  let atual = '';
  for (const palavra of limpar(texto).split(/\s+/)) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (fonte.widthOfTextAtSize(tentativa, tamanho) > largura && atual) {
      linhas.push(atual);
      atual = palavra;
    } else atual = tentativa;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/** Proposta em PDF, gerada no servidor a partir da versão emitida. */
export async function gerarProposta(d: DadosProposta): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(limpar(`Proposta ${d.numero}`));
  pdf.setCreator('Sistema de Pricing');
  const pagina: PDFPage = pdf.addPage([595.28, 841.89]);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const primaria = cor(d.identidade.corPrimaria, [0.06, 0.3, 0.36]);
  const destaque = cor(d.identidade.corDestaque, [0.89, 0.39, 0.08]);
  const cinza = rgb(0.38, 0.4, 0.44);
  const preto = rgb(0.1, 0.11, 0.13);
  const margem = 48;
  const largura = pagina.getWidth() - margem * 2;
  let y = pagina.getHeight();

  const texto = (t: string, x: number, yy: number, o: { fonte?: PDFFont; tamanho?: number; cor?: ReturnType<typeof rgb> } = {}) =>
    pagina.drawText(limpar(t), { x, y: yy, size: o.tamanho ?? 10, font: o.fonte ?? normal, color: o.cor ?? preto });
  const aDireita = (t: string, xDireita: number, yy: number, o: { fonte?: PDFFont; tamanho?: number; cor?: ReturnType<typeof rgb> } = {}) => {
    const f = o.fonte ?? normal;
    const s = o.tamanho ?? 10;
    texto(t, xDireita - f.widthOfTextAtSize(limpar(t), s), yy, o);
  };

  pagina.drawRectangle({ x: 0, y: y - 96, width: pagina.getWidth(), height: 96, color: primaria });
  texto(d.identidade.nomeFantasia ?? 'Proposta comercial', margem, y - 46, { fonte: negrito, tamanho: 20, cor: rgb(1, 1, 1) });
  texto('Proposta comercial', margem, y - 68, { tamanho: 11, cor: rgb(1, 1, 1) });
  aDireita(`Nº ${String(d.numero).padStart(6, '0')}`, margem + largura, y - 46, { fonte: negrito, tamanho: 16, cor: rgb(1, 1, 1) });
  aDireita(`versão ${d.versao}`, margem + largura, y - 68, { tamanho: 10, cor: rgb(1, 1, 1) });
  y -= 126;

  const campo = (rotulo: string, valor: string, x: number, yy: number) => {
    texto(rotulo.toUpperCase(), x, yy, { tamanho: 7.5, cor: cinza });
    texto(valor, x, yy - 14, { tamanho: 11 });
  };
  campo('Cliente', d.cliente.nome, margem, y);
  campo('Emissão', dataBr(d.emitidaEm), margem + 300, y);
  campo('Válida até', dataBr(d.validade), margem + 400, y);
  y -= 40;
  if (d.cliente.email) campo('E-mail', d.cliente.email, margem, y);
  if (d.canalNome) campo('Canal', d.canalNome, margem + 300, y);
  else if (d.vendedorNome) campo('Atendimento', d.vendedorNome, margem + 300, y);
  y -= 48;

  texto(d.produto.nome, margem, y, { fonte: negrito, tamanho: 14, cor: primaria });
  y -= 20;
  const escolhidos = d.produto.componentes.filter((c) => c.ativo && (c.obrigatorio || d.entrada.componentes?.includes(c.codigo)));
  if (escolhidos.length > 0) {
    for (const linha of quebrar(`Inclui: ${escolhidos.map((c) => c.nome).join(', ')}.`, normal, 10, largura)) {
      texto(linha, margem, y, { cor: cinza });
      y -= 14;
    }
  }
  y -= 8;

  const usados = [...new Set([...d.produto.dimensoes, ...d.produto.multiplicadores])];
  let coluna = 0;
  for (const codigo of usados) {
    const definicao = d.dimensoes.find((x) => x.codigo === codigo);
    if (!definicao) continue;
    const bruto = d.entrada.dimensoes[codigo];
    const rotulo = definicao.tipo === 'categoria' ? (definicao.valores?.find((v) => v.codigo === String(bruto))?.nome ?? String(bruto)) : String(bruto);
    campo(definicao.nome, rotulo, margem + (coluna % 3) * (largura / 3), y);
    coluna += 1;
    if (coluna % 3 === 0) y -= 38;
  }
  if (coluna % 3 !== 0) y -= 38;
  y -= 10;

  pagina.drawRectangle({ x: margem, y: y - 6, width: largura, height: 22, color: rgb(0.95, 0.96, 0.97) });
  texto('Composição do preço', margem + 8, y, { fonte: negrito, tamanho: 9.5 });
  aDireita('Valor', margem + largura - 8, y, { fonte: negrito, tamanho: 9.5 });
  y -= 24;
  for (const linha of d.resultado.detalhamento.filter((l) => l.tipo !== 'comissao')) {
    const rotulo = linha.percentual !== undefined && !linha.descricao.startsWith('Preço')
      ? `${linha.descricao} (${String(Math.abs(linha.percentual)).replace('.', ',')}%)`
      : linha.descricao;
    texto(quebrar(rotulo, normal, 10, largura - 130)[0] ?? '', margem + 8, y);
    aDireita(moedaBr(linha.valor, d.resultado.moeda), margem + largura - 8, y);
    pagina.drawLine({ start: { x: margem, y: y - 7 }, end: { x: margem + largura, y: y - 7 }, thickness: 0.5, color: rgb(0.88, 0.89, 0.91) });
    y -= 20;
  }
  y -= 8;
  pagina.drawRectangle({ x: margem + largura - 240, y: y - 14, width: 240, height: 40, color: primaria });
  texto('Preço final', margem + largura - 228, y, { tamanho: 10, cor: rgb(1, 1, 1) });
  aDireita(moedaBr(d.resultado.precoFinal, d.resultado.moeda), margem + largura - 12, y - 2, { fonte: negrito, tamanho: 16, cor: rgb(1, 1, 1) });
  y -= 44;

  if (d.resultado.campanhas.length > 0) {
    texto('Condição promocional aplicada nesta proposta.', margem, y, { tamanho: 9, cor: destaque });
    y -= 16;
  }
  texto(`Proposta válida até ${dataBr(d.validade)}. Depois dessa data os valores podem ser revistos.`, margem, y, { tamanho: 9, cor: cinza });

  let yRodape = 62;
  pagina.drawLine({ start: { x: margem, y: yRodape + 14 }, end: { x: margem + largura, y: yRodape + 14 }, thickness: 1.5, color: destaque });
  for (const linha of quebrar(d.identidade.rodapeProposta ?? '', normal, 8, largura).slice(0, 3)) {
    texto(linha, margem, yRodape, { tamanho: 8, cor: cinza });
    yRodape -= 11;
  }
  aDireita(`Proposta ${d.numero}/${d.versao} - tabela v${d.resultado.versoes.tabela.versao}, política v${d.resultado.versoes.politica.versao}`, margem + largura, 30, { tamanho: 7, cor: cinza });

  return pdf.save();
}
