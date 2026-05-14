routerAdd(
  'GET',
  '/backend/v1/cotacoes',
  (e) => {
    const ip = e.request.remoteAddr.split(':')[0]
    const oneMinAgo = new Date(Date.now() - 60000).toISOString().replace('T', ' ')
    const filter = `ip = '${ip}' && endpoint = '/backend/v1/cotacoes_get' && created >= '${oneMinAgo}'`
    const recs = $app.findRecordsByFilter('rate_limits', filter, '', 100, 0)
    if (recs.length >= 100) {
      throw new TooManyRequestsError('Rate limit exceeded')
    }
    const rl = new Record($app.findCollectionByNameOrId('rate_limits'))
    rl.set('ip', ip)
    rl.set('endpoint', '/backend/v1/cotacoes_get')
    $app.saveNoValidate(rl)

    const cotacoes = $app.findRecordsByFilter(
      'cotacoes',
      `usuario_id = '${e.auth.id}'`,
      '-created',
      1000,
      0,
    )
    return e.json(
      200,
      cotacoes.map((c) => ({
        id: c.id,
        status: c.getString('status'),
        data_inicio: c.getString('data_inicio'),
        data_fim: c.getString('data_fim'),
        fatura_total: c.getFloat('fatura_total'),
        created: c.getString('created'),
      })),
    )
  },
  $apis.requireAuth(),
)
