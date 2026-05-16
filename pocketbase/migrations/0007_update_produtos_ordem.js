migrate(
  (app) => {
    const ordens = [
      { nome: 'Now Master 1MM', ordem: 1 },
      { nome: 'Now VIP 500', ordem: 2 },
      { nome: 'Now Infinity 300', ordem: 3 },
      { nome: 'Now Premium 200', ordem: 4 },
      { nome: 'Now Total 100', ordem: 5 },
      { nome: 'Now Classic 60', ordem: 6 },
      { nome: 'Now Standard 40', ordem: 7 },
      { nome: 'Now Total 100 Deportes', ordem: 8 },
      { nome: 'Now Classic 60 Deportes', ordem: 9 },
      { nome: 'Now Standard 40 Deportes', ordem: 10 },
      { nome: 'Now Multi 1MM', ordem: 11 },
      { nome: 'Now Multi 300', ordem: 12 },
      { nome: 'Now Multi 150', ordem: 13 },
      { nome: 'Now Multi 60', ordem: 14 },
      { nome: 'Now Multi Plus 300', ordem: 15 },
      { nome: 'Now Multi Plus 150', ordem: 16 },
      { nome: 'Now Multi Plus 60', ordem: 17 },
      { nome: 'Now Multi Max 300', ordem: 18 },
      { nome: 'Now Multi Max 150', ordem: 19 },
      { nome: 'Now Multi Max 60', ordem: 20 },
      { nome: 'Now Nacional', ordem: 21 },
      { nome: 'Now Nacional VIP', ordem: 22 },
      { nome: 'Now Nacional Vip/Deportes', ordem: 23 },
      { nome: 'Now Classic Receptivo 60', ordem: 24 },
      { nome: 'Now Standard Receptivo 40', ordem: 25 },
      { nome: 'Now Crucero 200', ordem: 26 },
      { nome: 'Now Crucero 100', ordem: 27 },
      { nome: 'Now Crucero 60', ordem: 28 },
      { nome: 'Now VIP 500 Deportes', ordem: 29 },
      { nome: 'Now Infinity 300 Deportes', ordem: 30 },
      { nome: 'Now Premium 200 Deportes', ordem: 31 },
      { nome: 'Now VIP Bus 500', ordem: 32 },
      { nome: 'Now Infinity Bus 300', ordem: 33 },
      { nome: 'Now Premium Bus 200', ordem: 34 },
      { nome: 'Now Total Bus 100', ordem: 35 },
      { nome: 'Now Classic Bus 60', ordem: 36 },
      { nome: 'Now Standard Bus 40', ordem: 37 },
      { nome: 'Now VIP Bus 500 Deportes', ordem: 38 },
      { nome: 'Now Infinity Bus 300 Deportes', ordem: 39 },
      { nome: 'Now Premium Bus 200 Deportes', ordem: 40 },
      { nome: 'Now Total Bus 100 Deportes', ordem: 41 },
      { nome: 'Now Classic Bus 60 Deportes', ordem: 42 },
      { nome: 'Now Standard Bus 40 Deportes', ordem: 43 },
      { nome: 'Now Nacional Limitrofe', ordem: 44 },
      { nome: 'Now Express 40', ordem: 45 },
      { nome: 'Now Express 10', ordem: 46 },
      { nome: 'Now Crucero 500', ordem: 47 },
      { nome: 'Now Crucero 300', ordem: 48 },
      { nome: 'Now Crucero 40', ordem: 49 },
    ]

    for (const item of ordens) {
      try {
        const record = app.findFirstRecordByData('produtos', 'nome', item.nome)
        if (record) {
          record.set('ordem_exibicao', item.ordem)
          app.saveNoValidate(record)
        }
      } catch (_) {
        // Ignore products that might not exist yet
      }
    }
  },
  (app) => {
    // down migration no-op
  },
)
