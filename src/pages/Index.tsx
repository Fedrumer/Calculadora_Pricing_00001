import { useState } from 'react'
import { GridProdutos } from '@/components/GridProdutos'
import useCotacaoStore from '@/stores/useCotacaoStore'
import { Button } from '@/components/ui/button'
import { salvarCotacao } from '@/services/api'
import { useToast } from '@/hooks/use-toast'
import { useNavigate } from 'react-router-dom'
import { Save, Send } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function Index() {
  const { input, resultado, carregandoProdutos, erroCarregamento, recarregarDados } =
    useCotacaoStore()
  const [selecionados, setSelecionados] = useState<string[]>([])
  const [modalAcao, setModalAcao] = useState<'RASCUNHO' | 'PROPOSTA_ENVIADA' | null>(null)
  const [nomeAgencia, setNomeAgencia] = useState('')
  const [salvando, setSalvando] = useState(false)
  const { toast } = useToast()
  const navigate = useNavigate()

  const openModal = (status: 'RASCUNHO' | 'PROPOSTA_ENVIADA') => {
    if (selecionados.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Atenção',
        description: 'Selecione pelo menos um produto para salvar.',
      })
      return
    }
    setModalAcao(status)
    setNomeAgencia('')
  }

  const handleConfirmSave = async () => {
    if (!modalAcao) return
    setSalvando(true)
    try {
      await salvarCotacao(input, resultado, selecionados, modalAcao, nomeAgencia)
      toast({
        title: 'Sucesso',
        description:
          modalAcao === 'PROPOSTA_ENVIADA'
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
    } finally {
      setSalvando(false)
      setModalAcao(null)
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
            onClick={() => openModal('RASCUNHO')}
          >
            <Save className="w-4 h-4 mr-2" /> Salvar Rascunho
          </Button>
          <Button
            className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 shadow-sm"
            onClick={() => openModal('PROPOSTA_ENVIADA')}
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
        produtosSelecionados={selecionados}
        onSelecaoMudou={(id, isSelected) => {
          setSelecionados((prev) => (isSelected ? [...prev, id] : prev.filter((x) => x !== id)))
        }}
        isError={erroCarregamento}
        onRetry={recarregarDados}
      />

      <Dialog open={!!modalAcao} onOpenChange={(open) => !open && setModalAcao(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Salvar Cotação</DialogTitle>
            <DialogDescription>
              Informe o nome da agência para identificar esta cotação.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="nome_agencia" className="text-right">
                Agência
              </Label>
              <Input
                id="nome_agencia"
                value={nomeAgencia}
                onChange={(e) => setNomeAgencia(e.target.value)}
                className="col-span-3"
                placeholder="Ex: Agência Viagens Inc"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAcao(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmSave} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
