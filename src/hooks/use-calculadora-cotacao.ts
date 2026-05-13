import { useMemo } from 'react'
import { CalculoInput, CotacaoState } from '@/types/cotacao'
import { calcularCotacao } from '@/lib/calculadora'

export function useCalculadoraCotacao(input: Partial<CalculoInput>): CotacaoState {
  return useMemo(() => {
    return calcularCotacao(input)
  }, [
    input.produtos,
    input.forma_pagamento,
    input.comissao,
    input.viajantes_por_faixa?.ate_75,
    input.viajantes_por_faixa?.de_76_a_85,
    input.data_inicio,
    input.data_fim,
    input.destino,
  ])
}
