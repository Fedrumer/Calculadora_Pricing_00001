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
import { useTranslation } from '@/hooks/use-translation'

export default function Index() {
  const {
    input,
    resultado,
    carregandoProdutos,
    erroCarregamento,
    recarregarDados,
    formasPagamento,
  } = useCotacaoStore()
  const { t } = useTranslation()
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
        title: t('index.warning'),
        description: t('index.select_one'),
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
      const formaPagamentoId = formasPagamento.find((fp) => fp.codigo === input.forma_pagamento)?.id
      await salvarCotacao(input, resultado, selecionados, modalAcao, nomeAgencia, formaPagamentoId)
      toast({
        title: t('index.success'),
        description:
          modalAcao === 'PROPOSTA_ENVIADA' ? t('index.proposal_saved') : t('index.draft_saved'),
      })
      navigate('/historico')
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t('index.error'),
        description: t('index.error_saving'),
      })
    } finally {
      setSalvando(false)
      setModalAcao(null)
    }
  }

  const produtosFiltrados = (input.produtos || []).filter((p) => {
    let match = true
    if (input.filtro_tag && input.filtro_tag.length > 0) {
      match = match && input.filtro_tag.some((tag) => p.tags?.includes(tag) || p.categoria === tag)
    }
    if (input.filtro_nome && input.filtro_nome.length > 0) {
      match = match && input.filtro_nome.includes(p.nome)
    }
    return match
  })

  return (
    <div className="p-6 max-w-7xl mx-auto w-full flex flex-col h-full gap-6 animate-in fade-in zoom-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{t('index.title')}</h1>
          <p className="text-sm text-gray-500">{t('index.subtitle')}</p>
        </div>
        <div className="flex gap-3 w-full sm:w-auto">
          <Button
            variant="outline"
            className="flex-1 sm:flex-none border-gray-300 text-gray-700 whitespace-nowrap"
            onClick={() => openModal('RASCUNHO')}
          >
            <Save className="w-4 h-4 mr-2 hidden sm:block" /> {t('index.save_draft')}
          </Button>
          <Button
            className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 shadow-sm whitespace-nowrap"
            onClick={() => openModal('PROPOSTA_ENVIADA')}
          >
            <Send className="w-4 h-4 mr-2 hidden sm:block" /> {t('index.save_sent')}
          </Button>
        </div>
      </div>

      <GridProdutos
        produtos={produtosFiltrados}
        forma_pagamento={input.forma_pagamento}
        comissao={input.comissao || 0}
        markup={input.markup || 0}
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
            <DialogTitle>{t('index.save_quote')}</DialogTitle>
            <DialogDescription>{t('index.agency_name_desc')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="nome_agencia" className="text-right">
                {t('index.agency')}
              </Label>
              <Input
                id="nome_agencia"
                value={nomeAgencia}
                onChange={(e) => setNomeAgencia(e.target.value)}
                className="col-span-3"
                placeholder={t('index.agency_placeholder')}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAcao(null)} disabled={salvando}>
              {t('header.cancel')}
            </Button>
            <Button onClick={handleConfirmSave} disabled={salvando}>
              {salvando ? t('index.saving') : t('index.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
