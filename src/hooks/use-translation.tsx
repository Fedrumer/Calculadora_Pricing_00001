import React, { createContext, useContext, useState, ReactNode } from 'react'

type Language = 'pt' | 'es' | 'en'

const translations = {
  pt: {
    'header.title': 'Simulador de Seguros',
    'header.simulator': 'Simulador',
    'header.admin': 'Admin',
    'header.tests': 'Testes',
    'header.currency': 'Moeda',
    'header.price': 'Preço',
    'header.logout': 'Sair',
    'header.logout_title': 'Deseja realmente sair?',
    'header.logout_desc':
      'Você será desconectado da sua conta e precisará fazer login novamente para acessar o sistema.',
    'header.cancel': 'Cancelar',

    'form.filters': 'Filtros de Produtos',
    'form.show_all': 'Exibir Todos',
    'form.b2b': 'Folheto B2B',
    'form.b2c': 'Folheto B2C',
    'form.agreement': 'Acordo',
    'form.filter_placeholder': 'Filtrar por nome do produto...',
    'form.all_products': 'Todos os produtos',
    'form.payment': '1. Pagamento',
    'form.taxes_commissions': '2. Taxas e Comissões',
    'form.markup': 'Markup (%)',
    'form.commission': 'Comissão (%)',
    'form.period': '3. Período',
    'form.start': 'Início',
    'form.end': 'Fim',
    'form.travelers': '4. Viajantes (Idade)',
    'form.up_to_75': 'Até 75 anos',
    'form.76_to_85': '76 a 85 anos',

    'grid.error_loading': 'Ocorreu um erro ao carregar os produtos',
    'grid.try_again': 'Tentar novamente',
    'grid.no_products': 'Nenhum produto encontrado com os filtros atuais.',
    'grid.adjust_filters': 'Ajuste as datas ou idades no formulário.',
    'grid.selected': 'SELECIONADO',
    'grid.total_invoice': 'Total Fatura',
    'grid.no_age_range': 'Nenhuma faixa etária disponível para este produto',
    'grid.up_to_75_short': 'Até 75',
    'grid.base_price': 'Preço Base',
    'grid.total': 'Total',
    'grid.price_with_aggravation': 'Preço com Agravo',
    'grid.unit_price': 'Preço Unitário',

    'index.title': 'Cotação Atual',
    'index.subtitle': 'Selecione os produtos desejados e finalize a proposta.',
    'index.save_draft': 'Salvar Rascunho',
    'index.save_sent': 'Salvar como Enviada',
    'index.warning': 'Atenção',
    'index.select_one': 'Selecione pelo menos um produto para salvar.',
    'index.success': 'Sucesso',
    'index.draft_saved': 'Rascunho salvo com sucesso.',
    'index.proposal_saved': 'Proposta salva e marcada como enviada.',
    'index.error': 'Erro',
    'index.error_saving': 'Não foi possível salvar a cotação.',
    'index.saving': 'Salvando...',
    'index.confirm': 'Confirmar',
    'index.save_quote': 'Salvar Cotação',
    'index.agency_name_desc': 'Informe o nome da agência para identificar esta cotação.',
    'index.agency': 'Agência',
    'index.agency_placeholder': 'Ex: Agência Viagens Inc',
  },
  es: {
    'header.title': 'Simulador de Seguros',
    'header.simulator': 'Simulador',
    'header.admin': 'Admin',
    'header.tests': 'Pruebas',
    'header.currency': 'Moneda',
    'header.price': 'Precio',
    'header.logout': 'Salir',
    'header.logout_title': '¿Realmente deseas salir?',
    'header.logout_desc':
      'Cerrarás sesión y necesitarás iniciar sesión nuevamente para acceder al sistema.',
    'header.cancel': 'Cancelar',

    'form.filters': 'Filtros de Productos',
    'form.show_all': 'Mostrar Todos',
    'form.b2b': 'Folleto B2B',
    'form.b2c': 'Folleto B2C',
    'form.agreement': 'Acuerdo',
    'form.filter_placeholder': 'Filtrar por nombre del producto...',
    'form.all_products': 'Todos los productos',
    'form.payment': '1. Pago',
    'form.taxes_commissions': '2. Tasas y Comisiones',
    'form.markup': 'Margen (%)',
    'form.commission': 'Comisión (%)',
    'form.period': '3. Período',
    'form.start': 'Inicio',
    'form.end': 'Fin',
    'form.travelers': '4. Viajeros (Edad)',
    'form.up_to_75': 'Hasta 75 años',
    'form.76_to_85': '76 a 85 años',

    'grid.error_loading': 'Ocurrió un error al cargar los productos',
    'grid.try_again': 'Intentar nuevamente',
    'grid.no_products': 'No se encontraron productos con los filtros actuales.',
    'grid.adjust_filters': 'Ajuste las fechas o edades en el formulario.',
    'grid.selected': 'SELECCIONADO',
    'grid.total_invoice': 'Total Factura',
    'grid.no_age_range': 'Ningún rango de edad disponible para este producto',
    'grid.up_to_75_short': 'Hasta 75',
    'grid.base_price': 'Precio Base',
    'grid.total': 'Total',
    'grid.price_with_aggravation': 'Precio con Agravio',
    'grid.unit_price': 'Precio Unitario',

    'index.title': 'Cotización Actual',
    'index.subtitle': 'Seleccione los productos deseados y finalice la propuesta.',
    'index.save_draft': 'Guardar Borrador',
    'index.save_sent': 'Guardar como Enviada',
    'index.warning': 'Atención',
    'index.select_one': 'Seleccione al menos un producto para guardar.',
    'index.success': 'Éxito',
    'index.draft_saved': 'Borrador guardado con éxito.',
    'index.proposal_saved': 'Propuesta guardada y marcada como enviada.',
    'index.error': 'Error',
    'index.error_saving': 'No se pudo guardar la cotización.',
    'index.saving': 'Guardando...',
    'index.confirm': 'Confirmar',
    'index.save_quote': 'Guardar Cotización',
    'index.agency_name_desc': 'Informe el nombre de la agencia para identificar esta cotización.',
    'index.agency': 'Agencia',
    'index.agency_placeholder': 'Ej: Agencia Viajes Inc',
  },
  en: {
    'header.title': 'Insurance Simulator',
    'header.simulator': 'Simulator',
    'header.admin': 'Admin',
    'header.tests': 'Tests',
    'header.currency': 'Currency',
    'header.price': 'Price',
    'header.logout': 'Logout',
    'header.logout_title': 'Are you sure you want to log out?',
    'header.logout_desc':
      'You will be logged out and will need to log in again to access the system.',
    'header.cancel': 'Cancel',

    'form.filters': 'Product Filters',
    'form.show_all': 'Show All',
    'form.b2b': 'B2B Brochure',
    'form.b2c': 'B2C Brochure',
    'form.agreement': 'Agreement',
    'form.filter_placeholder': 'Filter by product name...',
    'form.all_products': 'All products',
    'form.payment': '1. Payment',
    'form.taxes_commissions': '2. Taxes & Commissions',
    'form.markup': 'Markup (%)',
    'form.commission': 'Commission (%)',
    'form.period': '3. Period',
    'form.start': 'Start',
    'form.end': 'End',
    'form.travelers': '4. Travelers (Age)',
    'form.up_to_75': 'Up to 75 years',
    'form.76_to_85': '76 to 85 years',

    'grid.error_loading': 'An error occurred while loading products',
    'grid.try_again': 'Try again',
    'grid.no_products': 'No products found with current filters.',
    'grid.adjust_filters': 'Adjust dates or ages in the form.',
    'grid.selected': 'SELECTED',
    'grid.total_invoice': 'Total Invoice',
    'grid.no_age_range': 'No age range available for this product',
    'grid.up_to_75_short': 'Up to 75',
    'grid.base_price': 'Base Price',
    'grid.total': 'Total',
    'grid.price_with_aggravation': 'Price with Aggravation',
    'grid.unit_price': 'Unit Price',

    'index.title': 'Current Quote',
    'index.subtitle': 'Select desired products and finalize proposal.',
    'index.save_draft': 'Save Draft',
    'index.save_sent': 'Save as Sent',
    'index.warning': 'Attention',
    'index.select_one': 'Select at least one product to save.',
    'index.success': 'Success',
    'index.draft_saved': 'Draft saved successfully.',
    'index.proposal_saved': 'Proposal saved and marked as sent.',
    'index.error': 'Error',
    'index.error_saving': 'Could not save the quote.',
    'index.saving': 'Saving...',
    'index.confirm': 'Confirm',
    'index.save_quote': 'Save Quote',
    'index.agency_name_desc': 'Enter the agency name to identify this quote.',
    'index.agency': 'Agency',
    'index.agency_placeholder': 'Ex: Travel Agency Inc',
  },
}

export type TranslationKey = keyof typeof translations.pt

interface TranslationContextType {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: TranslationKey) => string
}

const TranslationContext = createContext<TranslationContextType | undefined>(undefined)

export const TranslationProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('language')
    if (saved && ['pt', 'es', 'en'].includes(saved)) {
      return saved as Language
    }
    return 'pt'
  })

  const setLanguage = (lang: Language) => {
    setLanguageState(lang)
    localStorage.setItem('language', lang)
  }

  const t = (key: TranslationKey): string => {
    return translations[language][key] || translations.pt[key] || key
  }

  return React.createElement(
    TranslationContext.Provider,
    { value: { language, setLanguage, t } },
    children,
  )
}

export const useTranslation = () => {
  const context = useContext(TranslationContext)
  if (!context) {
    throw new Error('useTranslation must be used within TranslationProvider')
  }
  return context
}
