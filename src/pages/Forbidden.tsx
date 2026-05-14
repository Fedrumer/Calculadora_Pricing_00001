import { Button } from '@/components/ui/button'
import { ShieldX } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Forbidden() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] text-center px-4">
      <ShieldX className="w-16 h-16 text-destructive mb-6" />
      <h1 className="text-3xl font-bold mb-2">Acesso Negado</h1>
      <p className="text-muted-foreground mb-8 max-w-md">
        Você não tem permissão para acessar esta funcionalidade.
      </p>
      <Button asChild>
        <Link to="/">Voltar para o Início</Link>
      </Button>
    </div>
  )
}
