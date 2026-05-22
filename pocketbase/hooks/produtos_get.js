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

    let sortParam = e.requestInfo().query.sort || 'ordem_exibicao'
    const validSorts = ['ordem_exibicao', '-ordem_exibicao', 'created', '-created', 'nome', '-nome']
    const sortStr = validSorts.includes(sortParam) ? sortParam : 'ordem_exibicao'

    const produtos = $app.findRecordsByFilter('produtos', 'ativo = true', sortStr, 1000, 0)

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

      const faixasObj = {
        ate_75: { fator_multiplicador: 1.0 },
        de_76_a_85: { fator_multiplicador: 1.0 },
      }
      for (const f of faixas) {
        const nomeFaixa = f.getString('faixa_nome')
        if (nomeFaixa === 'ate_75' || nomeFaixa === 'de_76_a_85') {
          faixasObj[nomeFaixa] = {
            fator_multiplicador: f.getFloat('fator_multiplicador'),
          }
        }
      }

      result.push({
        id: p.id,
        codigo: p.getString('codigo'),
        nome: p.getString('nome'),
        categoria: p.getString('categoria'),
        tipo_cobranca: p.getString('tipo_cobranca'),
        tags: p.get('tags') || [],
        ordem_exibicao: p.getInt('ordem_exibicao'),
        precos_base_por_forma_pagamento: precosObj,
        destinos: destinosObj,
        faixas_etarias: faixasObj,
      })
    }
    return e.json(200, result)
  },
  $apis.requireAuth(),
)
