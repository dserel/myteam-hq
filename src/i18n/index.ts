import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import el from './el.json'
import en from './en.json'

const saved = (() => { try { return localStorage.getItem('locale') } catch { return null } })()

i18n.use(initReactI18next).init({
  resources: { el: { translation: el }, en: { translation: en } },
  lng: saved === 'en' ? 'en' : 'el',
  fallbackLng: 'el',
  interpolation: { escapeValue: false },
})

export function setLocale(l: 'el' | 'en') {
  i18n.changeLanguage(l)
  try { localStorage.setItem('locale', l) } catch { /* ignore */ }
  document.documentElement.lang = l
}

export default i18n
