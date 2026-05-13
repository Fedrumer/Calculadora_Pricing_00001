migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.fields.add(new SelectField({ name: 'role', values: ['ADMIN', 'COMERCIAL'] }))
    users.fields.add(new BoolField({ name: 'ativo' }))

    users.listRule = "id = @request.auth.id || @request.auth.role = 'ADMIN'"
    users.viewRule = "id = @request.auth.id || @request.auth.role = 'ADMIN'"
    users.updateRule = "id = @request.auth.id || @request.auth.role = 'ADMIN'"
    users.deleteRule = "id = @request.auth.id || @request.auth.role = 'ADMIN'"

    app.save(users)
  },
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.fields.removeByName('role')
    users.fields.removeByName('ativo')
    app.save(users)
  },
)
