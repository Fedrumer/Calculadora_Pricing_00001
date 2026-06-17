import { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'

export function useExchangeRate(currency: string) {
  const [rate, setRate] = useState<number | null>(null)

  useEffect(() => {
    let mounted = true
    async function fetchRate() {
      try {
        const records = await pb.collection('taxas_cambio').getList(1, 1, {
          filter: `moeda = '${currency}'`,
          sort: '-data',
        })
        if (mounted && records.items.length > 0) {
          setRate(records.items[0].valor)
        } else if (mounted) {
          setRate(null)
        }
      } catch (err) {
        console.error('Error fetching exchange rate:', err)
        if (mounted) setRate(null)
      }
    }
    fetchRate()
    return () => {
      mounted = false
    }
  }, [currency])

  return rate
}
