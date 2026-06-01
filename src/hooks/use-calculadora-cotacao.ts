import { useState, useEffect, useMemo, useCallback } from 'react'
import { CalculoInput, CotacaoState } from '@/types/cotacao'
import { calcularCotacao } from '@/lib/calculadora'

export function useCalculadoraCotacao(input: Partial<CalculoInput>): CotacaoState {
  const [state, setState] = useState<CotacaoState>({
    produtos_calculados: [],
    fatura_total: 0,
    preco_unitario_total: 0,
    tipo_preco: 'NET',
    moeda: 'USD',
    erros: [],
    carregando: false,
  })

  const currentInput = useMemo(() => {
    return input
  }, [
    input.produtos,
    input.forma_pagamento,
    input.comissao,
    input.markup,
    input.viajantes_por_faixa?.ate_75,
    input.viajantes_por_faixa?.de_76_a_85,
    input.data_inicio,
    input.data_fim,
  ])

  const calculate = useCallback((calcInput: Partial<CalculoInput>) => {
    return calcularCotacao(calcInput)
  }, [])

  useEffect(() => {
    const result = calculate(currentInput)
    setState(result)
  }, [currentInput, calculate])

  return state
}
