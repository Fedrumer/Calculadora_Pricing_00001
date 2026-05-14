migrate((app) => {
  const users = app.findCollectionByNameOrId('users')

  try {
    app.findAuthRecordByEmail('users', 'admin@now.com')
  } catch (_) {
    const admin = new Record(users)
    admin.setEmail('admin@now.com')
    admin.setPassword('admin123')
    admin.setVerified(true)
    admin.set('role', 'ADMIN')
    admin.set('ativo', true)
    admin.set('name', 'Administrador')
    app.save(admin)
  }

  try {
    app.findAuthRecordByEmail('users', 'comercial1@now.com')
  } catch (_) {
    const comercial = new Record(users)
    comercial.setEmail('comercial1@now.com')
    comercial.setPassword('comercial123')
    comercial.setVerified(true)
    comercial.set('role', 'COMERCIAL')
    comercial.set('ativo', true)
    comercial.set('name', 'Comercial')
    app.save(comercial)
  }
})
