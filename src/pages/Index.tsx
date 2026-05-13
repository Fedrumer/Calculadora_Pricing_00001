import { useState } from 'react'
import useCotacaoStore from '@/stores/useCotacaoStore'
import { GridProdutos } from '@/components/GridProdutos'
import { Button } from '@/components/ui/button'
import { salvarCotacao } from '@/services/api'
import { useToast } from '@/hooks/use-toast'

export default function Index() {
  const { input, resultado, carregandoProdutos } = useCotacaoStore()
  const [selecionados, setSelecionados] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)
  const { toast } = useToast()

  const handleSelecaoMudou = (id: string, selecionado: boolean) => {
    setSelecionados((prev) => (selecionado ? [...prev, id] : prev.filter((pId) => pId !== id)))
  }

  const handleSalvar = async () => {
    setSalvando(true)
    try {
      await salvarCotacao(input, resultado, selecionados)
      toast({
        title: 'Cotação Salva',
        description: 'A cotação foi salva com sucesso no sistema.',
      })
      setSelecionados([])
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err.message || 'Ocorreu um erro inesperado.',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="container max-w-7xl mx-auto py-8 px-4 sm:px-6">
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in-down">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Cotação de Seguro Viagem</h1>
          <p className="text-muted-foreground">
            Compare os produtos disponíveis e selecione a melhor opção para sua viagem.
          </p>
        </div>
        <Button onClick={handleSalvar} disabled={selecionados.length === 0 || salvando}>
          {salvando ? 'Salvando...' : 'Salvar Cotação'}
        </Button>
      </div>

      {carregandoProdutos ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground animate-pulse font-medium">
            Carregando produtos disponíveis...
          </p>
        </div>
      ) : (
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
      )}
    </div>
  )
}
