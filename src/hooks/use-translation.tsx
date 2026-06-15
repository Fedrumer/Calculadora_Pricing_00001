import React, { createContext, useContext, useState, ReactNode } from 'react'

import ptTranslations from '@/locales/pt.json'
import esTranslations from '@/locales/es.json'
import enTranslations from '@/locales/en.json'

type Language = 'pt' | 'es' | 'en'

const translations = {
  pt: ptTranslations,
  es: esTranslations,
  en: enTranslations,
} as const

export type TranslationKey = keyof typeof ptTranslations

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

    const browserLang = navigator.language.split('-')[0]
    if (['pt', 'es', 'en'].includes(browserLang)) {
      return browserLang as Language
    }
    return 'pt'
  })

  const setLanguage = (lang: Language) => {
    setLanguageState(lang)
    localStorage.setItem('language', lang)
  }

  const t = (key: TranslationKey): string => {
    const langDict = translations[language] as any
    const fallbackDict = translations.pt as any
    return langDict[key] || fallbackDict[key] || key
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
