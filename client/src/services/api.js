import axios from 'axios';
import i18n from '../i18n';
import { clearLast } from './offlineCache';

const API_URL = import.meta.env.VITE_API_URL;

const api = axios.create({
  baseURL: API_URL
})

// A visitor who has not signed in is a guest; this random per-browser id keeps each browser's records private
// (server/middleware/guestDevice.js). It is sent with every request, also when signed in (the account ignores it,
// and it lets "add this browser's records to my account" find them).
export const getDeviceId = () => {
  let id = localStorage.getItem('deviceId');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('deviceId', id);
  }
  return id;
};

// Attach token to every request automatically, if it exists
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.authorization = `Bearer ${token}`;
  }
  config.headers['x-device-id'] = getDeviceId();
  // one id per request, logged by the server and the ML service (docs/MONITORING.md)
  config.headers['x-request-id'] = crypto.randomUUID();
  // the server answers treatment advice in this language when it has it (English otherwise)
  config.headers['Accept-Language'] = i18n.language;
  return config;
});

// A token the server no longer accepts (expired, or the account was deleted): forget it and tell the app, which signs out
// (context/AuthContext.jsx). Other 401s (a wrong password) leave the session alone.
api.interceptors.response.use((res) => res, (error) => {
  if (error.response?.status === 401 && error.response.data?.code === 'invalid_token') {
    try { localStorage.removeItem('token'); localStorage.removeItem('user'); } catch { /* private mode */ }
    window.dispatchEvent(new Event('auth:expired'));
  }
  return Promise.reject(error);
});

// --- Auth (docs/AUTH.md) ---
export const registerUser = (data) => api.post('/auth/register', data);
export const loginUser = (data) => api.post('/auth/login', data);
export const getMe = () => api.get('/auth/me');
// asks for the password again; erases the account and everything of it
export const deleteAccount = (password) => api.delete('/auth/me', { data: { password } });
// what this browser holds as a guest ({ predictions, fields }), and moving it into the signed-in account
export const getGuestData = () => api.get('/auth/guest-data');
export const claimGuestData = () => api.post('/auth/claim-guest');


// --- Predictions ---
export const predictDisease = (formData) =>
  api.post('/predict', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

// newest first, 50 per page; pass the createdAt of the last record shown to get older ones
export const getPredictionHistory = (before) => api.get('/predict', { params: before ? { before } : {} });

// one checkup of this browser, with its heatmap (the checkup page opens by link)
export const getPrediction = (id) => api.get(`/predict/${id}`);

// "Was this correct?": { feedback: 'correct' | 'incorrect' | 'unsure', correctedLabel? }
export const sendFeedback = (id, body) => api.patch(`/predict/${id}/feedback`, body);
export const getCropClasses = () => api.get('/predict/classes');

// Removes every checkup of this browser (and its photos) from the server: /privacy page
export const deleteMyData = () => api.delete('/predict').then((res) => { clearLast(); return res; });   // the copy kept for offline goes too

// Satellite view of the diagnosed field (only for checkups with a consented location)
export const getFieldHealth = (id) => api.get(`/predict/${id}/field-health`, { timeout: 120000 });

// Weather-based disease risk (docs/DISEASE_RISK.md): for a checkup (its private location) or a map point
// One-click PDF report of a checkup (docs/REPORT.md)
export const getReport = (id, lang) => api.get(`/predict/${id}/report.pdf`, { params: { lang }, responseType: 'blob', timeout: 60000 });

// Environment context of a checkup (docs/CONTEXT_LAYER.md): weather, soil, season and how they fit the
// diagnosis. The first call builds it (weather + Earth Engine), so it may take a few seconds.
export const getPredictionContext = (id) => api.get(`/predict/${id}/context`, { timeout: 120000 });
// the farmer's own Soil Health Card numbers for that checkup
export const putSoilTest = (id, body) => api.patch(`/predict/${id}/soil-test`, body);

export const getPredictionRisk = (id) => api.get(`/predict/${id}/disease-risk`);
export const getDiseaseRisk = (params) => api.get('/disease-risk', { params });

// --- Saved fields and their weather alerts (docs/FIELD_ALERTS.md). Fields belong to this browser like checkups do.
// The alerts call returns every field with its alerts, 72-hour strip and conditions; a field whose weather
// could not be loaded comes back with status 'weather_unavailable'.
export const getFieldAlerts = () => api.get('/fields/alerts');
export const getFields = () => api.get('/fields');
// { crop, stage, lat, lon, name? } (at most 3 per browser); stage and name can change later, crop and place cannot
export const createField = (body) => api.post('/fields', body);
export const updateField = (id, body) => api.patch(`/fields/${id}`, body);
export const deleteField = (id) => api.delete(`/fields/${id}`);
// is the area around the field newly under water, from the newest Sentinel-1 radar image? (an Earth Engine call: only on request)
export const getFloodExtent = (id) => api.get(`/fields/${id}/flood-extent`);
// headlines (The Hindu, PIB) and official pages for the field's state and crop; the server never sends a place back
export const getFieldNews = (id) => api.get(`/fields/${id}/news`);
// the last mandi prices reported for the field's crop in its state ({ status: ok | stale | none | unavailable | disabled | no_state, ... })
export const getFieldPrices = (id) => api.get(`/fields/${id}/prices`);
// "Did this help?" on an alert: { alertId, level, answer: acted | not_needed | wrong }; the server stores no place
export const sendAlertFeedback = (fieldId, body) => api.post(`/fields/${fieldId}/alerts/feedback`, body);

// --- Notifications (docs/PUSH.md). 503 from getPushKey means the server has no push keys: the feature is off.
export const getPushKey = () => api.get('/push/key');
export const subscribePush = (subscription, lang) => api.post('/push/subscribe', { subscription, lang });
export const unsubscribePush = (endpoint) => api.post('/push/unsubscribe', { endpoint });
export const testPush = (endpoint) => api.post('/push/test', { endpoint });

// --- Public disease map: GeoJSON hexagons, { crop?, disease?, days: 7 | 30 | 90 }
export const getMapReports = (params) => api.get('/map/reports', { params });


export default api;