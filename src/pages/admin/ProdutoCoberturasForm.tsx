import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Trash2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import pb from '@/lib/pocketbase/client'

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
    <div className="border p-4 rounded-md relative space-y-4 bg-white shadow-sm">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 text-red-500 hover:text-red-700 hover:bg-red-50"
        onClick={onRemove}
      >
        <Trash2 className="w-4 h-4" />
      </Button>
      <h4 className="font-semibold pr-8 text-sm">{cobertura.nome}</h4>

      <div className="space-y-2">
        <Label className="text-xs">Valor (Ex: R$ 500 ou Incluído)</Label>
        <Input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => onUpdate(record.id, 'valor', val)}
          className="h-8 text-sm"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Descrição Customizada</Label>
        <Input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={() => onUpdate(record.id, 'descricao_customizada', desc)}
          className="h-8 text-sm"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Ordem de Exibição</Label>
        <Input
          type="number"
          value={ordem}
          onChange={(e) => setOrdem(Number(e.target.value))}
          onBlur={() => onUpdate(record.id, 'ordem_exibicao', ordem)}
          className="h-8 text-sm"
        />
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
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-1/3" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-4 border-b pb-4">
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
        <div className="text-center py-12 text-muted-foreground">Nenhuma cobertura disponível</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          {/* Coluna Esquerda: Checklist */}
          <div className="bg-slate-50 p-4 rounded-lg border space-y-2 max-h-[70vh] overflow-y-auto">
            <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-slate-500">
              Coberturas Disponíveis
            </h3>
            {coberturas.map((cob) => {
              const isActive = produtoCoberturas.some((pc) => pc.cobertura_id === cob.id)
              return (
                <div
                  key={cob.id}
                  className={`flex items-start gap-3 p-3 rounded-md border transition-colors ${
                    isActive
                      ? 'bg-white border-blue-200 shadow-sm'
                      : 'bg-transparent border-transparent hover:bg-slate-100'
                  }`}
                >
                  <Checkbox
                    id={`cob-${cob.id}`}
                    checked={isActive}
                    onCheckedChange={(c) => toggleCobertura(cob.id, !!c)}
                    className="mt-1"
                  />
                  <div className="grid gap-1.5 leading-none">
                    <label
                      htmlFor={`cob-${cob.id}`}
                      className="text-sm font-medium leading-none cursor-pointer"
                    >
                      {cob.nome}
                    </label>
                    {cob.descricao && (
                      <p className="text-xs text-muted-foreground">{cob.descricao}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Coluna Direita: Editores */}
          <div className="bg-slate-50 p-4 rounded-lg border space-y-4 max-h-[70vh] overflow-y-auto">
            <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-slate-500">
              Configuração das Coberturas Ativas
            </h3>
            {produtoCoberturas.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground flex flex-col items-center gap-2">
                <ShieldCheck className="w-8 h-8 text-slate-300" />
                <p className="text-sm">Nenhuma cobertura ativa para este produto.</p>
              </div>
            ) : (
              produtoCoberturas
                .sort((a, b) => (a.ordem_exibicao || 0) - (b.ordem_exibicao || 0))
                .map((pc) => {
                  const cob = coberturas.find((c) => c.id === pc.cobertura_id)
                  if (!cob) return null
                  return (
                    <CoberturaEditor
                      key={pc.id}
                      record={pc}
                      cobertura={cob}
                      onUpdate={updateCobertura}
                      onRemove={() => toggleCobertura(cob.id, false)}
                    />
                  )
                })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
