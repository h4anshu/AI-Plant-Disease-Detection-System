import { afterEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import en from '../locales/en.json';
import hi from '../locales/hi.json';
import terms from '../locales/terms.json';
import labelMaps from '../../../ml-service/data/label_maps.json';
import { AuthContext } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import ResultCard from '../components/ResultCard';
import api from '../services/api';

afterEach(async () => {
  await i18n.changeLanguage('en');
  localStorage.clear();
});

const keys = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) =>
  (typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

describe('translations are complete', () => {
  test('hi.json has exactly the keys of en.json, none empty', () => {
    expect(keys(hi).sort()).toEqual(keys(en).sort());
    expect(keys(hi).filter((k) => !i18n.getResource('hi', 'translation', k))).toEqual([]);
  });

  test('terms.json covers every crop and class of the ML label maps, each with hi, source and needs_review', () => {
    expect(Object.keys(terms.crops).sort()).toEqual(Object.keys(labelMaps).sort());
    for (const [crop, classes] of Object.entries(labelMaps)) {
      expect(Object.keys(terms.diseases[crop]).sort()).toEqual(Object.keys(classes).sort());
    }
    const entries = [...Object.values(terms.crops), ...Object.values(terms.diseases).flatMap(Object.values),
      ...Object.values(terms.severity)];
    for (const e of entries) {
      expect(e.hi).toMatch(/[ऀ-ॿ]/); // Devanagari
      expect(typeof e.source).toBe('string');
      expect(typeof e.needs_review).toBe('boolean');
    }
  });
});

test('the switcher changes the language, remembers it, and marks the page as Hindi', () => {
  render(<MemoryRouter><AuthContext.Provider value={{}}><Navbar /></AuthContext.Provider></MemoryRouter>);
  expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'हिंदी' }));
  expect(screen.getByRole('link', { name: 'होम' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'हिंदी' })).toHaveAttribute('aria-pressed', 'true');
  expect(localStorage.getItem('lang')).toBe('hi');
  expect(document.documentElement.lang).toBe('hi');
});

test('first visit: the language comes from the browser; a saved choice wins over it', async () => {
  vi.resetModules();
  vi.spyOn(navigator, 'language', 'get').mockReturnValue('hi-IN');
  expect((await import('../i18n')).default.language).toBe('hi');
  vi.resetModules();
  localStorage.setItem('lang', 'en');
  expect((await import('../i18n')).default.language).toBe('en');
  vi.restoreAllMocks();
});

test('a diagnosis in Hindi: farmer names for crop, disease and severity, and the not-reviewed note', async () => {
  await i18n.changeLanguage('hi');
  render(<ResultCard result={{ status: 'ok', crop: 'potato', disease: 'Late_blight', confidence: 0.93,
    severity: 'severe', treatment: 'हिंदी सलाह', treatmentNeedsReview: true, yieldLossPercent: 40, imageUrl: 'u' }} />);
  expect(screen.getByRole('heading', { name: 'पछेती झुलसा' })).toBeInTheDocument();
  expect(screen.getByText('आलू — जाँच परिणाम')).toBeInTheDocument();
  expect(screen.getByText('गंभीर')).toBeInTheDocument();
  expect(screen.getByRole('note')).toHaveTextContent('विशेषज्ञ');
  expect(screen.getByText('40%')).toBeInTheDocument();
});

test('English advice (or reviewed Hindi) shows no review note', () => {
  render(<ResultCard result={{ status: 'ok', crop: 'potato', disease: 'Late_blight', confidence: 0.93,
    severity: 'severe', treatment: 'Spray mancozeb.', yieldLossPercent: 40, imageUrl: 'u' }} />);
  expect(screen.queryByRole('note')).toBeNull();
});

test('API calls ask for the current language', async () => {
  const addHeaders = (config) => api.interceptors.request.handlers[0].fulfilled(config);
  expect(addHeaders({ headers: {} }).headers['Accept-Language']).toBe('en');
  await i18n.changeLanguage('hi');
  expect(addHeaders({ headers: {} }).headers['Accept-Language']).toBe('hi');
});
