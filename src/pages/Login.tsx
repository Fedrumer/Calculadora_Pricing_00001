import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ShieldAlert, Loader2, Mail, Lock } from 'lucide-react'
import { extractFieldErrors } from '@/lib/pocketbase/errors'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')

  const { login } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  // Real-time validation
  useEffect(() => {
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('E-mail inválido')
    } else {
      setEmailError('')
    }
  }, [email])

  useEffect(() => {
    if (password && password.length > 0 && password.length < 6) {
      setPasswordError('A senha deve ter no mínimo 6 caracteres')
    } else {
      setPasswordError('')
    }
  }, [password])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()

    if (emailError || passwordError || !email || !password) {
      toast({
        variant: 'destructive',
        title: 'Erro de validação',
        description: 'Por favor, preencha os campos corretamente antes de continuar.',
      })
      return
    }

    setLoading(true)
    const { error: signInError } = await login(email, password)

    if (signInError) {
      const fieldErrs = extractFieldErrors(signInError)
      let errorMessage = 'Erro ao entrar. Verifique suas credenciais.'
      if (Object.keys(fieldErrs).length > 0) {
        errorMessage = Object.values(fieldErrs).join(' ')
      }

      toast({
        variant: 'destructive',
        title: 'Falha na autenticação',
        description: errorMessage,
      })
      setLoading(false)
    } else {
      navigate('/cotacao')
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-sky-800 p-4 sm:p-8">
      <Card className="w-full max-w-md shadow-2xl animate-fade-in-up border-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <CardHeader className="space-y-2 text-center pb-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4 shadow-inner">
            <ShieldAlert className="h-8 w-8 text-primary animate-pulse" />
          </div>
          <CardTitle className="text-2xl sm:text-3xl font-bold tracking-tight">
            Acesso ao Sistema
          </CardTitle>
          <CardDescription className="text-base sm:text-lg">
            Entre com suas credenciais para acessar o painel de cotações.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="grid gap-6">
            <div className="grid gap-2">
              <Label htmlFor="email" className={cn(emailError && 'text-destructive')}>
                E-mail
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="nome@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className={cn(
                    'pl-10 h-11 text-base transition-colors',
                    emailError && 'border-destructive focus-visible:ring-destructive',
                  )}
                />
              </div>
              {emailError && (
                <span className="text-xs text-destructive animate-fade-in">{emailError}</span>
              )}
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className={cn(passwordError && 'text-destructive')}>
                  Senha
                </Label>
                <a
                  href="#"
                  className="text-sm font-medium text-primary hover:underline hover:text-primary/80 transition-colors"
                  onClick={(e) => {
                    e.preventDefault()
                  }}
                >
                  Esqueceu a senha?
                </a>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  minLength={6}
                  className={cn(
                    'pl-10 h-11 text-base tracking-widest placeholder:tracking-normal transition-colors',
                    passwordError && 'border-destructive focus-visible:ring-destructive',
                  )}
                />
              </div>
              {passwordError && (
                <span className="text-xs text-destructive animate-fade-in">{passwordError}</span>
              )}
            </div>
          </CardContent>
          <CardFooter className="pt-2 pb-8">
            <Button
              className="w-full text-base h-12 shadow-md transition-all hover:shadow-lg active:scale-[0.98]"
              type="submit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Entrando...
                </>
              ) : (
                'Entrar'
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
