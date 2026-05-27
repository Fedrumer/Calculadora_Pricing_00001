import { useState } from 'react'
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
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Edit, Trash, Plus } from 'lucide-react'

export function CoberturasTab() {
  const { data, loading, create, update, remove } = useAdmin('coberturas')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<any>({})

  const handleOpen = (item?: any) => {
    setForm(
      item || {
        nome: '',
        descricao: '',
        ordem_exibicao: 0,
        ativo: true,
      },
    )
    setOpen(true)
  }

  const handleSave = async () => {
    const success = form.id ? await update(form.id, form) : await create(form)
    if (success) setOpen(false)
  }

  const sortedData = [...data].sort(
    (a: any, b: any) => (a.ordem_exibicao || 0) - (b.ordem_exibicao || 0),
  )

  if (loading) return <div className="p-4 text-center text-gray-500">Carregando...</div>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Coberturas (Master List)</h2>
        <Button onClick={() => handleOpen()}>
          <Plus className="w-4 h-4 mr-2" /> Nova Cobertura
        </Button>
      </div>
      <div className="overflow-x-auto border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ordem</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((item: any) => (
              <TableRow key={item.id}>
                <TableCell>{item.ordem_exibicao}</TableCell>
                <TableCell>{item.nome}</TableCell>
                <TableCell>{item.descricao}</TableCell>
                <TableCell>
                  <Switch
                    checked={item.ativo}
                    onCheckedChange={(v) => update(item.id, { ativo: v })}
                  />
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
            {sortedData.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                  Nenhuma cobertura cadastrada.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? 'Editar Cobertura' : 'Nova Cobertura'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label>Nome</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Descrição</Label>
              <Input
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Ordem de Exibição</Label>
              <Input
                type="number"
                value={form.ordem_exibicao}
                onChange={(e) => setForm({ ...form, ordem_exibicao: Number(e.target.value) })}
              />
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Switch
                checked={form.ativo}
                onCheckedChange={(v) => setForm({ ...form, ativo: v })}
              />
              <Label>Ativo</Label>
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
