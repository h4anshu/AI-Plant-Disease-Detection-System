import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

// a plain function, not vi.fn(): Vitest's spy chains onto a returned rejected promise to record it,
// and that chained copy is reported as an unhandled rejection even though the component catches it
const api = vi.hoisted(() => ({ calls: [], reply: null }));
vi.mock('../services/api', () => ({ predictDisease: (formData) => { api.calls.push(formData); return api.reply(); } }));
import Predict from '../pages/Predict';

const CROPS = ['wheat', 'rice', 'sugarcane', 'potato', 'maize', 'pigeonpea', 'groundnut', 'blackgram', 'apple', 'banana'];

const chooseFile = (container) => {
  const input = container.querySelector('input[type="file"]');
  fireEvent.change(input, { target: { files: [new File(['x'], 'leaf.jpg', { type: 'image/jpeg' })] } });
};

describe('Predict page', () => {
  beforeEach(() => { api.calls = []; api.reply = null; });

  test('offers all 10 live crops', () => {
    render(<Predict />);
    for (const crop of CROPS) expect(screen.getByRole('button', { name: crop })).toBeInTheDocument();
  });

  test('asks for a photo before analysing', () => {
    render(<Predict />);
    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    expect(screen.getByText('Select a leaf image first.')).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });

  test('sends the photo with the chosen crop and shows the result', async () => {
    api.reply = async () => ({ data: { status: 'not_leaf', reasons: ['no_leaf'], crop: 'banana', imageUrl: 'u' } });
    const { container } = render(<Predict />);
    fireEvent.click(screen.getByRole('button', { name: 'banana' }));
    chooseFile(container);
    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    expect(await screen.findByRole('heading', { name: 'No leaf found' })).toBeInTheDocument();
    const sent = api.calls[0];
    expect(sent.get('crop')).toBe('banana');
    expect(sent.get('image').name).toBe('leaf.jpg');
  });

  test('shows the server message when the request fails', async () => {
    // axios rejects with an Error carrying the server response
    api.reply = async () => {
      throw Object.assign(new Error('Request failed with status code 502'),
        { response: { status: 502, data: { message: 'The diagnosis service is unavailable right now.' } } });
    };
    const { container } = render(<Predict />);
    chooseFile(container);
    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    expect(await screen.findByText('The diagnosis service is unavailable right now.')).toBeInTheDocument();
  });
});
