import { useState, useRef, useEffect } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Loader2, User as UserIcon, Lock, Camera } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useToast } from '@/hooks/use-toast'
import { updateProfile } from '@/services/users'
import { useAuth } from '@/hooks/use-auth'
import { extractFieldErrors, getErrorMessage } from '@/lib/pocketbase/errors'
import pb from '@/lib/pocketbase/client'

export default function Perfil() {
  const { user } = useAuth()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Profile Form State
  const [name, setName] = useState(user?.name || '')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({})

  // Password Form State
  const [oldPassword, setOldPassword] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [loadingPassword, setLoadingPassword] = useState(false)
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    }
  }, [avatarPreview])

  if (!user) return null

  const getAvatarUrl = () => {
    if (avatarPreview) return avatarPreview
    if (user?.avatar) return pb.files.getURL(user, user.avatar)
    return ''
  }

  const getInitials = (nameStr: string) => {
    return (
      nameStr
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase() || 'U'
    )
  }

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5242880) {
        // 5MB limit
        toast({
          title: 'Arquivo muito grande',
          description: 'A imagem deve ter no máximo 5MB.',
          variant: 'destructive',
        })
        return
      }
      setAvatarFile(file)
      setAvatarPreview(URL.createObjectURL(file))
    }
  }

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfileErrors({})
    setLoadingProfile(true)
    try {
      const formData = new FormData()
      formData.append('name', name)
      if (avatarFile) {
        formData.append('avatar', avatarFile)
      }

      await updateProfile(user.id, formData)

      toast({
        title: 'Perfil atualizado',
        description: 'Suas informações foram salvas com sucesso.',
      })
      setAvatarFile(null)
    } catch (err) {
      const errs = extractFieldErrors(err)
      if (Object.keys(errs).length > 0) {
        setProfileErrors(errs)
      } else {
        toast({
          title: 'Erro ao atualizar perfil',
          description: getErrorMessage(err),
          variant: 'destructive',
        })
      }
    } finally {
      setLoadingProfile(false)
    }
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordErrors({})

    if (password !== passwordConfirm) {
      setPasswordErrors({ passwordConfirm: 'As senhas não coincidem' })
      return
    }

    setLoadingPassword(true)
    try {
      await updateProfile(user.id, {
        oldPassword,
        password,
        passwordConfirm,
      })
      toast({
        title: 'Senha alterada',
        description: 'Sua senha foi alterada com sucesso.',
      })
      setOldPassword('')
      setPassword('')
      setPasswordConfirm('')
    } catch (err) {
      const errs = extractFieldErrors(err)
      if (Object.keys(errs).length > 0) {
        if (errs.oldPassword && errs.oldPassword.includes('Invalid')) {
          errs.oldPassword = 'Senha atual incorreta'
        }
        setPasswordErrors(errs)
      } else {
        toast({
          title: 'Erro ao alterar senha',
          description: getErrorMessage(err),
          variant: 'destructive',
        })
      }
    } finally {
      setLoadingPassword(false)
    }
  }

  return (
    <div className="container max-w-4xl mx-auto py-8 space-y-8 animate-in fade-in-up duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações do Perfil</h1>
        <p className="text-muted-foreground mt-2">
          Gerencie suas informações pessoais e credenciais de acesso.
        </p>
      </div>

      <Separator />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card className="shadow-sm border-blue-800/10 flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center text-lg">
              <UserIcon className="w-5 h-5 mr-2 text-primary" />
              Informações Pessoais
            </CardTitle>
            <CardDescription>Atualize seu nome de exibição e avatar no sistema.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <form id="profile-form" onSubmit={handleProfileSubmit} className="space-y-6">
              <div className="flex flex-col items-center justify-center space-y-4">
                <div
                  className="relative group cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Avatar className="w-24 h-24 border-2 border-muted shadow-sm">
                    <AvatarImage src={getAvatarUrl()} className="object-cover" />
                    <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                      {getInitials(name || user.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute inset-0 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Camera className="w-6 h-6 text-white" />
                  </div>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleAvatarChange}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Alterar foto
                </Button>
                {profileErrors.avatar && (
                  <p className="text-sm text-destructive">{profileErrors.avatar}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">E-mail (somente leitura)</Label>
                <Input id="email" type="email" value={user.email} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Nome Completo</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome"
                />
                {profileErrors.name && (
                  <p className="text-sm text-destructive font-medium">{profileErrors.name}</p>
                )}
              </div>
            </form>
          </CardContent>
          <CardFooter className="bg-muted/30 pt-6 mt-auto">
            <Button
              type="submit"
              form="profile-form"
              disabled={loadingProfile || !name}
              className="w-full sm:w-auto"
            >
              {loadingProfile && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar Alterações
            </Button>
          </CardFooter>
        </Card>

        <Card className="shadow-sm border-blue-800/10 flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center text-lg">
              <Lock className="w-5 h-5 mr-2 text-primary" />
              Segurança
            </CardTitle>
            <CardDescription>Altere sua senha de acesso.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <form id="password-form" onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="oldPassword">Senha Atual</Label>
                <Input
                  id="oldPassword"
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  required
                />
                {passwordErrors.oldPassword && (
                  <p className="text-sm text-destructive font-medium">
                    {passwordErrors.oldPassword}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword">Nova Senha</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
                {passwordErrors.password && (
                  <p className="text-sm text-destructive font-medium">{passwordErrors.password}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPasswordConfirm">Confirmar Nova Senha</Label>
                <Input
                  id="newPasswordConfirm"
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  required
                  minLength={8}
                />
                {passwordErrors.passwordConfirm && (
                  <p className="text-sm text-destructive font-medium">
                    {passwordErrors.passwordConfirm}
                  </p>
                )}
              </div>
            </form>
          </CardContent>
          <CardFooter className="bg-muted/30 pt-6 mt-auto">
            <Button
              type="submit"
              form="password-form"
              disabled={loadingPassword || !oldPassword || !password || !passwordConfirm}
              className="w-full sm:w-auto"
            >
              {loadingPassword && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Atualizar Senha
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
