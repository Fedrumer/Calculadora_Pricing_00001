routerAdd(
  'POST',
  '/backend/v1/cotacoes',
  (e) => {
    const ip = e.request.remoteAddr.split(':')[0]
    const oneMinAgo = new Date(Date.now() - 60000).toISOString().replace('T', ' ')
    // Fix: Alignment with the actual endpoint /backend/v1/cotacoes instead of /backend/v1/cotacoes_post
    const filter = `ip = '${ip}' && endpoint = '/backend/v1/cotacoes' && created >= '${oneMinAgo}'`
    const recs = $app.findRecordsByFilter('rate_limits', filter, '', 100, 0)
    if (recs.length >= 100) {
      throw new TooManyRequestsError('Rate limit exceeded')
    }
    const rl = new Record($app.findCollectionByNameOrId('rate_limits'))
    rl.set('ip', ip)
    rl.set('endpoint', '/backend/v1/cotacoes')
    $app.saveNoValidate(rl)

    const body = e.requestInfo().body

    if (!body.usuario_id || body.usuario_id !== e.auth.id) {
      throw new BadRequestError('Invalid user')
    }

    if (body.forma_pagamento_id) {
      try {
        const formaPagamento = $app.findRecordById('formas_pagamento', body.forma_pagamento_id)
        if (!formaPagamento.getBool('ativo')) {
          throw new BadRequestError('Forma de pagamento inativa')
        }
      } catch (_) {
        // Safe catch prevents internal SQL 404 'no rows in result set' from crashing the request with a generic 404
        throw new BadRequestError('Forma de pagamento inválida ou não encontrada')
      }
    }

    let expectedFatura = 0
    if (Array.isArray(body.produtos)) {
      for (const p of body.produtos) {
        try {
          const prod = $app.findRecordById('produtos', p.produto_id)
          if (!prod.getBool('ativo')) {
            throw new BadRequestError(`Produto inativo: ${prod.getString('nome')}`)
          }
        } catch (_) {
          throw new BadRequestError('Produto inválido ou não encontrado')
        }
        expectedFatura += p.preco_total_produto
      }
    }

    if (Math.abs(expectedFatura - body.fatura_total) > 0.5) {
      throw new BadRequestError('Falha na integridade do cálculo')
    }

    const cotacao = new Record($app.findCollectionByNameOrId('cotacoes'))
    cotacao.set('usuario_id', body.usuario_id)
    cotacao.set('status', body.status)
    cotacao.set('forma_pagamento_id', body.forma_pagamento_id)
    cotacao.set('comissao', body.comissao)
    cotacao.set('data_inicio', body.data_inicio)
    cotacao.set('data_fim', body.data_fim)
    cotacao.set('qtd_dias', body.qtd_dias)
    cotacao.set('fatura_total', body.fatura_total)
    cotacao.set('preco_unitario_total', body.preco_unitario_total)
    cotacao.set('tipo_preco', body.tipo_preco)
    cotacao.set('moeda', body.moeda)
    if (body.nome_agencia !== undefined) {
      cotacao.set('nome_agencia', body.nome_agencia)
    }
    if (body.markup_percentual !== undefined) {
      cotacao.set('markup_percentual', body.markup_percentual)
    }

    $app.runInTransaction((txApp) => {
      txApp.save(cotacao)

      if (Array.isArray(body.produtos)) {
        for (const p of body.produtos) {
          const cotProd = new Record(txApp.findCollectionByNameOrId('cotacao_produtos'))
          cotProd.set('cotacao_id', cotacao.id)
          cotProd.set('produto_id', p.produto_id)
          cotProd.set('qtd_ate_75', p.qtd_ate_75)
          cotProd.set('qtd_76_a_85', p.qtd_76_a_85)
          cotProd.set('preco_total_produto', p.preco_total_produto)
          txApp.save(cotProd)

          if (Array.isArray(p.detalhes)) {
            for (const d of p.detalhes) {
              const cotDet = new Record(txApp.findCollectionByNameOrId('cotacao_produto_detalhes'))
              cotDet.set('cotacao_produto_id', cotProd.id)
              cotDet.set('destino_codigo', d.destino_codigo)
              cotDet.set('faixa_etaria', d.faixa_etaria)
              cotDet.set('preco_unitario_dia', d.preco_unitario_dia)
              cotDet.set('preco_total_faixa', d.preco_total_faixa)
              txApp.save(cotDet)
            }
          }
        }
      }
    })

    return e.json(200, { id: cotacao.id, message: 'Cotação salva com sucesso' })
  },
  $apis.requireAuth(),
)
