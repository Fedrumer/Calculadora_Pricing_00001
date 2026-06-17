onRecordCreate((e) => {
  try {
    const currentTaxa = e.record.get('taxa_cambio')
    if (!currentTaxa) {
      const userId = e.record.get('usuario_id')
      let pais = 'Brasil'
      if (userId) {
        try {
          const user = $app.findRecordById('users', userId)
          pais = user.getString('pais') || 'Brasil'
        } catch (_) {}
      }
      const moeda = pais === 'Argentina' ? 'ARS' : 'BRL'

      const taxas = $app.findRecordsByFilter('taxas_cambio', `moeda = '${moeda}'`, '-data', 1, 0)
      if (taxas && taxas.length > 0) {
        e.record.set('taxa_cambio', taxas[0].get('valor'))
      }
    }
  } catch (err) {
    $app.logger().error('Error setting taxa_cambio', 'err', err?.message)
  }
  e.next()
}, 'cotacoes')
