export interface CotacaoPDFData {
  id: string
  usuario?: { name?: string; email?: string }
  data_inicio?: Date | string
  data_fim?: Date | string
  qtd_dias?: number
  forma_pagamento?: string
  comissao?: number
  fatura_total: number
  preco_unitario_total?: number
  tipo_preco?: string
  moeda?: string
  created_at?: Date | string
  status?: string
}

export interface ProdutoDetalhePDF {
  produto_nome: string
  qtd_ate_75: number
  qtd_76_a_85: number
  preco_total_produto: number
  detalhes: {
    destino_nome?: string
    faixa_etaria?: string
    preco_unitario_dia?: number
    preco_total_faixa?: number
  }[]
}

function buildSimplePDF(lines: string[]) {
  // A raw PDF generator that strictly generates a valid binary application/pdf.
  const streamLines = lines.map(
    (l, i) => `BT /F1 12 Tf 40 ${760 - i * 16} Td (${l.replace(/[()\\]/g, '')}) Tj ET`,
  )
  const stream = streamLines.join('\n')
  const streamLen = new Blob([stream]).size

  const header = '%PDF-1.4\n'
  const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'
  const obj2 = '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n'
  const obj3 =
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n'
  const obj4 = `4 0 obj\n<< /Length ${streamLen} >>\nstream\n${stream}\nendstream\nendobj\n`
  const obj5 = '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'

  const loc1 = header.length
  const loc2 = loc1 + obj1.length
  const loc3 = loc2 + obj2.length
  const loc4 = loc3 + obj3.length
  const loc5 = loc4 + obj4.length
  const xrefLoc = loc5 + obj5.length

  const pad = (n: number) => n.toString().padStart(10, '0')

  const xref = `xref\n0 6\n0000000000 65535 f \n${pad(loc1)} 00000 n \n${pad(loc2)} 00000 n \n${pad(loc3)} 00000 n \n${pad(loc4)} 00000 n \n${pad(loc5)} 00000 n \n`
  const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefLoc}\n%%EOF`

  return new Blob([header + obj1 + obj2 + obj3 + obj4 + obj5 + xref + trailer], {
    type: 'application/pdf',
  })
}

export function gerarPDFProposta(
  cotacao: CotacaoPDFData,
  produtos_detalhes: ProdutoDetalhePDF[],
): Blob {
  const lines: string[] = []
  lines.push('PROPOSTA DE COTACAO - SEGUROS VIAGEM')
  lines.push('================================================')
  lines.push('')
  lines.push(`Codigo da Proposta: ${cotacao.id}`)
  lines.push(`Data de Geracao: ${new Date().toLocaleDateString('pt-BR')}`)
  lines.push('')

  const dInicio = cotacao.data_inicio
    ? new Date(cotacao.data_inicio).toLocaleDateString('pt-BR')
    : 'N/A'
  const dFim = cotacao.data_fim ? new Date(cotacao.data_fim).toLocaleDateString('pt-BR') : 'N/A'

  lines.push(`Periodo da Viagem: ${dInicio} a ${dFim}`)
  lines.push(`Total de Dias: ${cotacao.qtd_dias || 0} dias`)
  lines.push(`Forma de Pagamento: ${cotacao.forma_pagamento || 'N/A'}`)
  lines.push(
    `Comissao Aplicada: ${cotacao.comissao ? (cotacao.comissao * 100).toFixed(0) + '%' : '0%'}`,
  )
  lines.push('')
  lines.push('================================================')
  lines.push('PRODUTOS SELECIONADOS')
  lines.push('================================================')
  lines.push('')

  let totalViajantes = 0

  produtos_detalhes.forEach((p) => {
    lines.push(`${p.produto_nome.substring(0, 50)}`)
    lines.push(`   - Viajantes ate 75 anos: ${p.qtd_ate_75}`)
    lines.push(`   - Viajantes 76 a 85 anos: ${p.qtd_76_a_85}`)
    lines.push(
      `   - Subtotal do Produto: ${cotacao.moeda || 'USD'} ${p.preco_total_produto.toFixed(2)}`,
    )
    lines.push('')
    totalViajantes += p.qtd_ate_75 + p.qtd_76_a_85
  })

  lines.push('================================================')
  lines.push('RESUMO FINANCEIRO')
  lines.push('================================================')
  lines.push('')
  lines.push(`Status da Proposta: ${cotacao.status?.replace('_', ' ') || 'N/A'}`)
  lines.push(`Total de Viajantes: ${totalViajantes}`)
  lines.push(`FATURA TOTAL: ${cotacao.moeda || 'USD'} ${cotacao.fatura_total.toFixed(2)}`)

  return buildSimplePDF(lines)
}
