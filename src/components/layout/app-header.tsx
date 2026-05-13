import { Badge } from '@/components/ui/badge'
import { SidebarTrigger } from '@/components/ui/sidebar'
import useCotacaoStore from '@/stores/useCotacaoStore'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'

export function AppHeader() {
  const { resultado } = useCotacaoStore()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    signOut()
    navigate('/login')
  }

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
        <Link
          to="/testes"
          className="text-sm font-medium hover:underline text-muted-foreground hidden md:block"
        >
          Testes
        </Link>
        <Badge variant="outline" className="font-mono bg-muted hidden sm:inline-flex">
          Moeda: {resultado.moeda}
        </Badge>
        <Badge
          variant={resultado.tipo_preco === 'NET' ? 'secondary' : 'default'}
          className="hidden sm:inline-flex"
        >
          Preço: {resultado.tipo_preco}
        </Badge>
        {user && (
          <div className="flex items-center gap-2 ml-2 pl-4 border-l">
            <span className="text-sm font-medium text-muted-foreground hidden md:block">
              {user.email}
            </span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              Sair
            </Button>
          </div>
        )}
      </div>
    </header>
  )
}
