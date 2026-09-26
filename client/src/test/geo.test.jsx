import { afterEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BINS, binLabel, colorFor } from '../pages/mapStyle';

const exif = vi.hoisted(() => ({ gps: null }));
vi.mock('exifr', () => ({ gps: async () => exif.gps }));
const api = vi.hoisted(() => ({ deleted: 0, calls: 0, fail: false }));
vi.mock('../services/api', () => ({
  deleteMyData: async () => { api.calls++; if (api.fail) throw new Error('x'); return { data: { deleted: api.deleted } }; },
}));
import { getLocation } from '../services/location';
import Privacy from '../pages/Privacy';

const geolocation = (outcome) => {
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
    getCurrentPosition: (ok, fail) => (outcome ? ok({ coords: outcome }) : fail({ code: 1 })),
  } });
};
afterEach(() => { exif.gps = null; delete navigator.geolocation; });

describe('getLocation (only called after consent)', () => {
  const photo = new File(['x'], 'leaf.jpg', { type: 'image/jpeg' });

  test('browser GPS first', async () => {
    geolocation({ latitude: 30.9, longitude: 75.85, accuracy: 12.4 });
    exif.gps = { latitude: 1, longitude: 2 };
    expect(await getLocation(photo)).toEqual({ lat: 30.9, lon: 75.85, accuracy_m: 12, location_source: 'gps' });
  });

  test('refused GPS -> the photo EXIF location', async () => {
    geolocation(null);
    exif.gps = { latitude: 23.52, longitude: 77.81 };
    expect(await getLocation(photo)).toEqual({ lat: 23.52, lon: 77.81, location_source: 'exif' });
  });

  test('neither -> none (no browser geolocation, photo without GPS)', async () => {
    expect(await getLocation(photo)).toEqual({ location_source: 'none' });
  });
});

describe('map colours', () => {
  test('bins start at the server minimum of 3 and darken with more reports', () => {
    expect(colorFor(3)).toBe(BINS[0].color);
    expect(colorFor(7)).toBe(BINS[1].color);
    expect(colorFor(24)).toBe(BINS[2].color);
    expect(colorFor(400)).toBe(BINS[3].color);
    expect(BINS.map((_, i) => binLabel(i))).toEqual(['3–4', '5–9', '10–24', '25+']);
  });
});

describe('Privacy page', () => {
  test('explains the data, and deletes only after a second, explicit confirmation', async () => {
    api.deleted = 4;
    render(<Privacy />);
    expect(screen.getByRole('heading', { name: 'What is public' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete my data' }));
    expect(api.calls).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete my data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete everything' }));
    expect(await screen.findByText('Deleted 4 checkups from this browser.')).toBeInTheDocument();
    expect(api.calls).toBe(1);
  });

  test('a failed delete says so', async () => {
    api.fail = true;
    render(<Privacy />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete my data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete everything' }));
    expect(await screen.findByText(/Could not delete/)).toBeInTheDocument();
    api.fail = false;
  });
});
