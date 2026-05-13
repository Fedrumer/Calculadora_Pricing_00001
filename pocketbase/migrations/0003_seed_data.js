migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    try {
      app.findAuthRecordByEmail('_pb_users_auth_', 'admin@now.com')
    } catch (_) {
      const admin = new Record(users)
      admin.setEmail('admin@now.com')
      admin.setPassword('admin123')
      admin.setVerified(true)
      admin.set('role', 'ADMIN')
      admin.set('ativo', true)
      app.save(admin)
    }

    try {
      app.findAuthRecordByEmail('_pb_users_auth_', 'comercial1@now.com')
    } catch (_) {
      const com = new Record(users)
      com.setEmail('comercial1@now.com')
      com.setPassword('comercial123')
      com.setVerified(true)
      com.set('role', 'COMERCIAL')
      com.set('ativo', true)
      app.save(com)
    }

    const fpgs = app.findCollectionByNameOrId('formas_pagamento')
    const fpData = [
      { codigo: 'TRANSFER', nome: 'Transfer', ativo: true },
      { codigo: 'CARD_1X', nome: 'Cartão 1x', ativo: true },
      { codigo: 'CARD_2X', nome: 'Cartão 2x', ativo: true },
      { codigo: 'CARD_3X', nome: 'Cartão 3x', ativo: true },
    ]
    fpData.forEach((d) => {
      try {
        app.findFirstRecordByData('formas_pagamento', 'codigo', d.codigo)
      } catch (_) {
        const rec = new Record(fpgs)
        rec.set('codigo', d.codigo)
        rec.set('nome', d.nome)
        rec.set('ativo', d.ativo)
        app.save(rec)
      }
    })

    const prods = app.findCollectionByNameOrId('produtos')
    const produtosSeed = [
      {
        codigo: 'NOW_VIP_500',
        nome: 'Now VIP 500',
        cobertura_medica: 500000,
        precos: { TRANSFER: 19.55, CARD_1X: 20.0, CARD_2X: 20.5, CARD_3X: 21.0 },
      },
      {
        codigo: 'NOW_INFINITY_300',
        nome: 'Now Infinity 300',
        cobertura_medica: 300000,
        precos: { TRANSFER: 15.5, CARD_1X: 16.0, CARD_2X: 16.5, CARD_3X: 17.0 },
      },
      {
        codigo: 'NOW_PREMIUM_200',
        nome: 'Now Premium 200',
        cobertura_medica: 200000,
        precos: { TRANSFER: 12.0, CARD_1X: 12.5, CARD_2X: 13.0, CARD_3X: 13.5 },
      },
      {
        codigo: 'NOW_TOTAL_100',
        nome: 'Now Total 100',
        cobertura_medica: 100000,
        precos: { TRANSFER: 9.0, CARD_1X: 9.5, CARD_2X: 10.0, CARD_3X: 10.5 },
      },
    ]

    const colPrecos = app.findCollectionByNameOrId('produto_precos_forma_pagamento')
    const colDest = app.findCollectionByNameOrId('produto_destinos')
    const colFaixa = app.findCollectionByNameOrId('produto_faixas_etarias')

    produtosSeed.forEach((p, idx) => {
      let pRec
      try {
        pRec = app.findFirstRecordByData('produtos', 'codigo', p.codigo)
      } catch (_) {
        pRec = new Record(prods)
        pRec.set('codigo', p.codigo)
        pRec.set('nome', p.nome)
        pRec.set('categoria', 'Seguro Viagem')
        pRec.set('tipo_cobranca', 'dia')
        pRec.set('cobertura_medica', p.cobertura_medica)
        pRec.set('ativo', true)
        pRec.set('ordem_exibicao', idx + 1)
        app.save(pRec)

        Object.entries(p.precos).forEach(([fp, preco]) => {
          const pr = new Record(colPrecos)
          pr.set('produto_id', pRec.id)
          pr.set('forma_pagamento_codigo', fp)
          pr.set('preco_base_net', preco)
          app.save(pr)
        })

        const destinos = [
          { c: 'WORLD', n: 'Mundo', a: 0.0 },
          { c: 'NORTH_AMERICA', n: 'América do Norte', a: 0.15 },
          { c: 'DOMESTIC', n: 'Nacional', a: 0.0 },
        ]
        destinos.forEach((d) => {
          const dr = new Record(colDest)
          dr.set('produto_id', pRec.id)
          dr.set('destino_codigo', d.c)
          dr.set('destino_nome', d.n)
          dr.set('agravo_percentual', d.a)
          app.save(dr)
        })

        const faixas = [
          { n: 'até 75', f: 1.0 },
          { n: '76-85', f: 2.0 },
        ]
        faixas.forEach((f) => {
          const fr = new Record(colFaixa)
          fr.set('produto_id', pRec.id)
          fr.set('faixa_nome', f.n)
          fr.set('fator_multiplicador', f.f)
          app.save(fr)
        })
      }
    })
  },
  (app) => {},
)
