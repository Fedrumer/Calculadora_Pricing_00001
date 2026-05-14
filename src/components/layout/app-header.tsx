import { Badge } from '@/components/ui/badge'
import { SidebarTrigger } from '@/components/ui/sidebar'
import useCotacaoStore from '@/stores/useCotacaoStore'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

export function AppHeader() {
  const { resultado } = useCotacaoStore()
  const { usuario, logout, temRole } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b px-6 bg-background/95 backdrop-blur z-10 sticky top-0">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="-ml-2" />
        <div className="font-semibold text-lg hidden sm:block">Simulador de Seguros</div>
      </div>

      <div className="flex items-center gap-4">
        <Link to="/cotacao" className="text-sm font-medium hover:underline text-muted-foreground">
          Simulador
        </Link>
        {temRole('ADMIN') && (
          <Link
            to="/admin"
            className="text-sm font-medium hover:underline text-muted-foreground hidden md:block"
          >
            Admin
          </Link>
        )}
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
        {usuario && (
          <div className="flex items-center gap-2 ml-2 pl-4 border-l">
            <span className="text-sm font-medium text-muted-foreground hidden md:block">
              {usuario.email}
            </span>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <LogOut className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Sair</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Deseja realmente sair?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Você será desconectado da sua conta e precisará fazer login novamente para
                    acessar o sistema.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleLogout}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Sair
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>
    </header>
  )
}
