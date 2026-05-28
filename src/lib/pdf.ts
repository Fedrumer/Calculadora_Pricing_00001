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
      if (code === 40) result += '\\('
      else if (code === 41) result += '\\)'
      else if (code === 92) result += '\\\\'
      else if (code > 127 && code < 256) {
        result += '\\' + code.toString(8).padStart(3, '0')
      } else if (code >= 256) {
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

  addRect(
    x: number,
    y: number,
    w: number,
    h: number,
    r = 0,
    g = 0,
    b = 0,
    fill = false,
    lineWidth = 1,
  ) {
    if (this.pages.length === 0) this.addPage()
    const op = fill ? 'f' : 'S'
    const cmds = [
      `${lineWidth.toFixed(2)} w`,
      `${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} RG`,
      `${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} rg`,
      `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`,
      op,
      `1 w 0 0 0 RG 0 0 0 rg`,
    ]
    this.pages[this.pages.length - 1].push(cmds.join(' '))
  }

  addLine(x1: number, y1: number, x2: number, y2: number, r = 0, g = 0, b = 0, lineWidth = 1) {
    if (this.pages.length === 0) this.addPage()
    this.pages[this.pages.length - 1].push(
      `${lineWidth.toFixed(2)} w ${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} RG ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S 1 w 0 0 0 RG`,
    )
  }

  addRoundedRect(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    rL = 0,
    gL = 0,
    bL = 0,
    rF = 1,
    gF = 1,
    bF = 1,
    fill = false,
    stroke = true,
  ) {
    if (this.pages.length === 0) this.addPage()
    const op = fill && stroke ? 'B' : fill ? 'f' : stroke ? 'S' : 'n'
    const kappa = 0.552284749831 * r
    const cmds = [
      `0.75 w`,
      `${rL.toFixed(2)} ${gL.toFixed(2)} ${bL.toFixed(2)} RG`,
      `${rF.toFixed(2)} ${gF.toFixed(2)} ${bF.toFixed(2)} rg`,
      `${(x + r).toFixed(2)} ${y.toFixed(2)} m`,
      `${(x + w - r).toFixed(2)} ${y.toFixed(2)} l`,
      `${(x + w - r + kappa).toFixed(2)} ${y.toFixed(2)} ${(x + w).toFixed(2)} ${(y + r - kappa).toFixed(2)} ${(x + w).toFixed(2)} ${(y + r).toFixed(2)} c`,
      `${(x + w).toFixed(2)} ${(y + h - r).toFixed(2)} l`,
      `${(x + w).toFixed(2)} ${(y + h - r + kappa).toFixed(2)} ${(x + w - r + kappa).toFixed(2)} ${(y + h).toFixed(2)} ${(x + w - r).toFixed(2)} ${(y + h).toFixed(2)} c`,
      `${(x + r).toFixed(2)} ${(y + h).toFixed(2)} l`,
      `${(x + r - kappa).toFixed(2)} ${(y + h).toFixed(2)} ${x.toFixed(2)} ${(y + h - r + kappa).toFixed(2)} ${x.toFixed(2)} ${(y + h - r).toFixed(2)} c`,
      `${x.toFixed(2)} ${(y + r).toFixed(2)} l`,
      `${x.toFixed(2)} ${(y + r - kappa).toFixed(2)} ${(x + r - kappa).toFixed(2)} ${y.toFixed(2)} ${(x + r).toFixed(2)} ${y.toFixed(2)} c`,
      `h`,
      op,
      `1 w 0 0 0 RG 0 0 0 rg`,
    ]
    this.pages[this.pages.length - 1].push(cmds.join(' '))
  }

  addShadow(x: number, y: number, w: number, h: number, r: number) {
    this.addRoundedRect(x, y - 1.5, w, h, r, 0, 0, 0, 0.92, 0.92, 0.92, true, false)
    this.addRoundedRect(x, y - 3, w, h, r, 0, 0, 0, 0.96, 0.96, 0.96, true, false)
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
      const streamLen = new Blob([streamContent]).size
      const contentObjIdx = pageObjectsStartIndex + i * 2 + 1

      addObj(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents ${contentObjIdx} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`,
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
  const PAGE_W = 595.28
  const PAGE_H = 841.89
  const MARGIN = 56.7 // 20mm

  const CARD_W = 255.1 // 90mm
  const CARD_GAP = 17 // 6mm
  const PADDING = 34 // 12mm

  const truncate = (str: string, len: number) =>
    str.length > len ? str.substring(0, len - 3) + '...' : str

  const cards = produtos.map((prod) => {
    const headerH = 14 + 4 + 10 + 8 + 16
    const padB = 17
    const margB = 22.7
    const spacing = headerH + padB + margB

    const limit = 39
    const hasMore = prod.coberturas.length > limit
    const showCount = hasMore ? limit - 1 : Math.min(prod.coberturas.length, limit)
    const tableRows = showCount + (hasMore ? 1 : 0)

    const tableH = 17 + tableRows * 17
    const h = PADDING * 2 + spacing + tableH
    return { prod, h, showCount, hasMore, tableRows }
  })

  const pages: any[][] = []
  let currentPageCards: any[] = []
  let cardsOnPage = 0
  let currentY = PAGE_H - MARGIN - 40

  let i = 0
  while (i < cards.length) {
    const c1 = cards[i]
    let c2 = null
    let rowH = c1.h

    const isLeft = cardsOnPage % 2 === 0
    if (isLeft && i + 1 < cards.length && cardsOnPage + 1 < 4) {
      c2 = cards[i + 1]
      rowH = Math.max(c1.h, c2.h)
    }

    if ((cardsOnPage >= 4 || currentY - rowH < MARGIN + 20) && cardsOnPage > 0) {
      pages.push(currentPageCards)
      currentPageCards = []
      cardsOnPage = 0
      currentY = PAGE_H - MARGIN - 40
      continue
    }

    currentPageCards.push({ card: c1, col: isLeft ? 0 : 1, yTop: currentY, rowH })
    cardsOnPage++
    i++

    if (c2) {
      currentPageCards.push({ card: c2, col: 1, yTop: currentY, rowH })
      cardsOnPage++
      i++
    }

    currentY -= rowH + CARD_GAP
  }
  if (currentPageCards.length > 0) {
    pages.push(currentPageCards)
  }

  if (pages.length === 0) {
    pdf.addPage()
    const dataFormatada = cotacao.created
      ? new Date(cotacao.created).toLocaleDateString('pt-BR')
      : new Date().toLocaleDateString('pt-BR')
    const headerText = `Cotação ${cotacao.id} | Data: ${dataFormatada} | Agência: ${cotacao.nome_agencia || 'N/A'}`
    pdf.addText(headerText, MARGIN, PAGE_H - MARGIN, 10, 'F2', 0.2, 0.2, 0.2)
    pdf.addText('Nenhum produto selecionado na cotação.', MARGIN, PAGE_H - MARGIN - 40, 12, 'F1')
    return pdf.build()
  }

  for (let p = 0; p < pages.length; p++) {
    pdf.addPage()
    const pageItems = pages[p]

    const dataFormatada = cotacao.created
      ? new Date(cotacao.created).toLocaleDateString('pt-BR')
      : new Date().toLocaleDateString('pt-BR')
    const headerText = `Cotação ${cotacao.id} | Data: ${dataFormatada} | Agência: ${cotacao.nome_agencia || 'N/A'}`
    pdf.addText(headerText, MARGIN, PAGE_H - MARGIN, 10, 'F2', 0.2, 0.2, 0.2)
    pdf.addLine(MARGIN, PAGE_H - MARGIN - 10, PAGE_W - MARGIN, PAGE_H - MARGIN - 10, 0.8, 0.8, 0.8)

    const footerText = `Página ${p + 1} de ${pages.length} | Now Assistance`
    const footerWidth = footerText.length * 4.2
    const footerX = (PAGE_W - footerWidth) / 2
    pdf.addLine(MARGIN, MARGIN, PAGE_W - MARGIN, MARGIN, 0.8, 0.8, 0.8)
    pdf.addText(footerText, footerX, MARGIN - 15, 8, 'F1', 0.4, 0.4, 0.4)

    for (const item of pageItems) {
      const x = MARGIN + item.col * (CARD_W + CARD_GAP)
      const yBot = item.yTop - item.rowH

      pdf.addShadow(x, yBot, CARD_W, item.rowH, 3)
      pdf.addRoundedRect(x, yBot, CARD_W, item.rowH, 3, 0.8, 0.8, 0.8, 1, 1, 1, true, true)

      const yStart = item.yTop - PADDING
      pdf.addText(
        truncate(item.card.prod.produto_nome, 32),
        x + PADDING,
        yStart - 14,
        14,
        'F2',
        0.1,
        0.1,
        0.1,
      )

      const tipo = item.card.prod.tipo_cobranca === 'anual' ? 'Anual' : 'Por Dia'
      pdf.addText(`Cobrança: ${tipo}`, x + PADDING, yStart - 28, 10, 'F1', 0.4, 0.4, 0.4)

      pdf.addText(
        `${cotacao.moeda || 'USD'} ${item.card.prod.preco_total_produto.toFixed(2)}`,
        x + PADDING,
        yStart - 52,
        16,
        'F2',
        0.05,
        0.4,
        0.8,
      )

      const yLine = yStart - 69
      pdf.addLine(x + PADDING, yLine, x + CARD_W - PADDING, yLine, 0.9, 0.9, 0.9, 0.5)

      const yTable = yStart - 91.7
      pdf.addRect(x + PADDING, yTable - 17, CARD_W - 2 * PADDING, 17, 0.95, 0.95, 0.95, true)

      const col2X = x + PADDING + 112.3
      pdf.addText('Cobertura', x + PADDING + 11.3, yTable - 11.5, 9, 'F2', 0.2, 0.2, 0.2)
      pdf.addText('Valor', col2X + 11.3, yTable - 11.5, 9, 'F2', 0.2, 0.2, 0.2)

      for (let j = 0; j < item.card.showCount; j++) {
        const cob = item.card.prod.coberturas[j]
        const rY = yTable - 17 - (j + 1) * 17
        if (j % 2 === 0) {
          pdf.addRect(x + PADDING, rY, CARD_W - 2 * PADDING, 17, 0.98, 0.98, 0.98, true)
        }
        pdf.addText(truncate(cob.nome, 26), x + PADDING + 11.3, rY + 5.5, 9, 'F1', 0.2, 0.2, 0.2)
        pdf.addText(truncate(cob.valor, 16), col2X + 11.3, rY + 5.5, 9, 'F1', 0.2, 0.2, 0.2)
      }

      if (item.card.hasMore) {
        const rY = yTable - 17 - (item.card.showCount + 1) * 17
        pdf.addText(
          `... e mais ${item.card.prod.coberturas.length - item.card.showCount} coberturas`,
          x + PADDING + 11.3,
          rY + 5.5,
          9,
          'F2',
          0.5,
          0.5,
          0.5,
        )
      }

      const tableH = 17 + item.card.tableRows * 17
      pdf.addRect(
        x + PADDING,
        yTable - tableH,
        CARD_W - 2 * PADDING,
        tableH,
        0.85,
        0.85,
        0.85,
        false,
        0.5,
      )
      pdf.addLine(col2X, yTable, col2X, yTable - tableH, 0.85, 0.85, 0.85, 0.5)
      for (let r = 1; r < item.card.tableRows + 1; r++) {
        const rowY = yTable - r * 17
        pdf.addLine(x + PADDING, rowY, x + CARD_W - PADDING, rowY, 0.85, 0.85, 0.85, 0.5)
      }
    }
  }

  return pdf.build()
}
