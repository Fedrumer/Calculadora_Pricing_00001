import { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'

export function useExchangeRate(currency: string) {
  const [rate, setRate] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    pb.collection('taxas_cambio')
      .getList(1, 1, { filter: `moeda = '${currency}'`, sort: '-data' })
      .then((res) => {
        if (active) setRate(res.items[0]?.valor || null)
      })
      .catch(() => {
        if (active) setRate(null)
      })
    return () => {
      active = false
    }
  }, [currency])

  return rate
}
