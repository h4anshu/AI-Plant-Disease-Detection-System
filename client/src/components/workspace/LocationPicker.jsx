import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Icon from './icons';

// Tap the map to put the pin where the field is. Loaded only on the "add field" page (pages/FieldNew.jsx).
// Same OpenStreetMap tiles and attribution as the public map (pages/MapPage.jsx).
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const INDIA = [22.5, 79];

const LocationPicker = ({ value, onPick }) => {
  const { t } = useTranslation();
  const box = useRef(null);
  const map = useRef(null);
  const pin = useRef(null);
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    map.current = L.map(box.current, { center: value ? [value.lat, value.lon] : INDIA, zoom: value ? 12 : 5, minZoom: 4, maxZoom: 17, scrollWheelZoom: false });
    L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map.current);
    map.current.on('click', (e) => pick.current({ lat: e.latlng.lat, lon: e.latlng.lng, source: 'map' }));
    return () => { map.current.remove(); map.current = null; pin.current = null; };
    // the map is created once; later positions arrive through `value`
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!value || !map.current) return;
    const at = [value.lat, value.lon];
    if (pin.current) pin.current.setLatLng(at);
    else pin.current = L.circleMarker(at, { radius: 10, color: '#FBF8F0', weight: 3, fillColor: '#98370C', fillOpacity: 1 }).addTo(map.current);
    map.current.setView(at, Math.max(map.current.getZoom(), 12));
  }, [value]);

  const useCentre = () => {
    const c = map.current.getCenter();
    onPick({ lat: c.lat, lon: c.lng, source: 'map' });
  };

  return (
    <div className="flex flex-col gap-3">
      <div ref={box} role="application" aria-label={t('alerts.new.mapAria')} className="h-[300px] w-full overflow-hidden rounded-[20px] border border-ink/15 bg-sage-wash sm:h-[360px]" />
      <button type="button" className="ws-btn ws-btn-ghost self-start" onClick={useCentre}><Icon name="crosshair" className="h-[18px] w-[18px]" />{t('alerts.new.centre')}</button>
    </div>
  );
};

export default LocationPicker;
