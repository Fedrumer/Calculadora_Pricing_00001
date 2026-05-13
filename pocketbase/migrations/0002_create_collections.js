migrate(
  (app) => {
    const produtos = new Collection({
      name: 'produtos',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.role = 'ADMIN'",
      updateRule: "@request.auth.role = 'ADMIN'",
      deleteRule: "@request.auth.role = 'ADMIN'",
      fields: [
        { name: 'codigo', type: 'text', required: true },
        { name: 'nome', type: 'text', required: true },
        { name: 'categoria', type: 'text' },
        { name: 'tipo_cobranca', type: 'select', values: ['dia', 'anual'] },
        { name: 'cobertura_medica', type: 'number' },
        { name: 'ativo', type: 'bool' },
        { name: 'ordem_exibicao', type: 'number' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_produtos_codigo ON produtos (codigo)'],
    })
    app.save(produtos)
    const pId = app.findCollectionByNameOrId('produtos').id

    const produto_precos = new Collection({
      name: 'produto_precos_forma_pagamento',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.role = 'ADMIN'",
      updateRule: "@request.auth.role = 'ADMIN'",
      deleteRule: "@request.auth.role = 'ADMIN'",
      fields: [
        {
          name: 'produto_id',
          type: 'relation',
          collectionId: pId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'forma_pagamento_codigo', type: 'text' },
        { name: 'preco_base_net', type: 'number' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_produto_precos_prod ON produto_precos_forma_pagamento (produto_id)',
      ],
    })
    app.save(produto_precos)

    const produto_destinos = new Collection({
      name: 'produto_destinos',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.role = 'ADMIN'",
      updateRule: "@request.auth.role = 'ADMIN'",
      deleteRule: "@request.auth.role = 'ADMIN'",
      fields: [
        {
          name: 'produto_id',
          type: 'relation',
          collectionId: pId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'destino_codigo', type: 'text' },
        { name: 'destino_nome', type: 'text' },
        { name: 'agravo_percentual', type: 'number' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_produto_destinos_prod ON produto_destinos (produto_id)'],
    })
    app.save(produto_destinos)

    const produto_faixas_etarias = new Collection({
      name: 'produto_faixas_etarias',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.role = 'ADMIN'",
      updateRule: "@request.auth.role = 'ADMIN'",
      deleteRule: "@request.auth.role = 'ADMIN'",
      fields: [
        {
          name: 'produto_id',
          type: 'relation',
          collectionId: pId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'faixa_nome', type: 'text' },
        { name: 'fator_multiplicador', type: 'number' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_produto_faixas_prod ON produto_faixas_etarias (produto_id)'],
    })
    app.save(produto_faixas_etarias)

    const formas_pagamento = new Collection({
      name: 'formas_pagamento',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.role = 'ADMIN'",
      updateRule: "@request.auth.role = 'ADMIN'",
      deleteRule: "@request.auth.role = 'ADMIN'",
      fields: [
        { name: 'codigo', type: 'text', required: true },
        { name: 'nome', type: 'text' },
        { name: 'ativo', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_formas_pagamento_codigo ON formas_pagamento (codigo)'],
    })
    app.save(formas_pagamento)
    const fpId = app.findCollectionByNameOrId('formas_pagamento').id

    const cotacoes = new Collection({
      name: 'cotacoes',
      type: 'base',
      listRule: "usuario_id = @request.auth.id || @request.auth.role = 'ADMIN'",
      viewRule: "usuario_id = @request.auth.id || @request.auth.role = 'ADMIN'",
      createRule: "@request.auth.id != ''",
      updateRule: "usuario_id = @request.auth.id || @request.auth.role = 'ADMIN'",
      deleteRule: "usuario_id = @request.auth.id || @request.auth.role = 'ADMIN'",
      fields: [
        {
          name: 'usuario_id',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'status', type: 'select', values: ['RASCUNHO', 'PROPOSTA_ENVIADA', 'APROVADA'] },
        { name: 'forma_pagamento_id', type: 'relation', collectionId: fpId, maxSelect: 1 },
        { name: 'comissao', type: 'number' },
        { name: 'data_inicio', type: 'date' },
        { name: 'data_fim', type: 'date' },
        { name: 'qtd_dias', type: 'number' },
        { name: 'fatura_total', type: 'number' },
        { name: 'preco_unitario_total', type: 'number' },
        { name: 'tipo_preco', type: 'select', values: ['NET', 'BRUTO'] },
        { name: 'moeda', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_cotacoes_user ON cotacoes (usuario_id)'],
    })
    app.save(cotacoes)
    const cotacoesId = app.findCollectionByNameOrId('cotacoes').id

    const cotacao_produtos = new Collection({
      name: 'cotacao_produtos',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'cotacao_id',
          type: 'relation',
          collectionId: cotacoesId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'produto_id', type: 'relation', collectionId: pId, maxSelect: 1 },
        { name: 'qtd_ate_75', type: 'number' },
        { name: 'qtd_76_a_85', type: 'number' },
        { name: 'preco_total_produto', type: 'number' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(cotacao_produtos)
    const cpId = app.findCollectionByNameOrId('cotacao_produtos').id

    const cotacao_produto_detalhes = new Collection({
      name: 'cotacao_produto_detalhes',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'cotacao_produto_id',
          type: 'relation',
          collectionId: cpId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'destino_codigo', type: 'text' },
        { name: 'faixa_etaria', type: 'text' },
        { name: 'preco_unitario_dia', type: 'number' },
        { name: 'preco_total_faixa', type: 'number' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(cotacao_produto_detalhes)
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('cotacao_produto_detalhes'))
    app.delete(app.findCollectionByNameOrId('cotacao_produtos'))
    app.delete(app.findCollectionByNameOrId('cotacoes'))
    app.delete(app.findCollectionByNameOrId('formas_pagamento'))
    app.delete(app.findCollectionByNameOrId('produto_faixas_etarias'))
    app.delete(app.findCollectionByNameOrId('produto_destinos'))
    app.delete(app.findCollectionByNameOrId('produto_precos_forma_pagamento'))
    app.delete(app.findCollectionByNameOrId('produtos'))
  },
)
