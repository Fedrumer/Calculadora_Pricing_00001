routerAdd(
  'POST',
  '/backend/v1/users/{id}/reset-password',
  (e) => {
    const admin = e.auth
    if (!admin || admin.getString('role') !== 'ADMIN') {
      return e.forbiddenError('Acesso negado. Apenas administradores podem resetar senhas.')
    }

    const body = e.requestInfo().body || {}
    const newPassword = body.password

    if (!newPassword || newPassword.length < 8) {
      return e.badRequestError('A nova senha deve ter pelo menos 8 caracteres.')
    }

    const userId = e.request.pathValue('id')
    let record

    try {
      record = $app.findRecordById('users', userId)
    } catch (err) {
      return e.notFoundError('Usuário não encontrado.')
    }

    record.setPassword(newPassword)
    record.set('forcar_troca_senha', true)

    $app.save(record)

    return e.json(200, { success: true })
  },
  $apis.requireAuth(),
)
