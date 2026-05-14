import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { Outlet } from 'react-router-dom'
import { LogOut, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'

export default function Layout() {
  const { user, signOut } = useAuth()

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col min-h-screen bg-muted/20">
        <header className="flex h-14 shrink-0 items-center gap-4 border-b bg-background px-4 sm:px-6 shadow-sm z-10 sticky top-0">
          <SidebarTrigger className="-ml-2" />
          <h1 className="text-lg font-semibold text-primary/90 flex-1 truncate">
            Cotação de Seguros
          </h1>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground mr-2">
              <User className="w-4 h-4" />
              <span>{user?.name || user?.email}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={signOut} title="Sair">
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
