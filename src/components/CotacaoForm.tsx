import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { DatePicker } from '@/components/ui/date-picker'
import useCotacaoStore from '@/stores/useCotacaoStore'
import { FormaPagamentoId, DestinoId } from '@/types/cotacao'
import { cn } from '@/lib/utils'

export function CotacaoForm({ className }: { className?: string }) {
  const { input, setInput, formasPagamento } = useCotacaoStore()

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
          1. Destino
        </Label>
        <RadioGroup
          value={input.destino}
          onValueChange={(v) => setInput((p) => ({ ...p, destino: v as DestinoId }))}
          className="flex flex-col gap-2 pt-1"
        >
          <div className="flex items-center space-x-2 text-blue-100">
            <RadioGroupItem
              value="DOMESTIC"
              id="dest-dom"
              className="border-blue-300 text-blue-400"
            />
            <Label htmlFor="dest-dom" className="font-normal cursor-pointer text-sm">
              Nacional
            </Label>
          </div>
          <div className="flex items-center space-x-2 text-blue-100">
            <RadioGroupItem value="WORLD" id="dest-wrl" className="border-blue-300 text-blue-400" />
            <Label htmlFor="dest-wrl" className="font-normal cursor-pointer text-sm">
              Mundo
            </Label>
          </div>
          <div className="flex items-center space-x-2 text-blue-100">
            <RadioGroupItem
              value="NORTH_AMERICA"
              id="dest-na"
              className="border-blue-300 text-blue-400"
            />
            <Label htmlFor="dest-na" className="font-normal cursor-pointer text-sm">
              Mundo + EUA
            </Label>
          </div>
        </RadioGroup>
      </div>

      <div className="space-y-2 bg-blue-900/30 p-3 rounded-lg border border-blue-800/50">
        <Label className="text-blue-50 font-medium text-xs uppercase tracking-wider">
          2. Pagamento
        </Label>
        <ToggleGroup
          type="single"
          className="flex flex-wrap justify-start gap-1 pt-1"
          value={input.forma_pagamento}
          onValueChange={(v) =>
            v && setInput((p) => ({ ...p, forma_pagamento: v as FormaPagamentoId }))
          }
        >
          {formasPagamento.map((fp) => (
            <ToggleGroupItem
              key={fp.codigo}
              value={fp.codigo}
              className="text-xs h-8 data-[state=on]:bg-blue-500 data-[state=on]:text-white text-blue-200 bg-blue-950/40 border border-transparent data-[state=on]:border-blue-400 hover:bg-blue-800"
            >
              {fp.nome}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="space-y-2 bg-blue-900/30 p-3 rounded-lg border border-blue-800/50">
        <Label className="text-blue-50 font-medium text-xs uppercase tracking-wider">
          3. Comissão (%)
        </Label>
        <Input
          type="number"
          min={0}
          max={99}
          value={((input.comissao || 0) * 100).toFixed(0)}
          onChange={(e) => {
            let val = parseInt(e.target.value) || 0
            setInput((p) => ({ ...p, comissao: Math.min(99, Math.max(0, val)) / 100 }))
          }}
          className={cn(inputStyle, 'w-full font-mono font-bold text-center')}
        />
      </div>

      <div className="space-y-2 bg-blue-900/30 p-3 rounded-lg border border-blue-800/50">
        <Label className="text-blue-50 font-medium text-xs uppercase tracking-wider">
          4. Período da Viagem
        </Label>
        <div className="grid gap-2 [&>button]:bg-white [&>button]:text-slate-900 [&>button]:h-9">
          <DatePicker
            label="Início"
            date={input.data_inicio}
            setDate={(d) => setInput((p) => ({ ...p, data_inicio: d }))}
          />
          <DatePicker
            label="Fim"
            date={input.data_fim}
            setDate={(d) => setInput((p) => ({ ...p, data_fim: d }))}
          />
        </div>
      </div>

      <div className="space-y-2 bg-blue-900/30 p-3 rounded-lg border border-blue-800/50">
        <Label className="text-blue-50 font-medium text-xs uppercase tracking-wider">
          5. Viajantes (Idade)
        </Label>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div>
            <Label className="text-[10px] text-blue-200 mb-1 block">Até 75 anos</Label>
            <Input
              type="number"
              min={0}
              className={inputStyle}
              value={input.viajantes_por_faixa?.ate_75 || 0}
              onChange={(e) => updateTravelers('ate_75', parseInt(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label className="text-[10px] text-blue-200 mb-1 block">76 a 85 anos</Label>
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
