import pb from '@/lib/pocketbase/client'
import {
  Produto,
  FormaPagamentoId,
  DestinoId,
  FaixaEtariaId,
  CalculoInput,
  CotacaoState,
} from '@/types/cotacao'

export async function fetchFormasPagamento() {
  const records = await pb
    .collection('formas_pagamento')
    .getFullList({ filter: 'ativo=true', sort: 'created' })
  return records.map((r) => ({ id: r.id, codigo: r.codigo, nome: r.nome }))
}

export async function fetchProdutos(): Promise<Produto[]> {
  const produtosRec = await pb
    .collection('produtos')
    .getFullList({ filter: 'ativo=true', sort: 'ordem_exibicao' })
  const precosRec = await pb.collection('produto_precos_forma_pagamento').getFullList()
  const destinosRec = await pb.collection('produto_destinos').getFullList()
  const faixasRec = await pb.collection('produto_faixas_etarias').getFullList()

  return produtosRec.map((p) => {
    const precos = precosRec.filter((pr) => pr.produto_id === p.id)
    const destinos = destinosRec.filter((d) => d.produto_id === p.id)
    const faixas = faixasRec.filter((f) => f.produto_id === p.id)

    const precos_base: Record<string, number> = {}
    precos.forEach((pr) => {
      precos_base[pr.forma_pagamento_codigo] = pr.preco_base_net
    })

    const destinosObj: Record<string, { agravo_percentual: number }> = {}
    destinos.forEach((d) => {
      destinosObj[d.destino_codigo] = { agravo_percentual: d.agravo_percentual }
    })

    const faixasObj: Record<string, { fator_multiplicador: number }> = {}
    faixas.forEach((f) => {
      const fType = f.faixa_nome === 'até 75' ? 'ate_75' : 'de_76_a_85'
      faixasObj[fType] = { fator_multiplicador: f.fator_multiplicador }
    })

    return {
      id: p.id,
      nome: p.nome,
      precos_base_por_forma_pagamento: precos_base as Record<FormaPagamentoId, number>,
      destinos: destinosObj as Record<DestinoId, { agravo_percentual: number }>,
      faixas_etarias: faixasObj as Record<FaixaEtariaId, { fator_multiplicador: number }>,
    }
  })
}

export async function salvarCotacao(
  input: Partial<CalculoInput>,
  resultado: CotacaoState,
  produtosSelecionadosIds: string[],
  status: 'RASCUNHO' | 'PROPOSTA_ENVIADA' = 'RASCUNHO',
) {
  if (!pb.authStore.record?.id) throw new Error('Usuário não autenticado')

  const fpList = await pb
    .collection('formas_pagamento')
    .getFullList({ filter: `codigo="${input.forma_pagamento}"` })
  const fpId = fpList[0]?.id

  if (!fpId) throw new Error('Forma de pagamento inválida')

  const data_inicio = input.data_inicio ? input.data_inicio.toISOString().split('T')[0] : ''
  const data_fim = input.data_fim ? input.data_fim.toISOString().split('T')[0] : ''
  const qtd_dias =
    input.data_inicio && input.data_fim
      ? Math.max(
          1,
          Math.floor(
            (input.data_fim.getTime() - input.data_inicio.getTime()) / (1000 * 3600 * 24),
          ) + 1,
        )
      : 0

  const cotacao = await pb.collection('cotacoes').create({
    usuario_id: pb.authStore.record.id,
    status: status,
    forma_pagamento_id: fpId,
    comissao: input.comissao || 0,
    data_inicio,
    data_fim,
    qtd_dias,
    fatura_total: resultado.fatura_total,
    preco_unitario_total: resultado.preco_unitario_total,
    tipo_preco: resultado.tipo_preco,
    moeda: resultado.moeda,
  })

  for (const p of resultado.produtos_calculados) {
    if (produtosSelecionadosIds.length > 0 && !produtosSelecionadosIds.includes(p.id)) {
      continue
    }
    const cp = await pb.collection('cotacao_produtos').create({
      cotacao_id: cotacao.id,
      produto_id: p.id,
      qtd_ate_75: p.breakdown.ate_75.quantidade,
      qtd_76_a_85: p.breakdown.de_76_a_85.quantidade,
      preco_total_produto: p.preco_total_produto,
    })

    if (p.breakdown.ate_75.quantidade > 0) {
      await pb.collection('cotacao_produto_detalhes').create({
        cotacao_produto_id: cp.id,
        destino_codigo: input.destino,
        faixa_etaria: 'até 75',
        preco_unitario_dia: p.breakdown.ate_75.preco_unitario / qtd_dias,
        preco_total_faixa: p.breakdown.ate_75.preco_total,
      })
    }

    if (p.breakdown.de_76_a_85.quantidade > 0) {
      await pb.collection('cotacao_produto_detalhes').create({
        cotacao_produto_id: cp.id,
        destino_codigo: input.destino,
        faixa_etaria: '76-85',
        preco_unitario_dia: p.breakdown.de_76_a_85.preco_unitario / qtd_dias,
        preco_total_faixa: p.breakdown.de_76_a_85.preco_total,
      })
    }
  }

  return cotacao
}
