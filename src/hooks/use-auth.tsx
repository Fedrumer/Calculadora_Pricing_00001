import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import pb from '@/lib/pocketbase/client'

export type Role = 'ADMIN' | 'COMERCIAL'

interface AuthContextType {
  user: any
  status: 'loading' | 'authenticated' | 'unauthenticated'
  isAutenticado: () => boolean
  temRole: (role: Role) => boolean
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signOut: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<any>(pb.authStore.record)
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading')

  useEffect(() => {
    setStatus(pb.authStore.isValid ? 'authenticated' : 'unauthenticated')
    const unsubscribe = pb.authStore.onChange((_token, record) => {
      setUser(record)
      setStatus(pb.authStore.isValid ? 'authenticated' : 'unauthenticated')
    })
    return () => {
      unsubscribe()
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    try {
      await pb.collection('users').authWithPassword(email, password)
      return { error: null }
    } catch (error) {
      return { error }
    }
  }

  const signOut = () => {
    pb.authStore.clear()
  }
  const isAutenticado = () => pb.authStore.isValid
  const temRole = (role: Role) => user?.role === role

  return (
    <AuthContext.Provider value={{ user, status, isAutenticado, temRole, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
