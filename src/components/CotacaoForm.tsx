import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DatePicker } from '@/components/ui/date-picker'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import useCotacaoStore from '@/stores/useCotacaoStore'
import { FormaPagamentoId, DestinoId } from '@/types/cotacao'
import { MapPin, CalendarDays, Users, CreditCard, Percent } from 'lucide-react'
import { cn } from '@/lib/utils'

export function CotacaoForm({ className }: { className?: string }) {
  const { input, setInput, formasPagamento } = useCotacaoStore()

  const updateTravelers = (key: 'ate_75' | 'de_76_a_85', value: number) => {
    setInput((prev) => ({
      ...prev,
      viajantes_por_faixa: {
        ...prev.viajantes_por_faixa!,
        [key]: Math.max(0, value),
      },
    }))
  }

  // Common input styles for better contrast against dark blue gradient
  const inputStyle = 'bg-white text-slate-900 border-white/20 shadow-sm focus-visible:ring-blue-400'

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <div className="space-y-3">
        <Label className="flex items-center gap-2 text-blue-50 font-medium">
          <MapPin className="w-4 h-4 text-blue-400" /> Destino
        </Label>
        <Select
          value={input.destino}
          onValueChange={(v) => setInput((p) => ({ ...p, destino: v as DestinoId }))}
        >
          <SelectTrigger className={inputStyle}>
            <SelectValue placeholder="Selecione o destino" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="WORLD">Mundo (exceto EUA/Canadá)</SelectItem>
            <SelectItem value="NORTH_AMERICA">EUA e Canadá</SelectItem>
            <SelectItem value="EUROPE">Europa (Tratado Schengen)</SelectItem>
            <SelectItem value="DOMESTIC">Nacional</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <Label className="flex items-center gap-2 text-blue-50 font-medium">
          <CalendarDays className="w-4 h-4 text-blue-400" /> Período da Viagem
        </Label>
        <div className="grid gap-3 p-3 bg-blue-900/30 rounded-lg border border-blue-800/50">
          <div className="grid gap-1.5">
            <Label className="text-xs text-blue-200">Data de Ínicio</Label>
            <div className="[&>button]:bg-white [&>button]:text-slate-900">
              <DatePicker
                label="Selecione..."
                date={input.data_inicio}
                setDate={(d) => setInput((p) => ({ ...p, data_inicio: d }))}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-blue-200">Data de Fim</Label>
            <div className="[&>button]:bg-white [&>button]:text-slate-900">
              <DatePicker
                label="Selecione..."
                date={input.data_fim}
                setDate={(d) => setInput((p) => ({ ...p, data_fim: d }))}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <Label className="flex items-center gap-2 text-blue-50 font-medium">
          <Users className="w-4 h-4 text-blue-400" /> Viajantes (Idade)
        </Label>
        <div className="grid grid-cols-2 gap-3 p-3 bg-blue-900/30 rounded-lg border border-blue-800/50">
          <div className="grid gap-1.5">
            <Label className="text-xs text-blue-200">Até 75 anos</Label>
            <Input
              type="number"
              min={0}
              className={inputStyle}
              value={input.viajantes_por_faixa?.ate_75 || 0}
              onChange={(e) => updateTravelers('ate_75', parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-blue-200">76 a 85 anos</Label>
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

      <div className="space-y-3">
        <Label className="flex items-center gap-2 text-blue-50 font-medium">
          <CreditCard className="w-4 h-4 text-blue-400" /> Forma de Pagamento
        </Label>
        <ToggleGroup
          type="single"
          className="flex flex-wrap justify-start bg-blue-900/40 p-1.5 rounded-lg border border-blue-800/50"
          value={input.forma_pagamento}
          onValueChange={(v) => {
            if (v) setInput((p) => ({ ...p, forma_pagamento: v as FormaPagamentoId }))
          }}
        >
          {formasPagamento.map((fp) => (
            <ToggleGroupItem
              key={fp.codigo}
              value={fp.codigo}
              aria-label={fp.nome}
              className="data-[state=on]:bg-blue-500 data-[state=on]:text-white hover:bg-blue-800/50 text-blue-100 transition-colors"
            >
              {fp.nome}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="space-y-3">
        <Label className="flex items-center gap-2 text-blue-50 font-medium">
          <Percent className="w-4 h-4 text-blue-400" /> Comissão (%)
        </Label>
        <div className="relative">
          <Input
            type="number"
            min={0}
            max={99}
            value={((input.comissao || 0) * 100).toFixed(0)}
            onChange={(e) => {
              let val = parseInt(e.target.value)
              if (isNaN(val)) val = 0
              if (val > 99) val = 99
              if (val < 0) val = 0
              setInput((p) => ({ ...p, comissao: val / 100 }))
            }}
            className={cn(inputStyle, 'w-full font-mono font-bold text-lg pl-10')}
          />
          <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        </div>
      </div>
    </div>
  )
}
