import { afterEach, expect, test } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import MapSection from '../components/MapSection';
import { BINS } from '../pages/mapStyle';

afterEach(async () => { await i18n.changeLanguage('en'); localStorage.clear(); });

test('the map section links to /map with the crop and time window picked in its two selects', () => {
  render(<MemoryRouter><MapSection /></MemoryRouter>);
  const cta = screen.getByRole('link', { name: /Open the map/ });
  expect(cta).toHaveAttribute('href', '/map?crop=potato&days=30');
  fireEvent.change(screen.getByLabelText('Crop'), { target: { value: 'rice' } });
  fireEvent.change(screen.getByLabelText('Time window'), { target: { value: '90' } });
  expect(cta).toHaveAttribute('href', '/map?crop=rice&days=90');
});

test('the legend shows the same four bins and colours as the real map, and the example is labelled as example data', () => {
  const { container } = render(<MemoryRouter><MapSection /></MemoryRouter>);
  for (const label of ['3–4 reports', '5–9 reports', '10–24 reports', '25+ reports']) expect(screen.getByText(label)).toBeInTheDocument();
  const swatches = [...container.querySelectorAll('li .map-hexsw')].map((el) => el.style.background.toLowerCase());
  expect(swatches.length).toBe(BINS.length);
  const rgb = (h) => `rgb(${[1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(', ')})`;   // jsdom reports colours as rgb()
  BINS.forEach((b, i) => expect(swatches[i]).toBe(rgb(b.color)));
  expect(screen.getByText('Example data')).toBeInTheDocument();
});
