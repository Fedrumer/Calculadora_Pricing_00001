import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Separator } from '@/components/ui/separator'
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
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from '@/components/ui/sidebar'
import { ShieldAlert } from 'lucide-react'

export function AppSidebar() {
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

  return (
    <Sidebar variant="inset">
      <SidebarHeader className="h-16 flex justify-center border-b px-6">
        <div className="flex items-center gap-2 font-semibold text-primary">
          <ShieldAlert className="w-5 h-5 text-emerald-500" />
          <span>Motor de Cálculo</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Destino</SidebarGroupLabel>
          <SidebarGroupContent className="pt-2 pb-4 px-1">
            <Select
              value={input.destino}
              onValueChange={(v) => setInput((p) => ({ ...p, destino: v as DestinoId }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o destino" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WORLD">Mundo (exceto EUA/Canadá)</SelectItem>
                <SelectItem value="NORTH_AMERICA">EUA e Canadá</SelectItem>
                <SelectItem value="EUROPE">Europa (Tratado Schengen)</SelectItem>
                <SelectItem value="DOMESTIC">Nacional</SelectItem>
              </SelectContent>
            </Select>
          </SidebarGroupContent>
        </SidebarGroup>

        <Separator className="my-2 mx-4 w-auto" />

        <SidebarGroup>
          <SidebarGroupLabel>Período da Viagem</SidebarGroupLabel>
          <SidebarGroupContent className="flex flex-col gap-3 pt-2">
            <div className="grid gap-2">
              <Label>Data de Ínicio</Label>
              <DatePicker
                label="Selecione..."
                date={input.data_inicio}
                setDate={(d) => setInput((p) => ({ ...p, data_inicio: d }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Data de Fim</Label>
              <DatePicker
                label="Selecione..."
                date={input.data_fim}
                setDate={(d) => setInput((p) => ({ ...p, data_fim: d }))}
              />
            </div>
          </SidebarGroupContent>
        </SidebarGroup>

        <Separator className="my-2 mx-4 w-auto" />

        <SidebarGroup>
          <SidebarGroupLabel>Viajantes (Idade)</SidebarGroupLabel>
          <SidebarGroupContent className="flex flex-col gap-3 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Até 75 anos</Label>
                <Input
                  type="number"
                  min={0}
                  value={input.viajantes_por_faixa?.ate_75 || 0}
                  onChange={(e) => updateTravelers('ate_75', parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="grid gap-2">
                <Label>76 a 85 anos</Label>
                <Input
                  type="number"
                  min={0}
                  value={input.viajantes_por_faixa?.de_76_a_85 || 0}
                  onChange={(e) => updateTravelers('de_76_a_85', parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>

        <Separator className="my-2 mx-4 w-auto" />

        <SidebarGroup>
          <SidebarGroupLabel>Forma de Pagamento</SidebarGroupLabel>
          <SidebarGroupContent className="pt-2">
            <ToggleGroup
              type="single"
              className="flex flex-wrap justify-start"
              value={input.forma_pagamento}
              onValueChange={(v) => {
                if (v) setInput((p) => ({ ...p, forma_pagamento: v as FormaPagamentoId }))
              }}
            >
              {formasPagamento.map((fp) => (
                <ToggleGroupItem key={fp.codigo} value={fp.codigo} aria-label={fp.nome}>
                  {fp.nome}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </SidebarGroupContent>
        </SidebarGroup>

        <Separator className="my-2 mx-4 w-auto" />

        <SidebarGroup>
          <SidebarGroupLabel>Comissão (%)</SidebarGroupLabel>
          <SidebarGroupContent className="pt-2 pb-6 px-1">
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
              className="w-full font-mono font-medium bg-background"
            />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
