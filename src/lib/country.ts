import pb from '@/lib/pocketbase/client'

export function getCurrentCountry(): string {
  const user = pb.authStore.record
  if (user?.role === 'ADMIN') {
    return localStorage.getItem('selected_country') || user?.pais || 'Todos'
  }
  return user?.pais || 'Brasil'
}

export function getCurrencyForCountry(country: string): string {
  if (country === 'Argentina') return 'ARS'
  if (country === 'Todos') return 'Todos'
  return 'BRL'
}
