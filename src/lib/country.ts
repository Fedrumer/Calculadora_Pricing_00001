import pb from '@/lib/pocketbase/client'

export function getCurrentCountry(): 'Brasil' | 'Argentina' {
  const user = pb.authStore.record
  if (!user) return 'Brasil'
  if (user.role === 'ADMIN') {
    return (localStorage.getItem('selected_country') as 'Brasil' | 'Argentina') || 'Brasil'
  }
  return (user.pais as 'Brasil' | 'Argentina') || 'Brasil'
}

export function getCurrencyForCountry(country: string) {
  return country === 'Argentina' ? 'ARS' : 'BRL'
}
