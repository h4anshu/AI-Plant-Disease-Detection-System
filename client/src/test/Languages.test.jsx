import { afterEach, describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n, { LANGUAGES, serverLang } from '../i18n';
import en from '../locales/en.json';
import hi from '../locales/hi.json';
import pa from '../locales/pa.json';
import or from '../locales/or.json';
import terms from '../locales/terms.json';
import { AuthContext } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import api from '../services/api';
import { cropName, diseaseName, severityName } from '../locales/terms';

// Punjabi and Odia (docs/LANGUAGES.md): the screens and the names are translated, the long advice and legal texts are not yet and fall back
afterEach(async () => { await i18n.changeLanguage('en'); localStorage.clear(); });

const flat = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) => (typeof v === 'object' ? flat(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]));
const EN = Object.fromEntries(flat(en));
const placeholders = (s) => [...s.matchAll(/\{\{\w+\}\}|<\/?b>/g)].map((m) => m[0]).sort();
const SCRIPT = { pa: /[਀-੿]/, or: /[଀-୿]/ };

describe.each([['pa', pa], ['or', or]])('the %s locale file', (code, file) => {
  const entries = flat(file);

  test('has only keys that exist in en.json, none empty, and translates the core of the app', () => {
    expect(entries.filter(([k]) => !(k in EN)).map(([k]) => k)).toEqual([]);
    expect(entries.filter(([, v]) => !String(v).trim()).map(([k]) => k)).toEqual([]);
    expect(entries.length).toBeGreaterThan(450);
    for (const k of ['nav.home', 'result.treatment', 'alerts.level.warn', 'auth.loginTitle', 'push.turnOn', 'ws.overview.heroCta']) expect(entries.some(([key]) => key === k)).toBe(true);
  });

  test('keeps every {{placeholder}} and <b> of the English text, so no sentence loses its number or name', () => {
    expect(entries.filter(([k, v]) => placeholders(v).join() !== placeholders(EN[k]).join()).map(([k]) => k)).toEqual([]);
  });

  test('every text is in the language\'s own script', () => {
    expect(entries.filter(([, v]) => !SCRIPT[code].test(v)).map(([k]) => k)).toEqual([]);
  });

  test('a plural has both of its forms', () => {
    const keys = new Set(entries.map(([k]) => k));
    for (const k of keys) {
      if (k.endsWith('_one')) expect(keys.has(k.replace(/_one$/, '_other'))).toBe(true);
      if (k.endsWith('_other')) expect(keys.has(k.replace(/_other$/, '_one'))).toBe(true);
    }
  });

  test('is not a copy of the Hindi or the English: the texts differ', () => {
    const hiFlat = Object.fromEntries(flat(hi));
    const same = entries.filter(([k, v]) => v === EN[k] || v === hiFlat[k]).map(([k]) => k);
    expect(same).toEqual([]);
  });
});

describe('the names in terms.json', () => {
  const all = [...Object.values(terms.crops), ...Object.values(terms.diseases).flatMap(Object.values), ...Object.values(terms.severity)];

  test('every crop, disease and severity has a Punjabi and an Odia name in its script, and is still marked for review', () => {
    expect(all).toHaveLength(10 + 53 + 4);
    for (const e of all) {
      expect(e.pa).toMatch(SCRIPT.pa);
      expect(e.or).toMatch(SCRIPT.or);
      expect(e.needs_review).toBe(true);
    }
  });

  test('the app shows them', async () => {
    await i18n.changeLanguage('pa');
    expect(cropName('wheat', 'pa')).toBe('ਕਣਕ');
    expect(diseaseName('potato', 'Late_blight', 'pa')).toBe('ਪਿਛੇਤਾ ਝੁਲਸ');
    expect(severityName('severe', 'pa')).toBe('ਗੰਭੀਰ');
    expect(cropName('rice', 'or')).toBe('ଧାନ');
    expect(diseaseName('potato', 'Early_blight', 'or')).toBe('ଅଗୁଆ ଝଲସା');
    expect(severityName('moderate', 'or')).toBe('ମଧ୍ୟମ');
  });
});

describe('choosing a language', () => {
  test('there are four, in the switcher of the navbar, each in its own name', () => {
    expect(Object.keys(LANGUAGES)).toEqual(['en', 'hi', 'pa', 'or']);
    render(<MemoryRouter><AuthContext.Provider value={{}}><Navbar /></AuthContext.Provider></MemoryRouter>);
    for (const name of ['English', 'हिंदी', 'ਪੰਜਾਬੀ', 'ଓଡ଼ିଆ']) expect(screen.getByRole('button', { name })).toBeInTheDocument();
  });

  test('choosing one sets the page language (so the right font and rules apply) and is remembered', async () => {
    for (const code of ['pa', 'or']) {
      await i18n.changeLanguage(code);
      expect(document.documentElement.lang).toBe(code);
      expect(localStorage.getItem('lang')).toBe(code);
    }
  });

  test('a translated text is used; a text not translated falls back to Hindi for Punjabi and to English for Odia', async () => {
    await i18n.changeLanguage('pa');
    expect(i18n.t('nav.diagnose')).toBe(pa.nav.diagnose);
    expect(i18n.t('privacy.storedTitle')).toBe(hi.privacy.storedTitle);
    expect(i18n.t('privacy.storedTitle')).not.toBe(en.privacy.storedTitle);
    await i18n.changeLanguage('or');
    expect(i18n.t('nav.diagnose')).toBe(or.nav.diagnose);
    expect(i18n.t('privacy.storedTitle')).toBe(en.privacy.storedTitle);
    expect(i18n.t('no.such.key')).toBe('no.such.key');
  });

  test('plurals use their own forms', async () => {
    await i18n.changeLanguage('pa');
    expect(i18n.t('ws.log.count', { count: 3 })).toBe(pa.ws.log.count_other.replace('{{count}}', '3'));
    await i18n.changeLanguage('or');
    expect(i18n.t('ws.log.count', { count: 1 })).toBe(or.ws.log.count_one.replace('{{count}}', '1'));
  });
});

describe('what the server is asked for', () => {
  test('it composes advice and reports in English and Hindi only: Punjabi asks for Hindi, Odia for English', () => {
    expect([serverLang('en'), serverLang('hi'), serverLang('pa'), serverLang('or'), serverLang('xx')]).toEqual(['en', 'hi', 'hi', 'en', 'en']);
  });

  test('the Accept-Language header follows', async () => {
    const add = (config) => api.interceptors.request.handlers[0].fulfilled(config);
    for (const [lang, sent] of [['pa', 'hi'], ['or', 'en'], ['hi', 'hi'], ['en', 'en']]) {
      await i18n.changeLanguage(lang);
      expect(add({ headers: {} }).headers['Accept-Language']).toBe(sent);
    }
  });

  test('the result card tells a Punjabi reader the advice is in Hindi, and an Odia reader that it is in English', () => {
    expect(pa.result.notReviewed).toContain('ਹਿੰਦੀ');
    expect(or.result.notReviewed).toContain('ଇଂରାଜୀ');
  });
});
