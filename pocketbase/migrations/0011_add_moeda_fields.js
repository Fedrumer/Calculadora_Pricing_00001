migrate(
  (app) => {
    const produtoCoberturas = app.findCollectionByNameOrId('produto_coberturas')
    produtoCoberturas.fields.add(new TextField({ name: 'moeda' }))

    const valorField = produtoCoberturas.fields.getByName('valor')
    if (valorField) {
      valorField.required = true
    }
    app.save(produtoCoberturas)

    app
      .db()
      .newQuery(
        "UPDATE produto_coberturas SET valor = 'Incluído' WHERE valor = '' OR valor IS NULL",
      )
      .execute()

    const produtoPrecos = app.findCollectionByNameOrId('produto_precos_forma_pagamento')
    produtoPrecos.fields.add(new TextField({ name: 'moeda', required: true }))
    app.save(produtoPrecos)

    app
      .db()
      .newQuery(
        "UPDATE produto_precos_forma_pagamento SET moeda = 'USD' WHERE moeda = '' OR moeda IS NULL",
      )
      .execute()
  },
  (app) => {
    const produtoCoberturas = app.findCollectionByNameOrId('produto_coberturas')
    produtoCoberturas.fields.removeByName('moeda')
    const valorField = produtoCoberturas.fields.getByName('valor')
    if (valorField) {
      valorField.required = false
    }
    app.save(produtoCoberturas)

    const produtoPrecos = app.findCollectionByNameOrId('produto_precos_forma_pagamento')
    produtoPrecos.fields.removeByName('moeda')
    app.save(produtoPrecos)
  },
)
