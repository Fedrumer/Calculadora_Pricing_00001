import { useState, useEffect, useCallback } from 'react'
import pb from '@/lib/pocketbase/client'
import { useToast } from '@/hooks/use-toast'

export function useAdmin<T = any>(collection: string, expand?: string) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await pb.collection(collection).getFullList({ expand, sort: '-created' })
      setData(res as any)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: `Erro ao carregar ${collection}`,
      })
    } finally {
      setLoading(false)
    }
  }, [collection, expand, toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const create = async (payload: any) => {
    try {
      await pb.collection(collection).create(payload)
      toast({ title: 'Sucesso', description: 'Registro criado com sucesso.' })
      fetchData()
      return true
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Erro ao criar registro.' })
      return false
    }
  }

  const update = async (id: string, payload: any) => {
    try {
      await pb.collection(collection).update(id, payload)
      toast({ title: 'Sucesso', description: 'Registro atualizado com sucesso.' })
      fetchData()
      return true
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Erro ao atualizar registro.' })
      return false
    }
  }

  const remove = async (id: string) => {
    try {
      await pb.collection(collection).delete(id)
      toast({ title: 'Sucesso', description: 'Registro excluído com sucesso.' })
      fetchData()
      return true
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Erro ao excluir registro.' })
      return false
    }
  }

  return { data, loading, create, update, remove, refetch: fetchData }
}
