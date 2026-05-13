import { Badge } from '@/components/ui/badge'
import { SidebarTrigger } from '@/components/ui/sidebar'
import useCotacaoStore from '@/stores/useCotacaoStore'
import { Link } from 'react-router-dom'

export function AppHeader() {
  const { resultado } = useCotacaoStore()

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b px-6 bg-background/95 backdrop-blur z-10 sticky top-0">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="-ml-2" />
        <div className="font-semibold text-lg hidden sm:block">Simulador de Seguros</div>
      </div>

      <div className="flex items-center gap-4">
        <Link to="/" className="text-sm font-medium hover:underline text-muted-foreground">
          Simulador
        </Link>
        <Link to="/testes" className="text-sm font-medium hover:underline text-muted-foreground">
          Suite de Testes
        </Link>
        <Badge variant="outline" className="font-mono bg-muted">
          Moeda: {resultado.moeda}
        </Badge>
        <Badge variant={resultado.tipo_preco === 'NET' ? 'secondary' : 'default'}>
          Preço: {resultado.tipo_preco}
        </Badge>
      </div>
    </header>
  )
}
