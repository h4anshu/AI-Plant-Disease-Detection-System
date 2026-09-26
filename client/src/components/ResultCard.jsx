const severityStyles = {
  healthy: { border: 'border-field', text: 'text-field', label: 'HEALTHY' },
  early: { border: 'border-field', text: 'text-field', label: 'EARLY' },
  moderate: { border: 'border-wheat', text: 'text-wheat', label: 'MODERATE' },
  severe: { border: 'border-clay', text: 'text-clay', label: 'SEVERE' }
};

// One tip per reason the ML gate can return (ml-service/gate.py, docs/OOD_GATE.md)
const retakeTips = {
  too_small: 'Use the full camera resolution and move a little closer.',
  blurry: 'Hold the phone steady and tap the leaf on screen to focus before taking the photo.',
  too_dark: 'Take the photo in daylight, not at night or in deep shade.',
  too_bright: 'Avoid harsh direct sun or flash glare. Shade the leaf with your body.',
  no_leaf: 'Fill most of the frame with one leaf, about 20–30 cm from the camera.',
  unreadable_image: 'The file could not be opened. Try a JPG or PNG photo.',
  unfamiliar_image: 'Check that the right crop is selected, then photograph a single leaf of that crop.',
  low_confidence: 'Check that the right crop is selected, then photograph a single leaf of that crop.'
};
const generalTips = [
  'Good daylight, no flash',
  'One leaf, filling most of the frame',
  'About 20–30 cm away',
  'Leaf in sharp focus'
];

const RetakeCard = ({ result, title, message }) => {
  const tips = [...new Set((result.reasons || []).map((r) => retakeTips[r]).filter(Boolean))];
  return (
    <div className="card-specimen max-w-xl mx-auto mt-10 p-6 relative" role="status">
      <span className="stamp absolute -top-3 -right-3 border-wheat text-wheat bg-parchment text-xs px-3 py-1">
        RETAKE
      </span>

      {result.imageUrl && (
        <img src={result.imageUrl} alt="Uploaded photo" className="w-full max-h-72 object-cover mb-5 border border-ink/10" />
      )}

      <span className="font-mono text-[10px] text-sage uppercase tracking-widest">{result.crop} — no reading</span>
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
      <p className="font-mono text-[10px] text-sage uppercase tracking-widest mb-2">For a good photo</p>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink/70">
        {generalTips.map((t) => <li key={t}>· {t}</li>)}
      </ul>

      {result.status === 'uncertain' && result.top3?.length > 0 && (
        <details className="mt-5 text-xs text-ink/60">
          <summary className="cursor-pointer font-mono uppercase tracking-widest text-[10px] text-sage">
            What the model leaned towards (not a diagnosis)
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {result.top3.map((t) => (
              <li key={t.disease} className="flex justify-between">
                <span>{t.disease.replace(/_/g, ' ')}</span>
                <span>{(t.probability * 100).toFixed(0)}%</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
};

const ResultCard = ({ result }) => {
  if (!result) return null;

  const status = result.status || 'ok';
  if (status === 'rejected_quality') {
    return <RetakeCard result={result} title="Photo not clear enough"
      message="We could not read this photo well enough to check the leaf. Please take it again." />;
  }
  if (status === 'not_leaf') {
    return <RetakeCard result={result} title="No leaf found"
      message="This photo does not seem to show a plant leaf. Please photograph the leaf you want checked." />;
  }
  if (status === 'uncertain') {
    return <RetakeCard result={result} title="We're not sure about this one"
      message={`This photo doesn't look like the ${result.crop} leaves our model has learned from, so we won't guess a disease. Please retake it, or ask a local agriculture officer.`} />;
  }

  const { imageUrl, disease, confidence, severity, treatment, yieldLossPercent, crop, gradcam } = result;
  const stamp = severityStyles[severity] || severityStyles.early;

  return (
    <div className="card-specimen max-w-xl mx-auto mt-10 p-6 relative">
      <span
        className={`stamp absolute -top-3 -right-3 ${stamp.border} ${stamp.text} bg-parchment text-xs px-3 py-1`}
      >
        {stamp.label}
      </span>

      <img
        src={imageUrl}
        alt="Analyzed leaf"
        className="w-full max-h-72 object-cover mb-5 border border-ink/10"
      />

      <span className="font-mono text-[10px] text-sage uppercase tracking-widest">
        {crop} — specimen reading
      </span>
      <h3 className="font-display text-3xl text-ink mt-1 mb-4">
        {disease.replace(/_/g, ' ')}
      </h3>

      <div className="mb-5">
        <div className="flex justify-between font-mono text-xs text-sage mb-1">
          <span>Confidence</span>
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
        <p className="font-mono text-[10px] text-sage uppercase tracking-widest mb-2">Treatment</p>
        <p className="text-sm text-ink/80 leading-relaxed">{treatment}</p>
      </div>

      {/* a Cloudinary URL; records saved before the migration hold base64 */}
      {gradcam && (
        <div className="mb-5">
          <p className="font-mono text-[10px] text-sage uppercase tracking-widest mb-2">Affected Region</p>
          <img
            src={/^(https?:|data:)/.test(gradcam) ? gradcam : `data:image/png;base64,${gradcam}`}
            alt="Grad-CAM heatmap"
            className="w-full border border-ink/10"
          />
        </div>
      )}

      {yieldLossPercent !== null && (
        <div className="border-l-2 border-clay pl-4">
          <p className="font-mono text-[10px] text-sage uppercase tracking-widest mb-1">Yield Impact</p>
          <p className="text-sm text-ink/80">
            Estimated loss of <span className="text-clay font-medium">{yieldLossPercent}%</span> if left untreated.
          </p>
        </div>
      )}
    </div>
  );
};

export default ResultCard;
