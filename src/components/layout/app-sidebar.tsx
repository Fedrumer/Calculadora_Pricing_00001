import { Sidebar, SidebarContent, SidebarHeader } from '@/components/ui/sidebar'
import { ShieldAlert, Calculator, History, Settings } from 'lucide-react'
import { CotacaoForm } from '@/components/CotacaoForm'
import { Link, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'

export function AppSidebar() {
  const location = useLocation()
  const isCotacao = location.pathname === '/cotacao'
  const isHistorico = location.pathname === '/historico'
  const isAdmin = location.pathname === '/admin'
  const { temRole } = useAuth()

  return (
    <Sidebar variant="inset" className="border-none">
      <SidebarHeader className="h-16 flex justify-center border-b border-blue-800/30 px-6 bg-blue-950">
        <div className="flex items-center gap-2 font-bold text-white tracking-tight">
          <ShieldAlert className="w-5 h-5 text-blue-400" />
          <span>Motor de Cálculo</span>
        </div>
      </SidebarHeader>
      <SidebarContent className="space-y-2 bg-blue-900/30 p-3 shadow-inner custom-scrollbar">
        <div className="flex flex-col gap-2 mb-6">
          <Button
            asChild
            variant={isCotacao ? 'default' : 'secondary'}
            className="inline-flex items-center justify-center text-xs"
          >
            <Link to="/cotacao">
              <Calculator className="w-4 h-4 mr-2" /> Cotação
            </Link>
          </Button>
          <Button
            asChild
            variant={isHistorico ? 'default' : 'secondary'}
            className="inline-flex items-center justify-center text-xs"
          >
            <Link to="/historico">
              <History className="w-4 h-4 mr-2" /> Histórico
            </Link>
          </Button>
          {temRole('ADMIN') && (
            <Button
              asChild
              variant={isAdmin ? 'default' : 'secondary'}
              className="inline-flex items-center justify-center text-xs"
            >
              <Link to="/admin">
                <Settings className="w-4 h-4 mr-2" /> Backoffice
              </Link>
            </Button>
          )}
        </div>
        {isCotacao && <CotacaoForm />}
      </SidebarContent>
    </Sidebar>
  )
}
