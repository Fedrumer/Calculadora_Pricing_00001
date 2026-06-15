import { Badge } from '@/components/ui/badge'
import { SidebarTrigger } from '@/components/ui/sidebar'
import useCotacaoStore from '@/stores/useCotacaoStore'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { LogOut, Globe } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTranslation } from '@/hooks/use-translation'
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
  const { t, language, setLanguage } = useTranslation()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b px-6 bg-background/95 backdrop-blur z-10 sticky top-0">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="-ml-2" />
        <div className="font-semibold text-lg hidden sm:block">{t('header.title')}</div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        <div className="flex items-center mr-1">
          <Globe className="w-4 h-4 text-muted-foreground mr-1 hidden sm:block" />
          <Select value={language} onValueChange={(v) => setLanguage(v as any)}>
            <SelectTrigger className="w-[80px] sm:w-[100px] h-8 text-xs bg-transparent border-border focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pt">PT</SelectItem>
              <SelectItem value="es">ES</SelectItem>
              <SelectItem value="en">EN</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Link
          to="/cotacao"
          className="text-sm font-medium hover:underline text-muted-foreground hidden md:block"
        >
          {t('header.simulator')}
        </Link>
        {temRole('ADMIN') && (
          <Link
            to="/admin"
            className="text-sm font-medium hover:underline text-muted-foreground hidden lg:block"
          >
            {t('header.admin')}
          </Link>
        )}
        <Link
          to="/testes"
          className="text-sm font-medium hover:underline text-muted-foreground hidden lg:block"
        >
          {t('header.tests')}
        </Link>
        <Badge variant="outline" className="font-mono bg-muted hidden md:inline-flex">
          {t('header.currency')}: {resultado.moeda}
        </Badge>
        <Badge
          variant={resultado.tipo_preco === 'NET' ? 'secondary' : 'default'}
          className="hidden lg:inline-flex"
        >
          {t('header.price')}: {resultado.tipo_preco}
        </Badge>
        {usuario && (
          <div className="flex items-center gap-2 ml-1 sm:ml-2 sm:pl-4 sm:border-l">
            <span className="text-sm font-medium text-muted-foreground hidden xl:block">
              {usuario.email}
            </span>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive transition-colors px-2 sm:px-3"
                >
                  <LogOut className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">{t('header.logout')}</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('header.logout_title')}</AlertDialogTitle>
                  <AlertDialogDescription>{t('header.logout_desc')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('header.cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleLogout}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {t('header.logout')}
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
