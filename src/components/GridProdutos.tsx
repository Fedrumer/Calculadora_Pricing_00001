import { useMemo } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AlertCircle, Plane } from 'lucide-react'
import { Produto, FormaPagamentoId, FaixaEtariaId } from '@/types/cotacao'
import { useCalculadoraCotacao } from '@/hooks/use-calculadora-cotacao'
import useCotacaoStore from '@/stores/useCotacaoStore'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/hooks/use-translation'
import { getCurrentCountry, getCurrencyForCountry } from '@/lib/country'
import { useExchangeRate } from '@/hooks/use-exchange-rate'

export interface GridProdutosProps {
  produtos: Produto[]
  forma_pagamento?: FormaPagamentoId
  comissao: number
  markup?: number
  viajantes_por_faixa: Record<FaixaEtariaId, number>
  data_inicio?: Date
  data_fim?: Date
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
  markup = 0,
  viajantes_por_faixa,
  data_inicio,
  data_fim,
  produtosSelecionados,
  onSelecaoMudou,
  isError = false,
  onRetry,
}: GridProdutosProps) {
  const { input: storeInput } = useCotacaoStore()
  const { t } = useTranslation()

  const country = getCurrentCountry()
  const localCurrency = country === 'Todos' ? 'BRL' : getCurrencyForCountry(country)
  const exchangeRate = useExchangeRate(localCurrency)

  const formatLocalCurrency = (val: number, prodMoeda: string) => {
    if (!exchangeRate || prodMoeda !== 'USD') return null
    const converted = val * exchangeRate
    return new Intl.NumberFormat(localCurrency === 'BRL' ? 'pt-BR' : 'es-AR', {
      style: 'currency',
      currency: localCurrency,
      maximumFractionDigits: 2,
    }).format(converted)
  }

  const produtosFiltrados = useMemo(() => {
    return produtos
      .filter((p) => {
        const matchTag =
          storeInput.filtro_tag && storeInput.filtro_tag !== 'TODOS'
            ? p.tags?.includes(storeInput.filtro_tag)
            : true
        const matchNome =
          storeInput.filtro_nome && storeInput.filtro_nome !== 'TODOS'
            ? p.nome === storeInput.filtro_nome
            : true
        return matchTag && matchNome
      })
      .sort((a, b) => (a.ordem_exibicao || 999) - (b.ordem_exibicao || 999))
  }, [produtos, storeInput.filtro_tag, storeInput.filtro_nome])

  const input = useMemo(
    () => ({
      produtos: produtosFiltrados,
      forma_pagamento,
      comissao,
      markup,
      viajantes_por_faixa,
      data_inicio,
      data_fim,
    }),
    [
      produtosFiltrados,
      forma_pagamento,
      comissao,
      markup,
      viajantes_por_faixa,
      data_inicio,
      data_fim,
    ],
  )

  const { produtos_calculados, tipo_preco, moeda, carregando, erros } = useCalculadoraCotacao(input)

  if (isError || erros.length > 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-fade-in text-center">
        <AlertCircle className="w-12 h-12 text-destructive mb-4" />
        <p className="text-lg font-medium text-destructive mb-4">{t('grid.error_loading')}</p>
        <Button onClick={() => (onRetry ? onRetry() : window.location.reload())} variant="outline">
          {t('grid.try_again')}
        </Button>
      </div>
    )
  }

  if (carregando) {
    return (
      <div className="grid gap-4 sm:gap-5 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="animate-pulse p-5 rounded-xl border-border/50">
            <div className="flex gap-4">
              <Skeleton className="h-5 w-5 rounded mt-1 shrink-0" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <div className="flex gap-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-10 w-full mt-4 rounded-lg" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    )
  }

  if (produtos_calculados.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground animate-fade-in bg-card/50 border border-dashed border-border/60 rounded-xl backdrop-blur-sm">
        <Plane className="w-16 h-16 mb-5 opacity-40 animate-float" />
        <p className="text-lg text-center px-4 font-medium">{t('grid.no_products')}</p>
        <p className="text-sm text-center px-4 mt-2 opacity-70">{t('grid.adjust_filters')}</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:gap-5 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {produtos_calculados.map((prodCalc, index) => {
        const originalProduto = produtos.find((p) => p.id === prodCalc.id)
        const isSelected = produtosSelecionados.includes(prodCalc.id)

        const qtdAte75 = prodCalc.breakdown['ate_75']?.quantidade || 0
        const qtd76a85 = prodCalc.breakdown['de_76_a_85']?.quantidade || 0

        return (
          <Card
            key={prodCalc.id}
            className={cn(
              'animate-fade-in-up transition-all duration-300 relative overflow-hidden rounded-xl',
              'hover:shadow-xl hover:-translate-y-1 cursor-pointer select-none group flex flex-col',
              isSelected
                ? 'ring-2 ring-primary border-primary bg-primary/[0.03] shadow-md'
                : 'hover:border-primary/40 border-border/60 shadow-sm bg-card',
            )}
            style={{ animationDelay: `${Math.min(index * 30, 500)}ms` }}
            onClick={() => onSelecaoMudou(prodCalc.id, !isSelected)}
          >
            {isSelected && (
              <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[10px] font-bold px-3 py-1 rounded-bl-xl z-10 shadow-sm flex items-center gap-1 animate-fade-in-down">
                {t('grid.selected')}
              </div>
            )}

            <div className="p-4 sm:p-5 flex gap-3 sm:gap-4 items-start flex-col sm:flex-row flex-1">
              <div className="flex items-center gap-3 w-full sm:w-auto border-b sm:border-b-0 pb-3 sm:pb-0 border-border/50 mt-0.5">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(checked) => onSelecaoMudou(prodCalc.id, !!checked)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-5 h-5 shadow-sm shrink-0 data-[state=checked]:bg-primary transition-transform duration-200"
                />
                <h3 className="font-semibold text-base leading-tight sm:hidden flex-1 truncate pr-16 text-foreground">
                  {prodCalc.nome}
                </h3>
              </div>

              <div className="flex-1 min-w-0 w-full flex flex-col h-full">
                <div className="flex-1">
                  <div className="hidden sm:flex justify-between items-start mb-3 gap-2">
                    <h3 className="font-semibold text-[1.05rem] leading-tight break-words group-hover:text-primary transition-colors text-foreground">
                      {prodCalc.nome}
                    </h3>
                  </div>

                  {originalProduto?.tags && originalProduto.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {originalProduto.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-secondary/80 text-secondary-foreground"
                        >
                          {tag}
                        </Badge>
                      ))}
                      <Badge
                        variant={tipo_preco === 'NET' ? 'outline' : 'default'}
                        className={cn(
                          'text-[10px] font-bold px-2 py-0.5 rounded-md ml-auto',
                          tipo_preco === 'NET' ? 'border-primary/50 text-primary' : '',
                        )}
                      >
                        {tipo_preco}
                      </Badge>
                    </div>
                  )}

                  <div className="mt-2 mb-4 bg-blue-50/60 dark:bg-blue-950/20 rounded-lg p-3 flex items-center justify-between border border-blue-100 dark:border-blue-900/50 transition-colors group-hover:bg-blue-50 dark:group-hover:bg-blue-900/40">
                    <span className="text-xs text-blue-700/80 dark:text-blue-400/80 font-bold uppercase tracking-wider line-clamp-1 mr-2">
                      {t('grid.total_invoice')}
                    </span>
                    <div className="flex flex-col items-end">
                      <span className="font-extrabold text-lg text-blue-700 dark:text-blue-400 tracking-tight whitespace-nowrap">
                        {formatCurrency(prodCalc.preco_total_produto, moeda)}
                      </span>
                      {exchangeRate && moeda === 'USD' && (
                        <span className="text-[11px] text-muted-foreground font-semibold">
                          ~ {formatLocalCurrency(prodCalc.preco_total_produto, moeda)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {(() => {
                  const hasAte75 =
                    qtdAte75 > 0 && (prodCalc.breakdown['ate_75']?.preco_unitario || 0) > 0
                  const has76a85 =
                    qtd76a85 > 0 && (prodCalc.breakdown['de_76_a_85']?.preco_unitario || 0) > 0

                  if (!hasAte75 && !has76a85) {
                    return (
                      <div className="mt-auto pt-4 border-t border-border/60 flex items-center justify-center">
                        <span className="text-sm font-medium text-muted-foreground text-center">
                          {t('grid.no_age_range')}
                        </span>
                      </div>
                    )
                  }

                  return (
                    <div
                      className={cn(
                        'grid gap-4 mt-auto pt-4 border-t border-border/60',
                        hasAte75 && has76a85 ? 'grid-cols-2' : 'grid-cols-1',
                      )}
                    >
                      {hasAte75 && (
                        <div className="flex flex-col">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1 flex flex-wrap items-center">
                            {t('grid.up_to_75_short')}{' '}
                            <span className="lowercase normal-case ml-1 font-normal text-muted-foreground/70 bg-muted px-1 rounded-sm">
                              {qtdAte75}x
                            </span>
                          </span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex flex-col w-max">
                                <span className="font-mono text-[15px] font-bold text-green-600 dark:text-green-500 cursor-help decoration-green-600/30 underline decoration-dotted underline-offset-4">
                                  {formatCurrency(
                                    prodCalc.breakdown['ate_75'].preco_unitario,
                                    moeda,
                                  )}
                                </span>
                                {exchangeRate && moeda === 'USD' && (
                                  <span className="text-[10px] text-muted-foreground font-semibold">
                                    ~{' '}
                                    {formatLocalCurrency(
                                      prodCalc.breakdown['ate_75'].preco_unitario,
                                      moeda,
                                    )}
                                  </span>
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs font-mono p-3 z-50 shadow-xl border-green-200 dark:border-green-900">
                              <p className="text-green-600 dark:text-green-400 font-bold mb-1">
                                {t('grid.base_price')}:{' '}
                                {formatCurrency(prodCalc.breakdown['ate_75'].preco_unitario, moeda)}
                              </p>
                              <p className="text-muted-foreground">
                                {t('grid.total')}:{' '}
                                {formatCurrency(prodCalc.breakdown['ate_75'].preco_total, moeda)}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      )}

                      {has76a85 && (
                        <div
                          className={cn(
                            'flex flex-col',
                            hasAte75 && 'border-l border-border/50 pl-4',
                          )}
                        >
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1 flex flex-wrap items-center">
                            76-85{' '}
                            <span className="lowercase normal-case ml-1 font-normal text-muted-foreground/70 bg-muted px-1 rounded-sm">
                              {qtd76a85}x
                            </span>
                          </span>
                          {(() => {
                            const basePrice = prodCalc.breakdown['ate_75']?.preco_unitario || 0
                            const thisPrice = prodCalc.breakdown['de_76_a_85'].preco_unitario
                            const isAgravo = thisPrice > basePrice
                            const textColorClass = isAgravo
                              ? 'text-red-600 dark:text-red-500'
                              : 'text-blue-600 dark:text-blue-400'

                            return (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex flex-col w-max">
                                    <span
                                      className={cn(
                                        'font-mono text-[15px] font-bold cursor-help underline decoration-dotted underline-offset-4',
                                        textColorClass,
                                        isAgravo
                                          ? 'decoration-red-600/30'
                                          : 'decoration-blue-600/30',
                                      )}
                                    >
                                      {formatCurrency(thisPrice, moeda)}
                                    </span>
                                    {exchangeRate && moeda === 'USD' && (
                                      <span className="text-[10px] text-muted-foreground font-semibold">
                                        ~ {formatLocalCurrency(thisPrice, moeda)}
                                      </span>
                                    )}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent
                                  className={cn(
                                    'text-xs font-mono p-3 z-50 shadow-xl',
                                    isAgravo
                                      ? 'border-red-200 dark:border-red-900'
                                      : 'border-blue-200 dark:border-blue-900',
                                  )}
                                >
                                  <p className={cn('font-bold mb-1', textColorClass)}>
                                    {isAgravo
                                      ? t('grid.price_with_aggravation')
                                      : t('grid.unit_price')}
                                    : {formatCurrency(thisPrice, moeda)}
                                  </p>
                                  <p className="text-muted-foreground">
                                    {t('grid.total')}:{' '}
                                    {formatCurrency(
                                      prodCalc.breakdown['de_76_a_85'].preco_total,
                                      moeda,
                                    )}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            )
                          })()}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
