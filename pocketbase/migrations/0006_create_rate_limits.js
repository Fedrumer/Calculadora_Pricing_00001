migrate(
  (app) => {
    const collection = new Collection({
      name: 'rate_limits',
      type: 'base',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'ip', type: 'text', required: true },
        { name: 'endpoint', type: 'text', required: true },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_rate_limits_ip_end ON rate_limits (ip, endpoint)'],
    })
    app.save(collection)
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('rate_limits')
    app.delete(collection)
  },
)
