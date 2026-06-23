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
  moeda?: string
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

  addRoundedRect(
    x: number,
    y: number,
    w: number,
    h: number,
    radius = 0,
    r = 0,
    g = 0,
    b = 0,
    fill = false,
    lineWidth = 1,
    corners = { tl: true, tr: true, br: true, bl: true },
  ) {
    if (this.pages.length === 0) this.addPage()
    const op = fill ? 'f' : 'S'

    const k = 0.552284749831 * radius

    const cmds = [
      `${lineWidth.toFixed(2)} w`,
      `${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} RG`,
      `${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} rg`,
    ]

    cmds.push(`${(x + (corners.bl ? radius : 0)).toFixed(2)} ${y.toFixed(2)} m`)
    cmds.push(`${(x + w - (corners.br ? radius : 0)).toFixed(2)} ${y.toFixed(2)} l`)
    if (corners.br) {
      cmds.push(
        `${(x + w - radius + k).toFixed(2)} ${y.toFixed(2)} ${(x + w).toFixed(2)} ${(y + radius - k).toFixed(2)} ${(x + w).toFixed(2)} ${(y + radius).toFixed(2)} c`,
      )
    }
    cmds.push(`${(x + w).toFixed(2)} ${(y + h - (corners.tr ? radius : 0)).toFixed(2)} l`)
    if (corners.tr) {
      cmds.push(
        `${(x + w).toFixed(2)} ${(y + h - radius + k).toFixed(2)} ${(x + w - radius + k).toFixed(2)} ${(y + h).toFixed(2)} ${(x + w - radius).toFixed(2)} ${(y + h).toFixed(2)} c`,
      )
    }
    cmds.push(`${(x + (corners.tl ? radius : 0)).toFixed(2)} ${(y + h).toFixed(2)} l`)
    if (corners.tl) {
      cmds.push(
        `${(x + radius - k).toFixed(2)} ${(y + h).toFixed(2)} ${x.toFixed(2)} ${(y + h - radius + k).toFixed(2)} ${x.toFixed(2)} ${(y + h - radius).toFixed(2)} c`,
      )
    }
    cmds.push(`${x.toFixed(2)} ${(y + (corners.bl ? radius : 0)).toFixed(2)} l`)
    if (corners.bl) {
      cmds.push(
        `${x.toFixed(2)} ${(y + radius - k).toFixed(2)} ${(x + radius - k).toFixed(2)} ${y.toFixed(2)} ${(x + radius).toFixed(2)} ${y.toFixed(2)} c`,
      )
    }

    cmds.push(op)
    cmds.push(`1 w 0 0 0 RG 0 0 0 rg`)

    this.pages[this.pages.length - 1].push(cmds.join(' '))
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
  pais_usuario?: string
}

