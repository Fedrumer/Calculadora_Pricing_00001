import { Sidebar, SidebarContent, SidebarHeader } from '@/components/ui/sidebar'
import { ShieldAlert } from 'lucide-react'
import { CotacaoForm } from '@/components/CotacaoForm'

export function AppSidebar() {
  return (
    <Sidebar variant="inset" className="border-none">
      <SidebarHeader className="h-16 flex justify-center border-b border-blue-800/30 px-6 bg-blue-950">
        <div className="flex items-center gap-2 font-bold text-white tracking-tight">
          <ShieldAlert className="w-5 h-5 text-blue-400" />
          <span>Motor de Cálculo</span>
        </div>
      </SidebarHeader>
      <SidebarContent className="bg-gradient-to-b from-blue-950 to-blue-900 p-6 shadow-inner custom-scrollbar">
        <CotacaoForm />
      </SidebarContent>
    </Sidebar>
  )
}
