import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DatePicker } from '@/components/ui/date-picker'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, ChevronsUpDown } from 'lucide-react'
import useCotacaoStore from '@/stores/useCotacaoStore'
import { FormaPagamentoId } from '@/types/cotacao'
import { cn } from '@/lib/utils'
import { useMemo } from 'react'
import { useTranslation } from '@/hooks/use-translation'
import { useAuth } from '@/hooks/use-auth'

export function CotacaoForm({ className }: { className?: string }) {
  const { input, setInput, formasPagamento } = useCotacaoStore()
  const { t } = useTranslation()
  const { user } = useAuth()

  const formasPagamentoFiltradas = useMemo(() => {
    return (formasPagamento || []).filter(
      (fp: any) =>
        !fp.pais || fp.pais === 'Todos' || user?.pais === 'Todos' || fp.pais === user?.pais,
    )
  }, [formasPagamento, user?.pais])

  const fpSelecionada = formasPagamentoFiltradas.find(
    (fp: any) => fp.codigo === input.forma_pagamento,
  )

  const produtosDisponiveis = useMemo(() => {
    let prods = input.produtos || []
    if (input.filtro_tag) {
      prods = prods.filter((p) => p.tags?.includes(input.filtro_tag!))
    }
    const uniqueNames = Array.from(new Set(prods.map((p) => p.nome)))
    return uniqueNames.sort()
  }, [input.produtos, input.filtro_tag])

  const updateTravelers = (key: 'ate_75' | 'de_76_a_85', value: number) => {
    setInput((prev) => ({
      ...prev,
      viajantes_por_faixa: { ...prev.viajantes_por_faixa!, [key]: Math.max(0, value) },
    }))
  }

  const inputStyle =
    'bg-white text-slate-900 border-white/20 shadow-sm focus-visible:ring-blue-400 h-9'

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="space-y-2 bg-blue-900/30 p-3 rounded-lg border border-blue-800/50">
        <Label className="text-blue-50 font-medium text-xs uppercase tracking-wider">
          {t('form.filters')}
        </Label>
        <ToggleGroup
          type="single"
          className="flex flex-wrap justify-start gap-1 pt-1"
          value={input.filtro_tag || 'TODOS'}
          onValueChange={(v) => {
            if (v) {
              setInput((p) => ({
                ...p,
                filtro_tag: v === 'TODOS' ? undefined : v,
                filtro_nome: [], // reseta nome ao mudar tag
              }))
            }
          }}
        >
          <ToggleGroupItem
            value="TODOS"
            className="text-[10px] sm:text-xs h-7 sm:h-8 px-2 data-[state=on]:bg-blue-500 data-[state=on]:text-white text-blue-200 bg-blue-950/40 border border-transparent data-[state=on]:border-blue-400 hover:bg-blue-800"
          >
            {t('form.show_all')}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="B2B"
            className="text-[10px] sm:text-xs h-7 sm:h-8 px-2 data-[state=on]:bg-blue-500 data-[state=on]:text-white text-blue-200 bg-blue-950/40 border border-transparent data-[state=on]:border-blue-400 hover:bg-blue-800"
          >
            {t('form.b2b')}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="B2C"
            className="text-[10px] sm:text-xs h-7 sm:h-8 px-2 data-[state=on]:bg-blue-500 data-[state=on]:text-white text-blue-200 bg-blue-950/40 border border-transparent data-[state=on]:border-blue-400 hover:bg-blue-800"
          >
            {t('form.b2c')}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="Acordo"
            className="text-[10px] sm:text-xs h-7 sm:h-8 px-2 data-[state=on]:bg-blue-500 data-[state=on]:text-white text-blue-200 bg-blue-950/40 border border-transparent data-[state=on]:border-blue-400 hover:bg-blue-800"
          >
            {t('form.agreement')}
          </ToggleGroupItem>
        </ToggleGroup>

        <div className="pt-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full justify-between h-9 bg-white text-slate-900 border-white/20 shadow-sm focus-visible:ring-blue-400 font-normal hover:bg-white/90"
              >
                <div className="flex gap-1 items-center overflow-hidden flex-1">
                  {!input.filtro_nome || input.filtro_nome.length === 0 ? (
                    <span className="truncate">{t('form.filter_placeholder')}</span>
                  ) : (
                    <>
                      <Badge
                        variant="secondary"
                        className="rounded-sm px-1.5 font-normal h-5 shrink-0 bg-blue-100 text-blue-900 hover:bg-blue-100 border-blue-200"
                      >
                        {input.filtro_nome.length} {t('form.items_selected')}
                      </Badge>
                      <span className="truncate text-xs text-muted-foreground ml-1 hidden sm:inline">
                        {input.filtro_nome.join(', ')}
                      </span>
                    </>
                  )}
                </div>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
              <Command>
                <CommandInput placeholder={t('form.search_product')} className="h-9" />
                <CommandList>
                  <CommandEmpty>{t('form.no_products_found')}</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      onSelect={() => {
                        setInput((p) => ({ ...p, filtro_nome: [] }))
                      }}
                      className="cursor-pointer"
                    >
                      <div
                        className={cn(
                          'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                          !input.filtro_nome || input.filtro_nome.length === 0
                            ? 'bg-primary text-primary-foreground'
                            : 'opacity-50 [&_svg]:invisible',
                        )}
                      >
                        <Check className="h-3 w-3" />
                      </div>
                      <span
                        className={
                          !input.filtro_nome || input.filtro_nome.length === 0 ? 'font-bold' : ''
                        }
                      >
                        {t('form.all_products')}
                      </span>
                    </CommandItem>

                    {produtosDisponiveis.map((nome) => {
                      const isSelected = input.filtro_nome?.includes(nome) ?? false
                      return (
                        <CommandItem
                          key={nome}
                          onSelect={() => {
                            setInput((p) => {
                              const current = p.filtro_nome || []
                              if (isSelected) {
                                return {
                                  ...p,
                                  filtro_nome: current.filter((n) => n !== nome),
                                }
                              } else {
                                return { ...p, filtro_nome: [...current, nome] }
                              }
                            })
                          }}
                          className="cursor-pointer"
                        >
                          <div
                            className={cn(
                              'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                              isSelected
                                ? 'bg-primary text-primary-foreground'
                                : 'opacity-50 [&_svg]:invisible',
                            )}
                          >
                            <Check className="h-3 w-3" />
                          </div>
                          <span>{nome}</span>
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="space-y-2 bg-blue-900/30 p-3 rounded-lg border border-blue-800/50">
        <Label className="text-blue-50 font-medium text-xs uppercase tracking-wider">
          {t('form.payment')}
        </Label>
        {formasPagamentoFiltradas.length === 0 ? (
          <p className="text-xs text-blue-200 pt-2 italic">
            {t('form.no_payment_methods')} {user?.pais || 'sua região'}
          </p>
        ) : (
          <ToggleGroup
            type="single"
            className="flex flex-wrap justify-start gap-1 pt-1"
            value={input.forma_pagamento}
            onValueChange={(v) => {
              if (v) {
                const fp = formasPagamentoFiltradas.find((f: any) => f.codigo === v)
                setInput((p) => ({
                  ...p,
                  forma_pagamento: v as FormaPagamentoId,
                  taxa_juros: fp?.taxa_juros || 0,
                  parcelas: 1,
                }))
              }
            }}
          >
            {formasPagamentoFiltradas.map((fp: any) => (
              <ToggleGroupItem
                key={fp.codigo}
                value={fp.codigo}
                className="text-xs h-8 data-[state=on]:bg-blue-500 data-[state=on]:text-white text-blue-200 bg-blue-950/40 border border-transparent data-[state=on]:border-blue-400 hover:bg-blue-800"
              >
                {fp.nome}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}

        {fpSelecionada && fpSelecionada.max_parcelas > 1 && (
          <div className="mt-3">
            <Label className="text-[10px] text-blue-200 mb-1 block">
              Parcelas (Máx {fpSelecionada.max_parcelas})
            </Label>
            <Input
              type="number"
              min={1}
              max={fpSelecionada.max_parcelas}
              value={input.parcelas || 1}
              onChange={(e) => {
                let val = parseInt(e.target.value) || 1
                setInput((p) => ({
                  ...p,
                  parcelas: Math.min(fpSelecionada.max_parcelas, Math.max(1, val)),
                }))
              }}
              className={cn(inputStyle, 'w-24 font-mono text-center')}
            />
          </div>
        )}
      </div>

      <div className="space-y-2 bg-blue-900/30 p-3 rounded-lg border border-blue-800/50">
        <Label className="text-blue-50 font-medium text-xs uppercase tracking-wider">
          {t('form.taxes_commissions')}
        </Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <Label className="text-[10px] text-blue-200 mb-1 block">{t('form.markup')}</Label>
            <Input
              type="number"
              min={0}
              max={199}
              placeholder="0"
              value={((input.markup || 0) * 100).toFixed(0)}
              onChange={(e) => {
                let val = parseInt(e.target.value) || 0
                setInput((p) => ({ ...p, markup: Math.min(199, Math.max(0, val)) / 100 }))
              }}
              className={cn(inputStyle, 'w-full font-mono font-bold text-center')}
            />
          </div>
          <div>
            <Label className="text-[10px] text-blue-200 mb-1 block">{t('form.commission')}</Label>
            <Input
              type="number"
              min={0}
              max={60}
              value={((input.comissao || 0) * 100).toFixed(0)}
              onChange={(e) => {
                let val = parseInt(e.target.value) || 0
                setInput((p) => ({ ...p, comissao: Math.min(99, Math.max(0, val)) / 100 }))
              }}
              className={cn(inputStyle, 'w-full font-mono font-bold text-center')}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2 bg-blue-900/30 p-3 rounded-lg border border-blue-800/50 overflow-hidden w-full">
        <Label className="text-blue-50 font-medium text-xs uppercase tracking-wider">
          {t('form.period')}
        </Label>
        <div className="flex flex-col gap-2 w-full min-w-0">
          <div className="w-full overflow-hidden [&_button]:w-full [&_button]:h-9 [&_button]:px-2 [&_button]:text-xs [&_button]:bg-white [&_button]:text-slate-900 [&_button]:justify-start [&_button_span]:truncate [&_button_span]:w-full [&_button_span]:text-left">
            <DatePicker
              label={t('form.start')}
              date={input.data_inicio}
              setDate={(d) => setInput((p) => ({ ...p, data_inicio: d }))}
            />
          </div>
          <div className="w-full overflow-hidden [&_button]:w-full [&_button]:h-9 [&_button]:px-2 [&_button]:text-xs [&_button]:bg-white [&_button]:text-slate-900 [&_button]:justify-start [&_button_span]:truncate [&_button_span]:w-full [&_button_span]:text-left">
            <DatePicker
              label={t('form.end')}
              date={input.data_fim}
              setDate={(d) => setInput((p) => ({ ...p, data_fim: d }))}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2 bg-blue-900/30 p-3 rounded-lg border border-blue-800/50">
        <Label className="text-blue-50 font-medium text-xs uppercase tracking-wider">
          {t('form.travelers')}
        </Label>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div>
            <Label className="text-[10px] text-blue-200 mb-1 block">{t('form.up_to_75')}</Label>
            <Input
              type="number"
              min={0}
              className={inputStyle}
              value={input.viajantes_por_faixa?.ate_75 || 0}
              onChange={(e) => updateTravelers('ate_75', parseInt(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label className="text-[10px] text-blue-200 mb-1 block">{t('form.76_to_85')}</Label>
            <Input
              type="number"
              min={0}
              className={inputStyle}
              value={input.viajantes_por_faixa?.de_76_a_85 || 0}
              onChange={(e) => updateTravelers('de_76_a_85', parseInt(e.target.value) || 0)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
