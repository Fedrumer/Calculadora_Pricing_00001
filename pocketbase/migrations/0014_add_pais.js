migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    if (!users.fields.getByName('pais')) {
      users.fields.add(
        new SelectField({ name: 'pais', values: ['Brasil', 'Argentina'], maxSelect: 1 }),
      )
      app.save(users)
    }

    const produtos = app.findCollectionByNameOrId('produtos')
    if (!produtos.fields.getByName('pais')) {
      produtos.fields.add(
        new SelectField({ name: 'pais', values: ['Brasil', 'Argentina'], maxSelect: 1 }),
      )
      app.save(produtos)
    }
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    users.fields.removeByName('pais')
    app.save(users)

    const produtos = app.findCollectionByNameOrId('produtos')
    produtos.fields.removeByName('pais')
    app.save(produtos)
  },
)
