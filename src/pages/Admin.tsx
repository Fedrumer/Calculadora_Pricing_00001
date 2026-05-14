import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ProdutosTab } from '@/components/admin/ProdutosTab'
import { PrecosTab } from '@/components/admin/PrecosTab'
import { DestinosTab } from '@/components/admin/DestinosTab'
import { FaixasTab } from '@/components/admin/FaixasTab'
import { FormasPagamentoTab } from '@/components/admin/FormasPagamentoTab'
import { ShieldAlert } from 'lucide-react'

export default function Admin() {
  return (
    <div className="p-6 max-w-7xl mx-auto w-full flex flex-col h-full gap-6 animate-in fade-in zoom-in duration-300">
      <div className="flex items-center gap-3 mb-6">
        <ShieldAlert className="w-8 h-8 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Backoffice Administrativo</h1>
          <p className="text-sm text-gray-500">
            Gerencie produtos, preços, destinos e configurações.
          </p>
        </div>
      </div>

      <Tabs defaultValue="produtos" className="w-full">
        <TabsList className="grid grid-cols-2 md:grid-cols-5 w-full h-auto gap-2 p-2">
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
          <TabsTrigger value="precos">Preços</TabsTrigger>
          <TabsTrigger value="destinos">Destinos</TabsTrigger>
          <TabsTrigger value="faixas">Faixas</TabsTrigger>
          <TabsTrigger value="formas">Formas Pagto</TabsTrigger>
        </TabsList>

        <div className="mt-6 bg-white p-6 rounded-lg shadow-sm border">
          <TabsContent value="produtos">
            <ProdutosTab />
          </TabsContent>
          <TabsContent value="precos">
            <PrecosTab />
          </TabsContent>
          <TabsContent value="destinos">
            <DestinosTab />
          </TabsContent>
          <TabsContent value="faixas">
            <FaixasTab />
          </TabsContent>
          <TabsContent value="formas">
            <FormasPagamentoTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
