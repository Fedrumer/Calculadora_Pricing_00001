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
import { Switch } from '@/components/ui/switch'
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
import { Alert, AlertDescription } from '@/components/ui/alert'

export function ProdutoCoberturasTab({ produtoId }: { produtoId: string }) {
  const { data, loading, create, update, remove } = useAdmin('produto_coberturas')
  const [coberturas, setCoberturas] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<any>({})

  useEffect(() => {
    pb.collection('coberturas').getFullList({ sort: 'ordem_exibicao' }).then(setCoberturas)
  }, [])

  if (produtoId === 'all') {
    return (
      <Alert>
        <AlertDescription>
          Selecione um produto específico no topo da página para gerenciar suas coberturas.
        </AlertDescription>
      </Alert>
    )
  }

  const handleOpen = (item?: any) => {
    setForm(
      item || {
        produto_id: produtoId,
        cobertura_id: '',
        valor: '',
        descricao_customizada: '',
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

  const filteredData = data
    .filter((d: any) => d.produto_id === produtoId)
    .sort((a: any, b: any) => (a.ordem_exibicao || 0) - (b.ordem_exibicao || 0))

  if (loading) return <div className="p-4 text-center text-gray-500">Carregando...</div>

  const getCoberturaNome = (id: string) => coberturas.find((c) => c.id === id)?.nome || id

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Coberturas do Produto</h2>
        <Button onClick={() => handleOpen()}>
          <Plus className="w-4 h-4 mr-2" /> Adicionar Cobertura
        </Button>
      </div>
      <div className="overflow-x-auto border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ordem</TableHead>
              <TableHead>Cobertura</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Desc. Customizada</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.map((item: any) => (
              <TableRow key={item.id}>
                <TableCell>{item.ordem_exibicao}</TableCell>
                <TableCell>{getCoberturaNome(item.cobertura_id)}</TableCell>
                <TableCell>{item.valor}</TableCell>
                <TableCell>{item.descricao_customizada}</TableCell>
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
            {filteredData.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
                  Nenhuma cobertura associada a este produto.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {form.id ? 'Editar Cobertura do Produto' : 'Adicionar Cobertura'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label>Cobertura</Label>
              <Select
                value={form.cobertura_id}
                onValueChange={(v) => setForm({ ...form, cobertura_id: v })}
                disabled={!!form.id}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma cobertura" />
                </SelectTrigger>
                <SelectContent>
                  {coberturas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Valor (Ex: R$ 500 ou Incluído)</Label>
              <Input
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Descrição Customizada (Opcional)</Label>
              <Input
                value={form.descricao_customizada}
                onChange={(e) => setForm({ ...form, descricao_customizada: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Ordem de Exibição (Opcional)</Label>
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
