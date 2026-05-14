routerAdd(
  'GET',
  '/backend/v1/produtos',
  (e) => {
    const ip = e.request.remoteAddr.split(':')[0]
    const oneMinAgo = new Date(Date.now() - 60000).toISOString().replace('T', ' ')
    const filter = `ip = '${ip}' && endpoint = '/backend/v1/produtos' && created >= '${oneMinAgo}'`
    const recs = $app.findRecordsByFilter('rate_limits', filter, '', 100, 0)
    if (recs.length >= 100) {
      throw new TooManyRequestsError('Rate limit exceeded')
    }
    const rl = new Record($app.findCollectionByNameOrId('rate_limits'))
    rl.set('ip', ip)
    rl.set('endpoint', '/backend/v1/produtos')
    $app.saveNoValidate(rl)

    const produtos = $app.findRecordsByFilter('produtos', 'ativo = true', '-created', 1000, 0)

    const result = []
    for (const p of produtos) {
      const precos = $app.findRecordsByFilter(
        'produto_precos_forma_pagamento',
        `produto_id = '${p.id}'`,
        '',
        1000,
        0,
      )
      const destinos = $app.findRecordsByFilter(
        'produto_destinos',
        `produto_id = '${p.id}'`,
        '',
        1000,
        0,
      )
      const faixas = $app.findRecordsByFilter(
        'produto_faixas_etarias',
        `produto_id = '${p.id}'`,
        '',
        1000,
        0,
      )

      const precosObj = {}
      for (const pr of precos)
        precosObj[pr.getString('forma_pagamento_codigo')] = pr.getFloat('preco_base_net')

      const destinosObj = {}
      for (const d of destinos)
        destinosObj[d.getString('destino_codigo')] = {
          agravo_percentual: d.getFloat('agravo_percentual'),
        }

      const faixasObj = {}
      for (const f of faixas)
        faixasObj[f.getString('faixa_nome')] = {
          fator_multiplicador: f.getFloat('fator_multiplicador'),
        }

      result.push({
        id: p.id,
        codigo: p.getString('codigo'),
        nome: p.getString('nome'),
        categoria: p.getString('categoria'),
        tags: p.get('tags') || [],
        precos_base_por_forma_pagamento: precosObj,
        destinos: destinosObj,
        faixas_etarias: faixasObj,
      })
    }
    return e.json(200, result)
  },
  $apis.requireAuth(),
)
