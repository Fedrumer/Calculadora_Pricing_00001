migrate(
  (app) => {
    const collection = new Collection({
      name: 'taxas_cambio',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.role = 'ADMIN'",
      updateRule: "@request.auth.role = 'ADMIN'",
      deleteRule: "@request.auth.role = 'ADMIN'",
      fields: [
        { name: 'data', type: 'date', required: true },
        { name: 'moeda', type: 'text', required: true },
        { name: 'valor', type: 'number', required: true },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_taxas_cambio_data_moeda ON taxas_cambio (data DESC, moeda)'],
    })
    app.save(collection)
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('taxas_cambio')
    app.delete(collection)
  },
)
