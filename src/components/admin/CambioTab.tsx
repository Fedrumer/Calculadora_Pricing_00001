import { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { format } from 'date-fns'

export function CambioTab() {
  const [taxas, setTaxas] = useState<any[]>([])
  const [data, setData] = useState('')
  const [moeda, setMoeda] = useState('BRL')
  const [valor, setValor] = useState('')
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const loadTaxas = async () => {
    try {
      const records = await pb.collection('taxas_cambio').getFullList({ sort: '-data' })
      setTaxas(records)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    loadTaxas()
  }, [])

  const handleSave = async () => {
    if (!data || !moeda || !valor) {
      toast({ title: 'Erro', description: 'Preencha todos os campos', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      await pb.collection('taxas_cambio').create({
        data: new Date(data).toISOString(),
        moeda,
        valor: parseFloat(valor),
      })
      toast({ title: 'Sucesso', description: 'Taxa de câmbio salva com sucesso!' })
      loadTaxas()
      setData('')
      setValor('')
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await pb.collection('taxas_cambio').delete(id)
      loadTaxas()
      toast({ title: 'Sucesso', description: 'Removido com sucesso!' })
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-muted/30 p-4 rounded-lg border grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        <div>
          <Label>Data</Label>
          <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <div>
          <Label>Moeda</Label>
          <Select value={moeda} onValueChange={setMoeda}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BRL">BRL (Real)</SelectItem>
              <SelectItem value="ARS">ARS (Peso Argentino)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Valor</Label>
          <Input
            type="number"
            step="0.01"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="Ex: 5.20"
          />
        </div>
        <Button onClick={handleSave} disabled={loading}>
          Adicionar Taxa
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Moeda</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead className="w-[100px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {taxas.map((taxa) => (
            <TableRow key={taxa.id}>
              <TableCell>{format(new Date(taxa.data), 'dd/MM/yyyy')}</TableCell>
              <TableCell>{taxa.moeda}</TableCell>
              <TableCell>{taxa.valor}</TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => handleDelete(taxa.id)}
                >
                  Remover
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {taxas.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                Nenhuma taxa cadastrada.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
