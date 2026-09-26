import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// a plain function, not vi.fn(): Vitest's spy chains onto a returned rejected promise to record it,
// and that chained copy is reported as an unhandled rejection even though the component catches it
const api = vi.hoisted(() => ({ calls: [], reply: null }));
vi.mock('../services/api', () => ({ predictDisease: (formData) => { api.calls.push(formData); return api.reply(); } }));
const geo = vi.hoisted(() => ({ place: { location_source: 'none' }, asked: 0 }));
vi.mock('../services/location', async (orig) => ({ ...(await orig()), getLocation: async () => { geo.asked++; return geo.place; } }));
import Predict, { SLOW_AFTER_MS } from '../pages/Predict';

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>);

const CROPS = ['wheat', 'rice', 'sugarcane', 'potato', 'maize', 'pigeonpea', 'groundnut', 'blackgram', 'apple', 'banana'];

const chooseFile = (container) => {
  const input = container.querySelector('input[type="file"]');
  fireEvent.change(input, { target: { files: [new File(['x'], 'leaf.jpg', { type: 'image/jpeg' })] } });
};

describe('Predict page', () => {
  beforeEach(() => { api.calls = []; api.reply = null; geo.asked = 0; localStorage.clear(); });

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

  test('a slow first call (cold start) says the model is waking up, and the note goes away with the result', async () => {
    vi.useFakeTimers();
    try {
      let answer;
      api.reply = () => new Promise((resolve) => { answer = resolve; });
      const { container } = render(<Predict />);
      chooseFile(container);
      fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
      act(() => vi.advanceTimersByTime(SLOW_AFTER_MS - 1));
      expect(screen.queryByText(/waking up the model/i)).toBeNull();
      act(() => vi.advanceTimersByTime(1));
      expect(screen.getByText(/waking up the model/i)).toBeInTheDocument();
      await act(async () => answer({ data: { status: 'not_leaf', reasons: ['no_leaf'], crop: 'wheat', imageUrl: 'u' } }));
      expect(screen.queryByText(/waking up the model/i)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test('location: asked first, sent only after "Share my location", remembered, and "none" after Skip', async () => {
    api.reply = async () => ({ data: { status: 'not_leaf', reasons: ['no_leaf'], crop: 'wheat', imageUrl: 'u' } });
    geo.place = { lat: 30.9, lon: 75.85, accuracy_m: 12, location_source: 'gps' };
    const { container, unmount } = render(<Predict />);
    expect(screen.getByRole('heading', { name: /Add your location/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Share my location' }));
    expect(screen.getByText(/Location: shared/)).toBeInTheDocument();
    chooseFile(container);
    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    await screen.findByRole('heading', { name: 'No leaf found' });
    expect(Object.fromEntries([...api.calls[0].entries()].filter(([k]) => k !== 'image')))
      .toEqual({ crop: 'wheat', lat: '30.9', lon: '75.85', accuracy_m: '12', location_source: 'gps' });
    expect(localStorage.getItem('locationConsent')).toBe('granted');
    unmount();

    render(<Predict />); // remembered: no question this time
    expect(screen.queryByRole('heading', { name: /Add your location/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    chooseFile(document.body);
    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    await screen.findAllByRole('heading', { name: 'No leaf found' });
    expect(api.calls[1].get('location_source')).toBe('none');
    expect(api.calls[1].get('lat')).toBeNull();
    expect(geo.asked).toBe(1); // never read without consent
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
