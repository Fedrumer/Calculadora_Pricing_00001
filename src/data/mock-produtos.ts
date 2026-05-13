import { Produto } from '@/types/cotacao'

export const mockProdutos: Produto[] = [
  {
    id: 'PROD-001',
    nome: 'Essential 30K',
    precos_base_por_forma_pagamento: {
      TRANSFER: 4.0,
      CARD_1X: 4.2,
      CARD_2X: 4.4,
      CARD_3X: 4.6,
    },
    destinos: {
      WORLD: { agravo_percentual: 0 },
      NORTH_AMERICA: { agravo_percentual: 0.2 },
      EUROPE: { agravo_percentual: 0.1 },
    },
    faixas_etarias: {
      ate_75: { fator_multiplicador: 1.0 },
      de_76_a_85: { fator_multiplicador: 1.5 },
    },
  },
  {
    id: 'PROD-002',
    nome: 'Premium 60K',
    precos_base_por_forma_pagamento: {
      TRANSFER: 7.0,
      CARD_1X: 7.3,
      CARD_2X: 7.6,
      CARD_3X: 8.0,
    },
    destinos: {
      WORLD: { agravo_percentual: 0 },
      NORTH_AMERICA: { agravo_percentual: 0.2 },
      EUROPE: { agravo_percentual: 0.1 },
    },
    faixas_etarias: {
      ate_75: { fator_multiplicador: 1.0 },
      de_76_a_85: { fator_multiplicador: 1.6 },
    },
  },
]
