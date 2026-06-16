import pb from '@/lib/pocketbase/client'
import { getCurrentCountry } from '@/lib/country'

export const fetchProdutos = async () => {
  const pais = getCurrentCountry()
  return pb.collection('produtos').getFullList({
    filter: `pais = '${pais}'`,
    sort: 'ordem_exibicao',
  })
}

export const fetchFormasPagamento = async () => {
  return pb.collection('formas_pagamento').getFullList({ sort: 'codigo' })
}

export const salvarCotacao = async (data: any) => {
  return pb.collection('cotacoes').create(data)
}

export const getCotacoes = async () => {
  return pb.collection('cotacoes').getFullList({ sort: '-created', expand: 'forma_pagamento_id' })
}

export const getCotacao = async (id: string) => {
  return pb.collection('cotacoes').getOne(id, { expand: 'forma_pagamento_id' })
}
