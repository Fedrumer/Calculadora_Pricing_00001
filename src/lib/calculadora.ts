import { differenceInDays } from 'date-fns'
import { CalculoInput, CotacaoState, FaixaEtariaId } from '@/types/cotacao'

export function calcularCotacao(input: Partial<CalculoInput>): CotacaoState {
  const erros: string[] = []

  if (!input.data_inicio || !input.data_fim) erros.push('Informe o período da viagem')
  else if (input.data_fim < input.data_inicio) erros.push('Data final menor que data inicial')

  if (!input.forma_pagamento) erros.push('Selecione a forma de pagamento')
  if (!input.destino) erros.push('Selecione o destino')
  if (input.comissao !== undefined && input.comissao >= 0.99) {
    erros.push('Comissão máxima permitida é de 99%')
  }

  const qtd75 = input.viajantes_por_faixa?.ate_75 || 0
  const qtd85 = input.viajantes_por_faixa?.de_76_a_85 || 0
  if (qtd75 + qtd85 === 0) erros.push('Adicione pelo menos um viajante')

  if (erros.length > 0 || !input.produtos || !input.forma_pagamento || !input.destino) {
    return {
      produtos_calculados: [],
      fatura_total: 0,
      preco_unitario_total: 0,
      tipo_preco: 'NET',
      moeda: 'USD',
      erros,
      carregando: false,
    }
  }

  // Calculate days (minimum 1)
  const diasRaw = differenceInDays(input.data_fim!, input.data_inicio!) + 1
  const dias = Math.max(1, diasRaw)

  const comissao = input.comissao || 0
  const isGross = comissao > 0

  const produtos_calculados = input.produtos.map((produto) => {
    const preco_net_base = produto.precos_base_por_forma_pagamento[input.forma_pagamento!]
    const preco_bruto = preco_net_base / (1 - comissao)
    const agravo = produto.destinos[input.destino!].agravo_percentual

    const calcFaixa = (faixa: FaixaEtariaId, qtd: number) => {
      const fator = produto.faixas_etarias[faixa].fator_multiplicador
      const preco_unitario = preco_bruto * (1 + agravo) * fator * dias
      return {
        preco_unitario,
        preco_total: preco_unitario * qtd,
        quantidade: qtd,
      }
    }

    const breakdown = {
      ate_75: calcFaixa('ate_75', qtd75),
      de_76_a_85: calcFaixa('de_76_a_85', qtd85),
    }

    return {
      id: produto.id,
      nome: produto.nome,
      breakdown,
      preco_total_produto: breakdown.ate_75.preco_total + breakdown.de_76_a_85.preco_total,
    }
  })

  const fatura_total = produtos_calculados.reduce((acc, p) => acc + p.preco_total_produto, 0)
  const total_viajantes = qtd75 + qtd85
  const preco_unitario_total = total_viajantes > 0 ? fatura_total / total_viajantes : 0

  return {
    produtos_calculados,
    fatura_total,
    preco_unitario_total,
    tipo_preco: isGross ? 'BRUTO' : 'NET',
    moeda: 'USD',
    erros: [],
    carregando: false,
  }
}
