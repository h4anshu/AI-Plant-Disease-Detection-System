// Location for a checkup, only ever called after the user agreed (components/LocationConsent.jsx).
// Browser GPS first; if refused, unavailable or slow, the photo's own EXIF GPS (read here in the browser,
// the server strips EXIF from the stored copy); otherwise nothing. Returns the multipart fields the server
// validates (server/utils/geo.js): lat, lon, accuracy_m, location_source = gps | exif | none.
export const CONSENT_KEY = 'locationConsent'; // 'granted' | 'declined'
const GPS_TIMEOUT_MS = 10000;

const fromGps = () => new Promise((resolve) => {
  if (!navigator.geolocation) return resolve(null);
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => resolve({ lat: coords.latitude, lon: coords.longitude,
      accuracy_m: Math.round(coords.accuracy), location_source: 'gps' }),
    () => resolve(null), // denied, unavailable or timed out
    { enableHighAccuracy: false, timeout: GPS_TIMEOUT_MS, maximumAge: 10 * 60 * 1000 },
  );
});

// Phones often remove GPS from photos picked in the browser, so this is a fallback, not the main path
const fromExif = async (file) => {
  try {
    const exifr = await import('exifr'); // loaded only when needed
    const gps = await (exifr.gps ?? exifr.default.gps)(file);
    if (Number.isFinite(gps?.latitude) && Number.isFinite(gps?.longitude)) {
      return { lat: gps.latitude, lon: gps.longitude, location_source: 'exif' };
    }
  } catch { /* no or unreadable EXIF */ }
  return null;
};

export async function getLocation(file) {
  return (await fromGps()) ?? (file && (await fromExif(file))) ?? { location_source: 'none' };
}

export const readConsent = () => {
  try { return localStorage.getItem(CONSENT_KEY); } catch { return null; }
};
export const saveConsent = (value) => {
  try { localStorage.setItem(CONSENT_KEY, value); } catch { /* private mode: asked again next visit */ }
};
