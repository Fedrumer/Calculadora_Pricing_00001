migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('cotacoes')
    col.fields.add(
      new TextField({
        name: 'nome_agencia',
        max: 100,
        required: false,
      }),
    )
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('cotacoes')
    col.fields.removeByName('nome_agencia')
    app.save(col)
  },
)
