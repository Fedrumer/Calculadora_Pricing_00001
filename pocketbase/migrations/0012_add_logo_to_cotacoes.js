migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('cotacoes')
    if (!col.fields.getByName('logo')) {
      col.fields.add(
        new FileField({
          name: 'logo',
          maxSelect: 1,
          maxSize: 2097152,
          mimeTypes: ['image/jpeg', 'image/png'],
        }),
      )
    }
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('cotacoes')
    if (col.fields.getByName('logo')) {
      col.fields.removeByName('logo')
    }
    app.save(col)
  },
)
