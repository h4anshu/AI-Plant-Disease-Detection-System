import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import hi from './locales/hi.json';

// Adding a language: add locales/<code>.json with the same keys, a "<code>" field to the entries in
// locales/terms.json, and the code here; the Navbar switcher lists LANGUAGES.
export const LANGUAGES = { en: { short: 'EN', name: 'English' }, hi: { short: 'हिं', name: 'हिंदी' } };
const STORAGE_KEY = 'lang';

const saved = (() => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } })();
const fromBrowser = (navigator.language || 'en').slice(0, 2).toLowerCase();
const initial = [saved, fromBrowser].find((l) => l in LANGUAGES) ?? 'en';

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi } },
  lng: initial,
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React escapes already
});

const apply = (lng) => {
  document.documentElement.lang = lng; // picks the Devanagari font and spacing rules in index.css
  try { localStorage.setItem(STORAGE_KEY, lng); } catch { /* private mode: choice just isn't remembered */ }
};
apply(i18n.language);
i18n.on('languageChanged', apply);

export default i18n;
