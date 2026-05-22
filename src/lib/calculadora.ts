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

  if (erros.length > 0 && import.meta.env.DEV) {
    console.error('Calculation errors:', erros)
  }

  const bloqueiaCalculo =
    !input.produtos ||
    !input.forma_pagamento ||
    !input.destino ||
    (input.comissao !== undefined && input.comissao >= 0.99)

  if (bloqueiaCalculo) {
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
  let dias = 1
  if (input.data_inicio && input.data_fim && input.data_fim >= input.data_inicio) {
    const diasRaw = differenceInDays(input.data_fim, input.data_inicio) + 1
    dias = Math.max(1, diasRaw)
  }

  const comissao = input.comissao || 0
  const isGross = comissao > 0

  const produtos_calculados = input.produtos.reduce<CotacaoState['produtos_calculados']>(
    (acc, produto) => {
      try {
        const preco_net_base =
          produto.precos_base_por_forma_pagamento?.[input.forma_pagamento!] ?? 0
        if (produto.precos_base_por_forma_pagamento?.[input.forma_pagamento!] === undefined) {
          console.warn(
            `Preço base não encontrado para a forma de pagamento ${input.forma_pagamento} no produto ${produto.id}. Usando 0.`,
          )
        }

        const preco_bruto = isGross ? preco_net_base / (1 - comissao) : preco_net_base

        const destinoData = produto.destinos?.[input.destino!]
        if (!destinoData) {
          console.warn(
            `Destino ${input.destino} não encontrado para o produto ${produto.id}. Usando agravo 0.`,
          )
        }
        const agravo = destinoData?.agravo_percentual ?? 0

        const tipoCobranca = produto.tipo_cobranca || 'dia'
        console.log(`Produto: ${produto.nome}, tipo_cobranca: ${tipoCobranca}`)

        const calcFaixa = (faixa: FaixaEtariaId, qtd: number) => {
          let diasParaEstaFaixa = dias
          if (tipoCobranca === 'anual') {
            diasParaEstaFaixa = 1
            console.log(`ANNUAL PRODUCT - Faixa ${faixa} using 1 day`)
          } else {
            console.log(`DAILY PRODUCT - Faixa ${faixa} using ${dias} days`)
          }

          const faixaData = produto.faixas_etarias?.[faixa]
          if (!faixaData && qtd > 0) {
            console.warn(
              `Faixa etária ${faixa} não encontrada para o produto ${produto.id}. Usando fator multiplicador 1.0.`,
            )
          }
          const fator = faixaData?.fator_multiplicador ?? 1.0

          const preco_dia = preco_bruto * (1 + agravo) * fator
          const preco_faixa = preco_dia * diasParaEstaFaixa * qtd

          console.log(
            `Produto ${produto.nome}, Destino ${input.destino}, Faixa ${faixa}, diasParaEstaFaixa: ${diasParaEstaFaixa}, preco_faixa: ${preco_faixa}`,
          )

          return {
            preco_unitario: preco_dia * diasParaEstaFaixa,
            preco_total: preco_faixa,
            quantidade: qtd,
          }
        }

        const breakdown = {
          ate_75: calcFaixa('ate_75', qtd75),
          de_76_a_85: calcFaixa('de_76_a_85', qtd85),
        }

        acc.push({
          id: produto.id,
          nome: produto.nome,
          breakdown,
          preco_total_produto: breakdown.ate_75.preco_total + breakdown.de_76_a_85.preco_total,
        })
      } catch (err) {
        console.error(`Erro ao calcular produto ${produto.id}:`, err)
      }

      return acc
    },
    [],
  )

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
