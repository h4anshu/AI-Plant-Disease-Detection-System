import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

// plain functions, not vi.fn(): see the note in Predict.test.jsx
const api = vi.hoisted(() => ({ sent: [], fail: false }));
vi.mock('../services/api', () => ({
  sendFeedback: async (id, body) => {
    if (api.fail) throw new Error('Network Error');
    api.sent.push([id, body]);
  },
  getCropClasses: async () => ({ data: { wheat: ['BlackPoint', 'HealthyLeaf', 'WheatBlast'] } }),
}));
import Feedback from '../components/Feedback';

beforeEach(() => { api.sent = []; api.fail = false; });

test('"Yes" sends correct and thanks the user', async () => {
  render(<Feedback predictionId="p1" crop="wheat" />);
  fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
  expect(await screen.findByText('Thank you for the feedback.')).toBeInTheDocument();
  expect(api.sent).toEqual([['p1', { feedback: 'correct' }]]);
});

test('"No" lets the user pick the right class from that crop, or Other', async () => {
  render(<Feedback predictionId="p1" crop="wheat" />);
  fireEvent.click(screen.getByRole('button', { name: 'No' }));
  const select = await screen.findByLabelText('What was it?');
  expect([...select.options].map((o) => o.value)).toEqual(['', 'BlackPoint', 'HealthyLeaf', 'WheatBlast', 'Other']);
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  fireEvent.change(select, { target: { value: 'WheatBlast' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  expect(await screen.findByText(/checked by an expert/)).toBeInTheDocument();
  expect(api.sent).toEqual([['p1', { feedback: 'incorrect', correctedLabel: 'WheatBlast' }]]);
});

test('a failed save keeps the buttons and says so', async () => {
  api.fail = true;
  render(<Feedback predictionId="p1" crop="wheat" />);
  fireEvent.click(screen.getByRole('button', { name: 'Not sure' }));
  expect(await screen.findByText(/Could not save/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Yes' })).toBeEnabled();
});
