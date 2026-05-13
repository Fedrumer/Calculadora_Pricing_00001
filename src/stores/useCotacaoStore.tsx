import React, { createContext, useContext, useState, useMemo, ReactNode } from 'react'
import { CalculoInput, CotacaoState } from '@/types/cotacao'
import { useCalculadoraCotacao } from '@/hooks/use-calculadora-cotacao'
import { fetchProdutos } from '@/services/api'

interface CotacaoContextType {
  input: Partial<CalculoInput>
  setInput: React.Dispatch<React.SetStateAction<Partial<CalculoInput>>>
  resultado: CotacaoState
  carregandoProdutos: boolean
}

const defaultInput: Partial<CalculoInput> = {
  produtos: [],
  comissao: 0,
  viajantes_por_faixa: { ate_75: 1, de_76_a_85: 0 },
  forma_pagamento: 'TRANSFER',
  destino: 'WORLD',
  data_inicio: new Date(),
  data_fim: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
}

const CotacaoContext = createContext<CotacaoContextType | null>(null)

export function CotacaoProvider({ children }: { children: ReactNode }) {
  const [input, setInput] = useState<Partial<CalculoInput>>(defaultInput)
  const [carregandoProdutos, setCarregandoProdutos] = useState(true)
  const resultado = useCalculadoraCotacao(input)

  React.useEffect(() => {
    fetchProdutos()
      .then((produtos) => {
        setInput((prev) => ({ ...prev, produtos }))
        setCarregandoProdutos(false)
      })
      .catch((err) => {
        console.error('Failed to load products:', err)
        setCarregandoProdutos(false)
      })
  }, [])

  const value = useMemo(
    () => ({
      input,
      setInput,
      resultado,
      carregandoProdutos,
    }),
    [input, resultado, carregandoProdutos],
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
