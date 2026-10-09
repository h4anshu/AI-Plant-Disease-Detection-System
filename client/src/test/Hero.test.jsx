import { afterEach, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import en from '../locales/en.json';
import hi from '../locales/hi.json';
import { AuthContext } from '../context/AuthContext';
import Home from '../pages/Home';

afterEach(async () => { await i18n.changeLanguage('en'); localStorage.clear(); });

const renderHome = () => render(<MemoryRouter><AuthContext.Provider value={{}}><Home /></AuthContext.Provider></MemoryRouter>);

test('hero: one headline, the main button goes to /predict, in English and Hindi', async () => {
  renderHome();
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(en.home.title1);
  expect(screen.getByRole('link', { name: new RegExp(en.home.cta) })).toHaveAttribute('href', '/predict');
  await i18n.changeLanguage('hi');
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(hi.home.title1);
  expect(screen.getByRole('link', { name: new RegExp(hi.home.cta) })).toHaveAttribute('href', '/predict');
});

test('hero: the example result card shows the example copy and the decorative art is hidden from screen readers', () => {
  const { container } = renderHome();
  expect(screen.getByText(en.home.exampleTitle)).toBeInTheDocument();
  expect(screen.getByText('87%')).toBeInTheDocument();
  expect(container.querySelector('.hero-stage')).toHaveAttribute('aria-hidden', 'true');
});
