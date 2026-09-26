import { useTranslation } from 'react-i18next';
import { cropName, diseaseName } from '../locales/terms';

// labels come from locales/*.json: history.risk.<severity>, history.status.<status>
const severityStyles = {
  early: { border: 'border-field', text: 'text-field' },
  moderate: { border: 'border-wheat', text: 'text-wheat' },
  severe: { border: 'border-clay', text: 'text-clay' }
};
// non-diagnosis outcomes of the ML quality/OOD gate (docs/OOD_GATE.md); old records have no status = ok
const statusStyles = {
  uncertain: { border: 'border-wheat', text: 'text-wheat' },
  rejected_quality: { border: 'border-wheat', text: 'text-wheat' },
  not_leaf: { border: 'border-wheat', text: 'text-wheat' }
};

const HistoryList = ({ predictions }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  if (!predictions || predictions.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="font-display text-2xl text-ink/50 italic mb-2">{t('history.empty')}</p>
        <p className="font-mono text-xs text-sage uppercase tracking-widest">
          {t('history.emptyHint')}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-4">
      {predictions.map((p, index) => {
        const severityKey = p.severity?.toLowerCase() || 'early';
        const gated = statusStyles[p.status];
        const riskKey = severityStyles[severityKey] ? severityKey : 'early';
        const s = gated || severityStyles[riskKey];
        const label = gated ? t(`history.status.${p.status}.label`) : t(`history.risk.${riskKey}`);
        const confidencePct = Math.round((p.confidence || 0) * 100);

        const dateObj = p.createdAt ? new Date(p.createdAt) : null;
        const formattedDate = dateObj && !isNaN(dateObj)
          ? dateObj.toLocaleDateString(lang, { month: 'short', day: 'numeric' })
          : '—';

        return (
          <div key={p._id || index} className="card-specimen p-4 relative">
            <span
              className={`stamp absolute -top-2 -right-2 ${s.border} ${s.text} bg-parchment text-[10px] px-2 py-0.5`}
            >
              {label}
            </span>

            <div className="flex gap-4">
              <img
                src={p.imageUrl}
                alt={p.disease ? t('history.imgAlt', { crop: cropName(p.crop, lang), disease: diseaseName(p.crop, p.disease, lang) }) : t('history.imgAltGeneric')}
                className="w-16 h-16 object-cover border border-ink/10 shrink-0"
              />

              <div className="flex-1 min-w-0">
                <span className="font-mono text-[10px] text-sage uppercase tracking-widest">
                  {p.crop ? cropName(p.crop, lang) : t('history.unknownCrop')}
                </span>
                <h3 className="font-display text-lg text-ink leading-snug truncate">
                  {gated ? t(`history.status.${p.status}.title`) : p.disease ? diseaseName(p.crop, p.disease, lang) : t('history.healthy')}
                </h3>

                <div className="vein-divider my-2" />

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-ink/60">
                  {!gated && <span className="whitespace-nowrap">{t('history.sure')} <strong className="text-ink">{confidencePct}%</strong></span>}
                  {p.yieldLossPercent !== null && p.yieldLossPercent !== undefined && (
                    <span className="whitespace-nowrap">{t('history.atRisk')} <strong className="text-clay">{p.yieldLossPercent}%</strong></span>
                  )}
                  <span className="text-ink/40 ml-auto whitespace-nowrap">{formattedDate}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default HistoryList;