export function gerarPDFProposta(
  cotacao: CotacaoPDFDataExt,
  produtos: ProdutoDetalhePDF[],
  logoData: { width: number; height: number; data: string } | null = null,
  onlyCoverages = false,
): Blob {
  const pdf = new PDFBuilder()
  if (logoData) {
    pdf.addImage('logo', logoData.width, logoData.height, logoData.data)
  }

  const PAGE_W = 595.28
  const PAGE_H = 841.89
  const MARGIN = 40
  const CONTENT_W = PAGE_W - 2 * MARGIN

  const blueR = 0.08,
    blueG = 0.16,
    blueB = 0.75
  const darkR = 0.15,
    darkG = 0.15,
    darkB = 0.15
  const grayR = 0.95,
    grayG = 0.95,
    grayB = 0.95
  const whiteR = 1,
    whiteG = 1,
    whiteB = 1

  const taxaCambio = cotacao.taxa_cambio || 5.09
  const pais = cotacao.pais_usuario || 'Brasil'
  const localSymbol = pais === 'Argentina' ? 'ARS' : 'R$'
  const localLocale = pais === 'Argentina' ? 'es-AR' : 'pt-BR'

  const formatNum = (n: number, minDec = 2, maxDec = 2) => {
    return n.toLocaleString(localLocale, {
      minimumFractionDigits: minDec,
      maximumFractionDigits: maxDec,
    })
  }

  pdf.addPage()

  const drawFooter = (pageIndex: number) => {
    const footerText = `Now Assistance \u00B7 nowassistance.com \u00B7 Valores convertidos ao câmbio US$1 = ${localSymbol} ${formatNum(taxaCambio)}; sujeitos a confirmação.`
    pdf.addTextToPage(pageIndex, footerText, MARGIN, 30, 7, 'F1', 0.5, 0.5, 0.5)
  }

  drawFooter(0)

  if (logoData) {
    const logoW = 120
    const logoH = (logoW / logoData.width) * logoData.height
    pdf.drawImage(0, 'logo', MARGIN, PAGE_H - MARGIN - logoH, logoW, logoH)
  }

  let currentY = PAGE_H - MARGIN - 60

  const wrapTextLocal = (
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

  if (!onlyCoverages) {
    const leftColX = MARGIN
    const leftColValX = leftColX + 90
    const rightColX = PAGE_W / 2 + 10
    const rightColValX = rightColX + 90

    const formatDate = (d: string | Date | undefined) => {
      if (!d) return ''
      return new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
    }

    const pDataInicio = formatDate(cotacao.data_inicio)
    const pDataFim = formatDate(cotacao.data_fim)
    const periodoStr = pDataInicio && pDataFim ? `${pDataInicio} a ${pDataFim}` : ''

    const headerFontSize = 10
    const lineHeight = 16

    pdf.addTextToPage(0, 'Agência:', leftColX, currentY, headerFontSize, 'F2')
    pdf.addTextToPage(0, cotacao.nome_agencia || '', leftColValX, currentY, headerFontSize, 'F1')

    pdf.addTextToPage(0, 'Data da Cotação:', rightColX, currentY, headerFontSize, 'F2')
    pdf.addTextToPage(0, formatDate(cotacao.created), rightColValX, currentY, headerFontSize, 'F1')

    currentY -= lineHeight
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

    currentY -= lineHeight
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
    pdf.addTextToPage(
      0,
      `${cotacao.comissao ? formatNum(cotacao.comissao * 100, 0, 0) : 0}%`,
      rightColValX,
      currentY,
      headerFontSize,
      'F1',
    )

    currentY -= lineHeight
    pdf.addTextToPage(0, 'Pagamento:', leftColX, currentY, headerFontSize, 'F2')
    pdf.addTextToPage(0, cotacao.forma_pagamento || '', leftColValX, currentY, headerFontSize, 'F1')

    const isLocalStored = cotacao.moeda === 'ARS' || cotacao.moeda === 'BRL'
    const usdValue =
      isLocalStored && taxaCambio ? cotacao.fatura_total / taxaCambio : cotacao.fatura_total
    const localValue = isLocalStored ? cotacao.fatura_total : cotacao.fatura_total * taxaCambio

    pdf.addTextToPage(0, 'Fatura (USD):', rightColX, currentY, headerFontSize, 'F2')
    const faturaVal = `USD ${formatNum(usdValue)}`
    pdf.addTextToPage(
      0,
      faturaVal,
      rightColValX,
      currentY,
      headerFontSize,
      'F1',
      blueR,
      blueG,
      blueB,
    )

    currentY -= lineHeight
    pdf.addTextToPage(0, `Fatura (${localSymbol}):`, rightColX, currentY, headerFontSize, 'F2')
    const faturaLocalVal = `${localSymbol} ${formatNum(localValue)}`
    pdf.addTextToPage(
      0,
      faturaLocalVal,
      rightColValX,
      currentY,
      headerFontSize,
      'F1',
      blueR,
      blueG,
      blueB,
    )

    currentY -= lineHeight
    pdf.addTextToPage(0, 'Câmbio Utilizado:', rightColX, currentY, headerFontSize, 'F2')
    const cambioVal = `${localSymbol} ${formatNum(taxaCambio)}`
    pdf.addTextToPage(0, cambioVal, rightColValX, currentY, headerFontSize, 'F1')

    currentY -= 30

    const prodCols = [
      { label: 'Produto', width: CONTENT_W * 0.4, align: 'L' },
      { label: 'Participação', width: CONTENT_W * 0.2, align: 'C' },
      { label: `Preço/viagem (${localSymbol})`, width: CONTENT_W * 0.25, align: 'C' },
      { label: `USD`, width: CONTENT_W * 0.15, align: 'R' },
    ]

    const participacao = formatNum(100 / (produtos.length || 1), 0, 1) + '%'

    pdf.addRoundedRect(MARGIN, currentY - 16, CONTENT_W, 22, 6, darkR, darkG, darkB, true, 0, {
      tl: true,
      tr: true,
      br: false,
      bl: false,
    })

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
      const isProdLocal = prod.moeda === 'ARS' || prod.moeda === 'BRL'
      const precoUsd =
        isProdLocal && taxaCambio ? prod.preco_total_produto / taxaCambio : prod.preco_total_produto
      const precoLocal = isProdLocal
        ? prod.preco_total_produto
        : prod.preco_total_produto * taxaCambio
      const pSymbol = prod.moeda === 'ARS' ? '$' : prod.moeda === 'BRL' ? 'R$' : localSymbol

      const rowData = [
        prod.produto_nome,
        participacao,
        `${pSymbol} ${formatNum(precoLocal)}`,
        `USD ${formatNum(precoUsd)}`,
      ]

      let maxLines = 1
      const wrappedRowData = rowData.map((text, cIdx) => {
        const colW = prodCols[cIdx].width
        const lines = wrapTextLocal(text, colW - 10, 9, false)
        maxLines = Math.max(maxLines, lines.length)
        return lines
      })

      const rowH = Math.max(20, maxLines * 10 + 10)

      if (isEven) {
        pdf.addRect(MARGIN, currentY - rowH, CONTENT_W, rowH, grayR, grayG, grayB, true, 0)
      }

      curX = MARGIN
      wrappedRowData.forEach((lines, cIdx) => {
        const col = prodCols[cIdx]
        const blockH = lines.length * 10
        const padding = (rowH - blockH) / 2
        const startY = currentY - padding - 8

        lines.forEach((line, lIdx) => {
          const textW = line.length * 4.5
          let textX = curX + 10
          if (col.align === 'C') textX = Math.max(curX + 2, curX + (col.width - textW) / 2)
          if (col.align === 'R') textX = curX + col.width - textW - 10
          pdf.addTextToPage(0, line, textX, startY - lIdx * 10, 9, 'F1', 0, 0, 0)
        })
        curX += col.width
      })

      currentY -= rowH
    })

    currentY -= 30
  } else {
    currentY = PAGE_H - MARGIN - 60
  }

  pdf.addTextToPage(0, 'Coberturas por produto', MARGIN, currentY, 14, 'F2', 0, 0, 0)
  currentY -= 15

  const covCols = [{ label: 'COBERTURA', width: CONTENT_W * 0.4, align: 'L' }]
  const prodColW = (CONTENT_W * 0.6) / (produtos.length || 1)
  produtos.forEach((p) => {
    covCols.push({ label: p.produto_nome, width: prodColW, align: 'C' })
  })

  const drawCovHeader = (pageIdx: number, y: number) => {
    let maxHeaderLines = 1
    const wrappedHeaders = covCols.map((col, idx) => {
      const lines = wrapTextLocal(col.label, col.width - (idx === 0 ? 10 : 4), 9, true)
      maxHeaderLines = Math.max(maxHeaderLines, lines.length)
      return lines
    })

    const headerH = maxHeaderLines * 10 + 6
    pdf.addRoundedRect(
      MARGIN,
      y - headerH + 6,
      CONTENT_W,
      headerH,
      8,
      blueR,
      blueG,
      blueB,
      true,
      0,
      { tl: true, tr: true, br: false, bl: false },
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
      const fontSize = 7
      const lines = wrapTextLocal(text, colW - (cIdx === 0 ? 10 : 4), fontSize, isBold)
      maxLines = Math.max(maxLines, lines.length)
      return lines
    })

    const rowH = Math.max(12, maxLines * 7 + 4)

    if (currentY - rowH < MARGIN + 20) {
      pdf.addPage()
      const newPageIdx = pdf.pages.length - 1
      drawFooter(newPageIdx)
      currentY = PAGE_H - MARGIN
      headerH = drawCovHeader(newPageIdx, currentY)
      currentY -= headerH
    }

    const isLast = idx === coberturasList.length - 1

    if (isEven) {
      if (isLast) {
        pdf.addRoundedRect(
          MARGIN,
          currentY - rowH + 6,
          CONTENT_W,
          rowH,
          8,
          grayR,
          grayG,
          grayB,
          true,
          0,
          { tl: false, tr: false, br: true, bl: true },
        )
      } else {
        pdf.addRect(MARGIN, currentY - rowH + 6, CONTENT_W, rowH, grayR, grayG, grayB, true, 0)
      }
    }

    let cx = MARGIN
    wrappedRowData.forEach((lines, cIdx) => {
      const col = covCols[cIdx]
      const startY = currentY - (rowH - lines.length * 7) / 2 + 3
      lines.forEach((line, lIdx) => {
        const isBold = cIdx > 0
        const fontSize = 7
        const textW = line.length * (isBold ? 4.0 : 3.5)
        let textX = cx + 5
        if (col.align === 'C') textX = Math.max(cx + 2, cx + (col.width - textW) / 2)
        pdf.addTextToPage(
          pdf.pages.length - 1,
          line,
          textX,
          startY - lIdx * 7,
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

export async function generateAndDownloadCotacaoPdf(cotacaoId: string, onlyCoverages = false) {
  const cotacao = await pb.collection('cotacoes').getOne(cotacaoId, {
    expand: 'forma_pagamento_id,cotacao_produtos_via_cotacao_id.produto_id,usuario_id',
  })

  const userPais = cotacao.expand?.usuario_id?.pais || 'Brasil'
  const targetMoeda = userPais === 'Argentina' ? 'ARS' : 'BRL'

  let taxaCambio = cotacao.taxa_cambio
  if (!taxaCambio) {
    taxaCambio = targetMoeda === 'ARS' ? 980.5 : 5.09
    try {
      const filterDate = cotacao.created
        ? new Date(cotacao.created).toISOString().replace('T', ' ')
        : new Date().toISOString().replace('T', ' ')
      const taxasRes = await pb.collection('taxas_cambio').getList(1, 1, {
        filter: `data <= "${filterDate}" && moeda = "${targetMoeda}"`,
        sort: '-data',
      })
      if (taxasRes.items.length > 0) {
        taxaCambio = taxasRes.items[0].valor
      }
    } catch {
      /* intentionally ignored */
    }
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
      moeda: rel.moeda || cotacao.moeda,
      coberturas: coberturasRel.map((c: any) => {
        let valRaw = c.valor || c.descricao_customizada
        let valFinal = ''

        if (!valRaw || valRaw.trim() === '') {
          valFinal = ''
        } else {
          let text = valRaw.trim()
          const match = text.match(/^([A-Za-z$]+)?\s*([\d.,\s]+)$/)
          if (match) {
            const prefix = match[1] ? match[1] + ' ' : ''
            const numberStr = match[2].trim()
            const justDigits = numberStr.replace(/[\s.,]/g, '')
            if (justDigits.length > 0) {
              let parsedNum = NaN
              if (/[,.]\d{1,2}$/.test(numberStr)) {
                const cleaned = numberStr
                  .replace(/[,.](\d{1,2})$/, '|$1')
                  .replace(/[\s.,]/g, '')
                  .replace('|', '.')
                parsedNum = parseFloat(cleaned)
              } else {
                parsedNum = parseFloat(justDigits)
              }

              if (!isNaN(parsedNum)) {
                valFinal =
                  prefix +
                  parsedNum.toLocaleString(userPais === 'Argentina' ? 'es-AR' : 'pt-BR', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })
              } else {
                valFinal = valRaw
              }
            } else {
              valFinal = valRaw
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
    pais_usuario: userPais,
  }

  const logoData = await getJpegData(logoImgUrl).catch(() => null)
  const blob = gerarPDFProposta(pdfData, produtosPDF, logoData, onlyCoverages)

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = onlyCoverages ? `Resumo_Coberturas_${cotacao.id}.pdf` : `Cotacao_${cotacao.id}.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 100)
}
