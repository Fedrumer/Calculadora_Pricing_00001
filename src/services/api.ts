import pb from '@/lib/pocketbase/client'
import { CalculoInput, CotacaoState } from '@/types/cotacao'
import { differenceInDays, startOfDay } from 'date-fns'

export const fetchProdutos = async () => {
  const fields =
    'id,nome,categoria,codigo,ordem_exibicao,tags,precos_base_por_forma_pagamento,destinos,faixas_etarias,tipo_cobranca'
  const response = await pb.send(`/backend/v1/produtos?sort=ordem_exibicao&fields=${fields}`, {
    method: 'GET',
  })

  return response
}

export const fetchFormasPagamento = async () => {
  return pb.send('/backend/v1/formas-pagamento', { method: 'GET' })
}

export const salvarCotacao = async (
  input: Partial<CalculoInput>,
  resultado: CotacaoState,
  selecionados: string[],
  acao: 'RASCUNHO' | 'PROPOSTA_ENVIADA',
) => {
  const usuario_id = pb.authStore.record?.id
  if (!usuario_id) throw new Error('Usuário não autenticado')

  const formas = await fetchFormasPagamento()
  const forma_pagamento_id = formas.find((f: any) => f.codigo === input.forma_pagamento)?.id
  if (!forma_pagamento_id) throw new Error('Forma de pagamento inválida')

  const produtosSelecionados = resultado.produtos_calculados.filter((p) =>
    selecionados.includes(p.id),
  )

  const fatura_total = produtosSelecionados.reduce((acc, p) => acc + p.preco_total_produto, 0)

  const qtd_75 = input.viajantes_por_faixa?.ate_75 || 0
  const qtd_85 = input.viajantes_por_faixa?.de_76_a_85 || 0
  const total_viajantes = qtd_75 + qtd_85
  const preco_unitario_total = total_viajantes > 0 ? fatura_total / total_viajantes : 0

  const qtd_dias =
    input.data_inicio && input.data_fim
      ? Math.max(1, differenceInDays(startOfDay(input.data_fim), startOfDay(input.data_inicio)) + 1)
      : 1

  const payload = {
    usuario_id,
    status: acao,
    forma_pagamento_id,
    comissao: input.comissao || 0,
    data_inicio: input.data_inicio?.toISOString(),
    data_fim: input.data_fim?.toISOString(),
    qtd_dias,
    fatura_total,
    preco_unitario_total,
    tipo_preco: resultado.tipo_preco,
    moeda: resultado.moeda,
    produtos: produtosSelecionados.map((p) => ({
      produto_id: p.id,
      qtd_ate_75: p.breakdown.ate_75.quantidade,
      qtd_76_a_85: p.breakdown.de_76_a_85.quantidade,
      preco_total_produto: p.preco_total_produto,
      detalhes: [
        {
          destino_codigo: input.destino,
          faixa_etaria: 'ate_75',
          preco_unitario_dia:
            qtd_dias > 0
              ? p.breakdown.ate_75.preco_unitario /
                (qtd_dias * (p.breakdown.ate_75.quantidade || 1))
              : 0,
          preco_total_faixa: p.breakdown.ate_75.preco_total,
        },
        {
          destino_codigo: input.destino,
          faixa_etaria: 'de_76_a_85',
          preco_unitario_dia:
            qtd_dias > 0
              ? p.breakdown.de_76_a_85.preco_unitario /
                (qtd_dias * (p.breakdown.de_76_a_85.quantidade || 1))
              : 0,
          preco_total_faixa: p.breakdown.de_76_a_85.preco_total,
        },
      ].filter((d) => d.preco_total_faixa > 0),
    })),
  }

  return pb.send('/backend/v1/cotacoes', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
  })
}

export const getCotacoes = async () => {
  return pb.send('/backend/v1/cotacoes', { method: 'GET' })
}

export const getCotacao = async (id: string) => {
  return pb.send(`/backend/v1/cotacoes/${id}`, { method: 'GET' })
}
