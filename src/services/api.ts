import pb from '@/lib/pocketbase/client'
import { CalculoInput, CotacaoState } from '@/types/cotacao'
import { differenceInDays } from 'date-fns'

export const fetchProdutos = async () => {
  const fields =
    'id,nome,categoria,codigo,ordem_exibicao,tags,precos_base_por_forma_pagamento,destinos,faixas_etarias,tipo_cobranca'
  const response = await pb.send(`/backend/v1/produtos?sort=ordem_exibicao&fields=${fields}`, {
    method: 'GET',
  })

  if (response && Array.isArray(response)) {
    console.log(
      `[API AUDIT] === RESPONSE VALIDATION === Total products received: ${response.length}`,
    )
    if (response.length > 0) {
      const p = response[0]
      console.log(`[API AUDIT] First Product ID: ${p.id}, Name: ${p.nome}`)
      console.log('[API AUDIT] Product Keys:', Object.keys(p))

      const tipoCobrancaValid = p.tipo_cobranca === 'anual' || p.tipo_cobranca === 'dia'
      console.log(
        `[API AUDIT] tipo_cobranca: value=${p.tipo_cobranca}, type=${typeof p.tipo_cobranca}, isValid=${tipoCobrancaValid}`,
      )

      console.log('[API AUDIT] precos_base_por_forma_pagamento:', p.precos_base_por_forma_pagamento)
      if (p.precos_base_por_forma_pagamento) {
        Object.entries(p.precos_base_por_forma_pagamento).forEach(([k, v]) => {
          console.log(`[API AUDIT] - Payment Key: ${k}, Value: ${v}, Type: ${typeof v}`)
        })
      }

      console.log('[API AUDIT] destinos:', p.destinos)
      if (p.destinos) {
        Object.entries(p.destinos).forEach(([k, v]: [string, any]) => {
          console.log(
            `[API AUDIT] - Destino Key: ${k}, agravo_percentual: ${v?.agravo_percentual}, Type: ${typeof v?.agravo_percentual}`,
          )
        })
      }

      console.log('[API AUDIT] faixas_etarias:', p.faixas_etarias)
      if (p.faixas_etarias) {
        Object.entries(p.faixas_etarias).forEach(([k, v]: [string, any]) => {
          console.log(
            `[API AUDIT] - Faixa Key: ${k}, fator_multiplicador: ${v?.fator_multiplicador}, Type: ${typeof v?.fator_multiplicador}`,
          )
        })
      }

      const hasRequired = !!(
        p.id &&
        p.nome &&
        p.tipo_cobranca &&
        p.precos_base_por_forma_pagamento &&
        p.destinos &&
        p.faixas_etarias
      )
      console.log(`[API AUDIT] Validation Summary - All required fields present: ${hasRequired}`)

      if (!hasRequired) {
        console.error('[API AUDIT] MISSING FIELDS DETECTED', {
          id: !!p.id,
          nome: !!p.nome,
          tipo_cobranca: !!p.tipo_cobranca,
          precos_base_por_forma_pagamento: !!p.precos_base_por_forma_pagamento,
          destinos: !!p.destinos,
          faixas_etarias: !!p.faixas_etarias,
        })
      }
    }
  }

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
      ? Math.max(1, differenceInDays(input.data_fim, input.data_inicio) + 1)
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
