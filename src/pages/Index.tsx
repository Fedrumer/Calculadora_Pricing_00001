import useCotacaoStore from '@/stores/useCotacaoStore'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AlertCircle, Plane } from 'lucide-react'

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val)

export default function Index() {
  const { resultado } = useCotacaoStore()

  return (
    <div className="container max-w-5xl mx-auto py-8 px-4 sm:px-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Cotação de Seguro Viagem</h1>
        <p className="text-muted-foreground">
          Ajuste os parâmetros na barra lateral para calcular os preços em tempo real.
        </p>
      </div>

      {resultado.erros.length > 0 && (
        <Alert variant="destructive" className="mb-8 animate-fade-in-down">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Faltam dados para o cálculo</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside mt-2">
              {resultado.erros.map((erro, i) => (
                <li key={i}>{erro}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {resultado.erros.length === 0 && resultado.produtos_calculados.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground animate-fade-in">
          <Plane className="w-12 h-12 mb-4 opacity-50" />
          <p>Nenhum produto disponível para as configurações atuais.</p>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {resultado.produtos_calculados.map((produto, index) => (
          <Card
            key={produto.id}
            className="animate-fade-in-up hover:shadow-elevation transition-shadow duration-300"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <CardHeader className="bg-muted/30 pb-4">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-xl text-primary">{produto.nome}</CardTitle>
                  <p className="text-xs text-muted-foreground font-mono mt-1">ID: {produto.id}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Faixa Etária</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Unitário</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {produto.breakdown.ate_75.quantidade > 0 && (
                    <TableRow>
                      <TableCell className="font-medium">Até 75 anos</TableCell>
                      <TableCell className="text-right">
                        {produto.breakdown.ate_75.quantidade}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(produto.breakdown.ate_75.preco_unitario)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {formatCurrency(produto.breakdown.ate_75.preco_total)}
                      </TableCell>
                    </TableRow>
                  )}
                  {produto.breakdown.de_76_a_85.quantidade > 0 && (
                    <TableRow>
                      <TableCell className="font-medium">76 a 85 anos</TableCell>
                      <TableCell className="text-right">
                        {produto.breakdown.de_76_a_85.quantidade}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(produto.breakdown.de_76_a_85.preco_unitario)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {formatCurrency(produto.breakdown.de_76_a_85.preco_total)}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
            <CardFooter className="bg-muted/10 border-t flex justify-between items-center py-4">
              <span className="text-sm text-muted-foreground font-medium">Subtotal Produto</span>
              <span className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {formatCurrency(produto.preco_total_produto)}
              </span>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  )
}
