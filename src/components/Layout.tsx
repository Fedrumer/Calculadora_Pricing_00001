import { Outlet } from 'react-router-dom'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { CotacaoProvider } from '@/stores/useCotacaoStore'

export default function Layout() {
  return (
    <CotacaoProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950">
          <AppHeader />
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
          <AppFooter />
        </SidebarInset>
      </SidebarProvider>
    </CotacaoProvider>
  )
}
