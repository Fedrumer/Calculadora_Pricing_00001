import { useState } from 'react'
import useCotacaoStore from '@/stores/useCotacaoStore'
import { GridProdutos } from '@/components/GridProdutos'

export default function Index() {
  const { input } = useCotacaoStore()
  const [selecionados, setSelecionados] = useState<string[]>([])

  const handleSelecaoMudou = (id: string, selecionado: boolean) => {
    setSelecionados((prev) => (selecionado ? [...prev, id] : prev.filter((pId) => pId !== id)))
  }

  return (
    <div className="container max-w-7xl mx-auto py-8 px-4 sm:px-6">
      <div className="mb-8 animate-fade-in-down">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Cotação de Seguro Viagem</h1>
        <p className="text-muted-foreground">
          Compare os produtos disponíveis e selecione a melhor opção para sua viagem.
        </p>
      </div>

      <GridProdutos
        produtos={input.produtos || []}
        forma_pagamento={input.forma_pagamento}
        comissao={input.comissao || 0}
        viajantes_por_faixa={input.viajantes_por_faixa || { ate_75: 0, de_76_a_85: 0 }}
        data_inicio={input.data_inicio}
        data_fim={input.data_fim}
        destino={input.destino}
        produtosSelecionados={selecionados}
        onSelecaoMudou={handleSelecaoMudou}
      />
    </div>
  )
}
