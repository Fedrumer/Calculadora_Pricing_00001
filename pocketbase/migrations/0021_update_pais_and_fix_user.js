migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    const fUsers = users.fields.getByName('pais')
    if (fUsers) {
      fUsers.values = ['Brasil', 'Argentina', 'Todos']
    }
    app.save(users)

    const fp = app.findCollectionByNameOrId('formas_pagamento')
    const fFp = fp.fields.getByName('pais')
    if (fFp) {
      fFp.values = ['Brasil', 'Argentina', 'Todos']
    }
    app.save(fp)

    try {
      const records = app.findRecordsByFilter('users', 'forcar_troca_senha = true', '', 1000, 0)
      for (const r of records) {
        r.set('forcar_troca_senha', false)
        app.saveNoValidate(r)
      }
    } catch (e) {
      // Ignore errors if no records match
    }
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    const fUsers = users.fields.getByName('pais')
    if (fUsers) {
      fUsers.values = ['Brasil', 'Argentina']
    }
    app.save(users)

    const fp = app.findCollectionByNameOrId('formas_pagamento')
    const fFp = fp.fields.getByName('pais')
    if (fFp) {
      fFp.values = ['Brasil', 'Argentina']
    }
    app.save(fp)
  },
)
