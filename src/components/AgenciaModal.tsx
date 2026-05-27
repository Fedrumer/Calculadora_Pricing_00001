import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface AgenciaModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (nomeAgencia: string) => Promise<void>
}

export function AgenciaModal({ open, onOpenChange, onConfirm }: AgenciaModalProps) {
  const [agencia, setAgencia] = useState('')
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await onConfirm(agencia)
      toast({
        title: agencia ? `Proposta enviada para ${agencia}` : 'Proposta enviada com sucesso!',
        variant: 'default',
      })
      onOpenChange(false)
      setAgencia('')
    } catch (error) {
      toast({
        title: 'Não foi possível enviar proposta',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!loading) onOpenChange(v)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Identificar Agência</DialogTitle>
          <DialogDescription>Opcional</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Input
            placeholder="Ex: Agência Brasil Turismo"
            value={agencia}
            onChange={(e) => setAgencia(e.target.value)}
            disabled={loading}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar e Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
