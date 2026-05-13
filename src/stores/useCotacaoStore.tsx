import React, { createContext, useContext, useState, useMemo, ReactNode } from 'react'
import { CalculoInput, CotacaoState } from '@/types/cotacao'
import { mockProdutos } from '@/data/mock-produtos'
import { useCalculadoraCotacao } from '@/hooks/use-calculadora-cotacao'

interface CotacaoContextType {
  input: Partial<CalculoInput>
  setInput: React.Dispatch<React.SetStateAction<Partial<CalculoInput>>>
  resultado: CotacaoState
}

const defaultInput: Partial<CalculoInput> = {
  produtos: mockProdutos,
  comissao: 0,
  viajantes_por_faixa: { ate_75: 1, de_76_a_85: 0 },
  forma_pagamento: 'TRANSFER',
  destino: 'WORLD',
}

const CotacaoContext = createContext<CotacaoContextType | null>(null)

export function CotacaoProvider({ children }: { children: ReactNode }) {
  const [input, setInput] = useState<Partial<CalculoInput>>(defaultInput)
  const resultado = useCalculadoraCotacao(input)

  const value = useMemo(
    () => ({
      input,
      setInput,
      resultado,
    }),
    [input, resultado],
  )

  return React.createElement(CotacaoContext.Provider, { value }, children)
}

export default function useCotacaoStore() {
  const context = useContext(CotacaoContext)
  if (!context) {
    throw new Error('useCotacaoStore must be used within a CotacaoProvider')
  }
  return context
}
