routerAdd(
  'GET',
  '/backend/v1/cotacoes/{id}',
  (e) => {
    const ip = e.request.remoteAddr.split(':')[0]
    const oneMinAgo = new Date(Date.now() - 60000).toISOString().replace('T', ' ')
    const filter = `ip = '${ip}' && endpoint = '/backend/v1/cotacoes_get_id' && created >= '${oneMinAgo}'`
    const recs = $app.findRecordsByFilter('rate_limits', filter, '', 100, 0)
    if (recs.length >= 100) {
      throw new TooManyRequestsError('Rate limit exceeded')
    }
    const rl = new Record($app.findCollectionByNameOrId('rate_limits'))
    rl.set('ip', ip)
    rl.set('endpoint', '/backend/v1/cotacoes_get_id')
    $app.saveNoValidate(rl)

    const id = e.request.pathValue('id')
    const cotacao = $app.findRecordById('cotacoes', id)

    if (cotacao.getString('usuario_id') !== e.auth.id) {
      throw new ForbiddenError('Acesso negado')
    }

    const result = {
      id: cotacao.id,
      status: cotacao.getString('status'),
      forma_pagamento_id: cotacao.getString('forma_pagamento_id'),
      comissao: cotacao.getFloat('comissao'),
      data_inicio: cotacao.getString('data_inicio'),
      data_fim: cotacao.getString('data_fim'),
      qtd_dias: cotacao.getInt('qtd_dias'),
      fatura_total: cotacao.getFloat('fatura_total'),
      preco_unitario_total: cotacao.getFloat('preco_unitario_total'),
      tipo_preco: cotacao.getString('tipo_preco'),
      moeda: cotacao.getString('moeda'),
      created: cotacao.getString('created'),
      produtos: [],
    }

    const produtos = $app.findRecordsByFilter(
      'cotacao_produtos',
      `cotacao_id = '${id}'`,
      '',
      1000,
      0,
    )
    for (const p of produtos) {
      const prodObj = {
        id: p.id,
        produto_id: p.getString('produto_id'),
        qtd_ate_75: p.getInt('qtd_ate_75'),
        qtd_76_a_85: p.getInt('qtd_76_a_85'),
        preco_total_produto: p.getFloat('preco_total_produto'),
        detalhes: [],
      }

      const detalhes = $app.findRecordsByFilter(
        'cotacao_produto_detalhes',
        `cotacao_produto_id = '${p.id}'`,
        '',
        1000,
        0,
      )
      for (const d of detalhes) {
        prodObj.detalhes.push({
          id: d.id,
          destino_codigo: d.getString('destino_codigo'),
          faixa_etaria: d.getString('faixa_etaria'),
          preco_unitario_dia: d.getFloat('preco_unitario_dia'),
          preco_total_faixa: d.getFloat('preco_total_faixa'),
        })
      }
      result.produtos.push(prodObj)
    }

    return e.json(200, result)
  },
  $apis.requireAuth(),
)
