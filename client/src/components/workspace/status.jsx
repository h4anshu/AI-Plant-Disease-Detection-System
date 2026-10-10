import { useTranslation } from 'react-i18next';
import { severityName } from '../../locales/terms';

// One status language everywhere: a shape, a word and a colour (never colour alone). Same glyphs as the landing page's risk strip.
export const STATUS = {
  healthy: { c: '#6C854D', bg: '#E4F0D8', tx: '#2F450C', d: 'M5 8.3l2.2 2.2L11 6', fill: 'none', stroke: 'currentColor' },
  early: { c: '#AE9900', bg: '#F0ECD2', tx: '#473D00', d: 'M8 8V1.5A6.5 6.5 0 0 1 14.5 8z', fill: 'currentColor', stroke: 'none' },
  moderate: { c: '#98370C', bg: '#FFE5DC', tx: '#6A2202', d: 'M8 1.5a6.5 6.5 0 0 1 0 13z', fill: 'currentColor', stroke: 'none' },
  severe: { c: '#6A2202', bg: '#F3C9B8', tx: '#4A1700', d: 'M8 1.5a6.5 6.5 0 1 1 0 13a6.5 6.5 0 0 1 0-13z', fill: 'currentColor', stroke: 'none' },
  retake: { c: '#2F493B', bg: '#EEE1CD', tx: '#2F493B', d: 'M6.3 6.2a1.8 1.8 0 1 1 2.6 1.6c-.6.4-.9.7-.9 1.4M8 11.6v.1', fill: 'none', stroke: 'currentColor' },
};

// healthy | early | moderate | severe | retake, from a saved prediction (records before the quality gate have no status)
export const levelOf = (p) => {
  if (p.status && p.status !== 'ok') return 'retake';
  const s = (p.severity || '').toLowerCase();
  if (s === 'healthy' || /^healthy/i.test(p.disease || '')) return 'healthy';
  return ['early', 'moderate', 'severe'].includes(s) ? s : 'early';
};

export const needsAttention = (p) => ['moderate', 'severe'].includes(levelOf(p));

export const Glyph = ({ level, size = 14 }) => {
  const s = STATUS[level];
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d={s.d} fill={s.fill} stroke={s.stroke} strokeWidth="1.8" />
    </svg>
  );
};

export const StatusPill = ({ level, className = '' }) => {
  const { t, i18n } = useTranslation();
  const s = STATUS[level];
  return (
    <span className={`ws-st ${className}`} style={{ color: s.tx, background: s.bg, borderColor: s.c, ...(level === 'retake' && { borderStyle: 'dashed' }) }}>
      <Glyph level={level} />{level === 'retake' ? t('ws.status.retake') : severityName(level, i18n.language)}
    </span>
  );
};
