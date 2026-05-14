import React, { useState } from 'react'
import useCotacaoStore from '@/stores/useCotacaoStore'
import { GridProdutos } from '@/components/GridProdutos'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import {
  Loader2,
  Plane,
  Save,
  Send,
  Download,
  Search,
  AlertCircle,
  ChevronDown,
  CheckCircle2,
} from 'lucide-react'
import { salvarCotacao } from '@/services/api'
import { useToast } from '@/hooks/use-toast'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CotacaoForm } from '@/components/CotacaoForm'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

export default function Index() {
  const { input, resultado, carregandoProdutos } = useCotacaoStore()
  const { toast } = useToast()

  const [search, setSearch] = useState('')
  const [categoria, setCategoria] = useState('ALL')
  const [selecionados, setSelecionados] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isTableOpen, setIsTableOpen] = useState(true)

  const handleSelecao = (id: string, selecionado: boolean) => {
    setSelecionados((prev) => (selecionado ? [...prev, id] : prev.filter((x) => x !== id)))
  }

  const produtos = input.produtos || []
  const categorias = Array.from(
    new Set(produtos.map((p) => p.categoria).filter(Boolean) as string[]),
  )

  const produtosFiltrados = produtos.filter((p) => {
    if (search && !p.nome.toLowerCase().includes(search.toLowerCase())) return false
    if (categoria !== 'ALL' && p.categoria !== categoria) return false
    return true
  })

  const selectedCalculated = resultado.produtos_calculados.filter((pc) =>
    selecionados.includes(pc.id),
  )
  const faturaTotalSelecionados = selectedCalculated.reduce(
    (acc, pc) => acc + pc.preco_total_produto,
    0,
  )

  const handleSave = async (acao: 'RASCUNHO' | 'PROPOSTA_ENVIADA') => {
    if (selecionados.length === 0) {
      toast({
        title: 'Atenção',
        description: 'Selecione ao menos um produto.',
        variant: 'destructive',
      })
      return
    }
    if (resultado.erros.length > 0) {
      toast({
        title: 'Atenção',
        description: 'Preencha os campos obrigatórios antes de salvar.',
        variant: 'destructive',
      })
      return
    }

    try {
      setIsSaving(true)
      await salvarCotacao(input, resultado, selecionados, acao)
      toast({
        title: acao === 'RASCUNHO' ? 'Rascunho salvo!' : 'Proposta enviada!',
        description:
          acao === 'RASCUNHO'
            ? 'Sua cotação foi salva nos rascunhos com sucesso.'
            : 'A proposta foi gerada e enviada com sucesso.',
        action: (
          <div className="flex items-center text-green-500">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        ),
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err.message || 'Erro desconhecido',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const MainView = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card p-4 rounded-xl shadow-sm border border-border/60">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar produto por nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9"
          />
        </div>
        <div className="w-full sm:w-64 shrink-0">
          <Select value={categoria} onValueChange={setCategoria}>
            <SelectTrigger>
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas as categorias</SelectItem>
              {categorias.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {resultado.erros.length > 0 && (
        <Alert variant="destructive" className="bg-destructive/10 animate-fade-in">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Ação Necessária</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4 mt-2 text-sm font-medium">
              {resultado.erros.map((erro, idx) => (
                <li key={idx}>{erro}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <GridProdutos
        produtos={produtosFiltrados}
        forma_pagamento={input.forma_pagamento}
        comissao={input.comissao || 0}
        viajantes_por_faixa={input.viajantes_por_faixa || { ate_75: 0, de_76_a_85: 0 }}
        data_inicio={input.data_inicio}
        data_fim={input.data_fim}
        destino={input.destino}
        produtosSelecionados={selecionados}
        onSelecaoMudou={handleSelecao}
        isError={false}
      />

      <Card className="shadow-lg border-primary/20 overflow-hidden bg-card/50 backdrop-blur-sm">
        <CardHeader className="bg-gradient-to-r from-primary/10 to-transparent border-b pb-4">
          <CardTitle className="text-xl">Resultados da Cotação</CardTitle>
          <CardDescription>Revise os produtos selecionados e gere a proposta</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {selecionados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border-2 border-dashed rounded-lg bg-muted/20 transition-all hover:bg-muted/40">
              <Plane className="w-12 h-12 mb-4 opacity-20 animate-float" />
              <p>Selecione produtos acima para visualizar o resumo e gerar a proposta</p>
            </div>
          ) : (
            <div className="space-y-6">
              <Collapsible
                open={isTableOpen}
                onOpenChange={setIsTableOpen}
                className="rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden"
              >
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full flex items-center justify-between p-4 h-auto hover:bg-muted/50 rounded-none"
                  >
                    <span className="font-semibold text-base">Tabela de Detalhes</span>
                    <ChevronDown
                      className={cn(
                        'h-5 w-5 text-muted-foreground transition-transform duration-300',
                        isTableOpen && 'rotate-180',
                      )}
                    />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="animate-accordion-down overflow-hidden">
                  <div className="w-full overflow-x-auto pb-2 border-t">
                    <Table className="min-w-[600px]">
                      <TableHeader className="bg-muted/30">
                        <TableRow>
                          <TableHead>Produto selecionado</TableHead>
                          <TableHead className="text-right">
                            Até 75 anos{' '}
                            <span className="text-xs text-green-600 dark:text-green-500 block">
                              (Base)
                            </span>
                          </TableHead>
                          <TableHead className="text-right">
                            76 a 85 anos{' '}
                            <span className="text-xs text-red-500 block">(Agravo)</span>
                          </TableHead>
                          <TableHead className="text-right font-semibold text-blue-600 dark:text-blue-400">
                            Total ({resultado.moeda})
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedCalculated.map((pc) => {
                          const basePrice = pc.breakdown.ate_75.preco_unitario
                          const olderPrice = pc.breakdown.de_76_a_85.preco_unitario
                          const isAgravo = olderPrice > basePrice

                          return (
                            <TableRow key={pc.id} className="hover:bg-muted/20 transition-colors">
                              <TableCell className="font-medium">{pc.nome}</TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {pc.breakdown.ate_75.quantidade}x
                                <span className="text-green-600 dark:text-green-500 font-medium ml-1">
                                  (
                                  {new Intl.NumberFormat('en-US', {
                                    style: 'currency',
                                    currency: resultado.moeda,
                                  }).format(pc.breakdown.ate_75.preco_total)}
                                  )
                                </span>
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {pc.breakdown.de_76_a_85.quantidade}x
                                <span
                                  className={cn(
                                    'font-medium ml-1',
                                    isAgravo ? 'text-red-500' : 'text-blue-500 dark:text-blue-400',
                                  )}
                                >
                                  (
                                  {new Intl.NumberFormat('en-US', {
                                    style: 'currency',
                                    currency: resultado.moeda,
                                  }).format(pc.breakdown.de_76_a_85.preco_total)}
                                  )
                                </span>
                              </TableCell>
                              <TableCell className="text-right font-bold text-blue-600 dark:text-blue-400">
                                {new Intl.NumberFormat('en-US', {
                                  style: 'currency',
                                  currency: resultado.moeda,
                                }).format(pc.preco_total_produto)}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-950/40 dark:to-blue-900/20 p-6 rounded-lg border border-blue-200 dark:border-blue-800 shadow-inner">
                <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
                  <div className="flex flex-col">
                    <span className="text-blue-700/70 dark:text-blue-300/70 text-[10px] font-bold uppercase tracking-wider">
                      Tipo de Preço
                    </span>
                    <span className="font-bold text-blue-900 dark:text-blue-100 text-lg">
                      {resultado.tipo_preco}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-blue-700/70 dark:text-blue-300/70 text-[10px] font-bold uppercase tracking-wider">
                      Moeda Base
                    </span>
                    <span className="font-bold text-blue-900 dark:text-blue-100 text-lg">
                      {resultado.moeda}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-blue-700/70 dark:text-blue-300/70 text-[10px] font-bold uppercase tracking-wider mb-1">
                    Fatura Total
                  </div>
                  <div className="text-4xl font-extrabold text-blue-700 dark:text-blue-400 tracking-tight drop-shadow-sm">
                    {new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: resultado.moeda,
                    }).format(faturaTotalSelecionados)}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-end pt-4">
                <Button
                  variant="outline"
                  size="lg"
                  className="hover:bg-primary/5 hover:text-primary transition-colors border-primary/20"
                  onClick={() => handleSave('RASCUNHO')}
                  disabled={isSaving || resultado.erros.length > 0}
                >
                  {isSaving ? (
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-5 h-5 mr-2" />
                  )}
                  Salvar Rascunho
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  className="bg-secondary/80 hover:bg-secondary transition-colors"
                  disabled={isSaving || resultado.erros.length > 0}
                  onClick={() => {
                    toast({
                      title: 'PDF gerado com sucesso',
                      description: 'O download iniciará em instantes.',
                      action: <CheckCircle2 className="w-5 h-5 text-green-500" />,
                    })
                  }}
                >
                  <Download className="w-5 h-5 mr-2" />
                  Baixar PDF
                </Button>
                <Button
                  size="lg"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5"
                  onClick={() => handleSave('PROPOSTA_ENVIADA')}
                  disabled={isSaving || resultado.erros.length > 0}
                >
                  {isSaving ? (
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5 mr-2" />
                  )}
                  Enviar Proposta
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )

  if (carregandoProdutos) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <span className="ml-3 text-lg font-medium text-muted-foreground animate-pulse">
          Carregando catálogo...
        </span>
      </div>
    )
  }

  return (
    <div className="animate-fade-in pb-20 max-w-7xl mx-auto px-2 sm:px-0">
      <div className="md:hidden">
        <Tabs defaultValue="resultado" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="formulario" className="text-sm">
              Formulário
            </TabsTrigger>
            <TabsTrigger value="resultado" className="text-sm">
              Resultado
            </TabsTrigger>
          </TabsList>
          <TabsContent value="formulario" className="mt-0">
            <Card className="bg-gradient-to-b from-blue-950 to-blue-900 border-none shadow-xl p-6 rounded-xl">
              <CotacaoForm />
            </Card>
          </TabsContent>
          <TabsContent value="resultado" className="mt-0">
            <MainView />
          </TabsContent>
        </Tabs>
      </div>
      <div className="hidden md:block">
        <MainView />
      </div>
    </div>
  )
}
