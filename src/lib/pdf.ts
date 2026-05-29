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

export function gerarPDFProposta(
  cotacao: CotacaoPDFData,
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
  const CARD_W = PAGE_W - 2 * MARGIN

  const pR = 0.114,
    pG = 0.188,
    pB = 0.859
  const lightR = 0,
    lightG = 0.804,
    lightB = 0.988
  const darkR = 0.125,
    darkG = 0.141,
    darkB = 0.188
  const grayR = 0.898,
    grayG = 0.902,
    grayB = 0.902
  const whiteR = 1,
    whiteG = 1,
    whiteB = 1

  const truncate = (str: string, len: number) => {
    if (!str) return ''
    return str.length > len ? str.substring(0, len - 3) + '...' : str
  }

  const formatDate = (d: any) => {
    if (!d) return 'N/A'
    const dt = new Date(d)
    return isNaN(dt.getTime()) ? 'N/A' : dt.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
  }

  const wrapText = (text: string, maxLen: number) => {
    if (!text) return []
    const words = text.split(' ')
    const lines: string[] = []
    let currentLine = words[0] || ''

    for (let i = 1; i < words.length; i++) {
      const word = words[i]
      if (currentLine.length + word.length + 1 <= maxLen) {
        currentLine += ' ' + word
      } else {
        lines.push(currentLine)
        currentLine = word
      }
    }
    if (currentLine) {
      lines.push(currentLine)
    }
    return lines
  }

  const drawGlobalHeader = (pageIndex: number) => {
    if (logoData) {
      pdf.drawImage(pageIndex, 'logo', MARGIN, PAGE_H - MARGIN - 80, 168, 80)
    } else {
      pdf.addTextToPage(pageIndex, 'Now', MARGIN, PAGE_H - MARGIN - 20, 24, 'F2', pR, pG, pB)
      pdf.addTextToPage(
        pageIndex,
        'Assistance',
        MARGIN,
        PAGE_H - MARGIN - 40,
        14,
        'F2',
        lightR,
        lightG,
        lightB,
      )
    }

    if (pageIndex === 0) {
      const dates = `${formatDate(cotacao.data_inicio)} a ${formatDate(cotacao.data_fim)}`
      const created = formatDate(cotacao.created)
      const comissaoText =
        (cotacao.comissao || 0) > 0 ? `${((cotacao.comissao || 0) * 100).toFixed(0)}%` : '0%'
      const totalFormatado = `${cotacao.moeda || 'USD'} ${(cotacao.fatura_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

      const col1 = MARGIN
      const col2 = MARGIN + 260
      let y = PAGE_H - 140

      const labelSz = 8
      const valSz = 9

      pdf.addTextToPage(pageIndex, 'Agência:', col1, y, labelSz, 'F2', darkR, darkG, darkB)
      pdf.addTextToPage(
        pageIndex,
        truncate(cotacao.nome_agencia || 'N/A', 40),
        col1 + 45,
        y,
        valSz,
        'F1',
        darkR,
        darkG,
        darkB,
      )
      pdf.addTextToPage(pageIndex, 'Data da Cotação:', col2, y, labelSz, 'F2', darkR, darkG, darkB)
      pdf.addTextToPage(pageIndex, created, col2 + 80, y, valSz, 'F1', darkR, darkG, darkB)

      y -= 15
      pdf.addTextToPage(pageIndex, 'Período:', col1, y, labelSz, 'F2', darkR, darkG, darkB)
      pdf.addTextToPage(pageIndex, dates, col1 + 45, y, valSz, 'F1', darkR, darkG, darkB)
      pdf.addTextToPage(pageIndex, 'Total de Dias:', col2, y, labelSz, 'F2', darkR, darkG, darkB)
      pdf.addTextToPage(
        pageIndex,
        `${cotacao.qtd_dias || 1}`,
        col2 + 65,
        y,
        valSz,
        'F1',
        darkR,
        darkG,
        darkB,
      )

      y -= 15
      pdf.addTextToPage(pageIndex, 'Passageiros:', col1, y, labelSz, 'F2', darkR, darkG, darkB)
      pdf.addTextToPage(
        pageIndex,
        `${cotacao.total_passageiros || 0}`,
        col1 + 60,
        y,
        valSz,
        'F1',
        darkR,
        darkG,
        darkB,
      )
      pdf.addTextToPage(pageIndex, 'Comissão:', col2, y, labelSz, 'F2', darkR, darkG, darkB)
      pdf.addTextToPage(pageIndex, comissaoText, col2 + 55, y, valSz, 'F1', darkR, darkG, darkB)

      y -= 15
      pdf.addTextToPage(pageIndex, 'Pagamento:', col1, y, labelSz, 'F2', darkR, darkG, darkB)
      pdf.addTextToPage(
        pageIndex,
        truncate(cotacao.forma_pagamento || 'N/A', 35),
        col1 + 55,
        y,
        valSz,
        'F1',
        darkR,
        darkG,
        darkB,
      )
      pdf.addTextToPage(pageIndex, 'Fatura Total:', col2, y, labelSz, 'F2', darkR, darkG, darkB)
      pdf.addTextToPage(pageIndex, totalFormatado, col2 + 60, y, 10, 'F2', pR, pG, pB)

      pdf.addLineToPage(pageIndex, MARGIN, y - 15, PAGE_W - MARGIN, y - 15, grayR, grayG, grayB)
    } else {
      pdf.addLineToPage(
        pageIndex,
        MARGIN,
        PAGE_H - MARGIN - 90,
        PAGE_W - MARGIN,
        PAGE_H - MARGIN - 90,
        grayR,
        grayG,
        grayB,
      )
    }
  }

  pdf.addPage()
  drawGlobalHeader(0)

  if (produtos.length === 0) {
    pdf.addText('Nenhum produto selecionado na cotação.', MARGIN, PAGE_H - 150, 12, 'F1')
  }

  let currentY = PAGE_H - 220
  const minAvailableY = 80
  const headerHeight = 60

  for (const prod of produtos) {
    let cobs = prod.coberturas
    let idx = 0

    while (idx < cobs.length || (cobs.length === 0 && idx === 0)) {
      let availableHeight = currentY - minAvailableY

      const remainingCobs = cobs.slice(idx)
      const cobHeights = remainingCobs.map((cob) => {
        const lines = wrapText(cob.nome, 65)
        return Math.max(17, lines.length * 10 + 7)
      })

      if (availableHeight < headerHeight + (cobHeights[0] || 17) + 25) {
        pdf.addPage()
        drawGlobalHeader(pdf.pages.length - 1)
        currentY = PAGE_H - 150
        availableHeight = currentY - minAvailableY
      }

      let spaceForRows = availableHeight - headerHeight - 25
      let itemsToDraw = 0
      let usedSpace = 0

      if (cobs.length === 0) {
        itemsToDraw = 1
        usedSpace = 17
      } else {
        for (let i = 0; i < remainingCobs.length; i++) {
          if (usedSpace + cobHeights[i] <= spaceForRows) {
            itemsToDraw++
            usedSpace += cobHeights[i]
          } else {
            break
          }
        }
      }

      if (idx === 0 && cobs.length > 0) {
        const totalNeeded = headerHeight + cobHeights.reduce((a, b) => a + b, 0) + 25
        const maxPageCapacity = PAGE_H - 150 - minAvailableY

        if (totalNeeded > availableHeight && totalNeeded <= maxPageCapacity) {
          pdf.addPage()
          drawGlobalHeader(pdf.pages.length - 1)
          currentY = PAGE_H - 150
          availableHeight = currentY - minAvailableY

          spaceForRows = availableHeight - headerHeight - 25
          itemsToDraw = 0
          usedSpace = 0
          for (let i = 0; i < remainingCobs.length; i++) {
            if (usedSpace + cobHeights[i] <= spaceForRows) {
              itemsToDraw++
              usedSpace += cobHeights[i]
            } else {
              break
            }
          }
        }
      }

      if (itemsToDraw < 1) {
        if (currentY < PAGE_H - 160) {
          pdf.addPage()
          drawGlobalHeader(pdf.pages.length - 1)
          currentY = PAGE_H - 150
          continue
        } else {
          itemsToDraw = 1
          usedSpace = cobHeights[0]
        }
      }

      const pageCobs = cobs.slice(idx, idx + itemsToDraw)
      const pageCobHeights = cobHeights.slice(0, itemsToDraw)
      const cobsCount = pageCobs.length || 1
      const cardHeight =
        headerHeight + (pageCobs.length > 0 ? pageCobHeights.reduce((a, b) => a + b, 0) : 17) + 25

      const cardTop = currentY

      pdf.addShadow(MARGIN, cardTop - cardHeight, CARD_W, cardHeight, 12)
      pdf.addRoundedRect(
        MARGIN,
        cardTop - cardHeight,
        CARD_W,
        cardHeight,
        12,
        12,
        12,
        12,
        pR,
        pG,
        pB,
        whiteR,
        whiteG,
        whiteB,
        true,
        true,
        2,
      )
      pdf.addRoundedRect(
        MARGIN,
        cardTop - headerHeight,
        CARD_W,
        headerHeight,
        10,
        10,
        0,
        0,
        pR,
        pG,
        pB,
        pR,
        pG,
        pB,
        true,
        false,
        1,
      )

      pdf.addText(
        truncate(prod.produto_nome, 60),
        MARGIN + 15,
        cardTop - 34,
        14,
        'F2',
        whiteR,
        whiteG,
        whiteB,
      )
      const priceText = `${cotacao.moeda || 'USD'} ${(prod.preco_total_produto || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      const priceW = priceText.length * 8
      pdf.addText(
        priceText,
        PAGE_W - MARGIN - priceW - 20,
        cardTop - 34,
        16,
        'F2',
        whiteR,
        whiteG,
        whiteB,
      )

      let rowY = cardTop - headerHeight

      pdf.addText('Cobertura', MARGIN + 15, rowY - 12, 9, 'F2', darkR, darkG, darkB)
      pdf.addText('Valor', MARGIN + CARD_W - 100, rowY - 12, 9, 'F2', darkR, darkG, darkB)
      pdf.addLine(MARGIN + 1, rowY - 17, MARGIN + CARD_W - 1, rowY - 17, grayR, grayG, grayB, 0.5)
      rowY -= 17

      if (cobs.length === 0) {
        pdf.addText('Não configurado.', MARGIN + 15, rowY - 12, 9, 'F1', darkR, darkG, darkB)
      } else {
        for (let i = 0; i < pageCobs.length; i++) {
          const cob = pageCobs[i]
          const rh = pageCobHeights[i]
          const isEven = (idx + i) % 2 === 0

          if (isEven) {
            pdf.addRect(MARGIN + 1, rowY - rh, CARD_W - 2, rh, whiteR, whiteG, whiteB, true, 0)
          } else {
            pdf.addRect(MARGIN + 1, rowY - rh, CARD_W - 2, rh, grayR, grayG, grayB, true, 0)
          }

          const lines = wrapText(cob.nome, 65)
          let textY = rowY - 12
          for (const line of lines) {
            pdf.addText(truncate(line, 80), MARGIN + 15, textY, 9, 'F1', darkR, darkG, darkB)
            textY -= 10
          }

          pdf.addText(
            truncate(cob.valor, 30),
            MARGIN + CARD_W - 100,
            rowY - 12,
            9,
            'F1',
            darkR,
            darkG,
            darkB,
          )

          if (i < pageCobs.length - 1) {
            pdf.addLine(
              MARGIN + 1,
              rowY - rh,
              MARGIN + CARD_W - 1,
              rowY - rh,
              grayR,
              grayG,
              grayB,
              0.5,
            )
          }

          rowY -= rh
        }
      }

      currentY -= cardHeight + 20
      idx += itemsToDraw
      if (idx >= cobs.length) break
    }
  }

  const numPages = pdf.pages.length
  for (let i = 0; i < numPages; i++) {
    const footerY = 30
    const footerText = `Página ${i + 1} de ${numPages} | Now Assistance | ID: ${cotacao.id}`

    pdf.addLineToPage(i, MARGIN, footerY + 15, PAGE_W - MARGIN, footerY + 15, grayR, grayG, grayB)
    pdf.addTextToPage(
      i,
      footerText,
      PAGE_W / 2 - footerText.length * 2.2,
      footerY,
      8,
      'F1',
      darkR,
      darkG,
      darkB,
    )
  }

  return pdf.build()
}

export async function generateAndDownloadCotacaoPdf(cotacaoId: string) {
  const cotacao = await pb.collection('cotacoes').getOne(cotacaoId, {
    expand: 'forma_pagamento_id,cotacao_produtos_via_cotacao_id.produto_id,usuario_id',
  })

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
          valFinal = 'Não configurado'
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
              valFinal = `${c.moeda} ${numVal.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
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
        }
      }),
    })
  }

  let totalPassageiros = 0
  for (const rel of produtosRel) {
    totalPassageiros += (rel.qtd_ate_75 || 0) + (rel.qtd_76_a_85 || 0)
  }

  const pdfData: CotacaoPDFData = {
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
