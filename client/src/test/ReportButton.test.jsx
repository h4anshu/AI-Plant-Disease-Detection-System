import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ calls: [], fail: false }));
vi.mock('../services/api', () => ({
  getReport: async (id, lang) => {
    api.calls.push([id, lang]);
    if (api.fail) throw new Error('Network Error');
    return { data: new Blob(['%PDF-1.3']) };
  },
}));
import ReportButton from '../components/ReportButton';

beforeEach(() => {
  api.calls = [];
  api.fail = false;
  URL.createObjectURL = vi.fn(() => 'blob:report');
  URL.revokeObjectURL = vi.fn();
});

test('downloads the PDF for this checkup in the app language', async () => {
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  render(<ReportButton predictionId="p1" hasLocation />);
  expect(screen.getByText(/only if you opened it above/)).toBeInTheDocument();
  expect(screen.getByText(/Not an official loss assessment/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Download report (PDF)' }));
  await waitFor(() => expect(click).toHaveBeenCalled());
  expect(api.calls).toEqual([['p1', 'en']]);
  expect(URL.createObjectURL).toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Download report (PDF)' })).toBeEnabled();
  click.mockRestore();
});

test('says so when the report cannot be made', async () => {
  api.fail = true;
  render(<ReportButton predictionId="p1" hasLocation={false} />);
  expect(screen.queryByText(/opened it above/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Download report (PDF)' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not make the report');
});
