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

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function FormasPagamentoTab() {
  const { data, loading, create, update, remove } = useAdmin('formas_pagamento')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<any>({})

  const handleOpen = (item?: any) => {
    setForm(
      item || { codigo: '', nome: '', ativo: true, pais: 'Brasil', taxa_juros: 0, max_parcelas: 1 },
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
        <h2 className="text-xl font-semibold">Formas de Pagamento Globais</h2>
        <Button onClick={() => handleOpen()}>
          <Plus className="w-4 h-4 mr-2" /> Nova Forma
        </Button>
      </div>
      <div className="overflow-x-auto border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>País</TableHead>
              <TableHead>Juros (%)</TableHead>
              <TableHead>Máx. Parcelas</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item: any) => (
              <TableRow key={item.id}>
                <TableCell className="font-mono text-sm">{item.codigo}</TableCell>
                <TableCell>{item.nome}</TableCell>
                <TableCell>{item.pais}</TableCell>
                <TableCell>{item.taxa_juros || 0}%</TableCell>
                <TableCell>{item.max_parcelas || 1}</TableCell>
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
          </TableBody>
        </Table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? 'Editar Forma de Pagamento' : 'Nova Forma'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label>Código (Ex: CARD_4X)</Label>
              <Input
                value={form.codigo}
                onChange={(e) => setForm({ ...form, codigo: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Nome de Exibição</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>País</Label>
              <Select value={form.pais} onValueChange={(v) => setForm({ ...form, pais: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o país" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Brasil">Brasil</SelectItem>
                  <SelectItem value="Argentina">Argentina</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Taxa de Juros (%)</Label>
                <Input
                  type="number"
                  value={form.taxa_juros}
                  onChange={(e) =>
                    setForm({ ...form, taxa_juros: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Máx. Parcelas</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.max_parcelas}
                  onChange={(e) =>
                    setForm({ ...form, max_parcelas: parseInt(e.target.value) || 1 })
                  }
                />
              </div>
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
