import pb from '@/lib/pocketbase/client'
import logoImgUrl from '@/assets/logo-3585e.png'

export interface CotacaoPDFData {
  id: string
  nome_agencia?: string
  data_inicio?: string | Date
  data_fim?: string | Date
  created?: string | Date
  fatura_total: number
  moeda?: string
  forma_pagamento?: string
  qtd_dias?: number
  total_passageiros?: number
  comissao?: number
}

export interface ProdutoDetalhePDF {
  produto_nome: string
  tipo_cobranca?: string
  preco_total_produto: number
  coberturas: {
    nome: string
    valor: string
    ordem: number
  }[]
}

export async function getJpegData(
  src: string,
): Promise<{ width: number; height: number; data: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'Anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('No canvas context'))
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95)
      const b64 = dataUrl.split(',')[1]
      if (!b64) return reject(new Error('No base64 data'))
      const binStr = atob(b64)
      resolve({ width: canvas.width, height: canvas.height, data: binStr })
    }
    img.onerror = () => reject(new Error('Image load failed'))
    img.src = src
  })
}

class PDFBuilder {
  pages: string[][] = []
  images: { id: string; width: number; height: number; data: string; objId: number }[] = []

  addPage() {
    this.pages.push([])
  }

  addImage(id: string, width: number, height: number, data: string) {
    this.images.push({ id, width, height, data, objId: 0 })
  }

  drawImage(pageIndex: number, id: string, x: number, y: number, w: number, h: number) {
    if (pageIndex < 0 || pageIndex >= this.pages.length) return
    this.pages[pageIndex].push(
      `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im${id} Do Q`,
    )
  }

