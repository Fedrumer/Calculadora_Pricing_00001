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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Edit, Trash, Plus, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'

export function ProdutosTab() {
  const { data, loading, create, update, remove } = useAdmin('produtos')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<any>({})

  const handleOpen = (item?: any) => {
    setForm(
      item || {
        codigo: '',
        nome: '',
        categoria: '',
        tipo_cobranca: 'dia',
        cobertura_medica: 0,
        ativo: true,
      },
    )
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
        <h2 className="text-xl font-semibold">Produtos</h2>
        <Button onClick={() => handleOpen()}>
          <Plus className="w-4 h-4 mr-2" /> Novo Produto
        </Button>
      </div>
      <div className="overflow-x-auto border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item: any) => (
              <TableRow key={item.id}>
                <TableCell>{item.codigo}</TableCell>
                <TableCell>{item.nome}</TableCell>
                <TableCell>{item.categoria}</TableCell>
                <TableCell>
                  <Switch
                    checked={item.ativo}
                    onCheckedChange={(v) => update(item.id, { ativo: v })}
                  />
                </TableCell>
                <TableCell className="flex gap-2 justify-end">
                  <Button variant="ghost" size="icon" asChild title="Gerenciar Coberturas">
                    <Link to={`/admin/produtos/${item.id}/coberturas`}>
                      <ShieldAlert className="w-4 h-4 text-purple-600" />
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleOpen(item)}
                    title="Editar Produto"
                  >
                    <Edit className="w-4 h-4 text-blue-600" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(item.id)}
                    title="Excluir Produto"
                  >
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
            <DialogTitle>{form.id ? 'Editar Produto' : 'Novo Produto'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label>Código</Label>
              <Input
                value={form.codigo}
                onChange={(e) => setForm({ ...form, codigo: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Nome</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Categoria</Label>
              <Input
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Tipo Cobrança</Label>
              <Select
                value={form.tipo_cobranca}
                onValueChange={(v) => setForm({ ...form, tipo_cobranca: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dia">Por Dia</SelectItem>
                  <SelectItem value="anual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Cobertura Médica</Label>
              <Input
                type="number"
                value={form.cobertura_medica}
                onChange={(e) => setForm({ ...form, cobertura_medica: Number(e.target.value) })}
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
