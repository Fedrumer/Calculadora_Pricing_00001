import { useState } from 'react'
import { format } from 'date-fns'
import { FileText, Copy, Trash2, Eye, MoreVertical, Send, Edit2 } from 'lucide-react'
import { useIsMobile } from '@/hooks/use-mobile'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/hooks/use-auth'
import pb from '@/lib/pocketbase/client'
import { useToast } from '@/hooks/use-toast'

const StatusBadge = ({ status }: { status: string }) => {
  const colors: any = {
    RASCUNHO: 'bg-gray-100 text-gray-800',
    PROPOSTA_ENVIADA: 'bg-blue-100 text-blue-800',
    APROVADA: 'bg-green-100 text-green-800',
  }
  return (
    <Badge className={colors[status] || ''} variant="secondary">
      {status.replace('_', ' ')}
    </Badge>
  )
}

import { generateAndDownloadCotacaoPdf } from '@/lib/pdf'

export function HistoricoList({
  data,
  onDuplicate,
  onDelete,
  onDownload,
  onUpdate,
  onUpdateAgencia,
  isGeneratingPdf,
}: any) {
  const isMobile = useIsMobile()
  const [viewItem, setViewItem] = useState<any>(null)
  const [localGenerating, setLocalGenerating] = useState(false)
  const generating = isGeneratingPdf || localGenerating

  const handleDownload = async (item: any) => {
    try {
      setLocalGenerating(true)
      await generateAndDownloadCotacaoPdf(item.id)
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível gerar PDF' })
    } finally {
      setLocalGenerating(false)
    }
  }
  const { user } = useAuth()
  const { toast } = useToast()

  const getLocalCurrencyData = (item: any) => {
    const pais = item.expand?.usuario_id?.pais || user?.pais || 'Brasil'
    return {
      symbol: pais === 'Argentina' ? 'ARS' : 'R$',
      locale: pais === 'Argentina' ? 'es-AR' : 'pt-BR',
    }
  }
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [editAgenciaName, setEditAgenciaName] = useState('')
  const [isEditingAgencia, setIsEditingAgencia] = useState(false)

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await pb.collection('cotacoes').update(id, { status })
      toast({ title: 'Sucesso', description: 'Status atualizado com sucesso.' })
      if (onUpdate) onUpdate()
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Falha ao atualizar status.' })
    }
  }

  const handleSaveAgencia = async () => {
    if (!viewItem) return
    try {
      await onUpdateAgencia(viewItem.id, editAgenciaName)
      setViewItem({ ...viewItem, nome_agencia: editAgenciaName })
      setIsEditingAgencia(false)
    } catch (err) {
      // Error is handled in the hook
    }
  }

  const openViewModal = (item: any) => {
    setViewItem(item)
    setEditAgenciaName(item.nome_agencia || '')
    setIsEditingAgencia(false)
  }

  const ActionsMenu = ({ item }: { item: any }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => openViewModal(item)}>
          <Eye className="w-4 h-4 mr-2" /> Visualizar
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleDownload(item)} disabled={generating}>
          <FileText className="w-4 h-4 mr-2" /> {generating ? 'Gerando PDF...' : 'Baixar PDF'}
        </DropdownMenuItem>
        {item.status === 'RASCUNHO' && (
          <DropdownMenuItem onClick={() => handleStatusChange(item.id, 'PROPOSTA_ENVIADA')}>
            <Send className="w-4 h-4 mr-2" /> Salvar como Enviada
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => onDuplicate(item)}>
          <Copy className="w-4 h-4 mr-2" /> Duplicar
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setDeleteId(item.id)}
          className="text-red-600 focus:text-red-600 focus:bg-red-50"
        >
          <Trash2 className="w-4 h-4 mr-2" /> Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <>
      {isMobile ? (
        <div className="grid grid-cols-1 gap-4">
          {data.map((item: any) => (
            <Card key={item.id}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-mono text-muted-foreground">
                    {item.id}
                  </CardTitle>
                  <CardDescription>{format(new Date(item.created), 'dd/MM/yyyy')}</CardDescription>
                </div>
                <ActionsMenu item={item} />
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center mb-2">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {item.moeda || 'USD'}{' '}
                      {item.fatura_total?.toLocaleString(getLocalCurrencyData(item).locale, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <span className="text-xs font-medium text-blue-700">
                      {item.taxa_cambio
                        ? `${getLocalCurrencyData(item).symbol} ${(item.fatura_total * item.taxa_cambio).toLocaleString(getLocalCurrencyData(item).locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : 'N/A'}
                    </span>
                  </div>
                  {user?.role === 'ADMIN' ? (
                    <Select
                      defaultValue={item.status}
                      onValueChange={(v) => handleStatusChange(item.id, v)}
                    >
                      <SelectTrigger className="h-8 text-xs w-[140px] bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="RASCUNHO">Rascunho</SelectItem>
                        <SelectItem value="PROPOSTA_ENVIADA">Proposta Enviada</SelectItem>
                        <SelectItem value="APROVADA">Aprovada</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <StatusBadge status={item.status} />
                  )}
                </div>
                <div className="text-xs text-muted-foreground mb-1">
                  Agência: {item.nome_agencia || 'Não informada'}
                </div>
                <div className="text-xs text-muted-foreground">
                  Pagamento: {item.expand?.forma_pagamento_id?.nome || 'N/A'}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <Table>
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead>ID da Cotação</TableHead>
                <TableHead>Agência</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead>Fatura (USD)</TableHead>
                <TableHead>Fatura (Moeda Local)</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-sm text-gray-600">{item.id}</TableCell>
                  <TableCell>{item.nome_agencia || 'Não informada'}</TableCell>
                  <TableCell>{format(new Date(item.created), 'dd/MM/yyyy')}</TableCell>
                  <TableCell>
                    {user?.role === 'ADMIN' ? (
                      <Select
                        defaultValue={item.status}
                        onValueChange={(v) => handleStatusChange(item.id, v)}
                      >
                        <SelectTrigger className="h-8 text-xs w-[140px] bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="RASCUNHO">Rascunho</SelectItem>
                          <SelectItem value="PROPOSTA_ENVIADA">Proposta Enviada</SelectItem>
                          <SelectItem value="APROVADA">Aprovada</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <StatusBadge status={item.status} />
                    )}
                  </TableCell>
                  <TableCell>{item.expand?.forma_pagamento_id?.nome || 'N/A'}</TableCell>
                  <TableCell className="font-medium text-gray-900">
                    {item.moeda || 'USD'}{' '}
                    {item.fatura_total?.toLocaleString(getLocalCurrencyData(item).locale, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </TableCell>
                  <TableCell className="font-medium text-blue-700">
                    {item.taxa_cambio
                      ? `${getLocalCurrencyData(item).symbol} ${(item.fatura_total * item.taxa_cambio).toLocaleString(getLocalCurrencyData(item).locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : 'N/A'}
                  </TableCell>
                  <TableCell>
                    <ActionsMenu item={item} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!viewItem} onOpenChange={(open) => !open && setViewItem(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da Cotação - {viewItem?.id}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm my-4 bg-gray-50 p-4 rounded-md">
            <div>
              <strong>Status:</strong>{' '}
              <span className="block mt-1">
                <StatusBadge status={viewItem?.status || ''} />
              </span>
            </div>
            <div>
              <strong>Data:</strong>{' '}
              <span className="block mt-1">
                {viewItem?.created && format(new Date(viewItem.created), 'dd/MM/yyyy')}
              </span>
            </div>
            <div className="col-span-2">
              <strong>Agência:</strong>{' '}
              <span className="block mt-1">
                {isEditingAgencia ? (
                  <div className="flex gap-2 items-center">
                    <Input
                      value={editAgenciaName}
                      onChange={(e) => setEditAgenciaName(e.target.value)}
                      className="h-8 text-sm max-w-[200px]"
                      placeholder="Nome da agência"
                    />
                    <Button size="sm" onClick={handleSaveAgencia}>
                      Salvar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setIsEditingAgencia(false)
                        setEditAgenciaName(viewItem?.nome_agencia || '')
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2 items-center">
                    <span>{viewItem?.nome_agencia || 'Não informada'}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setIsEditingAgencia(true)}
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </span>
            </div>
            <div>
              <strong>Pagamento:</strong>{' '}
              <span className="block mt-1">{viewItem?.expand?.forma_pagamento_id?.nome}</span>
            </div>
            <div>
              <strong>Fatura (USD):</strong>{' '}
              <span className="block mt-1 font-bold text-green-600">
                {viewItem?.moeda || 'USD'}{' '}
                {viewItem?.fatura_total?.toLocaleString(getLocalCurrencyData(viewItem).locale, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
            <div>
              <strong>Fatura (Moeda Local):</strong>{' '}
              <span className="block mt-1 font-bold text-blue-600">
                {viewItem?.taxa_cambio
                  ? `${getLocalCurrencyData(viewItem).symbol} ${(viewItem.fatura_total * viewItem.taxa_cambio).toLocaleString(getLocalCurrencyData(viewItem).locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : 'N/A'}
              </span>
            </div>
            <div>
              <strong>Início:</strong>{' '}
              <span className="block mt-1">
                {viewItem?.data_inicio && format(new Date(viewItem.data_inicio), 'dd/MM/yyyy')}
              </span>
            </div>
            <div>
              <strong>Fim:</strong>{' '}
              <span className="block mt-1">
                {viewItem?.data_fim && format(new Date(viewItem.data_fim), 'dd/MM/yyyy')}
              </span>
            </div>
            <div>
              <strong>Dias:</strong> <span className="block mt-1">{viewItem?.qtd_dias}</span>
            </div>
            <div>
              <strong>Comissão:</strong>{' '}
              <span className="block mt-1">
                {viewItem?.comissao ? (viewItem.comissao * 100).toFixed(0) : 0}%
              </span>
            </div>
            <div>
              <strong>Câmbio:</strong>{' '}
              <span className="block mt-1">
                {viewItem?.taxa_cambio
                  ? `${getLocalCurrencyData(viewItem).symbol} ${viewItem.taxa_cambio.toLocaleString(getLocalCurrencyData(viewItem).locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : 'N/A'}
              </span>
            </div>
          </div>
          <h3 className="font-semibold mb-2">Produtos Selecionados</h3>
          <div className="overflow-x-auto border rounded-md">
            <Table>
              <TableHeader className="bg-gray-100">
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Viajantes (Até 75)</TableHead>
                  <TableHead>Viajantes (76-85)</TableHead>
                  <TableHead>Preço (USD)</TableHead>
                  <TableHead>Preço (Moeda Local)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {viewItem?.expand?.cotacao_produtos_via_cotacao_id?.map((cp: any) => (
                  <TableRow key={cp.id}>
                    <TableCell>{cp.expand?.produto_id?.nome}</TableCell>
                    <TableCell>{cp.qtd_ate_75}</TableCell>
                    <TableCell>{cp.qtd_76_a_85}</TableCell>
                    <TableCell>
                      {viewItem?.moeda || 'USD'}{' '}
                      {cp.preco_total_produto.toLocaleString(
                        getLocalCurrencyData(viewItem).locale,
                        { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                      )}
                    </TableCell>
                    <TableCell className="text-blue-700">
                      {viewItem?.taxa_cambio
                        ? `${getLocalCurrencyData(viewItem).symbol} ${(cp.preco_total_produto * viewItem.taxa_cambio).toLocaleString(getLocalCurrencyData(viewItem).locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : 'N/A'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setViewItem(null)}>
              Fechar
            </Button>
            <Button
              disabled={generating}
              onClick={() => {
                handleDownload(viewItem)
                setViewItem(null)
              }}
            >
              {generating ? 'Gerando PDF...' : 'Baixar PDF'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <p className="text-gray-600">
            Tem certeza que deseja excluir esta cotação? Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteId) onDelete(deleteId)
                setDeleteId(null)
              }}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
