import { afterEach, describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '../i18n';
import Privacy from '../pages/Privacy';

// The Privacy page says what the weather alerts send out and keep (docs/FIELD_ALERTS.md, "Operations"). The numbers it states are the code's:
// 5 km and 22 km boxes (services/openMeteo.js, fire.js), 3 browsers (utils/geo.js MIN_DEVICES), a year (models/AlertFeedback.js).
afterEach(async () => { await i18n.changeLanguage('en'); });

describe('Privacy page, weather alerts', () => {
  test('what leaves the server: rounded points, the fire area, nothing for the official feeds; how long things are kept', () => {
    render(<Privacy />);
    expect(screen.getByRole('heading', { name: 'Weather alerts: what leaves our server' })).toBeInTheDocument();
    expect(screen.getByText(/rounded to about 5 km, never your field's exact place/)).toBeInTheDocument();
    expect(screen.getByText(/a box of about 22 km/)).toBeInTheDocument();
    expect(screen.getByText(/mandi prices are fetched by our server for everyone \(for a state and a crop, never for a person\), so nothing about you is sent for them/)).toBeInTheDocument();
    expect(screen.getByText(/Saved fields stay until you delete them/)).toBeInTheDocument();
    // the one place the exact point leaves (geo-service/flood.py builds the circle around it): the page says so
    expect(screen.getByText(/exact point of your field goes to Google \(Earth Engine\)/)).toBeInTheDocument();
    expect(screen.getByText(/circle of 500 m/)).toBeInTheDocument();
  });

  test('reports from others and "Did this help?": the 3-browser rule, your own browser left out, no place, a year, deletable', () => {
    render(<Privacy />);
    expect(screen.getByRole('heading', { name: 'Reports from other farmers, and your answers' })).toBeInTheDocument();
    expect(screen.getAllByText(/at least 3 different browsers/).length).toBeGreaterThanOrEqual(2);   // the public-map section says it too
    expect(screen.getByText(/your own browser is never counted/)).toBeInTheDocument();
    expect(screen.getByText(/kept for a year, and "Delete my data" removes it/)).toBeInTheDocument();
  });

  test('Hindi', async () => {
    await i18n.changeLanguage('hi');
    render(<Privacy />);
    expect(screen.getByRole('heading', { name: 'मौसम अलर्ट: हमारे सर्वर से बाहर क्या जाता है' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'दूसरे किसानों की रिपोर्ट, और आपके जवाब' })).toBeInTheDocument();
    expect(screen.getAllByText(/कम से कम 3 अलग-अलग ब्राउज़र/).length).toBeGreaterThanOrEqual(2);
  });
});
