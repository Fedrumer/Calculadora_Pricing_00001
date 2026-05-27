import { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { GripVertical, Trash2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Cobertura {
  id: string
  nome: string
  ativo: boolean
  ordem_exibicao: number
}
interface Produto {
  id: string
  nome: string
  ativo: boolean
}
interface ProdutoCobertura {
  id: string
  produto_id: string
  cobertura_id: string
  valor: string
}

export default function Coberturas() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [coberturas, setCoberturas] = useState<Cobertura[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [produtoCoberturas, setProdutoCoberturas] = useState<ProdutoCobertura[]>([])
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [itemToDelete, setItemToDelete] = useState<string | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newNome, setNewNome] = useState('')

  const [selectedCoberturaId, setSelectedCoberturaId] = useState<string | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [cobRes, prodRes, pcRes] = await Promise.all([
        pb.collection('coberturas').getFullList<Cobertura>({ sort: 'ordem_exibicao' }),
        pb
          .collection('produtos')
          .getFullList<Produto>({ filter: 'ativo = true', sort: 'ordem_exibicao' }),
        pb.collection('produto_coberturas').getFullList<ProdutoCobertura>(),
      ])
      setCoberturas(cobRes)
      setProdutos(prodRes)
      setProdutoCoberturas(pcRes)
    } catch {
      toast({ title: 'Não foi possível carregar coberturas', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  // drag logic
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    if (!draggedId || draggedId === targetId) return

    const draggedIdx = coberturas.findIndex((c) => c.id === draggedId)
    const targetIdx = coberturas.findIndex((c) => c.id === targetId)

    const newCoberturas = [...coberturas]
    const [draggedItem] = newCoberturas.splice(draggedIdx, 1)
    newCoberturas.splice(targetIdx, 0, draggedItem)

    // optimistic update
    const updatedCoberturas = newCoberturas.map((c, i) => ({ ...c, ordem_exibicao: i }))
    setCoberturas(updatedCoberturas)

    try {
      await Promise.all(
        updatedCoberturas.map((c) =>
          pb.collection('coberturas').update(c.id, { ordem_exibicao: c.ordem_exibicao }),
        ),
      )
    } catch {
      toast({ title: 'Erro ao salvar alterações', variant: 'destructive' })
      fetchData() // revert
    }
  }

  // row actions
  const toggleAtivo = async (id: string, current: boolean) => {
    try {
      await pb.collection('coberturas').update(id, { ativo: !current })
      setCoberturas((prev) => prev.map((c) => (c.id === id ? { ...c, ativo: !current } : c)))
    } catch {
      toast({ title: 'Erro ao salvar alterações', variant: 'destructive' })
    }
  }

  const handleDelete = async () => {
    if (!itemToDelete) return
    try {
      const related = produtoCoberturas.filter((pc) => pc.cobertura_id === itemToDelete)
      await Promise.all(related.map((r) => pb.collection('produto_coberturas').delete(r.id)))
      await pb.collection('coberturas').delete(itemToDelete)

      setCoberturas((prev) => prev.filter((c) => c.id !== itemToDelete))
      setProdutoCoberturas((prev) => prev.filter((pc) => pc.cobertura_id !== itemToDelete))
      toast({ title: 'Cobertura excluída' })
    } catch {
      toast({ title: 'Erro ao salvar alterações', variant: 'destructive' })
    }
    setItemToDelete(null)
  }

  const handleCreate = async () => {
    if (!newNome.trim()) return
    try {
      const res = await pb.collection('coberturas').create({
        nome: newNome,
        ativo: true,
        ordem_exibicao: coberturas.length,
      })
      setCoberturas((prev) => [...prev, res as unknown as Cobertura])
      setNewNome('')
      setIsCreateOpen(false)
    } catch {
      toast({ title: 'Erro ao salvar alterações', variant: 'destructive' })
    }
  }

  // matrix actions
  const handleMatrixSave = async (
    coberturaId: string,
    produtoId: string,
    value: string,
    pcId?: string,
  ) => {
    try {
      if (pcId) {
        if (!value.trim()) {
          await pb.collection('produto_coberturas').delete(pcId)
          setProdutoCoberturas((prev) => prev.filter((x) => x.id !== pcId))
        } else {
          const res = await pb.collection('produto_coberturas').update(pcId, { valor: value })
          setProdutoCoberturas((prev) =>
            prev.map((x) => (x.id === pcId ? (res as unknown as ProdutoCobertura) : x)),
          )
        }
      } else if (value.trim()) {
        const res = await pb.collection('produto_coberturas').create({
          cobertura_id: coberturaId,
          produto_id: produtoId,
          valor: value,
          ativo: true,
        })
        setProdutoCoberturas((prev) => [...prev, res as unknown as ProdutoCobertura])
      }
    } catch {
      toast({ title: 'Erro ao salvar alterações', variant: 'destructive' })
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-fade-in">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Gerenciar Coberturas</h1>
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          <div className="xl:col-span-1 border rounded-lg p-2 bg-white dark:bg-zinc-950">
            <Skeleton className="h-10 w-full mb-2" />
            <Skeleton className="h-10 w-full mb-2" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="xl:col-span-3 border rounded-lg bg-white dark:bg-zinc-950 p-2">
            <Skeleton className="h-[400px] w-full" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-fade-in">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold tracking-tight">Gerenciar Coberturas</h1>
        <Button onClick={() => setIsCreateOpen(true)} className="shadow-sm">
          <Plus className="w-4 h-4 mr-2" /> Nova Cobertura
        </Button>
      </div>

      {coberturas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border border-dashed rounded-lg bg-gray-50/50 dark:bg-zinc-900/20">
          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Plus className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-lg font-medium mb-1">Nenhuma cobertura cadastrada</h2>
          <p className="text-muted-foreground mb-6 text-sm">
            Comece adicionando uma cobertura para configurar o painel de produtos.
          </p>
          <Button onClick={() => setIsCreateOpen(true)}>Nova Cobertura</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
          {/* Left Panel: List */}
          <div className="xl:col-span-1 border rounded-lg bg-white dark:bg-zinc-950 overflow-hidden shadow-sm flex flex-col h-[calc(100vh-140px)]">
            <div className="bg-gray-50 dark:bg-zinc-900 px-4 py-3 border-b font-medium text-sm text-muted-foreground flex justify-between items-center">
              <span>Lista Master</span>
              <span className="text-xs">{coberturas.length} itens</span>
            </div>
            <div className="p-2 space-y-1 overflow-y-auto flex-1 custom-scrollbar">
              {coberturas.map((c) => (
                <div
                  key={c.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, c.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, c.id)}
                  onClick={() => setSelectedCoberturaId(c.id)}
                  className={cn(
                    'flex items-center gap-3 p-2 rounded-md border bg-white dark:bg-zinc-950 cursor-pointer transition-all',
                    draggedId === c.id ? 'opacity-50 scale-[0.98]' : '',
                    selectedCoberturaId === c.id
                      ? 'border-primary ring-1 ring-primary/20 shadow-sm'
                      : 'hover:border-gray-300 dark:hover:border-zinc-700',
                  )}
                >
                  <GripVertical className="w-4 h-4 text-gray-400 cursor-grab active:cursor-grabbing hover:text-gray-600 transition-colors" />
                  <Checkbox
                    checked={c.ativo}
                    onCheckedChange={() => toggleAtivo(c.id, c.ativo)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span
                    className={cn(
                      'flex-1 text-sm truncate font-medium',
                      !c.ativo && 'text-gray-400 line-through opacity-70',
                    )}
                    title={c.nome}
                  >
                    {c.nome}
                  </span>
                  <span className="text-[10px] text-muted-foreground w-4 text-center font-mono">
                    {c.ordem_exibicao}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-sm ml-1"
                    onClick={(e) => {
                      e.stopPropagation()
                      setItemToDelete(c.id)
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Right Panel: Matrix */}
          <div className="xl:col-span-3 border rounded-lg bg-white dark:bg-zinc-950 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-140px)]">
            <div className="overflow-auto flex-1 custom-scrollbar">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="sticky top-0 z-20 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                  <tr>
                    <th className="p-3 border-b border-r border-gray-200 dark:border-zinc-800 font-medium min-w-[220px] max-w-[300px] sticky left-0 bg-gray-50 dark:bg-zinc-900 z-30 text-muted-foreground">
                      Cobertura
                    </th>
                    {produtos.map((p) => (
                      <th
                        key={p.id}
                        className="p-3 border-b border-gray-200 dark:border-zinc-800 font-medium min-w-[160px] whitespace-nowrap bg-white dark:bg-zinc-950"
                      >
                        {p.nome}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {coberturas.map((c) => (
                    <tr
                      key={c.id}
                      className={cn(
                        'border-b border-gray-100 dark:border-zinc-800/50 transition-colors group',
                        selectedCoberturaId === c.id
                          ? 'bg-blue-50/50 dark:bg-blue-900/10'
                          : c.ativo
                            ? 'hover:bg-gray-50/50 dark:hover:bg-zinc-900/30'
                            : 'bg-gray-50/80 dark:bg-zinc-900/60 opacity-[0.65]',
                      )}
                      onClick={() => setSelectedCoberturaId(c.id)}
                    >
                      <td
                        className={cn(
                          'p-3 border-r border-gray-100 dark:border-zinc-800/50 font-medium sticky left-0 z-10 transition-colors truncate max-w-[300px]',
                          selectedCoberturaId === c.id
                            ? 'bg-blue-50/80 dark:bg-blue-900/20'
                            : 'bg-white dark:bg-zinc-950 group-hover:bg-gray-50 dark:group-hover:bg-zinc-900',
                          !c.ativo && 'bg-gray-50/80 dark:bg-zinc-900/80',
                        )}
                        title={c.nome}
                      >
                        {c.nome}
                      </td>
                      {produtos.map((p) => {
                        const pc = produtoCoberturas.find(
                          (x) => x.cobertura_id === c.id && x.produto_id === p.id,
                        )
                        return (
                          <td
                            key={p.id}
                            className="p-1.5 relative border-r border-gray-100 dark:border-zinc-800/50 last:border-r-0"
                          >
                            <Input
                              defaultValue={pc?.valor || ''}
                              placeholder="Não configurado"
                              onBlur={(e) => {
                                const val = e.target.value
                                if (val !== (pc?.valor || '')) {
                                  handleMatrixSave(c.id, p.id, val, pc?.id)
                                }
                              }}
                              className="h-9 w-full bg-transparent border-transparent hover:border-gray-200 dark:hover:border-zinc-700 focus:border-primary focus:bg-white dark:focus:bg-zinc-900 transition-all rounded px-2 shadow-none placeholder:text-gray-300 dark:placeholder:text-zinc-700"
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <Dialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Cobertura</DialogTitle>
          </DialogHeader>
          <p className="text-gray-600 dark:text-gray-400 py-4">
            Tem certeza que deseja excluir esta cobertura? Isso removerá a configuração para todos
            os produtos associados de forma permanente.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemToDelete(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Modal */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Cobertura</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Nome da cobertura (ex: Despesas Médicas)"
              value={newNome}
              onChange={(e) => setNewNome(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={!newNome.trim()}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
