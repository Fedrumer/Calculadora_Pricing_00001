import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import pb from '@/lib/pocketbase/client'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

function CoberturaEditor({
  record,
  cobertura,
  onUpdate,
  onRemove,
}: {
  record: any
  cobertura: any
  onUpdate: (id: string, field: string, value: any) => void
  onRemove: () => void
}) {
  const [val, setVal] = useState(record.valor || '')
  const [desc, setDesc] = useState(record.descricao_customizada || '')
  const [ordem, setOrdem] = useState(record.ordem_exibicao || 0)

  useEffect(() => {
    setVal(record.valor || '')
    setDesc(record.descricao_customizada || '')
    setOrdem(record.ordem_exibicao || 0)
  }, [record])

  return (
    <div className="animate-in fade-in duration-200">
      <h3 className="text-lg font-bold mb-6 text-foreground">{cobertura.nome}</h3>

      <div className="space-y-4">
        <div>
          <Label className="text-[12px] font-[600] text-muted-foreground mb-[8px] block">
            Valor (ex: R$ 500 ou Incluído)
          </Label>
          <Input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={() => onUpdate(record.id, 'valor', val)}
            className="h-[40px] px-[12px] rounded-[8px] border border-input focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          />
        </div>

        <div>
          <Label className="text-[12px] font-[600] text-muted-foreground mb-[8px] block">
            Descrição Customizada (opcional)
          </Label>
          <Input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={() => onUpdate(record.id, 'descricao_customizada', desc)}
            className="h-[40px] px-[12px] rounded-[8px] border border-input focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          />
        </div>

        <div>
          <Label className="text-[12px] font-[600] text-muted-foreground mb-[8px] block">
            Ordem de Exibição
          </Label>
          <Input
            type="number"
            value={ordem}
            onChange={(e) => setOrdem(Number(e.target.value))}
            onBlur={() => onUpdate(record.id, 'ordem_exibicao', ordem)}
            className="h-[40px] px-[12px] rounded-[8px] border border-input focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          />
        </div>

        <Button variant="destructive" className="w-full mt-[16px]" onClick={onRemove}>
          Remover Cobertura
        </Button>
      </div>
    </div>
  )
}

