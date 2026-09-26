import { Trans, useTranslation } from 'react-i18next';
import Feedback from './Feedback';
import FieldHealth from './FieldHealth';
import RiskStrip from './RiskStrip';
import ReportButton from './ReportButton';
import { getPredictionRisk } from '../services/api';
import { cropName, diseaseName, severityName } from '../locales/terms';

// stamp labels are the severity names from locales/terms.json
const severityStyles = {
  healthy: { border: 'border-field', text: 'text-field' },
  early: { border: 'border-field', text: 'text-field' },
  moderate: { border: 'border-wheat', text: 'text-wheat' },
  severe: { border: 'border-clay', text: 'text-clay' }
};

// One tip per reason the ML gate can return (ml-service/gate.py, docs/OOD_GATE.md): result.tips.<reason>
const TIP_REASONS = ['too_small', 'blurry', 'too_dark', 'too_bright', 'no_leaf', 'unreadable_image',
  'unfamiliar_image', 'low_confidence'];
const GENERAL_TIPS = ['light', 'oneLeaf', 'distance', 'focus'];

const RetakeCard = ({ result, title, message }) => {
  const { t, i18n } = useTranslation();
  const tips = [...new Set((result.reasons || []).filter((r) => TIP_REASONS.includes(r)).map((r) => t(`result.tips.${r}`)))];
  return (
    <div className="card-specimen max-w-xl mx-auto mt-10 p-6 relative" role="status">
      <span className="stamp absolute -top-3 -right-3 border-wheat text-wheat bg-parchment text-xs px-3 py-1">
        {t('result.retakeStamp')}
      </span>

      {result.imageUrl && (
        <img src={result.imageUrl} alt={t('result.uploadedAlt')} className="w-full max-h-72 object-cover mb-5 border border-ink/10" />
      )}

      <span className="font-mono text-[10px] text-sage uppercase tracking-widest">{t('result.noReading', { crop: cropName(result.crop, i18n.language) })}</span>
      <h3 className="font-display text-3xl text-ink mt-1 mb-3">{title}</h3>
      <p className="text-sm text-ink/80 leading-relaxed mb-5">{message}</p>

      {tips.length > 0 && (
        <ul className="mb-5 flex flex-col gap-2">
          {tips.map((t) => (
            <li key={t} className="text-sm text-ink border-l-2 border-wheat pl-3">{t}</li>
          ))}
        </ul>
      )}

      <div className="vein-divider mb-4" />
      <p className="font-mono text-[10px] text-sage uppercase tracking-widest mb-2">{t('result.goodPhoto')}</p>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink/70">
        {GENERAL_TIPS.map((k) => <li key={k}>· {t(`result.generalTips.${k}`)}</li>)}
      </ul>

      {result.status === 'uncertain' && result.top3?.length > 0 && (
        <details className="mt-5 text-xs text-ink/60">
          <summary className="cursor-pointer font-mono uppercase tracking-widest text-[10px] text-sage">
            {t('result.leanings')}
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {result.top3.map((c) => (
              <li key={c.disease} className="flex justify-between">
                <span>{diseaseName(result.crop, c.disease, i18n.language)}</span>
                <span>{(c.probability * 100).toFixed(0)}%</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
};

const ResultCard = ({ result }) => {
  const { t, i18n } = useTranslation();
  if (!result) return null;
  const lang = i18n.language;

  const status = result.status || 'ok';
  if (status === 'rejected_quality') {
    return <RetakeCard result={result} title={t('result.rejected.title')} message={t('result.rejected.message')} />;
  }
  if (status === 'not_leaf') {
    return <RetakeCard result={result} title={t('result.notLeaf.title')} message={t('result.notLeaf.message')} />;
  }
  if (status === 'uncertain') {
    return <RetakeCard result={result} title={t('result.uncertain.title')}
      message={t('result.uncertain.message', { crop: cropName(result.crop, lang) })} />;
  }

  const { imageUrl, disease, confidence, severity, treatment, yieldLossPercent, crop, gradcam } = result;
  const stamp = severityStyles[severity] || severityStyles.early;
  const stampLabel = severityName(severityStyles[severity] ? severity : 'early', lang).toUpperCase();

  return (
    <div className="card-specimen max-w-xl mx-auto mt-10 p-6 relative">
      <span
        className={`stamp absolute -top-3 -right-3 ${stamp.border} ${stamp.text} bg-parchment text-xs px-3 py-1`}
      >
        {stampLabel}
      </span>

      <img
        src={imageUrl}
        alt={t('result.analyzedAlt')}
        className="w-full max-h-72 object-cover mb-5 border border-ink/10"
      />

      <span className="font-mono text-[10px] text-sage uppercase tracking-widest">
        {t('result.specimen', { crop: cropName(crop, lang) })}
      </span>
      <h3 className="font-display text-3xl text-ink mt-1 mb-4">
        {diseaseName(crop, disease, lang)}
      </h3>

      <div className="mb-5">
        <div className="flex justify-between font-mono text-xs text-sage mb-1">
          <span>{t('result.confidence')}</span>
          <span>{(confidence * 100).toFixed(1)}%</span>
        </div>
        <div className="w-full bg-ink/10 h-1">
          <div
            className="bg-field h-1"
            style={{ width: `${(confidence * 100).toFixed(0)}%` }}
          />
        </div>
      </div>

      <div className="vein-divider mb-5" />

      <div className="mb-5">
        <p className="font-mono text-[10px] text-sage uppercase tracking-widest mb-2">{t('result.treatment')}</p>
        <p className="text-sm text-ink/80 leading-relaxed">{treatment}</p>
        {/* the server says when it answered with a translation no expert has checked yet (treatmentMap.hi.js) */}
        {result.treatmentNeedsReview && (
          <p role="note" className="text-xs text-clay border-l-2 border-clay pl-3 mt-3">{t('result.notReviewed')}</p>
        )}
      </div>

      {/* a Cloudinary URL; records saved before the migration hold base64 */}
      {gradcam && (
        <div className="mb-5">
          <p className="font-mono text-[10px] text-sage uppercase tracking-widest mb-2">{t('result.affected')}</p>
          <img
            src={/^(https?:|data:)/.test(gradcam) ? gradcam : `data:image/png;base64,${gradcam}`}
            alt={t('result.gradcamAlt')}
            className="w-full border border-ink/10"
          />
        </div>
      )}

      {yieldLossPercent !== null && (
        <div className="border-l-2 border-clay pl-4">
          <p className="font-mono text-[10px] text-sage uppercase tracking-widest mb-1">{t('result.yieldImpact')}</p>
          <p className="text-sm text-ink/80">
            <Trans i18nKey="result.yieldLoss" values={{ pct: yieldLossPercent }}
              components={{ b: <span className="text-clay font-medium" /> }} />
          </p>
        </div>
      )}

      {result._id && ['gps', 'exif'].includes(result.locationSource) && ['potato', 'rice'].includes(crop) && (
        <RiskStrip load={() => getPredictionRisk(result._id)} reloadKey={result._id} />
      )}

      {result._id && ['gps', 'exif'].includes(result.locationSource) && <FieldHealth predictionId={result._id} crop={crop} />}

      {result._id && <ReportButton predictionId={result._id} hasLocation={['gps', 'exif'].includes(result.locationSource)} />}

      {result._id && <Feedback predictionId={result._id} crop={crop} />}
    </div>
  );
};

export default ResultCard;
