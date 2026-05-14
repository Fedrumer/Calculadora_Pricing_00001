import { Sidebar, SidebarContent, SidebarHeader } from '@/components/ui/sidebar'
import { ShieldAlert, Calculator, History } from 'lucide-react'
import { CotacaoForm } from '@/components/CotacaoForm'
import { Link, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export function AppSidebar() {
  const location = useLocation()
  const isCotacao = location.pathname === '/cotacao'
  const isHistorico = location.pathname === '/historico'

  return (
    <Sidebar variant="inset" className="border-none">
      <SidebarHeader className="h-16 flex justify-center border-b border-blue-800/30 px-6 bg-blue-950">
        <div className="flex items-center gap-2 font-bold text-white tracking-tight">
          <ShieldAlert className="w-5 h-5 text-blue-400" />
          <span>Motor de Cálculo</span>
        </div>
      </SidebarHeader>
      <SidebarContent className="bg-gradient-to-b from-blue-950 to-blue-900 p-6 shadow-inner custom-scrollbar">
        <div className="flex gap-2 mb-6">
          <Button asChild variant={isCotacao ? 'default' : 'secondary'} className="flex-1 text-xs">
            <Link to="/cotacao">
              <Calculator className="w-4 h-4 mr-2" /> Cotação
            </Link>
          </Button>
          <Button
            asChild
            variant={isHistorico ? 'default' : 'secondary'}
            className="flex-1 text-xs"
          >
            <Link to="/historico">
              <History className="w-4 h-4 mr-2" /> Histórico
            </Link>
          </Button>
        </div>
        {isCotacao && <CotacaoForm />}
      </SidebarContent>
    </Sidebar>
  )
}
