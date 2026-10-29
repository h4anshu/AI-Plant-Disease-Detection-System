import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import hi from './locales/hi.json';
import pa from './locales/pa.json';
import or from './locales/or.json';

// Adding a language: add locales/<code>.json (all the keys, or the core ones: a missing key falls back, see below), a "<code>" field to the
// entries in locales/terms.json, the code here, its font in index.html / index.css, and its words in server/utils/pushText.js. The switchers list LANGUAGES.
// Punjabi and Odia (docs/LANGUAGES.md) translate the screens and the names; the long advice and legal texts are not translated yet, so a missing
// key falls back to Hindi for Punjabi (most Punjabi readers know it) and to English for Odia.
export const LANGUAGES = {
  en: { short: 'EN', name: 'English' },
  hi: { short: 'हिं', name: 'हिंदी' },
  pa: { short: 'ਪੰ', name: 'ਪੰਜਾਬੀ' },
  or: { short: 'ଓଡ଼', name: 'ଓଡ଼ିଆ' },
};
// The server composes treatment advice and the PDF report in English and Hindi only: the languages without them ask for the nearest one.
export const serverLang = (lang) => ({ pa: 'hi' }[lang] ?? (lang === 'hi' ? 'hi' : 'en'));
const STORAGE_KEY = 'lang';

const saved = (() => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } })();
const fromBrowser = (navigator.language || 'en').slice(0, 2).toLowerCase();
const initial = [saved, fromBrowser].find((l) => l in LANGUAGES) ?? 'en';

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi }, pa: { translation: pa }, or: { translation: or } },
  lng: initial,
  fallbackLng: { pa: ['hi', 'en'], default: ['en'] },
  interpolation: { escapeValue: false }, // React escapes already
});

const apply = (lng) => {
  document.documentElement.lang = lng; // picks the Devanagari, Gurmukhi or Odia font and spacing rules in index.css
  try { localStorage.setItem(STORAGE_KEY, lng); } catch { /* private mode: choice just isn't remembered */ }
};
apply(i18n.language);
i18n.on('languageChanged', apply);

export default i18n;