export default function ProdutoCoberturasForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [produto, setProduto] = useState<any>(null)
  const [coberturas, setCoberturas] = useState<any[]>([])
  const [produtoCoberturas, setProdutoCoberturas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const prod = await pb.collection('produtos').getOne(id!)
        setProduto(prod)

        const allCoberturas = await pb.collection('coberturas').getFullList({
          sort: 'ordem_exibicao',
        })
        setCoberturas(allCoberturas)

        const prodCob = await pb.collection('produto_coberturas').getFullList({
          filter: `produto_id = "${id}"`,
        })
        setProdutoCoberturas(prodCob)

        if (allCoberturas.length > 0) {
          setSelectedId(allCoberturas[0].id)
        }
      } catch (err) {
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: 'Não foi possível carregar',
        })
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [id, toast])

  const isActive = (coberturaId: string) => {
    return produtoCoberturas.some((pc) => pc.cobertura_id === coberturaId)
  }

  const toggleCobertura = async (coberturaId: string, checked: boolean) => {
    if (checked) {
      try {
        const newRecord = await pb.collection('produto_coberturas').create({
          produto_id: id,
          cobertura_id: coberturaId,
          ativo: true,
          ordem_exibicao: 0,
          valor: '',
          descricao_customizada: '',
        })
        setProdutoCoberturas((prev) => [...prev, newRecord])
        setSelectedId(coberturaId)
      } catch (err) {
        toast({ variant: 'destructive', title: 'Erro ao adicionar cobertura' })
      }
    } else {
      const record = produtoCoberturas.find((pc) => pc.cobertura_id === coberturaId)
      if (record) {
        try {
          await pb.collection('produto_coberturas').delete(record.id)
          setProdutoCoberturas((prev) => prev.filter((pc) => pc.id !== record.id))
        } catch (err) {
          toast({ variant: 'destructive', title: 'Erro ao remover cobertura' })
        }
      }
    }
  }

  const updateCobertura = async (recordId: string, field: string, value: any) => {
    try {
      setProdutoCoberturas((prev) =>
        prev.map((pc) => (pc.id === recordId ? { ...pc, [field]: value } : pc)),
      )
      await pb.collection('produto_coberturas').update(recordId, {
        [field]: value,
      })
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro ao atualizar' })
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto w-full">
        <div className="p-6 border-b">
          <div className="flex items-center gap-4">
            <Skeleton className="w-10 h-10 rounded-md" />
            <div className="space-y-2">
              <Skeleton className="w-64 h-8" />
              <Skeleton className="w-96 h-4" />
            </div>
          </div>
        </div>
        <div className="flex flex-col md:flex-row gap-[24px] p-[24px]">
          <div className="hidden md:flex w-[320px] flex-shrink-0 flex-col bg-card border rounded-[8px] p-[16px] gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="w-4 h-4 rounded-sm mt-1" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="w-3/4 h-4" />
                  <Skeleton className="w-full h-3" />
                </div>
              </div>
            ))}
          </div>
          <div className="flex-1 p-[16px] md:p-[24px] bg-secondary/[0.02] rounded-[8px] border md:border-none min-h-[400px]">
            <Skeleton className="w-full h-full rounded-md" />
          </div>
        </div>
      </div>
    )
  }

  const selectedCobertura = coberturas.find((c) => c.id === selectedId)
  const activeRecord = produtoCoberturas.find((pc) => pc.cobertura_id === selectedId)

  return (
    <div className="max-w-7xl mx-auto w-full">
      <div className="p-6 border-b flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => navigate('/admin')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Coberturas — {produto?.nome}</h1>
          <p className="text-muted-foreground text-sm">
            Selecione as coberturas e customize os valores para este produto.
          </p>
        </div>
      </div>

      {coberturas.length === 0 ? (
        <div className="p-[24px]">
          <div className="text-center py-12 text-muted-foreground bg-card border rounded-[8px]">
            Nenhuma cobertura disponível
          </div>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row gap-[24px] p-[24px]">
          {/* Mobile Dropdown */}
          <div className="md:hidden flex flex-col gap-2 w-full">
            <Label className="text-[12px] font-[600] text-muted-foreground">
              Selecionar Cobertura
            </Label>
            <Select value={selectedId || ''} onValueChange={setSelectedId}>
              <SelectTrigger className="w-full bg-card h-[40px] rounded-[8px]">
                <SelectValue placeholder="Escolha uma cobertura..." />
              </SelectTrigger>
              <SelectContent>
                {coberturas.map((cob) => (
                  <SelectItem key={cob.id} value={cob.id}>
                    {cob.nome} {isActive(cob.id) ? '(Ativa)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Left Section - Checklist */}
          <div className="hidden md:flex w-[320px] flex-shrink-0 flex-col bg-card border rounded-[8px] p-[16px] overflow-y-auto max-h-[calc(100vh-250px)]">
            <h3 className="font-semibold mb-4 text-sm text-foreground">Coberturas</h3>
            <div className="space-y-1">
              {coberturas.map((cob) => {
                const active = isActive(cob.id)
                return (
                  <div
                    key={cob.id}
                    className={cn(
                      'p-[12px] rounded-[6px] cursor-pointer transition-colors hover:bg-secondary/[0.05] flex items-start',
                      selectedId === cob.id && 'bg-secondary/[0.05]',
                    )}
                    onClick={() => setSelectedId(cob.id)}
                  >
                    <Checkbox
                      checked={active}
                      onCheckedChange={(c) => toggleCobertura(cob.id, !!c)}
                      onClick={(e) => e.stopPropagation()}
                      className="mr-[12px] mt-1"
                    />
                    <div className="flex-1">
                      <div className="text-[14px] font-[500] leading-none text-foreground">
                        {cob.nome}
                      </div>
                      {cob.descricao && (
                        <div className="text-[12px] text-muted-foreground mt-[4px] leading-snug">
                          {cob.descricao}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right Section - Editor */}
          <div className="flex-1 p-[16px] md:p-[24px] bg-secondary/[0.02] rounded-[8px] min-h-[400px]">
            {selectedCobertura ? (
              activeRecord ? (
                <CoberturaEditor
                  key={activeRecord.id}
                  record={activeRecord}
                  cobertura={selectedCobertura}
                  onUpdate={updateCobertura}
                  onRemove={() => toggleCobertura(selectedCobertura.id, false)}
                />
              ) : (
                <div className="text-center py-12 flex flex-col items-center justify-center h-full animate-in fade-in duration-200">
                  <ShieldCheck className="w-12 h-12 text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground mb-6 text-sm">
                    Esta cobertura não está ativa para este produto.
                  </p>
                  <Button onClick={() => toggleCobertura(selectedCobertura.id, true)}>
                    Ativar Cobertura
                  </Button>
                </div>
              )
            ) : (
              <div className="text-center py-12 text-muted-foreground flex items-center justify-center h-full">
                Selecione uma cobertura para gerenciar
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
