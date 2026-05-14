import { useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { useNavigate, Navigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ShieldAlert, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export default function Login() {
  const { signIn, isAutenticado } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [email, setEmail] = useState('fedrumer@gmail.com')
  const [password, setPassword] = useState('Skip@Pass')
  const [loading, setLoading] = useState(false)

  if (isAutenticado()) {
    return <Navigate to="/cotacao" replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) {
      toast({
        title: 'Erro de Autenticação',
        description: 'Credenciais inválidas. Verifique seu e-mail e senha.',
        variant: 'destructive',
      })
    } else {
      navigate('/cotacao')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md shadow-xl border-primary/10">
        <CardHeader className="text-center space-y-2 pb-6">
          <div className="mx-auto bg-primary/10 w-14 h-14 rounded-full flex items-center justify-center mb-2">
            <ShieldAlert className="w-7 h-7 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Acesso ao Sistema</CardTitle>
          <CardDescription>Calculadora de Cotação de Seguros</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11"
              />
            </div>
            <Button
              type="submit"
              className="w-full h-11 text-base font-semibold mt-4"
              disabled={loading}
            >
              {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
