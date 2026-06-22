migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('formas_pagamento')

    if (!col.fields.getByName('pais')) {
      col.fields.add(
        new SelectField({ name: 'pais', values: ['Brasil', 'Argentina'], maxSelect: 1 }),
      )
    }
    if (!col.fields.getByName('taxa_juros')) {
      col.fields.add(new NumberField({ name: 'taxa_juros' }))
    }
    if (!col.fields.getByName('max_parcelas')) {
      col.fields.add(new NumberField({ name: 'max_parcelas' }))
    }

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('formas_pagamento')
    col.fields.removeByName('pais')
    col.fields.removeByName('taxa_juros')
    col.fields.removeByName('max_parcelas')
    app.save(col)
  },
)
