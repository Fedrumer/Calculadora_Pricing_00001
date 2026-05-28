migrate(
  (app) => {
    const produtosCol = app.findCollectionByNameOrId('produtos')
    const coberturasCol = app.findCollectionByNameOrId('coberturas')

    const collection = new Collection({
      name: 'produto_coberturas',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.role = 'ADMIN'",
      updateRule: "@request.auth.role = 'ADMIN'",
      deleteRule: "@request.auth.role = 'ADMIN'",
      fields: [
        {
          name: 'produto_id',
          type: 'relation',
          required: true,
          collectionId: produtosCol.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'cobertura_id',
          type: 'relation',
          required: true,
          collectionId: coberturasCol.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'valor',
          type: 'text',
        },
        {
          name: 'descricao_customizada',
          type: 'text',
        },
        {
          name: 'ordem_exibicao',
          type: 'number',
        },
        {
          name: 'ativo',
          type: 'bool',
        },
        {
          name: 'created',
          type: 'autodate',
          onCreate: true,
          onUpdate: false,
        },
        {
          name: 'updated',
          type: 'autodate',
          onCreate: true,
          onUpdate: true,
        },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_produto_coberturas_unique ON produto_coberturas (produto_id, cobertura_id)',
        'CREATE INDEX idx_produto_coberturas_produto ON produto_coberturas (produto_id)',
        'CREATE INDEX idx_produto_coberturas_cobertura ON produto_coberturas (cobertura_id)',
      ],
    })

    app.save(collection)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('produto_coberturas')
      app.delete(collection)
    } catch (_) {}
  },
)
