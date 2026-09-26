import axios from "axios";
import mongoose from "mongoose";

// Open-Meteo (https://open-meteo.com): free for non-commercial use, no key, CC BY 4.0 (attribution shown
// in the app); limits 10,000 calls/day, 5,000/hour, 600/minute. We ask at most once per grid cell per
// hour: the cache below.
export const ATTRIBUTION = 'Weather data by Open-Meteo.com (CC BY 4.0)';
const URL = () => process.env.OPEN_METEO_URL || 'https://api.open-meteo.com/v1/forecast';
const GRID = 0.05; // ~5 km: the weather models are ~11 km, and the exact point never leaves our server

export const snap = (x) => Math.round(x / GRID) * GRID;

const weatherCacheSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 3 },
});
export const WeatherCache = mongoose.models.WeatherCache || mongoose.model('WeatherCache', weatherCacheSchema);

// Hourly temperature, RH and rain for the past 14 days + today + 4 days, in local time (day 4 completes the
// night of the last outlook day). 14 past days
// because INDO-BLIGHTCAST needs 13 (docs/DISEASE_RISK.md).
export async function getWeather(lat, lon, now = new Date()) {
  const la = snap(lat).toFixed(2);
  const lo = snap(lon).toFixed(2);
  const key = `${la},${lo}|${now.toISOString().slice(0, 13)}`;
  const cached = await WeatherCache.findOne({ key }).lean();
  if (cached) return cached.data;
  const { data } = await axios.get(URL(), {
    params: { latitude: la, longitude: lo, hourly: 'temperature_2m,relative_humidity_2m,precipitation',
      past_days: 14, forecast_days: 5, timezone: 'auto' }, // +1 day: the 3rd outlook day's night
    timeout: 15000,
  });
  const w = { time: data.hourly.time, temp: data.hourly.temperature_2m, rh: data.hourly.relative_humidity_2m,
    rain: data.hourly.precipitation, utcOffsetSeconds: data.utc_offset_seconds, timezone: data.timezone };
  await WeatherCache.updateOne({ key }, { $set: { data: w, createdAt: new Date() } }, { upsert: true });
  return w;
}

export const localToday = (utcOffsetSeconds, now = new Date()) =>
  new Date(now.getTime() + utcOffsetSeconds * 1000).toISOString().slice(0, 10);
