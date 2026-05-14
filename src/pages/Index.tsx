import { useState, useMemo } from 'react'
import useCotacaoStore from '@/stores/useCotacaoStore'
import { GridProdutos } from '@/components/GridProdutos'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { salvarCotacao } from '@/services/api'
import { useToast } from '@/hooks/use-toast'
import { Search, Filter } from 'lucide-react'

export default function Index() {
  const { input, resultado, carregandoProdutos } = useCotacaoStore()
  const [selecionados, setSelecionados] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)

  const [busca, setBusca] = useState('')
  const [categoriaSelecionada, setCategoriaSelecionada] = useState<string>('todas')
  const [tagSelecionada, setTagSelecionada] = useState<string>('todas')

  const { toast } = useToast()

  const handleSelecaoMudou = (id: string, selecionado: boolean) => {
    setSelecionados((prev) => (selecionado ? [...prev, id] : prev.filter((pId) => pId !== id)))
  }

  const handleSalvar = async () => {
    setSalvando(true)
    try {
      await salvarCotacao(input, resultado, selecionados)
      toast({
        title: 'Cotação Salva',
        description: 'A cotação foi salva com sucesso no sistema.',
      })
      setSelecionados([])
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err.message || 'Ocorreu um erro inesperado.',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  const categorias = useMemo(() => {
    const cats = new Set<string>()
    input.produtos?.forEach((p) => {
      if (p.categoria) cats.add(p.categoria)
    })
    return Array.from(cats).sort()
  }, [input.produtos])

  const tags = useMemo(() => {
    const ts = new Set<string>()
    input.produtos?.forEach((p) => {
      if (p.tags) p.tags.forEach((t) => ts.add(t))
    })
    return Array.from(ts).sort()
  }, [input.produtos])

  const produtosFiltrados = useMemo(() => {
    let prods = input.produtos || []

    if (busca.trim()) {
      const lower = busca.toLowerCase()
      prods = prods.filter((p) => p.nome.toLowerCase().includes(lower))
    }

    if (categoriaSelecionada !== 'todas') {
      prods = prods.filter((p) => p.categoria === categoriaSelecionada)
    }

    if (tagSelecionada !== 'todas') {
      prods = prods.filter((p) => p.tags && p.tags.includes(tagSelecionada))
    }

    return prods
  }, [input.produtos, busca, categoriaSelecionada, tagSelecionada])

  return (
    <div className="container max-w-7xl mx-auto py-6 sm:py-8 px-4 sm:px-6">
      <div className="mb-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 animate-fade-in-down">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-1 sm:mb-2">
            Cotação de Seguro Viagem
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Compare os produtos disponíveis e selecione a melhor opção para sua viagem.
          </p>
        </div>
        <Button
          onClick={handleSalvar}
          disabled={selecionados.length === 0 || salvando}
          size="lg"
          className="w-full lg:w-auto font-semibold"
        >
          {salvando ? 'Salvando...' : `Salvar Cotação (${selecionados.length})`}
        </Button>
      </div>

      <div className="bg-card border rounded-lg p-3 sm:p-4 mb-6 shadow-sm flex flex-col md:flex-row gap-3 animate-fade-in">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar produto pelo nome..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9 bg-background w-full"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 md:w-[400px]">
          <Select value={categoriaSelecionada} onValueChange={setCategoriaSelecionada}>
            <SelectTrigger className="w-full bg-background">
              <div className="flex items-center gap-2">
                <Filter className="h-3 w-3 text-muted-foreground" />
                <SelectValue placeholder="Categoria" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas Categorias</SelectItem>
              {categorias.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={tagSelecionada} onValueChange={setTagSelecionada}>
            <SelectTrigger className="w-full bg-background">
              <div className="flex items-center gap-2">
                <Filter className="h-3 w-3 text-muted-foreground" />
                <SelectValue placeholder="Tags" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas Tags</SelectItem>
              {tags.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {carregandoProdutos ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground animate-pulse font-medium">
            Carregando produtos disponíveis...
          </p>
        </div>
      ) : (
        <GridProdutos
          produtos={produtosFiltrados}
          forma_pagamento={input.forma_pagamento}
          comissao={input.comissao || 0}
          viajantes_por_faixa={input.viajantes_por_faixa || { ate_75: 0, de_76_a_85: 0 }}
          data_inicio={input.data_inicio}
          data_fim={input.data_fim}
          destino={input.destino}
          produtosSelecionados={selecionados}
          onSelecaoMudou={handleSelecaoMudou}
        />
      )}
    </div>
  )
}
