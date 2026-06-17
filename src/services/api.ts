import pb from '@/lib/pocketbase/client'
import { Produto, FormaPagamentoId, DestinoId, FaixaEtariaId } from '@/types/cotacao'
import { getCurrentCountry } from '@/lib/country'

export async function fetchProdutos(): Promise<Produto[]> {
  const country = getCurrentCountry()
  const records = await pb.collection('produtos').getFullList({
    filter: `ativo = true && pais = '${country}'`,
    expand:
      'produto_precos_forma_pagamento_via_produto_id,produto_destinos_via_produto_id,produto_faixas_etarias_via_produto_id',
    sort: 'ordem_exibicao',
  })

  return records.map((record) => {
    const precos: Record<string, number> = {}
    const moedas: Record<string, string> = {}
    const precosExpand = record.expand?.produto_precos_forma_pagamento_via_produto_id || []
    for (const p of precosExpand) {
      precos[p.forma_pagamento_codigo] = p.preco_base_net || 0
      moedas[p.forma_pagamento_codigo] = p.moeda || 'USD'
    }

    const destinos: Record<string, any> = {}
    const destinosExpand = record.expand?.produto_destinos_via_produto_id || []
    for (const d of destinosExpand) {
      destinos[d.destino_codigo] = { agravo_percentual: d.agravo_percentual || 0 }
    }

    const faixas: Record<string, any> = {}
    const faixasExpand = record.expand?.produto_faixas_etarias_via_produto_id || []
    for (const f of faixasExpand) {
      faixas[f.faixa_nome] = { fator_multiplicador: f.fator_multiplicador || 1 }
    }

    return {
      id: record.id,
      nome: record.nome,
      categoria: record.categoria,
      tags: record.tags || [],
      ordem_exibicao: record.ordem_exibicao,
      tipo_cobranca: record.tipo_cobranca,
      precos_base_por_forma_pagamento: precos as Record<FormaPagamentoId, number>,
      moedas_por_forma_pagamento: moedas,
      destinos: destinos as Record<DestinoId, any>,
      faixas_etarias: faixas as Record<FaixaEtariaId, any>,
    }
  })
}

export async function fetchFormasPagamento() {
  return await pb
    .collection('formas_pagamento')
    .getFullList({ filter: 'ativo = true', sort: 'created' })
}

export async function salvarCotacao(
  input: any,
  resultado: any,
  selecionados: string[],
  status: string,
  nomeAgencia: string,
) {
  const dtInicio = input.data_inicio ? new Date(input.data_inicio) : new Date()
  const dtFim = input.data_fim ? new Date(input.data_fim) : new Date()

  const cotacao = await pb.collection('cotacoes').create({
    usuario_id: pb.authStore.record?.id,
    status,
    forma_pagamento_id: input.forma_pagamento,
    comissao: input.comissao || 0,
    data_inicio: dtInicio.toISOString(),
    data_fim: dtFim.toISOString(),
    qtd_dias: Math.max(1, Math.ceil((dtFim.getTime() - dtInicio.getTime()) / (1000 * 3600 * 24))),
    fatura_total: resultado?.fatura_total || 0,
    preco_unitario_total: resultado?.preco_unitario_total || 0,
    tipo_preco: resultado?.tipo_preco || 'NET',
    moeda: resultado?.moeda || 'USD',
    nome_agencia,
    markup_percentual: input.markup || 0,
  })

  for (const prodId of selecionados) {
    const calc = resultado?.produtos_calculados?.find((p: any) => p.id === prodId)
    const cotacaoProduto = await pb.collection('cotacao_produtos').create({
      cotacao_id: cotacao.id,
      produto_id: prodId,
      qtd_ate_75: input.viajantes_por_faixa?.['ate_75'] || 0,
      qtd_76_a_85: input.viajantes_por_faixa?.['de_76_a_85'] || 0,
      preco_total_produto: calc?.preco_total_produto || 0,
    })

    if (calc?.breakdown) {
      for (const [faixa, desc] of Object.entries(calc.breakdown) as any) {
        if (desc.quantidade > 0) {
          await pb.collection('cotacao_produto_detalhes').create({
            cotacao_produto_id: cotacaoProduto.id,
            faixa_etaria: faixa,
            preco_unitario_dia: desc.preco_unitario,
            preco_total_faixa: desc.preco_total,
          })
        }
      }
    }
  }

  return cotacao
}

export async function getCotacoes() {
  return await pb
    .collection('cotacoes')
    .getFullList({ sort: '-created', expand: 'usuario_id,forma_pagamento_id' })
}

export async function getCotacao(id: string) {
  return await pb
    .collection('cotacoes')
    .getOne(id, {
      expand: 'usuario_id,forma_pagamento_id,cotacao_produtos_via_cotacao_id.produto_id',
    })
}
