migrate(
  (app) => {
    try {
      const records = app.findRecordsByFilter('users', 'forcar_troca_senha = true', '', 1000, 0)
      for (const r of records) {
        r.set('forcar_troca_senha', false)
        app.saveNoValidate(r)
      }
    } catch (e) {
      // skip if no records found
    }
  },
  (app) => {
    // not reversible
  },
)
