migrate(
  (app) => {
    const col1 = app.findCollectionByNameOrId('cotacao_produtos')
    if (!col1.fields.getByName('moeda')) {
      col1.fields.add(new TextField({ name: 'moeda' }))
      app.save(col1)
    }

    const col2 = app.findCollectionByNameOrId('cotacao_produto_detalhes')
    if (!col2.fields.getByName('moeda')) {
      col2.fields.add(new TextField({ name: 'moeda' }))
      app.save(col2)
    }
  },
  (app) => {
    const col1 = app.findCollectionByNameOrId('cotacao_produtos')
    if (col1.fields.getByName('moeda')) {
      col1.fields.removeByName('moeda')
      app.save(col1)
    }

    const col2 = app.findCollectionByNameOrId('cotacao_produto_detalhes')
    if (col2.fields.getByName('moeda')) {
      col2.fields.removeByName('moeda')
      app.save(col2)
    }
  },
)
