migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('produtos')
    if (!col.fields.getByName('tags')) {
      col.fields.add(new JSONField({ name: 'tags', maxSize: 2000000 }))
      app.save(col)
    }

    try {
      const records = app.findRecordsByFilter('produtos', '1=1', '', 1000, 0)
      for (const record of records) {
        const nome = record.getString('nome').toLowerCase()
        let tags = ['Mundo']

        if (nome.includes('brasil') || nome.includes('nacional') || nome.includes('domestic')) {
          tags = ['Nacional']
        } else if (nome.includes('eua') || nome.includes('usa') || nome.includes('vip')) {
          tags = ['Mundo + EUA']
        } else if (nome.includes('europa') || nome.includes('europe')) {
          tags = ['Europa']
        }

        record.set('tags', tags)

        if (!record.getString('categoria')) {
          if (nome.includes('vip') || nome.includes('premium')) {
            record.set('categoria', 'Premium')
          } else if (nome.includes('total') || nome.includes('basic')) {
            record.set('categoria', 'Básico')
          } else {
            record.set('categoria', 'Intermediário')
          }
        }

        app.saveNoValidate(record)
      }
    } catch (e) {
      // collection might be empty or error fetching
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('produtos')
    col.fields.removeByName('tags')
    app.save(col)
  },
)
