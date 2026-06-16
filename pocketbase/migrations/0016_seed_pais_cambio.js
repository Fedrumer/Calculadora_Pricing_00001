migrate(
  (app) => {
    try {
      const admin = app.findAuthRecordByEmail('users', 'fedrumer@gmail.com')
      admin.set('pais', 'Brasil')
      app.save(admin)
    } catch (_) {}

    const produtos = app.findRecordsByFilter('produtos', '1=1', '', 1000, 0)
    for (const p of produtos) {
      if (!p.getString('pais')) {
        p.set('pais', 'Brasil')
        app.save(p)
      }
    }

    const taxas = app.findCollectionByNameOrId('taxas_cambio')
    const dataStr = new Date().toISOString().replace('T', ' ')

    try {
      app.findFirstRecordByFilter('taxas_cambio', "moeda='BRL'")
    } catch (_) {
      const t1 = new Record(taxas)
      t1.set('data', dataStr)
      t1.set('moeda', 'BRL')
      t1.set('valor', 5.4)
      app.save(t1)
    }

    try {
      app.findFirstRecordByFilter('taxas_cambio', "moeda='ARS'")
    } catch (_) {
      const t2 = new Record(taxas)
      t2.set('data', dataStr)
      t2.set('moeda', 'ARS')
      t2.set('valor', 980.5)
      app.save(t2)
    }
  },
  (app) => {},
)
