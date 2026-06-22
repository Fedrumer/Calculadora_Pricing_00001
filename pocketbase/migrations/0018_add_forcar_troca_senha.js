migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')

    users.createRule = "@request.auth.role = 'ADMIN'"

    if (!users.fields.getByName('forcar_troca_senha')) {
      users.fields.add(new BoolField({ name: 'forcar_troca_senha' }))
    }

    app.save(users)

    app.db().newQuery('UPDATE users SET forcar_troca_senha = 1').execute()
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users')

    users.createRule = ''

    if (users.fields.getByName('forcar_troca_senha')) {
      users.fields.removeByName('forcar_troca_senha')
    }

    app.save(users)
  },
)
