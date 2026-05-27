migrate(
  (app) => {
    const coberturas = new Collection({
      name: 'coberturas',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.role = 'ADMIN'",
      updateRule: "@request.auth.role = 'ADMIN'",
      deleteRule: "@request.auth.role = 'ADMIN'",
      fields: [
        { name: 'nome', type: 'text', required: true },
        { name: 'descricao', type: 'text' },
        { name: 'ordem_exibicao', type: 'number' },
        { name: 'ativo', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_coberturas_ordem ON coberturas (ordem_exibicao)'],
    })
    app.save(coberturas)

    const produtosCol = app.findCollectionByNameOrId('produtos')

    const produto_coberturas = new Collection({
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
          collectionId: coberturas.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'valor', type: 'text', required: true },
        { name: 'descricao_customizada', type: 'text' },
        { name: 'ordem_exibicao', type: 'number' },
        { name: 'ativo', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_produto_coberturas_unique ON produto_coberturas (produto_id, cobertura_id)',
        'CREATE INDEX idx_produto_coberturas_produto_id ON produto_coberturas (produto_id)',
        'CREATE INDEX idx_produto_coberturas_cobertura_id ON produto_coberturas (cobertura_id)',
      ],
    })
    app.save(produto_coberturas)
  },
  (app) => {
    try {
      const pc = app.findCollectionByNameOrId('produto_coberturas')
      app.delete(pc)
    } catch (_) {}
    try {
      const c = app.findCollectionByNameOrId('coberturas')
      app.delete(c)
    } catch (_) {}
  },
)