  escapeText(text: string): string {
    if (text == null) return ''
    let result = ''
    const str = String(text)
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i)
      if (code === 40) result += '\\('
      else if (code === 41) result += '\\)'
      else if (code === 92) result += '\\\\'
      else if (code > 127) {
        result += '\\' + code.toString(8).padStart(3, '0')
      } else {
        result += str[i]
      }
    }
    return result
  }

  addTextToPage(
    pageIndex: number,
    text: string,
    x: number,
    y: number,
    size: number = 10,
    font: 'F1' | 'F2' = 'F1',
    r = 0,
    g = 0,
    b = 0,
  ) {
    if (pageIndex < 0 || pageIndex >= this.pages.length) return
    const escaped = this.escapeText(text)
    this.pages[pageIndex].push(
      `${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} rg BT /${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escaped}) Tj ET 0 0 0 rg`,
    )
  }

  addLineToPage(
    pageIndex: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    r = 0,
    g = 0,
    b = 0,
    lineWidth = 1,
  ) {
    if (pageIndex < 0 || pageIndex >= this.pages.length) return
    this.pages[pageIndex].push(
      `${lineWidth.toFixed(2)} w ${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} RG ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S 1 w 0 0 0 RG`,
    )
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
    rTL: number,
    rTR: number,
    rBR: number,
    rBL: number,
    rL = 0,
    gL = 0,
    bL = 0,
    rF = 1,
    gF = 1,
    bF = 1,
    fill = false,
    stroke = true,
    lineWidth = 1,
  ) {
    if (this.pages.length === 0) this.addPage()
    const op = fill && stroke ? 'B' : fill ? 'f' : stroke ? 'S' : 'n'
    const cmds = [
      `${lineWidth.toFixed(2)} w`,
      `${rL.toFixed(2)} ${gL.toFixed(2)} ${bL.toFixed(2)} RG`,
      `${rF.toFixed(2)} ${gF.toFixed(2)} ${bF.toFixed(2)} rg`,
    ]

    cmds.push(`${(x + rBL).toFixed(2)} ${y.toFixed(2)} m`)
    cmds.push(`${(x + w - rBR).toFixed(2)} ${y.toFixed(2)} l`)
    if (rBR > 0) {
      const kappa = 0.552284749831 * rBR
      cmds.push(
        `${(x + w - rBR + kappa).toFixed(2)} ${y.toFixed(2)} ${(x + w).toFixed(2)} ${(y + rBR - kappa).toFixed(2)} ${(x + w).toFixed(2)} ${(y + rBR).toFixed(2)} c`,
      )
    }

    cmds.push(`${(x + w).toFixed(2)} ${(y + h - rTR).toFixed(2)} l`)
    if (rTR > 0) {
      const kappa = 0.552284749831 * rTR
      cmds.push(
        `${(x + w).toFixed(2)} ${(y + h - rTR + kappa).toFixed(2)} ${(x + w - rTR + kappa).toFixed(2)} ${(y + h).toFixed(2)} ${(x + w - rTR).toFixed(2)} ${(y + h).toFixed(2)} c`,
      )
    }

    cmds.push(`${(x + rTL).toFixed(2)} ${(y + h).toFixed(2)} l`)
    if (rTL > 0) {
      const kappa = 0.552284749831 * rTL
      cmds.push(
        `${(x + rTL - kappa).toFixed(2)} ${(y + h).toFixed(2)} ${x.toFixed(2)} ${(y + h - rTL + kappa).toFixed(2)} ${x.toFixed(2)} ${(y + h - rTL).toFixed(2)} c`,
      )
    }

    cmds.push(`${x.toFixed(2)} ${(y + rBL).toFixed(2)} l`)
    if (rBL > 0) {
      const kappa = 0.552284749831 * rBL
      cmds.push(
        `${x.toFixed(2)} ${(y + rBL - kappa).toFixed(2)} ${(x + rBL - kappa).toFixed(2)} ${y.toFixed(2)} ${(x + rBL).toFixed(2)} ${y.toFixed(2)} c`,
      )
    }

    cmds.push(`h`)
    cmds.push(op)
    cmds.push(`1 w 0 0 0 RG 0 0 0 rg`)

    this.pages[this.pages.length - 1].push(cmds.join(' '))
  }

  addShadow(x: number, y: number, w: number, h: number, r: number) {
    this.addRoundedRect(x, y - 2, w, h, r, r, r, r, 0.92, 0.92, 0.92, 0.92, 0.92, 0.92, true, false)
    this.addRoundedRect(x, y - 4, w, h, r, r, r, r, 0.96, 0.96, 0.96, 0.96, 0.96, 0.96, true, false)
  }

  build(): Blob {
    const header = '%PDF-1.4\n'
    const objects: (string | Uint8Array)[] = []
    const xref: number[] = []
    let currentOffset = header.length

    const addObj = (content: string | (string | Uint8Array)[]) => {
      xref.push(currentOffset)
      const objId = xref.length
      const prefix = `${objId} 0 obj\n`
      const suffix = `\nendobj\n`

      const writeStr = (str: string) => {
        objects.push(str)
        currentOffset += str.length
      }

      writeStr(prefix)
      if (Array.isArray(content)) {
        for (const part of content) {
          if (typeof part === 'string') {
            writeStr(part)
          } else {
            objects.push(part)
            currentOffset += part.length
          }
        }
      } else {
        writeStr(content)
      }
      writeStr(suffix)
      return objId
    }

    const numPages = this.pages.length || 1
    const imagesStartIndex = 5
    const contentsStartIndex = imagesStartIndex + this.images.length

    const pageDictIds: number[] = []
    for (let i = 0; i < numPages; i++) {
      pageDictIds.push(contentsStartIndex + i * 2)
    }

    addObj(`<< /Type /Catalog /Pages 2 0 R >>`)
    addObj(
      `<< /Type /Pages /Kids [${pageDictIds.map((id) => id + ' 0 R').join(' ')}] /Count ${numPages} >>`,
    )
    addObj(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`)
    addObj(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`)

    for (const img of this.images) {
      const streamContent = new Uint8Array(img.data.length)
      for (let i = 0; i < img.data.length; i++) {
        streamContent[i] = img.data.charCodeAt(i)
      }
      const dict = `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${streamContent.length} >>\nstream\n`
      img.objId = addObj([dict, streamContent, '\nendstream'])
    }

    let xObjectStr = ''
    if (this.images.length > 0) {
      xObjectStr =
        ` /XObject << ` +
        this.images.map((img) => `/Im${img.id} ${img.objId} 0 R`).join(' ') +
        ` >>`
    }

    for (let i = 0; i < numPages; i++) {
      const streamContent = this.pages[i]?.join('\n') || ''
      const contentObjId = contentsStartIndex + i * 2 + 1

      addObj(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents ${contentObjId} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xObjectStr} >> >>`,
      )
      addObj(`<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream`)
    }

    const xrefData =
      `xref\n0 ${xref.length + 1}\n0000000000 65535 f \r\n` +
      xref.map((off) => `${off.toString().padStart(10, '0')} 00000 n \r\n`).join('')

    const trailer = `trailer\n<< /Size ${xref.length + 1} /Root 1 0 R >>\nstartxref\n${currentOffset}\n%%EOF\n`

    return new Blob([header, ...objects, xrefData, trailer], { type: 'application/pdf' })
  }
}

export interface CotacaoPDFDataExt extends CotacaoPDFData {
  taxa_cambio?: number
}

export function gerarPDFProposta(
  cotacao: CotacaoPDFDataExt,
  produtos: ProdutoDetalhePDF[],
  logoData: { width: number; height: number; data: string } | null = null,
): Blob {
  const pdf = new PDFBuilder()
  if (logoData) {
    pdf.addImage('logo', logoData.width, logoData.height, logoData.data)
  }

  const PAGE_W = 595.28
  const PAGE_H = 841.89
  const MARGIN = 40
  const CONTENT_W = PAGE_W - 2 * MARGIN

  const blueR = 0.11,
    blueG = 0.21,
    blueB = 0.83
  const darkR = 0.15,
    darkG = 0.15,
    darkB = 0.15
  const grayR = 0.96,
    grayG = 0.96,
    grayB = 0.96
  const whiteR = 1,
    whiteG = 1,
    whiteB = 1

  const taxaCambio = cotacao.taxa_cambio || 5.09

  pdf.addPage()

  const drawFooter = (pageIndex: number) => {
    const footerText = `Now Assistance \u00B7 nowassistance.com \u00B7 Valores em R$ convertidos ao câmbio US$1 = R$ ${taxaCambio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}; sujeitos a confirmação.`
    pdf.addTextToPage(pageIndex, footerText, MARGIN, 30, 7, 'F1', 0.4, 0.4, 0.4)
  }

  drawFooter(0)

  if (logoData) {
    const logoW = 120
    const logoH = (logoW / logoData.width) * logoData.height
    pdf.drawImage(0, 'logo', MARGIN, PAGE_H - MARGIN - logoH, logoW, logoH)
  }

  let currentY = PAGE_H - MARGIN - 70

  const leftColX = MARGIN + 20
  const leftColValX = leftColX + 60
  const rightColX = PAGE_W / 2 + 30
  const rightColValX = rightColX + 80

  const formatDate = (d: string | Date | undefined) => {
    if (!d) return ''
    return new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
  }

  const pDataInicio = formatDate(cotacao.data_inicio)
  const pDataFim = formatDate(cotacao.data_fim)
  const periodoStr = pDataInicio && pDataFim ? `${pDataInicio} a ${pDataFim}` : ''

  const headerFontSize = 10

  pdf.addTextToPage(0, 'Agência:', leftColX, currentY, headerFontSize, 'F2')
  pdf.addTextToPage(0, cotacao.nome_agencia || '', leftColValX, currentY, headerFontSize, 'F1')
  pdf.addTextToPage(0, 'Data da Cotação:', rightColX, currentY, headerFontSize, 'F2')
  pdf.addTextToPage(0, formatDate(cotacao.created), rightColValX, currentY, headerFontSize, 'F1')

  currentY -= 16
  pdf.addTextToPage(0, 'Período:', leftColX, currentY, headerFontSize, 'F2')
  pdf.addTextToPage(0, periodoStr, leftColValX, currentY, headerFontSize, 'F1')
  pdf.addTextToPage(0, 'Total de Dias:', rightColX, currentY, headerFontSize, 'F2')
  pdf.addTextToPage(
    0,
    (cotacao.qtd_dias || 0).toString(),
    rightColValX,
    currentY,
    headerFontSize,
    'F1',
  )

  currentY -= 16
  pdf.addTextToPage(0, 'Passageiros:', leftColX, currentY, headerFontSize, 'F2')
  pdf.addTextToPage(
    0,
    (cotacao.total_passageiros || 1).toString(),
    leftColValX,
    currentY,
    headerFontSize,
    'F1',
  )
  pdf.addTextToPage(0, 'Comissão:', rightColX, currentY, headerFontSize, 'F2')
  pdf.addTextToPage(0, `${cotacao.comissao || 0}%`, rightColValX, currentY, headerFontSize, 'F1')

  currentY -= 16
  pdf.addTextToPage(0, 'Pagamento:', leftColX, currentY, headerFontSize, 'F2')
  pdf.addTextToPage(0, cotacao.forma_pagamento || '', leftColValX, currentY, headerFontSize, 'F1')
  pdf.addTextToPage(0, 'Fatura Total:', rightColX, currentY, headerFontSize, 'F2')

  const faturaVal = `${cotacao.moeda || 'USD'} ${cotacao.fatura_total?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  pdf.addTextToPage(0, faturaVal, rightColValX, currentY, headerFontSize, 'F2', blueR, blueG, blueB)

  currentY -= 30

  const prodCols = [
    { label: 'Produto', width: CONTENT_W * 0.4, align: 'L' },
    { label: 'Participação', width: CONTENT_W * 0.2, align: 'C' },
    { label: 'Preço/viagem (R$)', width: CONTENT_W * 0.25, align: 'C' },
    { label: `${cotacao.moeda || 'US$'}`, width: CONTENT_W * 0.15, align: 'R' },
  ]

  const participacao =
    (100 / (produtos.length || 1)).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'

  pdf.addRoundedRect(
    MARGIN,
    currentY - 16,
    CONTENT_W,
    22,
    6,
    6,
    0,
    0,
    darkR,
    darkG,
    darkB,
    darkR,
    darkG,
    darkB,
    true,
    false,
  )
  let curX = MARGIN
  prodCols.forEach((col) => {
    const textW = col.label.length * 5.5
    let textX = curX + 10
    if (col.align === 'C') textX = curX + (col.width - textW) / 2
    if (col.align === 'R') textX = curX + col.width - textW - 10
    pdf.addTextToPage(0, col.label, textX, currentY - 10, 10, 'F2', whiteR, whiteG, whiteB)
    curX += col.width
  })

  currentY -= 16

  produtos.forEach((prod, idx) => {
    const isEven = idx % 2 === 0
    if (isEven) {
      pdf.addRect(MARGIN, currentY - 20, CONTENT_W, 20, grayR, grayG, grayB, true, 0)
    }

    const precoUsd = prod.preco_total_produto
    const precoBrl = precoUsd * taxaCambio

    const rowData = [
      prod.produto_nome,
      participacao,
      `R$ ${precoBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `${cotacao.moeda || 'US$'} ${precoUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    ]

    curX = MARGIN
    prodCols.forEach((col, cIdx) => {
      const text = rowData[cIdx]
      const textW = text.length * 5
      let textX = curX + 10
      if (col.align === 'C') textX = curX + (col.width - textW) / 2
      if (col.align === 'R') textX = curX + col.width - textW - 10
      pdf.addTextToPage(0, text, textX, currentY - 13, 9, 'F1', 0, 0, 0)
      curX += col.width
    })

    currentY -= 20
  })

  currentY -= 30

  pdf.addTextToPage(0, 'Coberturas por produto', MARGIN, currentY, 12, 'F2', 0, 0, 0)
  currentY -= 15

  const covCols = [{ label: 'COBERTURA', width: CONTENT_W * 0.4, align: 'L' }]
  const prodColW = (CONTENT_W * 0.6) / (produtos.length || 1)
  produtos.forEach((p) => {
    covCols.push({ label: p.produto_nome, width: prodColW, align: 'C' })
  })

  const wrapText = (
    text: string,
    maxWidth: number,
    fontSize: number,
    isBold: boolean = false,
  ): string[] => {
    const avgCharWidth = fontSize * (isBold ? 0.55 : 0.5)
    const maxChars = Math.max(1, Math.floor(maxWidth / avgCharWidth))
    const words = text.split(' ')
    const lines: string[] = []
    let currentLine = ''

    words.forEach((word) => {
      if ((currentLine + (currentLine ? ' ' : '') + word).trim().length <= maxChars) {
        currentLine = (currentLine + (currentLine ? ' ' : '') + word).trim()
      } else {
        if (currentLine) lines.push(currentLine)
        if (word.length > maxChars) {
          let tempWord = word
          while (tempWord.length > maxChars) {
            lines.push(tempWord.substring(0, maxChars))
            tempWord = tempWord.substring(maxChars)
          }
          currentLine = tempWord
        } else {
          currentLine = word
        }
      }
    })
    if (currentLine) lines.push(currentLine)
    return lines
  }

  const drawCovHeader = (pageIdx: number, y: number) => {
    let maxHeaderLines = 1
    const wrappedHeaders = covCols.map((col, idx) => {
      const lines = wrapText(col.label, col.width - (idx === 0 ? 10 : 4), 9, true)
      maxHeaderLines = Math.max(maxHeaderLines, lines.length)
      return lines
    })

    const headerH = maxHeaderLines * 12 + 10
    pdf.addRoundedRect(
      MARGIN,
      y - headerH + 6,
      CONTENT_W,
      headerH,
      6,
      6,
      0,
      0,
      blueR,
      blueG,
      blueB,
      blueR,
      blueG,
      blueB,
      true,
      false,
    )

    let cx = MARGIN
    wrappedHeaders.forEach((lines, cIdx) => {
      const col = covCols[cIdx]
      const startY = y - (headerH - lines.length * 10) / 2 + 2
      lines.forEach((line, lIdx) => {
        const textW = line.length * 5
        let textX = cx + 5
        if (col.align === 'C') textX = Math.max(cx + 2, cx + (col.width - textW) / 2)
        pdf.addTextToPage(pageIdx, line, textX, startY - lIdx * 10, 9, 'F2', whiteR, whiteG, whiteB)
      })
      cx += col.width
    })

    return headerH
  }

  let headerH = drawCovHeader(pdf.pages.length - 1, currentY)
  currentY -= headerH

  const allCoberturasMap = new Map<string, { nome: string; ordem: number }>()
  produtos.forEach((p) => {
    p.coberturas.forEach((c) => {
      if (!allCoberturasMap.has(c.nome)) {
        allCoberturasMap.set(c.nome, { nome: c.nome, ordem: c.ordem })
      }
    })
  })

  const coberturasList = Array.from(allCoberturasMap.values()).sort((a, b) => a.ordem - b.ordem)

  coberturasList.forEach((cov, idx) => {
    const isEven = idx % 2 === 0
    const rowData = [cov.nome]
    produtos.forEach((p) => {
      const pCov = p.coberturas.find((c) => c.nome === cov.nome)
      rowData.push(pCov ? pCov.valor : '')
    })

    let maxLines = 1
    const wrappedRowData = rowData.map((text, cIdx) => {
      const colW = covCols[cIdx].width
      const isBold = cIdx > 0
      const fontSize = 8
      const lines = wrapText(text, colW - (cIdx === 0 ? 10 : 4), fontSize, isBold)
      maxLines = Math.max(maxLines, lines.length)
      return lines
    })

    const rowH = Math.max(20, maxLines * 10 + 6)

    if (currentY - rowH < MARGIN + 20) {
      pdf.addPage()
      const newPageIdx = pdf.pages.length - 1
      drawFooter(newPageIdx)
      currentY = PAGE_H - MARGIN
      headerH = drawCovHeader(newPageIdx, currentY)
      currentY -= headerH
    }

    if (isEven) {
      pdf.addRect(MARGIN, currentY - rowH + 6, CONTENT_W, rowH, grayR, grayG, grayB, true, 0)
    }

    let cx = MARGIN
    wrappedRowData.forEach((lines, cIdx) => {
      const col = covCols[cIdx]
      const startY = currentY - (rowH - lines.length * 10) / 2 + 2
      lines.forEach((line, lIdx) => {
        const isBold = cIdx > 0
        const fontSize = 8
        const textW = line.length * (isBold ? 4.5 : 4)
        let textX = cx + 5
        if (col.align === 'C') textX = Math.max(cx + 2, cx + (col.width - textW) / 2)
        pdf.addTextToPage(
          pdf.pages.length - 1,
          line,
          textX,
          startY - lIdx * 10,
          fontSize,
          isBold ? 'F2' : 'F1',
          0,
          0,
          0,
        )
      })
      cx += col.width
    })

    currentY -= rowH
  })

  return pdf.build()
}

export async function generateAndDownloadCotacaoPdf(cotacaoId: string) {
  const cotacao = await pb.collection('cotacoes').getOne(cotacaoId, {
    expand: 'forma_pagamento_id,cotacao_produtos_via_cotacao_id.produto_id,usuario_id',
  })

  let taxaCambio = 5.09
  try {
    const filterDate = cotacao.created
      ? new Date(cotacao.created).toISOString().replace('T', ' ')
      : new Date().toISOString().replace('T', ' ')
    const taxasRes = await pb.collection('taxas_cambio').getList(1, 1, {
      filter: `data <= "${filterDate}"`,
      sort: '-data',
    })
    if (taxasRes.items.length > 0) {
      taxaCambio = taxasRes.items[0].valor
    }
  } catch {
    /* intentionally ignored */
  }

  const produtosRel = cotacao.expand?.cotacao_produtos_via_cotacao_id || []
  const produtosPDF: ProdutoDetalhePDF[] = []

  for (const rel of produtosRel) {
    const prod = rel.expand?.produto_id
    if (!prod) continue

    const coberturasRel = await pb.collection('produto_coberturas').getFullList({
      filter: `produto_id = "${prod.id}" && ativo = true && cobertura_id.ativo = true`,
      expand: 'cobertura_id',
      sort: 'ordem_exibicao,cobertura_id.ordem_exibicao',
    })

    produtosPDF.push({
      produto_nome: prod.nome,
      tipo_cobranca: prod.tipo_cobranca,
      preco_total_produto: rel.preco_total_produto,
      coberturas: coberturasRel.map((c: any) => {
        let valRaw = c.valor || c.descricao_customizada
        let valFinal = ''

        if (!valRaw || valRaw.trim() === '') {
          valFinal = ''
        } else {
          if (c.moeda) {
            let normalized = valRaw.trim()
            let numVal: number | null = null
            if (/^\d+([.,]\d+)?$/.test(normalized)) {
              if (normalized.includes(',')) {
                normalized = normalized.replace(',', '.')
              }
              numVal = parseFloat(normalized)
            } else if (/^[\d.]+$/.test(normalized) && normalized.includes('.')) {
              numVal = parseFloat(normalized.replace(/\./g, ''))
            }

            if (numVal !== null && !isNaN(numVal)) {
              valFinal = `${c.moeda} ${numVal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
            } else {
              valFinal = `${c.moeda} ${valRaw}`
            }
          } else {
            valFinal = valRaw
          }
        }

        return {
          nome: c.expand?.cobertura_id?.nome || 'Cobertura',
          valor: valFinal,
          ordem: c.expand?.cobertura_id?.ordem_exibicao || 0,
        }
      }),
    })
  }

  let totalPassageiros = 0
  for (const rel of produtosRel) {
    totalPassageiros += (rel.qtd_ate_75 || 0) + (rel.qtd_76_a_85 || 0)
  }

  const pdfData: CotacaoPDFDataExt = {
    id: cotacao.id,
    nome_agencia: cotacao.nome_agencia || cotacao.expand?.usuario_id?.name,
    data_inicio: cotacao.data_inicio,
    data_fim: cotacao.data_fim,
    created: cotacao.created,
    fatura_total: cotacao.fatura_total,
    moeda: cotacao.moeda,
    forma_pagamento: cotacao.expand?.forma_pagamento_id?.nome,
    qtd_dias: cotacao.qtd_dias,
    total_passageiros: totalPassageiros,
    comissao: cotacao.comissao,
    taxa_cambio: taxaCambio,
  }

  const logoData = await getJpegData(logoImgUrl).catch(() => null)
  const blob = gerarPDFProposta(pdfData, produtosPDF, logoData)

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Cotacao_${cotacao.id}.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 100)
}
