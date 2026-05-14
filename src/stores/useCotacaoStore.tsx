import React, { createContext, useContext, useState, useMemo, ReactNode } from 'react'
import { CalculoInput, CotacaoState } from '@/types/cotacao'
import { useCalculadoraCotacao } from '@/hooks/use-calculadora-cotacao'
import { fetchProdutos, fetchFormasPagamento } from '@/services/api'

interface CotacaoContextType {
  input: Partial<CalculoInput>
  setInput: React.Dispatch<React.SetStateAction<Partial<CalculoInput>>>
  resultado: CotacaoState
  carregandoProdutos: boolean
  formasPagamento: Array<{ id: string; codigo: string; nome: string }>
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
  const [formasPagamento, setFormasPagamento] = useState<
    Array<{ id: string; codigo: string; nome: string }>
  >([])
  const resultado = useCalculadoraCotacao(input)

  React.useEffect(() => {
    Promise.all([fetchProdutos(), fetchFormasPagamento()])
      .then(([produtos, fps]) => {
        setInput((prev) => ({ ...prev, produtos }))
        setFormasPagamento(fps)
        setCarregandoProdutos(false)
      })
      .catch((err) => {
        console.error('Failed to load initial data:', err)
        setCarregandoProdutos(false)
      })
  }, [])

  const value = useMemo(
    () => ({
      input,
      setInput,
      resultado,
      carregandoProdutos,
      formasPagamento,
    }),
    [input, resultado, carregandoProdutos, formasPagamento],
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
