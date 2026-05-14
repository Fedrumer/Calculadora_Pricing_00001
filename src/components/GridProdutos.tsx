import { useMemo } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
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
      <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="animate-pulse p-4">
            <div className="flex gap-4">
              <Skeleton className="h-5 w-5 rounded mt-1 shrink-0" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <div className="flex gap-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-8 w-full mt-4" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    )
  }

  if (produtos_calculados.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground animate-fade-in bg-card border border-dashed rounded-xl">
        <Plane className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-lg text-center px-4">Nenhum produto encontrado com os filtros atuais.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {produtos_calculados.map((prodCalc, index) => {
        const originalProduto = produtos.find((p) => p.id === prodCalc.id)
        const isSelected = produtosSelecionados.includes(prodCalc.id)

        const qtdAte75 = prodCalc.breakdown['ate_75']?.quantidade || 0
        const qtd76a85 = prodCalc.breakdown['de_76_a_85']?.quantidade || 0

        return (
          <Card
            key={prodCalc.id}
            className={cn(
              'animate-fade-in-up transition-all duration-200 relative overflow-hidden',
              'hover:shadow-md cursor-pointer select-none group',
              isSelected
                ? 'ring-2 ring-primary border-primary bg-primary/[0.03]'
                : 'hover:border-primary/40 border-border',
            )}
            style={{ animationDelay: `${Math.min(index * 30, 500)}ms` }}
            onClick={() => onSelecaoMudou(prodCalc.id, !isSelected)}
          >
            <div className="p-3 sm:p-4 flex gap-3 sm:gap-4 items-start h-full flex-col sm:flex-row">
              <div className="flex items-center gap-3 w-full sm:w-auto border-b sm:border-b-0 pb-3 sm:pb-0 border-border/50">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(checked) => onSelecaoMudou(prodCalc.id, !!checked)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-5 h-5 shadow-sm shrink-0 data-[state=checked]:bg-primary"
                />
                <h3 className="font-semibold text-base leading-tight sm:hidden flex-1 truncate">
                  {prodCalc.nome}
                </h3>
              </div>

              <div className="flex-1 min-w-0 w-full flex flex-col justify-between h-full">
                <div>
                  <div className="hidden sm:flex justify-between items-start mb-2 gap-2">
                    <h3 className="font-semibold text-base leading-tight break-words group-hover:text-primary transition-colors">
                      {prodCalc.nome}
                    </h3>
                  </div>

                  {originalProduto?.tags && originalProduto.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {originalProduto.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="text-[10px] font-medium px-1.5 py-0 rounded-sm bg-muted/60 text-muted-foreground"
                        >
                          {tag}
                        </Badge>
                      ))}
                      <Badge
                        variant={tipo_preco === 'NET' ? 'outline' : 'default'}
                        className="text-[10px] font-medium px-1.5 py-0 rounded-sm ml-auto"
                      >
                        {tipo_preco}
                      </Badge>
                    </div>
                  )}

                  <div className="mt-2 mb-3 bg-muted/30 rounded-md p-2 flex items-center justify-between border border-border/40">
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                      Total Fatura
                    </span>
                    <span className="font-bold text-primary">
                      {formatCurrency(prodCalc.preco_total_produto, moeda)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-auto pt-3 border-t border-border/50">
                  <div className={cn('flex flex-col', qtdAte75 === 0 && 'opacity-40 grayscale')}>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5 flex flex-wrap">
                      Até 75{' '}
                      <span className="lowercase normal-case ml-1 font-normal text-muted-foreground">
                        ({qtdAte75}x)
                      </span>
                    </span>
                    {qtdAte75 > 0 ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="font-mono text-sm font-bold text-foreground cursor-help decoration-muted-foreground/30 underline decoration-dotted underline-offset-4 w-max">
                            {formatCurrency(prodCalc.breakdown['ate_75'].preco_unitario, moeda)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs font-mono p-2 z-50">
                          <p>
                            Preço Unitário:{' '}
                            {formatCurrency(prodCalc.breakdown['ate_75'].preco_unitario, moeda)}
                          </p>
                          <p>
                            Total faixa:{' '}
                            {formatCurrency(prodCalc.breakdown['ate_75'].preco_total, moeda)}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="font-mono text-sm text-muted-foreground">-</span>
                    )}
                  </div>

                  <div className={cn('flex flex-col', qtd76a85 === 0 && 'opacity-40 grayscale')}>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5 flex flex-wrap">
                      76-85{' '}
                      <span className="lowercase normal-case ml-1 font-normal text-muted-foreground">
                        ({qtd76a85}x)
                      </span>
                    </span>
                    {qtd76a85 > 0 ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="font-mono text-sm font-bold text-foreground cursor-help decoration-muted-foreground/30 underline decoration-dotted underline-offset-4 w-max">
                            {formatCurrency(prodCalc.breakdown['de_76_a_85'].preco_unitario, moeda)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs font-mono p-2 z-50">
                          <p>
                            Preço Unitário:{' '}
                            {formatCurrency(prodCalc.breakdown['de_76_a_85'].preco_unitario, moeda)}
                          </p>
                          <p>
                            Total faixa:{' '}
                            {formatCurrency(prodCalc.breakdown['de_76_a_85'].preco_total, moeda)}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="font-mono text-sm text-muted-foreground">-</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
