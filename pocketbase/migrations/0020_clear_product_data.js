migrate(
  (app) => {
    const collectionsToClear = [
      'cotacao_produto_detalhes',
      'cotacao_produtos',
      'produto_coberturas',
      'produto_precos_forma_pagamento',
      'produto_destinos',
      'produto_faixas_etarias',
      'coberturas',
      'produtos',
    ]

    for (const name of collectionsToClear) {
      try {
        const col = app.findCollectionByNameOrId(name)
        app.truncateCollection(col)
      } catch (err) {
        console.log('Could not truncate collection: ' + name, err.message)
      }
    }
  },
  (app) => {
    // This migration removes data and cannot be automatically reverted.
  },
)
