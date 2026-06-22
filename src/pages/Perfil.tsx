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
import { Loader2, User as UserIcon, Lock, Camera, ShieldAlert } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useToast } from '@/hooks/use-toast'
import { updateProfile } from '@/services/users'
import { useAuth } from '@/hooks/use-auth'
import { extractFieldErrors, getErrorMessage } from '@/lib/pocketbase/errors'
import pb from '@/lib/pocketbase/client'
import { useNavigate } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useTranslation } from '@/hooks/use-translation'

export default function Perfil() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { t } = useTranslation()
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
          description: t('profile.toast_file_too_large'),
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
        title: t('profile.toast_profile_updated'),
        description: t('profile.toast_profile_updated_desc'),
      })
      setAvatarFile(null)
    } catch (err) {
      const errs = extractFieldErrors(err)
      if (Object.keys(errs).length > 0) {
        setProfileErrors(errs)
      } else {
        toast({
          title: t('profile.toast_error_updating'),
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
      setPasswordErrors({ passwordConfirm: t('profile.error_password_match') })
      return
    }

    setLoadingPassword(true)
    try {
      await updateProfile(user.id, {
        oldPassword,
        password,
        passwordConfirm,
        forcar_troca_senha: false,
      })

      if (user.forcar_troca_senha) {
        toast({
          title: t('profile.toast_password_changed'),
          description: t('profile.toast_password_changed_desc'),
        })
        signOut()
        navigate('/login')
        return
      }

      toast({
        title: t('profile.toast_password_changed_normal'),
        description: t('profile.toast_password_changed_normal_desc'),
      })
      setOldPassword('')
      setPassword('')
      setPasswordConfirm('')
    } catch (err) {
      const errs = extractFieldErrors(err)
      if (Object.keys(errs).length > 0) {
        if (errs.oldPassword && errs.oldPassword.includes('Invalid')) {
          errs.oldPassword = t('profile.error_wrong_password')
        }
        setPasswordErrors(errs)
      } else {
        toast({
          title: t('profile.toast_error_password'),
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
      {user.forcar_troca_senha && (
        <Alert variant="destructive" className="mb-6">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>{t('profile.force_password_alert_title')}</AlertTitle>
          <AlertDescription>{t('profile.force_password_alert_desc')}</AlertDescription>
        </Alert>
      )}

      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('profile.title')}</h1>
        <p className="text-muted-foreground mt-2">{t('profile.subtitle')}</p>
      </div>

      <Separator />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card className="shadow-sm border-blue-800/10 flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center text-lg">
              <UserIcon className="w-5 h-5 mr-2 text-primary" />
              {t('profile.personal_info_title')}
            </CardTitle>
            <CardDescription>{t('profile.personal_info_desc')}</CardDescription>
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
                  {t('profile.change_photo')}
                </Button>
                {profileErrors.avatar && (
                  <p className="text-sm text-destructive">{profileErrors.avatar}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t('profile.email_label')}</Label>
                <Input id="email" type="email" value={user.email} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">{t('profile.name_label')}</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('profile.name_placeholder')}
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
              {t('profile.save_changes')}
            </Button>
          </CardFooter>
        </Card>

        <Card className="shadow-sm border-blue-800/10 flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center text-lg">
              <Lock className="w-5 h-5 mr-2 text-primary" />
              {t('profile.security_title')}
            </CardTitle>
            <CardDescription>{t('profile.security_desc')}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <form id="password-form" onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="oldPassword">{t('profile.current_password')}</Label>
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
                <Label htmlFor="newPassword">{t('profile.new_password')}</Label>
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
                <Label htmlFor="newPasswordConfirm">{t('profile.confirm_new_password')}</Label>
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
              {t('profile.update_password')}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
