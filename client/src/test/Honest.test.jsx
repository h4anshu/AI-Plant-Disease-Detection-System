import { expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import metrics from '../../../ml-service/models/metrics.json';
import { ACCURACY } from '../data/accuracy';
import Honest from '../components/Honest';

test('the landing-page accuracy table matches ml-service/models/metrics.json exactly, for every crop', () => {
  expect(ACCURACY).toHaveLength(metrics.crops.length);
  for (const m of metrics.crops) {
    const r = ACCURACY.find((a) => a.crop === m.crop);
    expect(r, m.crop).toBeTruthy();
    expect([r.acc, r.lo, r.hi, r.n]).toEqual([m.accuracy, m.ci95[0], m.ci95[1], m.n_test]);
    expect(r.cv).toBe(m.eval_method !== 'holdout split');
  }
  expect(ACCURACY.map((a) => a.acc)).toEqual([...ACCURACY.map((a) => a.acc)].sort((x, y) => y - x));
});

test('the section lists all ten crops with their interval, and marks the weakest one', () => {
  render(<MemoryRouter><Honest /></MemoryRouter>);
  expect(screen.getAllByRole('row')).toHaveLength(11);               // header + 10 crops
  expect(screen.getByText('99.78%')).toBeInTheDocument();
  expect(screen.getByText('81.08%')).toBeInTheDocument();
  expect(screen.getByText(/our weakest/i)).toBeInTheDocument();
});
