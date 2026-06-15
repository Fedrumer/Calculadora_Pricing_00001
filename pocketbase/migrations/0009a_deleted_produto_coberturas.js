/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2830269296");

  return app.delete(collection);
}, (app) => {
  const collection = new Collection({
    "createRule": "@request.auth.role = 'ADMIN'",
    "deleteRule": "@request.auth.role = 'ADMIN'",
    "fields": [
      {
        "autogeneratePattern": "[a-z0-9]{15}",
        "help": "",
        "hidden": false,
        "id": "text3208210256",
        "max": 15,
        "min": 15,
        "name": "id",
        "pattern": "^[a-z0-9]+$",
        "presentable": false,
        "primaryKey": true,
        "required": true,
        "system": true,
        "type": "text"
      },
      {
        "cascadeDelete": true,
        "collectionId": "pbc_1135311916",
        "help": "",
        "hidden": false,
        "id": "relation274529622",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "produto_id",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "relation"
      },
      {
        "cascadeDelete": true,
        "collectionId": "pbc_464916817",
        "help": "",
        "hidden": false,
        "id": "relation283560835",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "cobertura_id",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "relation"
      },
      {
        "autogeneratePattern": "",
        "help": "",
        "hidden": false,
        "id": "text780740392",
        "max": 0,
        "min": 0,
        "name": "valor",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "help": "",
        "hidden": false,
        "id": "text2158434337",
        "max": 0,
        "min": 0,
        "name": "descricao_customizada",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "help": "",
        "hidden": false,
        "id": "number1957578318",
        "max": null,
        "min": null,
        "name": "ordem_exibicao",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "help": "",
        "hidden": false,
        "id": "bool1698942013",
        "name": "ativo",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "bool"
      },
      {
        "hidden": false,
        "id": "autodate2990389176",
        "name": "created",
        "onCreate": true,
        "onUpdate": false,
        "presentable": false,
        "system": false,
        "type": "autodate"
      },
      {
        "hidden": false,
        "id": "autodate3332085495",
        "name": "updated",
        "onCreate": true,
        "onUpdate": true,
        "presentable": false,
        "system": false,
        "type": "autodate"
      }
    ],
    "id": "pbc_2830269296",
    "indexes": [
      "CREATE UNIQUE INDEX idx_produto_coberturas_unique ON produto_coberturas (produto_id, cobertura_id)",
      "CREATE INDEX idx_produto_coberturas_produto_id ON produto_coberturas (produto_id)",
      "CREATE INDEX idx_produto_coberturas_cobertura_id ON produto_coberturas (cobertura_id)"
    ],
    "listRule": "@request.auth.id != ''",
    "name": "produto_coberturas",
    "system": false,
    "type": "base",
    "updateRule": "@request.auth.role = 'ADMIN'",
    "viewRule": "@request.auth.id != ''"
  });

  return app.save(collection);
})
