import { useMemo } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { AlertCircle, Plane } from 'lucide-react'
import { Produto, FormaPagamentoId, FaixaEtariaId, DestinoId } from '@/types/cotacao'
import { useCalculadoraCotacao } from '@/hooks/use-calculadora-cotacao'
import { cn } from '@/lib/utils'

export interface GridProdutosProps {
  produtos: Produto[]
  forma_pagamento?: FormaPagamentoId
  comissao: number
  viajantes_por_faixa: Record<FaixaEtariaId, number>
  data_inicio?: Date
  data_fim?: Date
  destino?: DestinoId
  produtosSelecionados: string[]
  onSelecaoMudou: (id: string, selecionado: boolean) => void
  isError?: boolean
  onRetry?: () => void
}

const formatCurrency = (val: number, currency: string = 'USD') =>
  new Intl.NumberFormat(currency === 'BRL' ? 'pt-BR' : 'en-US', {
    style: 'currency',
    currency: currency,
  }).format(val)

export function GridProdutos({
  produtos,
  forma_pagamento,
  comissao,
  viajantes_por_faixa,
  data_inicio,
  data_fim,
  destino,
  produtosSelecionados,
  onSelecaoMudou,
  isError = false,
  onRetry,
}: GridProdutosProps) {
  const input = useMemo(
    () => ({
      produtos,
      forma_pagamento,
      comissao,
      viajantes_por_faixa,
      data_inicio,
      data_fim,
      destino,
    }),
    [produtos, forma_pagamento, comissao, viajantes_por_faixa, data_inicio, data_fim, destino],
  )

  const { produtos_calculados, tipo_preco, moeda, carregando, erros } = useCalculadoraCotacao(input)

  if (isError || erros.length > 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-fade-in text-center">
        <AlertCircle className="w-12 h-12 text-destructive mb-4" />
        <p className="text-lg font-medium text-destructive mb-4">
          Ocorreu um erro ao carregar os produtos
        </p>
        <Button onClick={() => (onRetry ? onRetry() : window.location.reload())} variant="outline">
          Tentar novamente
        </Button>
      </div>
    )
  }

  if (carregando) {
    return (
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="animate-pulse flex flex-col">
            <CardHeader className="pb-4">
              <Skeleton className="h-6 w-3/4 mb-2" />
              <Skeleton className="h-4 w-1/4" />
            </CardHeader>
            <CardContent className="flex-grow">
              <Skeleton className="h-32 w-full" />
            </CardContent>
            <CardFooter>
              <Skeleton className="h-8 w-full" />
            </CardFooter>
          </Card>
        ))}
      </div>
    )
  }

  if (produtos_calculados.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground animate-fade-in">
        <Plane className="w-12 h-12 mb-4 opacity-50" />
        <p>Nenhum produto disponível</p>
      </div>
    )
  }

  return (
    <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {produtos_calculados.map((prodCalc, index) => {
        const originalProduto = produtos.find((p) => p.id === prodCalc.id)
        const isSelected = produtosSelecionados.includes(prodCalc.id)

        return (
          <Card
            key={prodCalc.id}
            className={cn(
              'animate-fade-in-up transition-all duration-300 relative flex flex-col',
              isSelected ? 'ring-2 ring-primary border-primary' : 'hover:border-primary/50',
            )}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <CardHeader className="bg-muted/30 pb-4 flex flex-row items-start justify-between space-y-0">
              <div className="flex items-start space-x-3">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(checked) => onSelecaoMudou(prodCalc.id, !!checked)}
                  className="mt-1"
                />
                <div>
                  <CardTitle className="text-xl text-primary leading-tight">
                    {prodCalc.nome}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground font-mono mt-1">ID: {prodCalc.id}</p>
                </div>
              </div>
              <span
                className={cn(
                  'text-[10px] font-bold px-2 py-1 rounded-sm tracking-wider',
                  tipo_preco === 'NET'
                    ? 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                    : 'bg-emerald-200 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300',
                )}
              >
                {tipo_preco}
              </span>
            </CardHeader>
            <CardContent className="pt-6 flex-grow overflow-x-auto">
              <Table className="min-w-full">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="whitespace-nowrap text-xs">Faixa Etária</TableHead>
                    {originalProduto &&
                      Object.keys(originalProduto.destinos).map((dest) => (
                        <TableHead key={dest} className="text-right whitespace-nowrap text-xs">
                          {dest === 'WORLD'
                            ? 'Mundo'
                            : dest === 'NORTH_AMERICA'
                              ? 'América do Norte'
                              : dest === 'EUROPE'
                                ? 'Europa'
                                : dest}
                        </TableHead>
                      ))}
                    <TableHead className="text-right font-bold whitespace-nowrap text-xs">
                      Total
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(prodCalc.breakdown).map(([faixa, data]) => {
                    if (data.quantidade === 0) return null
                    const faixaLabel = faixa === 'ate_75' ? 'Até 75' : '76-85'

                    return (
                      <TableRow key={faixa} className="hover:bg-muted/50">
                        <TableCell className="font-medium whitespace-nowrap text-xs">
                          {faixaLabel}
                          <span className="ml-1 text-muted-foreground">({data.quantidade}x)</span>
                        </TableCell>

                        {originalProduto &&
                          Object.keys(originalProduto.destinos).map((dest) => {
                            const isCurrentDest = dest === destino
                            const base = forma_pagamento
                              ? originalProduto.precos_base_por_forma_pagamento[forma_pagamento]
                              : 0
                            const fator =
                              originalProduto.faixas_etarias[faixa as FaixaEtariaId]
                                .fator_multiplicador
                            const agravo =
                              originalProduto.destinos[dest as DestinoId].agravo_percentual
                            const net = base * fator * (1 + agravo)
                            const unitPrice = comissao > 0 ? net / (1 - comissao) : net

                            return (
                              <TableCell
                                key={dest}
                                className={cn(
                                  'text-right font-mono text-[11px]',
                                  isCurrentDest
                                    ? 'text-foreground font-semibold'
                                    : 'text-muted-foreground',
                                )}
                              >
                                {formatCurrency(unitPrice, moeda)}
                              </TableCell>
                            )
                          })}

                        <TableCell className="text-right font-mono font-bold text-[11px]">
                          {formatCurrency(data.preco_total, moeda)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
            <CardFooter className="bg-muted/10 border-t flex justify-between items-center py-4 mt-auto">
              <span className="text-sm text-muted-foreground font-medium">Subtotal</span>
              <span className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {formatCurrency(prodCalc.preco_total_produto, moeda)}
              </span>
            </CardFooter>
          </Card>
        )
      })}
    </div>
  )
}
