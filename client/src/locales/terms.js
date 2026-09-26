import terms from './terms.json';

// Names from terms.json in the current language, falling back to English, then to the raw key
const pick = (entry, lang, fallback) => entry?.[lang] || entry?.en || fallback;

export const cropName = (crop, lang) => pick(terms.crops[crop], lang, crop);
export const diseaseName = (crop, disease, lang) =>
  pick(terms.diseases[crop]?.[disease], lang, disease?.replace(/_/g, ' '));
export const severityName = (severity, lang) => pick(terms.severity[severity], lang, severity);
