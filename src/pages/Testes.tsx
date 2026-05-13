import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { calcularCotacao } from '@/lib/calculadora'
import { mockProdutos } from '@/data/mock-produtos'
import { addDays } from 'date-fns'

function formatCurrency(val: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val)
}

function TestCase({ title, description, input, expectedFatura }: any) {
  const result = useMemo(() => calcularCotacao(input), [input])
  const passed = Math.abs(result.fatura_total - expectedFatura) < 0.01

  return (
    <Card className="mb-4 shadow-sm">
      <CardHeader className="py-4">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          </div>
          <Badge
            variant={passed ? 'default' : 'destructive'}
            className={passed ? 'bg-emerald-500' : ''}
          >
            {passed ? 'PASS' : 'FAIL'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="py-2 pb-4 bg-muted/20 border-t font-mono text-sm grid grid-cols-2 gap-4">
        <div>
          <span className="text-muted-foreground block mb-1">Resultado Calculado:</span>
          {result.erros.length > 0 ? (
            <span className="text-red-500">Erro: {result.erros[0]}</span>
          ) : (
            <span className="font-bold">{formatCurrency(result.fatura_total)}</span>
          )}
        </div>
        <div>
          <span className="text-muted-foreground block mb-1">Esperado:</span>
          <span className="font-bold">{formatCurrency(expectedFatura)}</span>
        </div>
      </CardContent>
    </Card>
  )
}

export default function Testes() {
  const baseDate = new Date()
  const data_inicio = baseDate
  const data_fim = addDays(baseDate, 9) // 10 days trip

  return (
    <div className="container max-w-4xl mx-auto py-10 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Suite de Testes da Calculadora</h1>
        <p className="text-muted-foreground">
          Validação automatizada do motor de cálculo com casos de teste predefinidos baseados em
          `mockProdutos`.
        </p>
      </div>

      <div className="space-y-6">
        <section>
          <h2 className="text-xl font-semibold mb-4 border-b pb-2">
            Casos A: Diferença de Comissão
          </h2>
          <TestCase
            title="A1: Sem Comissão (NET)"
            description="10 dias, 1 Viajante (até 75), Pagamento PIX, Destino WORLD. Comissão 0%."
            input={{
              produtos: mockProdutos,
              data_inicio,
              data_fim,
              forma_pagamento: 'TRANSFER',
              destino: 'WORLD',
              comissao: 0,
              viajantes_por_faixa: { ate_75: 1, de_76_a_85: 0 },
            }}
            // Prod1: 4.0 * 10 * 1 = 40. Prod2: 7.0 * 10 * 1 = 70. Total = 110.
            expectedFatura={110}
          />
          <TestCase
            title="A2: 20% de Comissão (BRUTO)"
            description="Mesmos dados, porém com 20% de comissão. Fórmula: NET / (1 - 0.20)."
            input={{
              produtos: mockProdutos,
              data_inicio,
              data_fim,
              forma_pagamento: 'TRANSFER',
              destino: 'WORLD',
              comissao: 0.2,
              viajantes_por_faixa: { ate_75: 1, de_76_a_85: 0 },
            }}
            // Prod1: (4.0 / 0.8) * 10 = 5.0 * 10 = 50. Prod2: (7.0 / 0.8) * 10 = 8.75 * 10 = 87.5. Total = 137.5.
            expectedFatura={137.5}
          />
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4 border-b pb-2">Casos B: Forma de Pagamento</h2>
          <TestCase
            title="B1: Cartão 3x"
            description="10 dias, 1 Viajante (até 75), Cartão 3x, Destino WORLD. Comissão 0%."
            input={{
              produtos: mockProdutos,
              data_inicio,
              data_fim,
              forma_pagamento: 'CARD_3X',
              destino: 'WORLD',
              comissao: 0,
              viajantes_por_faixa: { ate_75: 1, de_76_a_85: 0 },
            }}
            // Prod1: 4.6 * 10 = 46. Prod2: 8.0 * 10 = 80. Total = 126.
            expectedFatura={126}
          />
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4 border-b pb-2">
            Casos C: Viajantes Mistos e Agravo Idade
          </h2>
          <TestCase
            title="C1: 2 Adultos + 1 Idoso"
            description="10 dias, Destino WORLD, Pagamento PIX. Comissao 0%."
            input={{
              produtos: mockProdutos,
              data_inicio,
              data_fim,
              forma_pagamento: 'TRANSFER',
              destino: 'WORLD',
              comissao: 0,
              viajantes_por_faixa: { ate_75: 2, de_76_a_85: 1 },
            }}
            // Prod1: (4 * 10 * 2) + (4 * 1.5 * 10 * 1) = 80 + 60 = 140
            // Prod2: (7 * 10 * 2) + (7 * 1.6 * 10 * 1) = 140 + 112 = 252
            // Total = 392
            expectedFatura={392}
          />
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4 border-b pb-2">Casos D: Agravo de Destino</h2>
          <TestCase
            title="D1: North America (+20%)"
            description="10 dias, 1 Viajante (até 75), Pagamento PIX, Destino NORTH_AMERICA. Comissão 0%."
            input={{
              produtos: mockProdutos,
              data_inicio,
              data_fim,
              forma_pagamento: 'TRANSFER',
              destino: 'NORTH_AMERICA',
              comissao: 0,
              viajantes_por_faixa: { ate_75: 1, de_76_a_85: 0 },
            }}
            // Prod1: 4 * 1.2 * 10 = 48
            // Prod2: 7 * 1.2 * 10 = 84
            // Total = 132
            expectedFatura={132}
          />
        </section>
      </div>
    </div>
  )
}
