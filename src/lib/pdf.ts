export interface CotacaoPDFData {
  id: string
  nome_agencia?: string
  created?: string | Date
  fatura_total: number
  moeda?: string
  forma_pagamento?: string
}

export interface ProdutoDetalhePDF {
  produto_nome: string
  tipo_cobranca?: string
  preco_total_produto: number
  coberturas: {
    nome: string
    valor: string
  }[]
}

class PDFBuilder {
  pages: string[][] = []

  addPage() {
    this.pages.push([])
  }

  escapeText(text: string): string {
    if (!text) return ''
    let result = ''
    const str = String(text)
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i)
      if (code === 40)
        result += '\\(' // Escape '('
      else if (code === 41)
        result += '\\)' // Escape ')'
      else if (code === 92)
        result += '\\\\' // Escape '\'
      else if (code > 127 && code < 256) {
        // Encode extended ascii to octal to avoid UTF-8 mismatch via Blob
        result += '\\' + code.toString(8).padStart(3, '0')
      } else if (code >= 256) {
        // Strip unicode outside WinAnsi
        result += '?'
      } else {
        result += str[i]
      }
    }
    return result
  }

  addText(
    text: string,
    x: number,
    y: number,
    size: number = 10,
    font: 'F1' | 'F2' = 'F1',
    r = 0,
    g = 0,
    b = 0,
  ) {
    if (this.pages.length === 0) this.addPage()
    const escaped = this.escapeText(text)
    this.pages[this.pages.length - 1].push(
      `${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} rg BT /${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escaped}) Tj ET 0 0 0 rg`,
    )
  }

  addRect(x: number, y: number, w: number, h: number, r = 0, g = 0, b = 0, fill = false) {
    if (this.pages.length === 0) this.addPage()
    const op = fill ? 'f' : 'S'
    this.pages[this.pages.length - 1].push(
      `${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} RG ${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${op} 0 0 0 RG 0 0 0 rg`,
    )
  }

  addLine(x1: number, y1: number, x2: number, y2: number, r = 0, g = 0, b = 0, lineWidth = 1) {
    if (this.pages.length === 0) this.addPage()
    this.pages[this.pages.length - 1].push(
      `${lineWidth.toFixed(2)} w ${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} RG ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S 1 w 0 0 0 RG`,
    )
  }

  build(): Blob {
    const header = '%PDF-1.4\n'

    let objects: string[] = []
    let xref: number[] = []
    let currentOffset = header.length

    const addObj = (content: string) => {
      xref.push(currentOffset)
      const obj = `${xref.length + 1} 0 obj\n${content}\nendobj\n`
      objects.push(obj)
      currentOffset += obj.length
    }

    const pageObjectsStartIndex = 5
    const numPages = this.pages.length || 1
    const kids = Array.from(
      { length: numPages },
      (_, i) => `${pageObjectsStartIndex + i * 2} 0 R`,
    ).join(' ')

    addObj(`<< /Type /Catalog /Pages 2 0 R >>`)
    addObj(`<< /Type /Pages /Kids [${kids}] /Count ${numPages} >>`)
    addObj(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`)
    addObj(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`)

    for (let i = 0; i < numPages; i++) {
      const streamContent = this.pages[i]?.join('\n') || ''
      const streamLen = new Blob([streamContent]).size // count accurate bytes
      const contentObjIdx = pageObjectsStartIndex + i * 2 + 1

      addObj(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentObjIdx} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`,
      )
      addObj(`<< /Length ${streamLen} >>\nstream\n${streamContent}\nendstream`)
    }

    const xrefData =
      `xref\n0 ${xref.length + 1}\n0000000000 65535 f \n` +
      xref.map((off) => `${off.toString().padStart(10, '0')} 00000 n \n`).join('')

    const trailer = `trailer\n<< /Size ${xref.length + 1} /Root 1 0 R >>\nstartxref\n${currentOffset}\n%%EOF`

    return new Blob([header + objects.join('') + xrefData + trailer], { type: 'application/pdf' })
  }
}

export function gerarPDFProposta(cotacao: CotacaoPDFData, produtos: ProdutoDetalhePDF[]): Blob {
  const pdf = new PDFBuilder()
  const PAGE_W = 595
  const PAGE_H = 842
  const MARGIN = 57 // ~20mm
  const HEADER_Y = PAGE_H - MARGIN
  const FOOTER_Y = 40

  const COL_WIDTH = 230
  const COL_GAP = 21
  const ROW_HEIGHT = 340
  const ROW_GAP = 20

  const startX = MARGIN
  const startY = HEADER_Y - 40 // ~745

  const truncate = (str: string, len: number) =>
    str.length > len ? str.substring(0, len - 3) + '...' : str

  const totalPages = Math.ceil(Math.max(1, produtos.length) / 4)

  for (let page = 0; page < totalPages; page++) {
    pdf.addPage()

    // Header
    const dataFormatada = cotacao.created
      ? new Date(cotacao.created).toLocaleDateString('pt-BR')
      : new Date().toLocaleDateString('pt-BR')
    const headerText = `Cotação ${cotacao.id} | Data: ${dataFormatada} | Agência: ${cotacao.nome_agencia || 'N/A'}`
    pdf.addText(headerText, MARGIN, HEADER_Y, 10, 'F2', 0.2, 0.2, 0.2)
    pdf.addLine(MARGIN, HEADER_Y - 10, PAGE_W - MARGIN, HEADER_Y - 10, 0.8, 0.8, 0.8)

    // Footer
    pdf.addLine(MARGIN, FOOTER_Y + 15, PAGE_W - MARGIN, FOOTER_Y + 15, 0.8, 0.8, 0.8)
    pdf.addText(
      `Página ${page + 1} de ${totalPages} | Now Assistance`,
      MARGIN,
      FOOTER_Y,
      9,
      'F1',
      0.4,
      0.4,
      0.4,
    )

    // 2x2 Grid setup
    const prodsPage = produtos.slice(page * 4, page * 4 + 4)

    prodsPage.forEach((prod, i) => {
      const col = i % 2
      const row = Math.floor(i / 2)

      const x = startX + col * (COL_WIDTH + COL_GAP)
      const yTop = startY - row * (ROW_HEIGHT + ROW_GAP)

      // Card Container
      pdf.addRect(x - 5, yTop - ROW_HEIGHT + 5, COL_WIDTH + 10, ROW_HEIGHT, 0.9, 0.9, 0.9)

      // Card Info
      pdf.addText(truncate(prod.produto_nome, 35), x, yTop - 15, 12, 'F2')
      pdf.addText(
        `Cobrança: ${prod.tipo_cobranca === 'anual' ? 'Anual' : 'Dia'}`,
        x,
        yTop - 28,
        9,
        'F1',
        0.4,
        0.4,
        0.4,
      )
      pdf.addText(
        `${cotacao.moeda || 'USD'} ${prod.preco_total_produto.toFixed(2)}`,
        x,
        yTop - 50,
        16,
        'F2',
        0.1,
        0.5,
        0.2,
      )

      // Table Header
      const thY = yTop - 75
      pdf.addRect(x, thY - 5, COL_WIDTH, 14, 0.95, 0.95, 0.95, true)
      pdf.addText('Cobertura', x + 5, thY, 7, 'F2')
      pdf.addText('Valor', x + COL_WIDTH - 50, thY, 7, 'F2')

      // Table Rows (Max 39 to fit inside card layout)
      const maxRows = 39
      const hasMore = prod.coberturas.length > maxRows
      const showCount = hasMore ? maxRows - 1 : Math.min(prod.coberturas.length, maxRows)

      for (let j = 0; j < showCount; j++) {
        const cob = prod.coberturas[j]
        const rowY = thY - 12 - j * 6.5

        pdf.addText(truncate(cob.nome, 50), x + 5, rowY, 5.5, 'F1')
        pdf.addText(truncate(cob.valor, 15), x + COL_WIDTH - 50, rowY, 5.5, 'F1')
        pdf.addLine(x, rowY - 1.5, x + COL_WIDTH, rowY - 1.5, 0.95, 0.95, 0.95, 0.5)
      }

      // Truncation row if items exceed capacity
      if (hasMore) {
        const rowY = thY - 12 - showCount * 6.5
        const restantes = prod.coberturas.length - showCount
        pdf.addText(`... e mais ${restantes} coberturas`, x + 5, rowY, 5.5, 'F2', 0.5, 0.5, 0.5)
      }
    })
  }

  // Fallback if no products
  if (produtos.length === 0) {
    pdf.addPage()
    const dataFormatada = cotacao.created
      ? new Date(cotacao.created).toLocaleDateString('pt-BR')
      : new Date().toLocaleDateString('pt-BR')
    const headerText = `Cotação ${cotacao.id} | Data: ${dataFormatada} | Agência: ${cotacao.nome_agencia || 'N/A'}`
    pdf.addText(headerText, MARGIN, HEADER_Y, 10, 'F2', 0.2, 0.2, 0.2)
    pdf.addText('Nenhum produto selecionado na cotação.', MARGIN, HEADER_Y - 40, 12, 'F1')
  }

  return pdf.build()
}
