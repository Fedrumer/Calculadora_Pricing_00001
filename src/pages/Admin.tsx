import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ProdutosTab } from '@/components/admin/ProdutosTab'
import { PrecosTab } from '@/components/admin/PrecosTab'
import { DestinosTab } from '@/components/admin/DestinosTab'
import { FaixasTab } from '@/components/admin/FaixasTab'
import { FormasPagamentoTab } from '@/components/admin/FormasPagamentoTab'
import { CoberturasTab } from '@/components/admin/CoberturasTab'
import { ProdutoCoberturasTab } from '@/components/admin/ProdutoCoberturasTab'
import { CambioTab } from '@/components/admin/CambioTab'
import { UsuariosTab } from '@/components/admin/UsuariosTab'
import { ShieldAlert } from 'lucide-react'
import { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { getCurrentCountry } from '@/lib/country'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export default function Admin() {
  const [produtos, setProdutos] = useState<any[]>([])
  const [produtoSelecionado, setProdutoSelecionado] = useState<string>('all')

  useEffect(() => {
    const country = getCurrentCountry()
    const filter = country === 'Todos' ? '' : `pais = '${country}'`
    pb.collection('produtos')
      .getFullList(filter ? { filter } : undefined)
      .then(setProdutos)
  }, [])

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

      <div className="bg-white p-4 rounded-lg shadow-sm border flex flex-col md:flex-row items-center gap-4">
        <span className="font-medium text-sm text-gray-700 whitespace-nowrap">
          Produto Selecionado:
        </span>
        <Select value={produtoSelecionado} onValueChange={setProdutoSelecionado}>
          <SelectTrigger className="w-full md:w-[300px]">
            <SelectValue placeholder="Selecione um produto..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Produtos</SelectItem>
            {produtos.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="produtos" className="w-full">
        <TabsList className="flex flex-wrap w-full h-auto gap-2 p-2 justify-start bg-muted">
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
          <TabsTrigger value="precos">Preços</TabsTrigger>
          <TabsTrigger value="destinos">Destinos</TabsTrigger>
          <TabsTrigger value="faixas">Faixas</TabsTrigger>
          <TabsTrigger value="formas">Formas Pagto</TabsTrigger>
          <TabsTrigger value="coberturas">Coberturas</TabsTrigger>
          <TabsTrigger value="produto_coberturas">Cob. Produto</TabsTrigger>
          <TabsTrigger value="cambio">Câmbio</TabsTrigger>
          <TabsTrigger value="usuarios">Usuários</TabsTrigger>
        </TabsList>

        <div className="mt-6 bg-white p-6 rounded-lg shadow-sm border">
          <TabsContent value="produtos">
            <ProdutosTab />
          </TabsContent>
          <TabsContent value="precos">
            <PrecosTab produtoId={produtoSelecionado} />
          </TabsContent>
          <TabsContent value="destinos">
            <DestinosTab produtoId={produtoSelecionado} />
          </TabsContent>
          <TabsContent value="faixas">
            <FaixasTab produtoId={produtoSelecionado} />
          </TabsContent>
          <TabsContent value="formas">
            <FormasPagamentoTab />
          </TabsContent>
          <TabsContent value="coberturas">
            <CoberturasTab />
          </TabsContent>
          <TabsContent value="produto_coberturas">
            <ProdutoCoberturasTab produtoId={produtoSelecionado} />
          </TabsContent>
          <TabsContent value="cambio">
            <CambioTab />
          </TabsContent>
          <TabsContent value="usuarios">
            <UsuariosTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
