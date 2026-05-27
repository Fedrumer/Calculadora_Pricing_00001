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
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'

interface AgencyModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (agencyName: string) => void
  isSaving: boolean
}

export function AgencyModal({ isOpen, onClose, onConfirm, isSaving }: AgencyModalProps) {
  const [agencyName, setAgencyName] = useState('')

  const handleOpenChange = (open: boolean) => {
    if (!open && !isSaving) {
      onClose()
      setAgencyName('')
    }
  }

  const handleConfirm = () => {
    onConfirm(agencyName)
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Identificar Agência</DialogTitle>
          <DialogDescription>Opcional</DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-2">
          <Label htmlFor="agencyName">Nome da Agência</Label>
          <Input
            id="agencyName"
            placeholder="Ex: Agência Brasil Turismo"
            value={agencyName}
            onChange={(e) => setAgencyName(e.target.value)}
            disabled={isSaving}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar e Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
