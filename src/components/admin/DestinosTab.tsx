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

export function DestinosTab({ produtoId = 'all' }: { produtoId?: string }) {
  const { data, loading, create, update, remove } = useAdmin('produto_destinos', 'produto_id')
  const [produtos, setProdutos] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<any>({})

  useEffect(() => {
    pb.collection('produtos').getFullList().then(setProdutos)
  }, [])

  const handleOpen = (item?: any) => {
    setForm(
      item || {
        produto_id: produtoId !== 'all' ? produtoId : '',
        destino_codigo: '',
        destino_nome: '',
        agravo_percentual: 0,
      },
    )
    setOpen(true)
  }

  const filteredData =
    produtoId === 'all' ? data : data.filter((d: any) => d.produto_id === produtoId)

  const handleSave = async () => {
    const nomes: Record<string, string> = {
      WORLD: 'Mundo',
      NORTH_AMERICA: 'América do Norte (Mundo + EUA)',
      DOMESTIC: 'Nacional',
    }
    const payload = { ...form, destino_nome: nomes[form.destino_codigo] || form.destino_codigo }
    const success = form.id ? await update(form.id, payload) : await create(payload)
    if (success) setOpen(false)
  }

  if (loading) return <div className="p-4 text-center text-gray-500">Carregando...</div>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Destinos por Produto</h2>
        <Button onClick={() => handleOpen()}>
          <Plus className="w-4 h-4 mr-2" /> Novo Destino
        </Button>
      </div>
      <div className="overflow-x-auto border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Destino</TableHead>
              <TableHead>Agravo (%)</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.map((item: any) => (
              <TableRow key={item.id}>
                <TableCell>{item.expand?.produto_id?.nome}</TableCell>
                <TableCell>{item.destino_nome}</TableCell>
                <TableCell className="font-mono text-blue-600">
                  {(item.agravo_percentual * 100).toFixed(0)}%
                </TableCell>
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
            <DialogTitle>{form.id ? 'Editar Destino' : 'Novo Destino'}</DialogTitle>
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
              <Label>Destino</Label>
              <Select
                value={form.destino_codigo}
                onValueChange={(v) => setForm({ ...form, destino_codigo: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o destino" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DOMESTIC">Nacional</SelectItem>
                  <SelectItem value="WORLD">Mundo</SelectItem>
                  <SelectItem value="NORTH_AMERICA">Mundo + EUA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Agravo (%) - Ex: 0.15 para 15%</Label>
              <Input
                type="number"
                step="0.01"
                value={form.agravo_percentual}
                onChange={(e) => setForm({ ...form, agravo_percentual: Number(e.target.value) })}
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
