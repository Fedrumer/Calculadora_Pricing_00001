migrate(
  (app) => {
    const cotacoes = app.findCollectionByNameOrId('cotacoes')
    cotacoes.fields.add(new NumberField({ name: 'taxa_cambio' }))
    app.save(cotacoes)
  },
  (app) => {
    const cotacoes = app.findCollectionByNameOrId('cotacoes')
    cotacoes.fields.removeByName('taxa_cambio')
    app.save(cotacoes)
  },
)
