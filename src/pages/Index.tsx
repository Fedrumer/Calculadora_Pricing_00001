import { useState } from 'react'
import { GridProdutos } from '@/components/GridProdutos'
import useCotacaoStore from '@/stores/useCotacaoStore'
import { Button } from '@/components/ui/button'
import { salvarCotacao } from '@/services/api'
import { useToast } from '@/hooks/use-toast'
import { useNavigate } from 'react-router-dom'
import { Save, Send } from 'lucide-react'

export default function Index() {
  const { input, resultado, carregandoProdutos, erroCarregamento, recarregarDados } =
    useCotacaoStore()
  const [selecionados, setSelecionados] = useState<string[]>([])
  const { toast } = useToast()
  const navigate = useNavigate()

  const handleSave = async (status: 'RASCUNHO' | 'PROPOSTA_ENVIADA') => {
    if (selecionados.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Atenção',
        description: 'Selecione pelo menos um produto para salvar.',
      })
      return
    }
    try {
      await salvarCotacao(input, resultado, selecionados, status)
      toast({
        title: 'Sucesso',
        description:
          status === 'PROPOSTA_ENVIADA'
            ? 'Proposta salva e marcada como enviada.'
            : 'Rascunho salvo com sucesso.',
      })
      navigate('/historico')
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível salvar a cotação.',
      })
    }
  }

  const produtosFiltrados = (input.produtos || []).filter((p) => {
    let match = true
    if (input.filtro_tag) {
      match = match && !!p.tags?.includes(input.filtro_tag)
    }
    if (input.filtro_nome) {
      match = match && p.nome === input.filtro_nome
    }
    return match
  })

  return (
    <div className="p-6 max-w-7xl mx-auto w-full flex flex-col h-full gap-6 animate-in fade-in zoom-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Cotação Atual</h1>
          <p className="text-sm text-gray-500">
            Selecione os produtos desejados e finalize a proposta.
          </p>
        </div>
        <div className="flex gap-3 w-full sm:w-auto">
          <Button
            variant="outline"
            className="flex-1 sm:flex-none border-gray-300 text-gray-700"
            onClick={() => handleSave('RASCUNHO')}
          >
            <Save className="w-4 h-4 mr-2" /> Salvar Rascunho
          </Button>
          <Button
            className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 shadow-sm"
            onClick={() => handleSave('PROPOSTA_ENVIADA')}
          >
            <Send className="w-4 h-4 mr-2" /> Salvar como Enviada
          </Button>
        </div>
      </div>

      <GridProdutos
        produtos={produtosFiltrados}
        forma_pagamento={input.forma_pagamento}
        comissao={input.comissao || 0}
        viajantes_por_faixa={input.viajantes_por_faixa!}
        data_inicio={input.data_inicio}
        data_fim={input.data_fim}
        destino={input.destino}
        produtosSelecionados={selecionados}
        onSelecaoMudou={(id, isSelected) => {
          setSelecionados((prev) => (isSelected ? [...prev, id] : prev.filter((x) => x !== id)))
        }}
        isError={erroCarregamento}
        onRetry={recarregarDados}
      />
    </div>
  )
}
