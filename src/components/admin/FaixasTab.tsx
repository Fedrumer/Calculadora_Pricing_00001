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

export function FaixasTab() {
  const { data, loading, create, update, remove } = useAdmin('produto_faixas_etarias', 'produto_id')
  const [produtos, setProdutos] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<any>({})

  useEffect(() => {
    pb.collection('produtos').getFullList().then(setProdutos)
  }, [])

  const handleOpen = (item?: any) => {
    setForm(item || { produto_id: '', faixa_nome: '', fator_multiplicador: 1.0 })
    setOpen(true)
  }

  const handleSave = async () => {
    const success = form.id ? await update(form.id, form) : await create(form)
    if (success) setOpen(false)
  }

  if (loading) return <div className="p-4 text-center text-gray-500">Carregando...</div>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Faixas Etárias</h2>
        <Button onClick={() => handleOpen()}>
          <Plus className="w-4 h-4 mr-2" /> Nova Faixa
        </Button>
      </div>
      <div className="overflow-x-auto border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Faixa</TableHead>
              <TableHead>Fator Multiplicador</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item: any) => (
              <TableRow key={item.id}>
                <TableCell>{item.expand?.produto_id?.nome}</TableCell>
                <TableCell>
                  {item.faixa_nome === 'ate_75' ? 'Até 75 anos' : '76 a 85 anos'}
                </TableCell>
                <TableCell className="font-mono">{item.fator_multiplicador}</TableCell>
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
            <DialogTitle>{form.id ? 'Editar Faixa' : 'Nova Faixa'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
            <div className="grid gap-2">
              <Label>Faixa Etária</Label>
              <Select
                value={form.faixa_nome}
                onValueChange={(v) => setForm({ ...form, faixa_nome: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a faixa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ate_75">Até 75 anos</SelectItem>
                  <SelectItem value="de_76_a_85">76 a 85 anos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Fator (Ex: 1.0 = Preço Base, 2.0 = Dobro do Preço)</Label>
              <Input
                type="number"
                step="0.1"
                value={form.fator_multiplicador}
                onChange={(e) => setForm({ ...form, fator_multiplicador: Number(e.target.value) })}
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
