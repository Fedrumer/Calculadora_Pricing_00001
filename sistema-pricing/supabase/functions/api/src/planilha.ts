import { strToU8, zipSync } from 'fflate';
import type { ConjuntoRegras } from '@pricing/motor';

type Celula = string | number | null | undefined;
export interface Aba {
  nome: string;
  linhas: Celula[][];
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function coluna(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Gera um .xlsx mínimo (sem dependência de biblioteca de planilha). */
export function gerarXlsx(abas: Aba[]): Uint8Array {
  const folha = (a: Aba) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${a.linhas
      .map(
        (linha, l) =>
          `<row r="${l + 1}">${linha
            .map((c, i) => {
              const ref = `${coluna(i)}${l + 1}`;
              if (c === null || c === undefined || c === '') return '';
              if (typeof c === 'number' && Number.isFinite(c)) return `<c r="${ref}"${l === 0 ? ' s="1"' : ''}><v>${c}</v></c>`;
              return `<c r="${ref}" t="inlineStr"${l === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${xml(String(c))}</t></is></c>`;
            })
            .join('')}</row>`,
      )
      .join('')}</sheetData></worksheet>`;

  const arquivos: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${abas
        .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
        .join('')}</Types>`,
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${abas
        .map((a, i) => `<sheet name="${xml(a.nome.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('')}</sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${abas
        .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
        .join('')}<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    'xl/styles.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>',
    ),
  };
  abas.forEach((a, i) => {
    arquivos[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(folha(a));
  });
  return zipSync(arquivos, { level: 6 });
}

/**
 * Planilha de contingência: as regras vigentes em formato que o comercial
 * consegue usar se o sistema cair. As cotações feitas por ela são lançadas
 * depois, com marcação de origem.
 */
export function planilhaContingencia(regras: ConjuntoRegras, meta: { organizacao: string; geradaEm: string; vigenciaInicio: string }): Uint8Array {
  const nomeProduto = (codigo: string) => regras.produtos.find((p) => p.codigo === codigo)?.nome ?? codigo;
  const dimsUsadas = [...new Set(regras.tabela.itens.flatMap((i) => Object.keys(i.dimensoes)))];
  const { politica } = regras;
  const etapas = politica.etapas.map((e, i) => `${i + 1}. ${e.nome ?? e.tipo}`);

  return gerarXlsx([
    {
      nome: 'Leia-me',
      linhas: [
        ['Planilha de contingência'],
        ['Organização', meta.organizacao],
        ['Gerada em', meta.geradaEm],
        ['Tabela', `versão ${regras.tabela.versao}, vigente desde ${meta.vigenciaInicio}`],
        ['Política', `versão ${politica.versao}`],
        [],
        ['Use somente se o sistema estiver indisponível.'],
        ['Ordem do cálculo', etapas.join('  >  ')],
        ['Arredondamento', `${politica.arredondamento.casas} casas, ${politica.arredondamento.modo.replace(/_/g, ' ')}`],
        ['Depois que o sistema voltar, lance cada cotação feita por esta planilha com a origem "contingência".'],
        ['Descontos acima do limite de emissão direta continuam exigindo aprovação por escrito de quem tem alçada.'],
      ],
    },
    {
      nome: 'Preços',
      linhas: [
        ['Produto', 'Código', 'Componente', ...dimsUsadas, 'Preço base'],
        ...regras.tabela.itens.map((i) => [
          nomeProduto(i.produto),
          i.produto,
          i.componente ?? '',
          ...dimsUsadas.map((d) => i.dimensoes[d] ?? '(qualquer)'),
          Number(i.precoBase),
        ]),
      ],
    },
    {
      nome: 'Fatores',
      linhas: [
        ['Fator', 'Dimensão', 'Valor', 'Tipo', 'Ajuste', 'Produto'],
        ...regras.tabela.fatores.map((f) => [f.nome, f.dimensao, f.valor, f.tipo, Number(f.ajuste), f.produto ? nomeProduto(f.produto) : '(todos)']),
      ],
    },
    {
      nome: 'Dimensões',
      linhas: [
        ['Dimensão', 'Código', 'Valor ou faixa', 'De', 'Até'],
        ...regras.dimensoes.flatMap((d) =>
          d.tipo === 'categoria'
            ? (d.valores ?? []).map((v): Celula[] => [d.nome, v.codigo, v.nome])
            : (d.faixas ?? []).map((f): Celula[] => [d.nome, f.codigo, f.nome ?? f.codigo, f.min, f.max ?? 'sem teto']),
        ),
      ],
    },
    {
      nome: 'Limites e alçadas',
      linhas: [
        ['Regra', 'Valor'],
        ['Desconto de emissão direta (até, %)', politica.limites.descontoLivrePct],
        ['Desconto máximo (%)', politica.limites.descontoMaximoPct],
        ['Validade da proposta (dias)', politica.validadeDias],
        [],
        ['Alçada', 'Libera desconto até (%)'],
        ...politica.alcadas.map((a): Celula[] => [`Nível ${a.nivel}: ${a.nome}`, a.descontoAtePct]),
        [],
        ['Canal', 'Produto', 'Comissão (%)'],
        ...politica.comissoes.map((c): Celula[] => [c.canal, c.produto ? nomeProduto(c.produto) : '(todos)', c.pct]),
      ],
    },
    {
      nome: 'Campanhas',
      linhas: [
        ['Campanha', 'Início', 'Fim', 'Tipo', 'Valor', 'Acumula com desconto', 'Acumula com outras'],
        ...regras.campanhas.map((c): Celula[] => [c.nome, c.inicio, c.fim, c.tipo, Number(c.valor), c.acumulaComDesconto ? 'sim' : 'não', c.acumulaComOutras ? 'sim' : 'não']),
      ],
    },
    {
      nome: 'Registro de cotações',
      linhas: [['Data', 'Vendedor', 'Cliente', 'Produto', 'Dimensões', 'Desconto (%)', 'Preço final', 'Quem aprovou (se houve exceção)', 'Lançada no sistema?']],
    },
  ]);
}
