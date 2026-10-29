import { describe, expect, test } from 'vitest';
import { formatDate, formatDateTime, formatTime } from '../locales/dates';

// dates and times in every language of the screen (docs/LANGUAGES.md): Punjabi and Odia from tables, English and Hindi from the browser
const D = new Date(2026, 9, 29, 18, 47);   // Thursday 29 October 2026, 6:47 pm local time

describe('English and Hindi are the browser\'s own', () => {
  test.each([['en', 'en-IN'], ['hi', 'hi']])('%s', (lang, loc) => {
    for (const opts of [{ day: 'numeric', month: 'short' }, { weekday: 'long', day: 'numeric', month: 'long' }, { weekday: 'short' }, { day: 'numeric', month: 'long', year: 'numeric' }]) {
      expect(formatDate(D, lang, opts)).toBe(D.toLocaleDateString(loc, opts));
    }
    expect(formatTime(D, lang, { hour: 'numeric', minute: '2-digit' })).toBe(D.toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' }));
    expect(formatDateTime(D, lang, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })).toBe(D.toLocaleString(loc, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }));
  });
});

describe('Punjabi and Odia', () => {
  test('Punjabi dates are in Gurmukhi, with the day, the month and the weekday where asked', () => {
    expect(formatDate(D, 'pa', { day: 'numeric', month: 'short' })).toBe('29 ਅਕਤੂ');
    expect(formatDate(D, 'pa', { weekday: 'long', day: 'numeric', month: 'long' })).toBe('ਵੀਰਵਾਰ, 29 ਅਕਤੂਬਰ');
    expect(formatDate(D, 'pa', { weekday: 'short' })).toBe('ਵੀਰ');
    expect(formatDate(D, 'pa', { weekday: 'short', day: 'numeric' })).toBe('ਵੀਰ, 29');
    expect(formatDate(D, 'pa', { day: 'numeric', month: 'long', year: 'numeric' })).toBe('29 ਅਕਤੂਬਰ 2026');
  });

  test('Odia dates are in Odia script', () => {
    expect(formatDate(D, 'or', { day: 'numeric', month: 'short' })).toBe('29 ଅକ୍ଟୋ');
    expect(formatDate(D, 'or', { weekday: 'long', day: 'numeric', month: 'long' })).toBe('ଗୁରୁବାର, 29 ଅକ୍ଟୋବର');
    expect(formatDate(D, 'or', { weekday: 'short' })).toBe('ଗୁରୁ');
  });

  test('every month and weekday has a name, in the right script, and none repeats', () => {
    for (const [lang, script] of [['pa', /^[\u0A00-\u0A7F]+$/], ['or', /^[\u0B00-\u0B7F]+$/]]) {
      for (const style of ['long', 'short']) {
        const months = Array.from({ length: 12 }, (_, m) => formatDate(new Date(2026, m, 15), lang, { month: style }));
        const days = Array.from({ length: 7 }, (_, d) => formatDate(new Date(2026, 9, 25 + d), lang, { weekday: style }));
        for (const name of [...months, ...days]) expect(name).toMatch(script);
        expect(new Set(days).size).toBe(7);
        expect(new Set(months).size).toBe(12);
      }
    }
  });

  test('times are the 12-hour English form with 0-9 digits, and a date with a time joins them', () => {
    expect(formatTime(D, 'pa', { hour: 'numeric', minute: '2-digit' })).toBe(D.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }));
    expect(formatDateTime(D, 'or', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })).toMatch(/^29 ଅକ୍ଟୋ, 6:47\s?pm$/i);
    expect(formatDateTime(D, 'pa', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })).toMatch(/^29 ਅਕਤੂ 2026, 06:47\s?pm$/i);
  });
});
