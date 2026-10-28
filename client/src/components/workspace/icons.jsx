// Menu and tab-bar icons, 24x24 stroke (same drawing style as heroIcons.jsx)
const PATHS = {
  overview: 'M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z',
  check: 'M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1ZM12 16.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z',
  log: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11M9 8h6',
  map: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11zM12 12.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z',
  me: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5',
  chevron: 'm9 6 6 6-6 6',
  back: 'm15 6-6 6 6 6',
  download: 'M12 4v11M7.5 11 12 15.5 16.5 11M5 19h14',
  arrow: 'M7 17 17 7M8 7h9v9',
  fire: 'M12 3c.8 3.4-2.6 4.8-2.6 8.4a3.4 3.4 0 0 0 6.8 0c0-1.1-.3-2-.9-2.9 1.9 1.1 3.3 3.3 3.3 5.9a6.6 6.6 0 1 1-13.2 0c0-3.1 2-5 3.4-6.8C9.3 6.5 11.3 5.2 12 3z',
  // weather alerts (docs/FIELD_ALERTS.md)
  sprout: 'M12 21V11M12 11C12 7 9 5 5 5c0 4 2 6 7 6zM12 14c0-3 2.5-5 7-5 0 3.5-2.5 5-7 5z',
  cloudsun: 'M3 10a3.6 3.6 0 0 1 6.6-1.7M6.6 2.6v1.2M2.3 5l.9.8M10.9 5l-.9.8M8.2 20a3.7 3.7 0 0 1-.3-7.4A5 5 0 0 1 17.4 13.5 3.2 3.2 0 0 1 17 20z',
  frost: 'M12 3v18M4.2 7.5l15.6 9M19.8 7.5 4.2 16.5M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5M4 11.2l3.2-.4-.9-3.1M20 12.8l-3.2.4.9 3.1',
  rain: 'M7 15.5a4 4 0 0 1-.4-7.98A5.5 5.5 0 0 1 17.2 9 3.6 3.6 0 0 1 17 16M8.5 18.5l-1 2M12.5 18.5l-1 2M16.5 18.5l-1 2',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4',
  harvest: 'M12 21V9M12 9c-2-.5-3-2-3-4 2 .5 3 2 3 4zm0 0c2-.5 3-2 3-4-2 .5-3 2-3 4zM12 14c-2-.5-3-2-3-4M12 14c2-.5 3-2 3-4M12 19c-2-.5-3-2-3-4M12 19c2-.5 3-2 3-4',
  clock: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.5V12l3 2',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0',
  plus: 'M12 5v14M5 12h14',
  field: 'M3 20h18M5 20c0-5 2-9 7-9s7 4 7 9M12 11V6M9 8l3-2 3 2',
  crosshair: 'M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM12 2v4M12 18v4M2 12h4M18 12h4',
  lock: 'M7 11h10a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1zM8 11V8a4 4 0 0 1 8 0v3',
  check2: 'M5 12.5l4.5 4.5L19 7',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6',
};
const Icon = ({ name, className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATHS[name]} /></svg>
);
export default Icon;
