import { useTranslation } from 'react-i18next';
import { Glyph, STATUS } from './status';
import { cropName, diseaseName } from '../../locales/terms';
import { dayLabel, dueKey, stamp, titleCase } from './alertsLib';

// The alert level is drawn like a checkup's status: a shape, a word and a colour, never colour alone.
// Watch and Warning reuse the quarter and half circle of "Early" and "Moderate"; No alert reuses the tick of "Healthy".
const LOOK = {
  watch: { ...STATUS.early, shape: 'early' },
  warn: { ...STATUS.moderate, shape: 'moderate' },
  urgent: { ...STATUS.severe, shape: 'severe' },
  calm: { ...STATUS.healthy, shape: 'healthy' },
  info: { c: '#2F493B', bg: '#EEE1CD', tx: '#2F493B', dashed: true },
  stale: { c: '#AE9900', bg: '#F0ECD2', tx: '#473D00', dashed: true },
};

const Dot = ({ stale }) => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray={stale ? '2.6 2' : undefined} />
    {stale ? <path d="M8 4.6v4M8 11v.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /> : <circle cx="8" cy="8" r="1.7" fill="currentColor" />}
  </svg>
);

export const AlertPill = ({ level, label, dark = false, className = '' }) => {
  const { t } = useTranslation();
  const look = LOOK[level];
  const style = dark
    ? { color: '#F2DB8F', background: 'rgba(245,240,226,.12)', borderColor: '#F2DB8F' }
    : { color: look.tx, background: look.bg, borderColor: look.c, ...(look.dashed && { borderStyle: 'dashed' }) };
  return (
    <span className={`ws-st ${className}`} style={style}>
      {look.shape ? <Glyph level={look.shape} /> : <Dot stale={level === 'stale'} />}
      {label ?? t(`alerts.level.${level}`)}
    </span>
  );
};

// the words of an alert. Ours come from the locale files (alerts.rules.<RULE-ID>.head / why). An official alert is passed on as
// published: SACHET's own headline in the reader's language when it has one (else English, else the event name); IMD only sends codes
// and colours, which are named here with IMD's own legend (alerts.official.code.*).
export const useAlertText = () => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const when = (a) => (dueKey(a) ? t(`alerts.${dueKey(a)}`) : dayLabel(a.date, lang));
  const params = (a) => ({ day: when(a), value: a.values?.value, threshold: a.values?.threshold, window: a.values?.window, km: a.values?.nearKm, count: a.values?.count, crop: cropName(a.crop, lang), disease: a.disease ? diseaseName(a.crop, a.disease, lang) : '' });
  const cwcHead = (a) => t('alerts.official.cwcHead', { name: a.station, km: a.km, level: t(`alerts.official.cwcLevel.${a.level}`), trend: t(`alerts.official.trend.${a.trend || 'steady'}`) });
  const imdHead = (a) => t('alerts.official.imdHead', {
    color: t(`alerts.official.color.${a.level}`), districts: a.districts.map(titleCase).join(', '),
    hazards: a.codes.map((c) => t(`alerts.official.code.${c}`)).join(', ') || t('alerts.official.generic'),
  });
  return {
    when,
    crop: (a) => cropName(a.crop, lang),
    disease: (a) => diseaseName(a.crop, a.disease, lang),
    head: (a) => (a.origin !== 'official' ? t(`alerts.rules.${a.rule}.head`, params(a)) : a.source === 'sachet' ? a.headlines?.[lang] || a.headlines?.en || a.event : a.source === 'cwc' ? cwcHead(a) : imdHead(a)),
    why: (a) => (a.origin !== 'official' ? t(`alerts.rules.${a.rule}.why`, params(a))
      : a.source === 'sachet' ? t('alerts.official.whySachet', { issuer: a.issuer, area: a.area || '-' })
        : a.source === 'cwc' ? t('alerts.official.whyCwc', { level: t(`alerts.official.cwcLevel.${a.level}`), time: stamp(a.issuedAt, lang) })
        : t('alerts.official.whyImd', { color: t(`alerts.official.color.${a.level}`), time: stamp(a.issuedAt, lang) })),
  };
};
