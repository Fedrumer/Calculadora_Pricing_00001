routerAdd(
  'GET',
  '/backend/v1/formas-pagamento',
  (e) => {
    const ip = e.request.remoteAddr.split(':')[0]
    const oneMinAgo = new Date(Date.now() - 60000).toISOString().replace('T', ' ')
    const filter = `ip = '${ip}' && endpoint = '/backend/v1/formas-pagamento' && created >= '${oneMinAgo}'`
    const recs = $app.findRecordsByFilter('rate_limits', filter, '', 100, 0)
    if (recs.length >= 100) {
      throw new TooManyRequestsError('Rate limit exceeded')
    }
    const rl = new Record($app.findCollectionByNameOrId('rate_limits'))
    rl.set('ip', ip)
    rl.set('endpoint', '/backend/v1/formas-pagamento')
    $app.saveNoValidate(rl)

    const formas = $app.findRecordsByFilter('formas_pagamento', 'ativo = true', 'nome', 1000, 0)
    const result = formas.map((f) => ({
      id: f.id,
      codigo: f.getString('codigo'),
      nome: f.getString('nome'),
    }))
    return e.json(200, result)
  },
  $apis.requireAuth(),
)
