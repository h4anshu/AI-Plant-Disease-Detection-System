import axios from 'axios';
import i18n from '../i18n';

const API_URL = import.meta.env.VITE_API_URL;

const api = axios.create({
  baseURL: API_URL
})

// Login is disabled, so all visitors are one guest user; this random per-browser id keeps each
// browser's history private (server/middleware/guestDevice.js). TODO(auth): remove when login returns.
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
    config.headers.authorization = token;
  }
  config.headers['x-device-id'] = getDeviceId();
  // one id per request, logged by the server and the ML service (docs/MONITORING.md)
  config.headers['x-request-id'] = crypto.randomUUID();
  // the server answers treatment advice in this language when it has it (English otherwise)
  config.headers['Accept-Language'] = i18n.language;
  return config;
});

// --- Auth ---
export const registerUser = (data) => api.post('/auth/register', data);
export const loginUser = (data) => api.post('/auth/login', data);


// --- Predictions ---
export const predictDisease = (formData) =>
  api.post('/predict', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

// newest first, 50 per page; pass the createdAt of the last record shown to get older ones
export const getPredictionHistory = (before) => api.get('/predict', { params: before ? { before } : {} });

// "Was this correct?": { feedback: 'correct' | 'incorrect' | 'unsure', correctedLabel? }
export const sendFeedback = (id, body) => api.patch(`/predict/${id}/feedback`, body);
export const getCropClasses = () => api.get('/predict/classes');


export default api;