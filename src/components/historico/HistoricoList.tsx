import { useState } from 'react'
import { format } from 'date-fns'
import { FileText, Copy, Trash2, Eye, MoreVertical } from 'lucide-react'
import { useIsMobile } from '@/hooks/use-mobile'
import { Button } from '@/components/ui/button'
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

export function HistoricoList({ data, onDuplicate, onDelete, onDownload }: any) {
  const isMobile = useIsMobile()
  const [viewItem, setViewItem] = useState<any>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const ActionsMenu = ({ item }: { item: any }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setViewItem(item)}>
          <Eye className="w-4 h-4 mr-2" /> Visualizar
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDownload(item)}>
          <FileText className="w-4 h-4 mr-2" /> Baixar PDF
        </DropdownMenuItem>
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
                  <span className="text-sm font-medium">
                    {item.moeda || 'USD'} {item.fatura_total?.toFixed(2)}
                  </span>
                  <StatusBadge status={item.status} />
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
                <TableHead>Pagamento</TableHead>
                <TableHead>Fatura Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-sm text-gray-600">{item.id}</TableCell>
                  <TableCell>{item.expand?.forma_pagamento_id?.nome || 'N/A'}</TableCell>
                  <TableCell className="font-medium text-gray-900">
                    {item.moeda || 'USD'} {item.fatura_total?.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={item.status} />
                  </TableCell>
                  <TableCell>{format(new Date(item.created), 'dd/MM/yyyy')}</TableCell>
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
            <div>
              <strong>Pagamento:</strong>{' '}
              <span className="block mt-1">{viewItem?.expand?.forma_pagamento_id?.nome}</span>
            </div>
            <div>
              <strong>Fatura:</strong>{' '}
              <span className="block mt-1 font-bold text-green-600">
                {viewItem?.moeda || 'USD'} {viewItem?.fatura_total?.toFixed(2)}
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
          </div>
          <h3 className="font-semibold mb-2">Produtos Selecionados</h3>
          <div className="overflow-x-auto border rounded-md">
            <Table>
              <TableHeader className="bg-gray-100">
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Viajantes (Até 75)</TableHead>
                  <TableHead>Viajantes (76-85)</TableHead>
                  <TableHead>Preço Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {viewItem?.expand?.cotacao_produtos_via_cotacao_id?.map((cp: any) => (
                  <TableRow key={cp.id}>
                    <TableCell>{cp.expand?.produto_id?.nome}</TableCell>
                    <TableCell>{cp.qtd_ate_75}</TableCell>
                    <TableCell>{cp.qtd_76_a_85}</TableCell>
                    <TableCell>
                      {viewItem?.moeda || 'USD'} {cp.preco_total_produto.toFixed(2)}
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
              onClick={() => {
                onDownload(viewItem)
                setViewItem(null)
              }}
            >
              Baixar PDF
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
