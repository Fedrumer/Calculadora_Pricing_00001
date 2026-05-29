import pb from '@/lib/pocketbase/client'

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

class PDFBuilder {
  pages: string[][] = []

  addPage() {
    this.pages.push([])
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
      const objId = xref.length
      const obj = `${objId} 0 obj\n${content}\nendobj\n`
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
      const streamLen = streamContent.length
      const contentObjIdx = pageObjectsStartIndex + i * 2 + 1

      addObj(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents ${contentObjIdx} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`,
      )
      addObj(`<< /Length ${streamLen} >>\nstream\n${streamContent}\nendstream`)
    }

    const xrefData =
      `xref\n0 ${xref.length + 1}\n0000000000 65535 f \r\n` +
      xref.map((off) => `${off.toString().padStart(10, '0')} 00000 n \r\n`).join('')

    const trailer = `trailer\n<< /Size ${xref.length + 1} /Root 1 0 R >>\nstartxref\n${currentOffset}\n%%EOF\n`

    return new Blob([header + objects.join('') + xrefData + trailer], { type: 'application/pdf' })
  }
}

export function gerarPDFProposta(cotacao: CotacaoPDFData, produtos: ProdutoDetalhePDF[]): Blob {
  const pdf = new PDFBuilder()
  const PAGE_W = 595.28
  const PAGE_H = 841.89
  const MARGIN = 56.7

  const CARD_W = PAGE_W - 2 * MARGIN

  const truncate = (str: string, len: number) =>
    str.length > len ? str.substring(0, len - 3) + '...' : str

  let currentY = PAGE_H - MARGIN

  const checkSpace = (required: number) => {
    if (currentY - required < MARGIN + 40) {
      pdf.addPage()
      currentY = PAGE_H - MARGIN
      pdf.addText(`Cotação ${cotacao.id}`, MARGIN, currentY, 10, 'F2', 0.5, 0.5, 0.5)
      pdf.addLine(MARGIN, currentY - 5, PAGE_W - MARGIN, currentY - 5, 0.8, 0.8, 0.8)
      currentY -= 25
    }
  }

  pdf.addPage()

  // Header Page 1
  pdf.addText('NOW ASSISTANCE', MARGIN, currentY, 18, 'F2', 0, 0.31, 0.63)
  currentY -= 30

  const formatDate = (d: any) => {
    if (!d) return 'N/A'
    const dt = new Date(d)
    return isNaN(dt.getTime()) ? 'N/A' : dt.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
  }

  const dates = `${formatDate(cotacao.data_inicio)} a ${formatDate(cotacao.data_fim)}`
  const created = formatDate(cotacao.created)

  const col2 = MARGIN + 220

  pdf.addText(`Agência: ${cotacao.nome_agencia || 'N/A'}`, MARGIN, currentY, 10, 'F2')
  pdf.addText(`Data da Cotação: ${created}`, col2, currentY, 10, 'F1')
  currentY -= 18

  pdf.addText(`Período da Viagem: ${dates}`, MARGIN, currentY, 10, 'F1')
  pdf.addText(`Total de Dias: ${cotacao.qtd_dias || 'N/A'}`, col2, currentY, 10, 'F1')
  currentY -= 18

  pdf.addText(`Passageiros: ${cotacao.total_passageiros || '0'}`, MARGIN, currentY, 10, 'F1')
  const comissaoText =
    (cotacao.comissao || 0) > 0 ? `${((cotacao.comissao || 0) * 100).toFixed(0)}%` : '0%'
  pdf.addText(`Comissão: ${comissaoText}`, col2, currentY, 10, 'F1')
  currentY -= 18

  pdf.addText(`Pagamento: ${cotacao.forma_pagamento || 'N/A'}`, MARGIN, currentY, 10, 'F1')
  const totalFormatado = `${cotacao.moeda || 'USD'} ${cotacao.fatura_total.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
  pdf.addText(`Fatura Total: ${totalFormatado}`, col2, currentY, 10, 'F2', 0, 0.31, 0.63)
  currentY -= 25

  pdf.addLine(MARGIN, currentY, PAGE_W - MARGIN, currentY, 0.8, 0.8, 0.8)
  currentY -= 25

  if (produtos.length === 0) {
    pdf.addText('Nenhum produto selecionado na cotação.', MARGIN, currentY, 12, 'F1')
  }

  for (const prod of produtos) {
    checkSpace(80)

    // Product Header
    pdf.addRect(MARGIN, currentY - 20, CARD_W, 25, 0.2, 0.2, 0.2, true)
    pdf.addText(truncate(prod.produto_nome, 60), MARGIN + 10, currentY - 14, 12, 'F2', 1, 1, 1)

    const priceText = `${cotacao.moeda || 'USD'} ${prod.preco_total_produto.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
    const priceW = priceText.length * 6 // estimation
    pdf.addText(priceText, PAGE_W - MARGIN - priceW - 20, currentY - 14, 12, 'F2', 1, 1, 1)
    currentY -= 35

    // Section header
    pdf.addText('COBERTURAS', MARGIN, currentY, 10, 'F2', 0, 0.31, 0.63)
    currentY -= 15

    // Table Header
    pdf.addRect(MARGIN, currentY - 15, CARD_W, 15, 0, 0.31, 0.63, true)
    pdf.addText('Cobertura', MARGIN + 10, currentY - 10, 9, 'F2', 1, 1, 1)
    pdf.addText('Valor', MARGIN + CARD_W - 120, currentY - 10, 9, 'F2', 1, 1, 1)
    currentY -= 15

    // Table Rows
    for (let i = 0; i < prod.coberturas.length; i++) {
      checkSpace(20)
      const cob = prod.coberturas[i]
      const isEven = i % 2 === 0
      if (isEven) {
        pdf.addRect(MARGIN, currentY - 15, CARD_W, 15, 0.95, 0.95, 0.95, true)
      } else {
        pdf.addRect(MARGIN, currentY - 15, CARD_W, 15, 1, 1, 1, true)
      }

      pdf.addText(truncate(cob.nome, 70), MARGIN + 10, currentY - 10, 8, 'F1', 0.2, 0.2, 0.2)
      pdf.addText(
        truncate(cob.valor, 50),
        MARGIN + CARD_W - 120,
        currentY - 10,
        8,
        'F1',
        0.2,
        0.2,
        0.2,
      )

      currentY -= 15
    }

    currentY -= 20
  }

  // Draw Footers on all pages
  const numPages = pdf.pages.length
  for (let i = 0; i < numPages; i++) {
    const footerY = 30
    const footerText = `Página ${i + 1} de ${numPages} | Now Assistance | ID: ${cotacao.id}`

    pdf.addLineToPage(i, MARGIN, footerY + 15, PAGE_W - MARGIN, footerY + 15, 0.8, 0.8, 0.8)
    pdf.addTextToPage(
      i,
      footerText,
      PAGE_W / 2 - footerText.length * 2.2,
      footerY,
      8,
      'F1',
      0.4,
      0.4,
      0.4,
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
            const numRegex = /^(\d+)([.,]\d+)?$/
            const match = valRaw.match(numRegex)
            if (match) {
              const intPart = parseInt(match[1], 10).toLocaleString('pt-BR')
              const decPart = match[2] ? match[2].replace('.', ',') : ''
              valRaw = intPart + decPart
            }
            valFinal = `${c.moeda} ${valRaw}`
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

  const blob = gerarPDFProposta(pdfData, produtosPDF)

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Cotacao_${cotacao.id}.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 100)
}
