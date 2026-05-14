import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ShieldCheck } from 'lucide-react'

export default function Admin() {
  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
          <ShieldCheck className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Painel Administrativo</h1>
          <p className="text-muted-foreground">Gerencie o sistema e os usuários.</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Usuários</CardTitle>
            <CardDescription>Gerencie os usuários e suas permissões</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Módulo em desenvolvimento.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Produtos</CardTitle>
            <CardDescription>Configuração de produtos e preços</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Módulo em desenvolvimento.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Relatórios</CardTitle>
            <CardDescription>Visualize o uso e cotações</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Módulo em desenvolvimento.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
