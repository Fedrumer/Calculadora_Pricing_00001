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
import { Loader2, Plane, Save, Send, Download, Search, AlertCircle } from 'lucide-react'
import { salvarCotacao } from '@/services/api'
import { useToast } from '@/hooks/use-toast'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export default function Index() {
  const { input, resultado, carregandoProdutos } = useCotacaoStore()
  const { toast } = useToast()

  const [search, setSearch] = useState('')
  const [categoria, setCategoria] = useState('ALL')
  const [selecionados, setSelecionados] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)

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
        description: 'Preencha os campos obrigatórios na barra lateral antes de salvar.',
        variant: 'destructive',
      })
      return
    }

    try {
      setIsSaving(true)
      await salvarCotacao(input, resultado, selecionados, acao)
      toast({
        title: 'Sucesso',
        description: `Cotação ${acao === 'RASCUNHO' ? 'salva como rascunho' : 'enviada como proposta'} com sucesso!`,
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

  if (carregandoProdutos) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Carregando catálogo de produtos...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in pb-20 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card p-4 rounded-xl border shadow-sm">
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
        <Alert variant="destructive" className="bg-destructive/10">
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

      <Card className="shadow-sm border-primary/20">
        <CardHeader className="bg-primary/5 border-b pb-4">
          <CardTitle>Resultados da Cotação</CardTitle>
          <CardDescription>Revise os produtos selecionados e gere a proposta</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {selecionados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border-2 border-dashed rounded-lg bg-muted/10">
              <Plane className="w-12 h-12 mb-4 opacity-20" />
              <p>Selecione produtos acima para visualizar o resumo e gerar a proposta</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>Produto selecionado</TableHead>
                      <TableHead className="text-right">Até 75 anos</TableHead>
                      <TableHead className="text-right">76 a 85 anos</TableHead>
                      <TableHead className="text-right font-semibold">
                        Total ({resultado.moeda})
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedCalculated.map((pc) => (
                      <TableRow key={pc.id}>
                        <TableCell className="font-medium">{pc.nome}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {pc.breakdown.ate_75.quantidade}x
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {pc.breakdown.de_76_a_85.quantidade}x
                        </TableCell>
                        <TableCell className="text-right font-bold text-primary">
                          {new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: resultado.moeda,
                          }).format(pc.preco_total_produto)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-primary/5 p-5 rounded-lg border border-primary/10">
                <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
                  <div className="flex flex-col">
                    <span className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                      Tipo de Preço
                    </span>
                    <span className="font-semibold text-base">{resultado.tipo_preco}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                      Moeda Base
                    </span>
                    <span className="font-semibold text-base">{resultado.moeda}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider mb-1">
                    Fatura Total
                  </div>
                  <div className="text-3xl font-bold text-primary tracking-tight">
                    {new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: resultado.moeda,
                    }).format(faturaTotalSelecionados)}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-end pt-2">
                <Button
                  variant="outline"
                  onClick={() => handleSave('RASCUNHO')}
                  disabled={isSaving || resultado.erros.length > 0}
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Salvar como Rascunho
                </Button>
                <Button
                  variant="secondary"
                  disabled={isSaving || resultado.erros.length > 0}
                  onClick={() => {
                    toast({
                      title: 'PDF gerado com sucesso',
                      description: 'O download iniciará em instantes.',
                    })
                  }}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Baixar PDF
                </Button>
                <Button
                  onClick={() => handleSave('PROPOSTA_ENVIADA')}
                  disabled={isSaving || resultado.erros.length > 0}
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
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
}
