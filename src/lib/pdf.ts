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
    <title>Proposta de Cotação - ${cotacao.id}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; color: #333; margin: 40px; }
      .header-container { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #1e3a8a; padding-bottom: 15px; margin-bottom: 20px; }
      .header-title { color: #1e3a8a; font-size: 24px; font-weight: bold; letter-spacing: 1px; }
      .logo-placeholder { width: 140px; height: 50px; background-color: #f8fafc; border: 1px dashed #94a3b8; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: 11px; font-weight: bold; }
      .section-title { font-size: 16px; font-weight: bold; margin-top: 25px; margin-bottom: 15px; color: #1e3a8a; border-left: 4px solid #3b82f6; padding-left: 8px; }
      .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 25px; background: #f8fafc; padding: 15px; border-radius: 6px; }
      .info-item span { font-weight: bold; color: #475569; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 25px; border: 1px solid #cbd5e1; }
      th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; }
      th { background-color: #f1f5f9; color: #1e293b; font-weight: bold; }
      .total-value { color: #16a34a; font-size: 16px; font-weight: bold; }
      .validity { margin-top: 30px; font-weight: bold; color: #dc2626; background: #fee2e2; padding: 10px; border-radius: 4px; display: inline-block; }
      .footer { margin-top: 50px; font-size: 10px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 15px; display: flex; justify-content: space-between; }
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
            <td>${cotacao.moeda || 'USD'} ${p.preco_total_produto.toFixed(2)}</td>
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
        <td>${cotacao.moeda || 'USD'}</td>
      </tr>
      <tr>
        <td><strong>Fatura Total:</strong></td>
        <td class="total-value">${cotacao.moeda || 'USD'} ${cotacao.fatura_total.toFixed(2)}</td>
      </tr>
      <tr>
        <td><strong>Status da Proposta:</strong></td>
        <td>${cotacao.status?.replace('_', ' ') || 'N/A'}</td>
      </tr>
    </table>

    <div class="section-title">4. Validade</div>
    <div class="validity">
      Validade: 30 dias (a partir de ${
        cotacao.created_at
          ? new Date(cotacao.created_at).toLocaleDateString('pt-BR')
          : new Date().toLocaleDateString('pt-BR')
      })
    </div>

    <div class="footer">
      <div>Código da Proposta: ${cotacao.id}</div>
      <div>Contato: atendimento@segurosviagem.com | +55 11 9999-9999</div>
    </div>
  </body>
  </html>
  `

  return new Blob([html], { type: 'application/pdf' })
}
