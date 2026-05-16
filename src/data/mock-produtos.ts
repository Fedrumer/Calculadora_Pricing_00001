import { Produto } from '@/types/cotacao'

export const mockProdutos: Produto[] = [
  {
    id: 'prod-1',
    nome: 'Now VIP 500',
    categoria: 'Premium',
    tags: ['Mundo + EUA'],
    ordem_exibicao: 2,
    precos_base_por_forma_pagamento: {
      TRANSFER: 19.55,
      CARD_1X: 20.0,
      CARD_2X: 20.5,
      CARD_3X: 21.0,
    },
    destinos: {
      WORLD: { agravo_percentual: 0 },
      NORTH_AMERICA: { agravo_percentual: 0.15 },
      EUROPE: { agravo_percentual: 0 },
      DOMESTIC: { agravo_percentual: 0 },
    },
    faixas_etarias: {
      ate_75: { fator_multiplicador: 1.0 },
      de_76_a_85: { fator_multiplicador: 2.0 },
    },
  },
  {
    id: 'prod-2',
    nome: 'Now Infinity 300',
    categoria: 'Intermediário',
    tags: ['Mundo'],
    ordem_exibicao: 3,
    precos_base_por_forma_pagamento: {
      TRANSFER: 15.5,
      CARD_1X: 16.0,
      CARD_2X: 16.5,
      CARD_3X: 17.0,
    },
    destinos: {
      WORLD: { agravo_percentual: 0 },
      NORTH_AMERICA: { agravo_percentual: 0.15 },
      EUROPE: { agravo_percentual: 0 },
      DOMESTIC: { agravo_percentual: 0 },
    },
    faixas_etarias: {
      ate_75: { fator_multiplicador: 1.0 },
      de_76_a_85: { fator_multiplicador: 2.0 },
    },
  },
  {
    id: 'prod-3',
    nome: 'Now Premium 200',
    categoria: 'Intermediário',
    tags: ['Mundo'],
    ordem_exibicao: 4,
    precos_base_por_forma_pagamento: {
      TRANSFER: 12.0,
      CARD_1X: 12.5,
      CARD_2X: 13.0,
      CARD_3X: 13.5,
    },
    destinos: {
      WORLD: { agravo_percentual: 0 },
      NORTH_AMERICA: { agravo_percentual: 0.15 },
      EUROPE: { agravo_percentual: 0 },
      DOMESTIC: { agravo_percentual: 0 },
    },
    faixas_etarias: {
      ate_75: { fator_multiplicador: 1.0 },
      de_76_a_85: { fator_multiplicador: 2.0 },
    },
  },
  {
    id: 'prod-4',
    nome: 'Now Total 100',
    categoria: 'Básico',
    tags: ['Nacional'],
    ordem_exibicao: 5,
    precos_base_por_forma_pagamento: {
      TRANSFER: 9.0,
      CARD_1X: 9.5,
      CARD_2X: 10.0,
      CARD_3X: 10.5,
    },
    destinos: {
      WORLD: { agravo_percentual: 0 },
      NORTH_AMERICA: { agravo_percentual: 0.15 },
      EUROPE: { agravo_percentual: 0 },
      DOMESTIC: { agravo_percentual: 0 },
    },
    faixas_etarias: {
      ate_75: { fator_multiplicador: 1.0 },
      de_76_a_85: { fator_multiplicador: 2.0 },
    },
  },
]
