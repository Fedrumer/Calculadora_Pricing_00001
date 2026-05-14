import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react'
import pb from '@/lib/pocketbase/client'

export type Role = 'ADMIN' | 'COMERCIAL'

export interface Usuario {
  id: string
  email: string
  nome: string
  role: Role
}

interface AuthContextType {
  usuario: Usuario | null
  token: string | null
  status: 'loading' | 'authenticated' | 'unauthenticated'
  login: (email: string, password: string) => Promise<{ error: any }>
  logout: () => void
  isAutenticado: () => boolean
  temRole: (role: Role) => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading')

  const updateStateFromStore = useCallback(() => {
    if (pb.authStore.isValid && pb.authStore.record) {
      setUsuario({
        id: pb.authStore.record.id,
        email: pb.authStore.record.email,
        nome: pb.authStore.record.name || '',
        role: pb.authStore.record.role as Role,
      })
      setToken(pb.authStore.token)
      setStatus('authenticated')
    } else {
      setUsuario(null)
      setToken(null)
      setStatus('unauthenticated')
    }
  }, [])

  useEffect(() => {
    updateStateFromStore()
    const unsubscribe = pb.authStore.onChange(() => {
      updateStateFromStore()
    }, true)

    return () => {
      unsubscribe()
    }
  }, [updateStateFromStore])

  const login = async (email: string, password: string) => {
    try {
      await pb.collection('users').authWithPassword(email, password)
      return { error: null }
    } catch (error) {
      return { error }
    }
  }

  const logout = () => {
    pb.authStore.clear()
  }

  const isAutenticado = () => {
    return pb.authStore.isValid
  }

  const temRole = (role: Role) => {
    return isAutenticado() && pb.authStore.record?.role === role
  }

  return (
    <AuthContext.Provider
      value={{
        usuario,
        token,
        status,
        login,
        logout,
        isAutenticado,
        temRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
