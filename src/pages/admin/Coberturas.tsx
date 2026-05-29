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
import { Trash2, Plus, Loader2, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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
  moeda: string
  ativo: boolean
}

export default function Coberturas() {
  const { toast } = useToast()
  const isMobile = useIsMobile()
  const [loading, setLoading] = useState(true)
  const [coberturas, setCoberturas] = useState<Cobertura[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [produtoCoberturas, setProdutoCoberturas] = useState<ProdutoCobertura[]>([])

  const [selectedCoberturaId, setSelectedCoberturaId] = useState<string | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [itemToDelete, setItemToDelete] = useState<string | null>(null)

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newNome, setNewNome] = useState('')

  const [editingCell, setEditingCell] = useState<{ cId: string; pId: string } | null>(null)
  const [savingCell, setSavingCell] = useState<{ cId: string; pId: string } | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (isMobile && selectedCoberturaId) {
      const el = document.getElementById(`row-${selectedCoberturaId}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [selectedCoberturaId, isMobile])

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

    const updatedCoberturas = newCoberturas.map((c, i) => ({ ...c, ordem_exibicao: i }))
    setCoberturas(updatedCoberturas)

    try {
      await Promise.all(
        updatedCoberturas.map((c) =>
          pb.collection('coberturas').update(c.id, { ordem_exibicao: c.ordem_exibicao }),
        ),
      )
    } catch {
      toast({ title: 'Erro ao reordenar', variant: 'destructive' })
      fetchData()
    }
    setDraggedId(null)
  }

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
      if (selectedCoberturaId === itemToDelete) setSelectedCoberturaId(null)
      toast({ title: 'Cobertura excluída' })
    } catch {
      toast({ title: 'Erro ao excluir', variant: 'destructive' })
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
      toast({ title: 'Erro ao criar', variant: 'destructive' })
    }
  }

  const handleBlur = async (
    e: React.FocusEvent<HTMLInputElement>,
    cId: string,
    pId: string,
    pc?: ProdutoCobertura,
  ) => {
    const rawValue = e.target.value.trim()
    setEditingCell(null)

    let newMoeda = pc?.moeda || ''
    let newValor = rawValue

    const match = rawValue.match(/^([A-Za-z]{3})\s+(.*)$/)
    if (match) {
      newMoeda = match[1].toUpperCase()
      newValor = match[2].trim()
    } else if (rawValue === '') {
      newMoeda = ''
    }

    const currentDisplay = pc ? (pc.moeda ? `${pc.moeda} ${pc.valor}` : pc.valor) : ''

    if (
      rawValue === currentDisplay ||
      (newValor === (pc?.valor || '') && newMoeda === (pc?.moeda || ''))
    ) {
      return
    }

    setSavingCell({ cId, pId })
    try {
      if (pc?.id) {
        if (!newValor) {
          await pb.collection('produto_coberturas').delete(pc.id)
          setProdutoCoberturas((prev) => prev.filter((x) => x.id !== pc.id))
        } else {
          const res = await pb
            .collection('produto_coberturas')
            .update(pc.id, { valor: newValor, moeda: newMoeda })
          setProdutoCoberturas((prev) =>
            prev.map((x) => (x.id === pc.id ? (res as unknown as ProdutoCobertura) : x)),
          )
        }
      } else if (newValor) {
        const res = await pb.collection('produto_coberturas').create({
          cobertura_id: cId,
          produto_id: pId,
          valor: newValor,
          moeda: newMoeda,
          ativo: true,
        })
        setProdutoCoberturas((prev) => [...prev, res as unknown as ProdutoCobertura])
      }
    } catch {
      toast({ title: 'Erro ao salvar valor', variant: 'destructive' })
    } finally {
      setSavingCell(null)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-[calc(100vh-80px)] p-[24px] gap-[24px] max-w-[1600px] mx-auto animate-fade-in">
        <div className="flex justify-between items-center shrink-0">
          <Skeleton className="h-[32px] w-[240px]" />
          <Skeleton className="h-[40px] w-[160px]" />
        </div>
        <div className="flex flex-col md:flex-row gap-[24px] flex-1 min-h-0">
          {!isMobile && <Skeleton className="w-[280px] shrink-0 h-full rounded-[8px]" />}
          <div className="flex-1 rounded-lg border border-border bg-background shadow-sm overflow-hidden flex flex-col">
            <div className="flex border-b border-border bg-secondary/5">
              <Skeleton className="h-[48px] w-[200px] rounded-none border-r border-border shrink-0" />
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-[48px] w-[160px] rounded-none border-r border-border shrink-0"
                />
              ))}
            </div>
            {Array.from({ length: 5 }).map((_, r) => (
              <div key={r} className="flex border-b border-border">
                <Skeleton className="h-[48px] w-[200px] rounded-none border-r border-border shrink-0" />
                {Array.from({ length: 4 }).map((_, c) => (
                  <div key={c} className="h-[48px] w-[160px] border-r border-border shrink-0 p-3">
                    <Skeleton className="h-full w-full" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] p-[24px] gap-[24px] max-w-[1600px] mx-auto animate-fade-in">
      <div className="flex justify-between items-center shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Gerenciar Coberturas</h1>
        <Button onClick={() => setIsCreateOpen(true)} className="shadow-sm">
          <Plus className="w-4 h-4 mr-2" /> Nova Cobertura
        </Button>
      </div>

      {coberturas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border rounded-[8px] bg-secondary/5 flex-1 min-h-0">
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
        <div className="flex flex-col md:flex-row gap-[24px] flex-1 min-h-0">
          {!isMobile ? (
            <div className="w-[280px] shrink-0 bg-secondary/5 rounded-[8px] p-[16px] flex flex-col gap-1 overflow-y-auto custom-scrollbar border border-border/50">
              {coberturas.map((c) => (
                <div
                  key={c.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, c.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, c.id)}
                  onClick={() => setSelectedCoberturaId(c.id)}
                  className={cn(
                    'group flex items-center p-[12px] rounded-[6px] transition-colors cursor-grab active:cursor-grabbing border-l-[4px]',
                    draggedId === c.id && 'opacity-50 scale-[0.98]',
                    selectedCoberturaId === c.id
                      ? 'bg-primary/10 border-primary'
                      : 'bg-transparent hover:bg-secondary/10 border-transparent',
                  )}
                >
                  <GripVertical className="w-4 h-4 text-muted-foreground/50 mr-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Checkbox
                    className="mr-[8px] shrink-0"
                    checked={c.ativo}
                    onCheckedChange={() => toggleAtivo(c.id, c.ativo)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="text-xs font-mono text-muted-foreground/70 w-5 shrink-0 text-center">
                    {c.ordem_exibicao}
                  </span>
                  <span
                    className={cn(
                      'flex-1 text-[14px] font-medium truncate ml-1',
                      !c.ativo && 'text-muted-foreground line-through opacity-70',
                    )}
                    title={c.nome}
                  >
                    {c.nome}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100 transition-opacity ml-1 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      setItemToDelete(c.id)
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="shrink-0">
              <Select value={selectedCoberturaId || ''} onValueChange={setSelectedCoberturaId}>
                <SelectTrigger className="w-full bg-background border-border">
                  <SelectValue placeholder="Selecionar Cobertura" />
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
          )}

          <div className="flex-1 overflow-auto rounded-[8px] border border-border bg-background shadow-sm custom-scrollbar relative">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="sticky top-0 z-20 shadow-sm">
                <tr>
                  <th className="bg-secondary/5 font-semibold text-foreground p-[12px] border-b border-r border-border sticky left-0 z-30 w-[180px] min-w-[180px] md:w-[200px] md:min-w-[200px]">
                    Cobertura
                  </th>
                  {produtos.map((p) => (
                    <th
                      key={p.id}
                      className="bg-secondary/5 font-semibold text-foreground p-[12px] border-b border-r border-border w-[140px] min-w-[140px] md:w-[160px] md:min-w-[160px]"
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
                    id={`row-${c.id}`}
                    className={cn(
                      'h-[48px] hover:bg-accent/5 transition-colors group',
                      selectedCoberturaId === c.id
                        ? 'bg-primary/5 dark:bg-primary/10'
                        : 'bg-background',
                    )}
                  >
                    <td
                      className={cn(
                        'p-[12px] border-b border-r border-border sticky left-0 z-10 transition-colors truncate font-medium',
                        selectedCoberturaId === c.id
                          ? 'bg-primary/10'
                          : 'bg-background group-hover:bg-accent/5',
                        !c.ativo && 'opacity-60 line-through',
                      )}
                      title={c.nome}
                    >
                      {c.nome}
                    </td>
                    {produtos.map((p) => {
                      const pc = produtoCoberturas.find(
                        (x) => x.cobertura_id === c.id && x.produto_id === p.id,
                      )
                      const isEditing = editingCell?.cId === c.id && editingCell?.pId === p.id
                      const isSaving = savingCell?.cId === c.id && savingCell?.pId === p.id

                      const displayValue = pc
                        ? pc.moeda
                          ? `${pc.moeda} ${pc.valor}`
                          : pc.valor
                        : 'Não configurado'
                      const isCellActive = pc ? pc.ativo : false
                      const textColor = !pc
                        ? 'text-muted-foreground/70 italic text-xs'
                        : isCellActive
                          ? 'text-green-600 dark:text-green-500 font-medium'
                          : 'text-gray-500 dark:text-gray-400 font-medium'

                      return (
                        <td
                          key={p.id}
                          className="p-[12px] border-b border-r border-border cursor-text relative hover:bg-accent/5 transition-colors"
                          onClick={() => {
                            if (!isSaving && !isEditing) setEditingCell({ cId: c.id, pId: p.id })
                          }}
                        >
                          <div className="flex items-center justify-start h-full min-h-[20px]">
                            {isEditing ? (
                              <div className="absolute inset-0 flex items-center px-[6px]">
                                <Input
                                  autoFocus
                                  defaultValue={
                                    pc ? (pc.moeda ? `${pc.moeda} ${pc.valor}` : pc.valor) : ''
                                  }
                                  className="h-[36px] px-[8px] rounded-[4px] focus-visible:ring-2 focus-visible:ring-primary w-full border-input dark:border-gray-600 bg-background shadow-sm text-sm"
                                  onBlur={(e) => handleBlur(e, c.id, p.id, pc)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') e.currentTarget.blur()
                                    if (e.key === 'Escape') {
                                      e.currentTarget.value = pc
                                        ? pc.moeda
                                          ? `${pc.moeda} ${pc.valor}`
                                          : pc.valor
                                        : ''
                                      e.currentTarget.blur()
                                    }
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                {isSaving ? (
                                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                ) : (
                                  <span className={cn('truncate block w-full', textColor)}>
                                    {displayValue}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Cobertura</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground py-4">
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
