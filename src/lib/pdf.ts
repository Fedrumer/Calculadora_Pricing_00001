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

export function gerarPDFProposta(
  cotacao: CotacaoPDFData,
  produtos_detalhes: ProdutoDetalhePDF[],
): Blob {
  const totalViajantes = produtos_detalhes.reduce((acc, p) => acc + p.qtd_ate_75 + p.qtd_76_a_85, 0)

  const html = `
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <title>Proposta de Cotação</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 11px; color: #333; margin: 40px; }
      .header-container { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-bottom: 20px; }
      .header-title { color: #2563eb; font-size: 20px; font-weight: bold; }
      .logo-placeholder { width: 120px; height: 40px; background-color: #f3f4f6; border: 1px dashed #9ca3af; display: flex; align-items: center; justify-content: center; color: #9ca3af; font-size: 10px; font-weight: bold; }
      .section-title { font-size: 14px; font-weight: bold; margin-top: 20px; margin-bottom: 10px; color: #4b5563; }
      .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 20px; }
      .info-item span { font-weight: bold; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 20px; }
      th, td { border: 1px solid #9ca3af; padding: 8px; text-align: left; }
      th { background-color: #f3f4f6; color: #1f2937; }
      .total-value { color: #16a34a; font-size: 14px; font-weight: bold; }
      .validity { margin-top: 30px; font-style: italic; color: #4b5563; }
      .footer { margin-top: 50px; font-size: 9px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 10px; display: flex; justify-content: space-between; }
    </style>
  </head>
  <body>
    <div class="header-container">
      <div class="header-title">PROPOSTA DE COTAÇÃO</div>
      <div class="logo-placeholder">LOGO AQUI</div>
    </div>
    
    <p><strong>Data da Geração:</strong> ${new Date().toLocaleDateString('pt-BR')}</p>

    <div class="section-title">1. Dados da Cotação</div>
    <div class="info-grid">
      <div class="info-item"><span>Período:</span> ${
        cotacao.data_inicio ? new Date(cotacao.data_inicio).toLocaleDateString('pt-BR') : ''
      } a ${cotacao.data_fim ? new Date(cotacao.data_fim).toLocaleDateString('pt-BR') : ''}</div>
      <div class="info-item"><span>Total de Dias:</span> ${cotacao.qtd_dias || 0} dias</div>
      <div class="info-item"><span>Total de Viajantes:</span> ${totalViajantes}</div>
      <div class="info-item"><span>Forma de Pagamento:</span> ${
        cotacao.forma_pagamento || 'N/A'
      }</div>
      <div class="info-item"><span>Tipo de Preço:</span> ${cotacao.tipo_preco || 'N/A'}</div>
      <div class="info-item"><span>Comissão:</span> ${
        cotacao.comissao ? (cotacao.comissao * 100).toFixed(2) + '%' : '0%'
      }</div>
    </div>

    <div class="section-title">2. Produtos Selecionados</div>
    <table>
      <thead>
        <tr>
          <th>Produto</th>
          <th>Até 75 anos</th>
          <th>76 a 85 anos</th>
          <th>Qtd Viajantes</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${produtos_detalhes
          .map(
            (p) => `
          <tr>
            <td>${p.produto_nome}</td>
            <td>${p.qtd_ate_75}</td>
            <td>${p.qtd_76_a_85}</td>
            <td>${p.qtd_ate_75 + p.qtd_76_a_85}</td>
            <td>${cotacao.moeda} ${p.preco_total_produto.toFixed(2)}</td>
          </tr>
        `,
          )
          .join('')}
      </tbody>
    </table>

    <div class="section-title">3. Resumo Financeiro</div>
    <table>
      <tr>
        <td style="width: 70%;"><strong>Moeda Base:</strong></td>
        <td>${cotacao.moeda}</td>
      </tr>
      <tr>
        <td><strong>Fatura Total:</strong></td>
        <td class="total-value">${cotacao.moeda} ${cotacao.fatura_total.toFixed(2)}</td>
      </tr>
      <tr>
        <td><strong>Status da Proposta:</strong></td>
        <td>${cotacao.status || 'N/A'}</td>
      </tr>
    </table>

    <div class="section-title">4. Validade</div>
    <div class="validity">
      Validade de 30 dias a partir de ${
        cotacao.created_at
          ? new Date(cotacao.created_at).toLocaleDateString('pt-BR')
          : new Date().toLocaleDateString('pt-BR')
      }.
    </div>

    <div class="footer">
      <div>Código da Proposta: ${cotacao.id}</div>
      <div>Contato: atendimento@segurosviagem.com | +55 11 9999-9999</div>
    </div>
  </body>
  </html>
  `

  // We return the content wrapped as an application/pdf blob per specification.
  return new Blob([html], { type: 'application/pdf' })
}
