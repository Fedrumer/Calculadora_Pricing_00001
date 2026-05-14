import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'

export default function Forbidden() {
  const navigate = useNavigate()
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center space-y-6 bg-slate-50 dark:bg-slate-950 p-4 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
        <ShieldAlert className="h-10 w-10 text-destructive" />
      </div>
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl">Acesso Negado</h1>
        <p className="text-muted-foreground max-w-[400px]">
          Sua conta não tem permissão para acessar esta área. Se você acredita que isso é um erro,
          entre em contato com o suporte.
        </p>
      </div>
      <Button size="lg" onClick={() => navigate('/cotacao')}>
        Voltar para o Início
      </Button>
    </div>
  )
}
