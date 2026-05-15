import { useState, useEffect } from 'react'
import { useAdmin } from '@/hooks/use-admin'
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Edit, Trash, Plus } from 'lucide-react'
import pb from '@/lib/pocketbase/client'

export function PrecosTab({ produtoId = 'all' }: { produtoId?: string }) {
  const { data, loading, create, update, remove } = useAdmin(
    'produto_precos_forma_pagamento',
    'produto_id',
  )
  const [produtos, setProdutos] = useState<any[]>([])
  const [formas, setFormas] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<any>({})

  useEffect(() => {
    pb.collection('produtos').getFullList().then(setProdutos)
    pb.collection('formas_pagamento').getFullList().then(setFormas)
  }, [])

  const handleOpen = (item?: any) => {
    setForm(
      item || {
        produto_id: produtoId !== 'all' ? produtoId : '',
        forma_pagamento_codigo: '',
        preco_base_net: 0,
      },
    )
    setOpen(true)
  }

  const filteredData =
    produtoId === 'all' ? data : data.filter((d: any) => d.produto_id === produtoId)

  const handleSave = async () => {
    const success = form.id ? await update(form.id, form) : await create(form)
    if (success) setOpen(false)
  }

  if (loading) return <div className="p-4 text-center text-gray-500">Carregando...</div>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Preços por Forma de Pagamento</h2>
        <Button onClick={() => handleOpen()}>
          <Plus className="w-4 h-4 mr-2" /> Novo Preço
        </Button>
      </div>
      <div className="overflow-x-auto border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Forma Pgto</TableHead>
              <TableHead>Preço NET</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.map((item: any) => (
              <TableRow key={item.id}>
                <TableCell>{item.expand?.produto_id?.nome}</TableCell>
                <TableCell>{item.forma_pagamento_codigo}</TableCell>
                <TableCell className="font-mono">{item.preco_base_net?.toFixed(2)}</TableCell>
                <TableCell className="flex gap-2 justify-end">
                  <Button variant="ghost" size="icon" onClick={() => handleOpen(item)}>
                    <Edit className="w-4 h-4 text-blue-600" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(item.id)}>
                    <Trash className="w-4 h-4 text-red-500" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? 'Editar Preço' : 'Novo Preço'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {produtoId === 'all' && (
              <div className="grid gap-2">
                <Label>Produto</Label>
                <Select
                  value={form.produto_id}
                  onValueChange={(v) => setForm({ ...form, produto_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um produto" />
                  </SelectTrigger>
                  <SelectContent>
                    {produtos.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-2">
              <Label>Forma de Pagamento</Label>
              <Select
                value={form.forma_pagamento_codigo}
                onValueChange={(v) => setForm({ ...form, forma_pagamento_codigo: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o pagamento" />
                </SelectTrigger>
                <SelectContent>
                  {formas.map((f) => (
                    <SelectItem key={f.codigo} value={f.codigo}>
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Preço Base NET</Label>
              <Input
                type="number"
                step="0.01"
                value={form.preco_base_net}
                onChange={(e) => setForm({ ...form, preco_base_net: Number(e.target.value) })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
