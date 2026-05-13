import { useEffect, useState } from 'react'
import useCotacaoStore from '@/stores/useCotacaoStore'
import { cn } from '@/lib/utils'

export function AppFooter() {
  const { resultado } = useCotacaoStore()
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    setPulse(true)
    const t = setTimeout(() => setPulse(false), 500)
    return () => clearTimeout(t)
  }, [resultado.fatura_total])

  const formattedTotal = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(resultado.fatura_total)

  return (
    <footer className="sticky bottom-0 border-t bg-background/95 backdrop-blur p-4 z-10 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
      <div className="container mx-auto flex items-center justify-between max-w-4xl">
        <div>
          <p className="text-sm text-muted-foreground">Fatura Total Estimada</p>
          <p className="text-xs text-muted-foreground mt-1">
            Reflete a soma de todos os produtos do carrinho
          </p>
        </div>
        <div
          className={cn(
            'text-3xl font-bold font-mono transition-colors duration-500',
            pulse ? 'text-emerald-500' : 'text-foreground',
          )}
        >
          {formattedTotal}
        </div>
      </div>
    </footer>
  )
}
