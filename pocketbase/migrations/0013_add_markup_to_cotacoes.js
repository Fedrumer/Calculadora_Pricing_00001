migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('cotacoes')
    if (!col.fields.getByName('markup_percentual')) {
      col.fields.add(new NumberField({ name: 'markup_percentual' }))
    }
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('cotacoes')
    if (col.fields.getByName('markup_percentual')) {
      col.fields.removeByName('markup_percentual')
      app.save(col)
    }
  },
)
