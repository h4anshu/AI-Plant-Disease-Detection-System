import { afterEach, expect, test } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import Beyond from '../components/Beyond';
import ReportSection from '../components/ReportSection';
import Finale from '../components/Finale';

afterEach(async () => { await i18n.changeLanguage('en'); localStorage.clear(); });
const wrap = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

test('Around the leaf: the three cards are all labelled as example data, and risk is shown with a word and a glyph, not colour alone', () => {
  const { container } = wrap(<Beyond />);
  expect(screen.getAllByText('Example data')).toHaveLength(3);
  const chips = container.querySelectorAll('ol li');
  expect(chips).toHaveLength(6);
  for (const li of chips) { expect(li.querySelector('svg')).toBeTruthy(); expect(li.textContent).toMatch(/Low|Medium|High/); }
});

test('Report section: the sample PDF follows the language, and the language buttons really switch it', () => {
  wrap(<ReportSection />);
  const link = screen.getByRole('link', { name: /sample report/i });
  expect(link).toHaveAttribute('href', '/samples/plantguard-sample-report.pdf');
  fireEvent.click(screen.getByRole('button', { name: 'हिंदी' }));
  expect(i18n.language).toBe('hi');
  expect(screen.getByRole('link', { name: /नमूना रिपोर्ट/ })).toHaveAttribute('href', '/samples/plantguard-sample-report-hi.pdf');
});

test('Closing band: one main button to /predict, footer links to the real pages, and the honest limits line', () => {
  wrap(<Finale />);
  expect(screen.getByRole('link', { name: /Check a leaf now/ })).toHaveAttribute('href', '/predict');
  for (const [name, href] of [['Diagnose', '/predict'], ['Log', '/history'], ['Map', '/map'], ['Privacy', '/privacy']]) expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
  expect(screen.getByText(/Estimates, not a lab test/)).toBeInTheDocument();
});
