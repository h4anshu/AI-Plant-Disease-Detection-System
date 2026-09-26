import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import terms from '../locales/terms.json';
import { cropName, diseaseName } from '../locales/terms';
import { getDiseaseRisk, getMapReports } from '../services/api';
import RiskStrip from '../components/RiskStrip';
import { BINS, binLabel, colorFor } from './mapStyle';

const CROPS = Object.keys(terms.crops);
const DAYS = [7, 30, 90]; // the only windows the server accepts (server/utils/geo.js)

// OpenStreetMap's volunteer tile servers: fine for a small project with attribution and normal browsing
// (https://operations.osmfoundation.org/policies/tiles/). Heavy traffic needs a commercial tile provider.
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const INDIA = { center: [22.5, 79], zoom: 5 };
const DOTS_BELOW_ZOOM = 8;
const RISK_CROPS = ['potato', 'rice']; // crops with a published weather model (docs/DISEASE_RISK.md)
const RISK_MIN_ZOOM = 7; // at country zoom, 'the centre of the map' is not a place anyone farms // a 5 km^2 hexagon is a few pixels at state/country zoom: draw a dot on it too

const select = 'w-full border border-ink/25 bg-parchment px-2 py-2 text-sm text-ink';
const label = 'font-mono text-[10px] text-sage uppercase tracking-widest block mb-1';

const MapPage = () => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [crop, setCrop] = useState('');
  const [disease, setDisease] = useState('');
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [centre, setCentre] = useState(null); // { lat, lon, zoom } after the map settles
  const mapDiv = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const dots = useRef(null);

  function showDots() {
    if (!dots.current || !map.current) return;
    if (map.current.getZoom() < DOTS_BELOW_ZOOM) dots.current.addTo(map.current);
    else dots.current.remove();
  }

  // create the map once
  useEffect(() => {
    // no wheel zoom: the map sits inside a scrolling page (buttons, double-click and pinch still zoom)
    map.current = L.map(mapDiv.current, { ...INDIA, minZoom: 4, maxZoom: 13, scrollWheelZoom: false });
    L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map.current);
    map.current.on('zoomend', showDots);
    const settle = () => { const c = map.current.getCenter(); setCentre({ lat: c.lat, lon: c.lng, zoom: map.current.getZoom() }); };
    map.current.on('moveend', settle);
    settle();
    return () => map.current.remove();
  }, []);

  // reload the hexagons whenever a filter changes
  useEffect(() => {
    let current = true;
    setError('');
    getMapReports({ days, ...(crop && { crop }), ...(crop && disease && { disease }) })
      .then((res) => current && setData(res.data))
      .catch(() => current && setError(t('map.failed')));
    return () => { current = false; };
  }, [crop, disease, days, t]);

  // draw them (and redraw popups when the language changes)
  useEffect(() => {
    if (!data) return;
    layer.current?.remove();
    dots.current?.remove();
    const popup = (f) => t('map.popup', { count: f.properties.reports });
    layer.current = L.geoJSON(data, {
      style: (f) => ({ color: '#1F3B2C', weight: 1, fillColor: colorFor(f.properties.reports), fillOpacity: 0.7 }),
      onEachFeature: (f, l) => l.bindPopup(popup(f)),
    }).addTo(map.current);
    // the dot marks the hexagon's centre, which the polygon already shows: no extra detail made public
    dots.current = L.layerGroup(layer.current.getLayers().map((l) => L.circleMarker(l.getBounds().getCenter(), {
      radius: 7, color: '#1F3B2C', weight: 1, fillColor: colorFor(l.feature.properties.reports), fillOpacity: 0.9,
    }).bindPopup(popup(l.feature))));
    showDots();
  }, [data, t, lang]);

  // a 5 km^2 hexagon is a dot at country zoom: show the reported areas, but never closer than a district
  useEffect(() => {
    if (data?.features.length) map.current.fitBounds(L.geoJSON(data).getBounds(), { maxZoom: 9, padding: [24, 24] });
  }, [data]);

  const empty = data && data.features.length === 0;

  return (
    <div className="max-w-5xl mx-auto px-6 pt-16 pb-20">
      <span className="font-mono text-xs text-clay uppercase tracking-widest">{t('map.eyebrow')}</span>
      <h2 className="font-display text-4xl text-ink mt-2 mb-3">{t('map.title')}</h2>
      <p className="text-sm text-ink/70 leading-relaxed mb-6 max-w-2xl">{t('map.intro')}</p>

      {data?.meta.demo && (
        <p role="alert" className="font-mono text-xs text-clay border-l-2 border-clay pl-3 mb-4">{t('map.demo')}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div>
          <label htmlFor="map-crop" className={label}>{t('map.crop')}</label>
          <select id="map-crop" className={select} value={crop} onChange={(e) => { setCrop(e.target.value); setDisease(''); }}>
            <option value="">{t('map.allCrops')}</option>
            {CROPS.map((c) => <option key={c} value={c}>{cropName(c, lang)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="map-disease" className={label}>{t('map.disease')}</label>
          <select id="map-disease" className={select} value={disease} disabled={!crop} onChange={(e) => setDisease(e.target.value)}>
            <option value="">{t('map.allDiseases')}</option>
            {crop && Object.keys(terms.diseases[crop]).map((d) => (
              <option key={d} value={d}>{diseaseName(crop, d, lang)}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="map-days" className={label}>{t('map.days')}</label>
          <select id="map-days" className={select} value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {DAYS.map((d) => <option key={d} value={d}>{t(`map.days${d}`)}</option>)}
          </select>
        </div>
      </div>

      <div className="relative border border-ink/15">
        <div ref={mapDiv} className="h-[60vh] min-h-[360px] w-full z-0" aria-label={t('map.title')} />
        {(!data || empty || error) && (
          <p role="status" className="absolute left-3 right-3 bottom-8 z-[500] bg-parchment/95 border border-ink/15 p-3 text-sm text-ink/80">
            {error || (empty ? t('map.empty') : t('map.loading'))}
          </p>
        )}
      </div>

      {RISK_CROPS.includes(crop) && centre && (
        <div className="mt-4 border border-ink/15 p-3">
          <p className="font-mono text-[10px] text-sage uppercase tracking-widest">{t('risk.mapCentre')}</p>
          {centre.zoom >= RISK_MIN_ZOOM ? (
            <RiskStrip load={() => getDiseaseRisk({ lat: centre.lat, lon: centre.lon, crop })}
              reloadKey={`${crop}|${centre.lat.toFixed(2)}|${centre.lon.toFixed(2)}`} />
          ) : (
            <p className="text-xs text-ink/60 mt-1">{t('risk.zoomIn')}</p>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className={label + ' mb-0'}>{t('map.legend')}</span>
        {BINS.map((b, i) => (
          <span key={b.min} className="flex items-center gap-1.5 font-mono text-xs text-ink/70">
            <span className="inline-block w-4 h-4 border border-ink/40" style={{ background: b.color }} />
            {binLabel(i)}
          </span>
        ))}
        <Link to="/privacy" className="font-mono text-xs text-sage underline ml-auto">{t('map.privacy')}</Link>
      </div>
    </div>
  );
};

export default MapPage;
