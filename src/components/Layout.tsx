import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { Outlet, useLocation } from 'react-router-dom'
import { LogOut, User, Globe, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { useTranslation } from '@/hooks/use-translation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useState } from 'react'
import { getCurrentCountry } from '@/lib/country'
import useCotacaoStore from '@/stores/useCotacaoStore'

export default function Layout() {
  const { user, signOut, temRole } = useAuth()
  const { language, setLanguage, t } = useTranslation()
  const location = useLocation()
  const isCotacao = location.pathname === '/cotacao' || location.pathname === '/'
  const [country, setCountry] = useState(getCurrentCountry())
  const { recarregarDados } = useCotacaoStore()

  const handleCountryChange = (c: string) => {
    localStorage.setItem('selected_country', c)
    setCountry(c)
    recarregarDados()
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col min-h-screen bg-muted/20">
        <header className="flex h-14 shrink-0 items-center gap-4 border-b bg-background px-4 sm:px-6 shadow-sm z-10 sticky top-0">
          <SidebarTrigger className="-ml-2" />
          <h1 className="text-lg font-semibold text-primary/90 flex-1 truncate">
            {t('header.title')}
          </h1>
          <div className="flex items-center gap-3">
            {isCotacao && temRole('ADMIN') && (
              <div className="flex items-center mr-1 sm:mr-3 border-r pr-3">
                <MapPin className="w-4 h-4 text-muted-foreground mr-1 hidden sm:block" />
                <Select value={country} onValueChange={handleCountryChange}>
                  <SelectTrigger className="w-[90px] sm:w-[110px] h-8 text-xs bg-transparent border-border focus:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Brasil">Brasil</SelectItem>
                    <SelectItem value="Argentina">Argentina</SelectItem>
                    <SelectItem value="Todos">Todos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground mr-2">
              <User className="w-4 h-4" />
              <span>{user?.name || user?.email}</span>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Language"
                  className="uppercase text-xs font-bold text-muted-foreground hover:text-primary"
                >
                  {language}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setLanguage('pt')}
                  className={language === 'pt' ? 'font-bold' : ''}
                >
                  Português
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setLanguage('es')}
                  className={language === 'es' ? 'font-bold' : ''}
                >
                  Español
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setLanguage('en')}
                  className={language === 'en' ? 'font-bold' : ''}
                >
                  English
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="ghost" size="icon" onClick={signOut} title={t('header.logout')}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
