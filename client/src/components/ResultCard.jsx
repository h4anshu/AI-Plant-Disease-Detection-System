const severityColors = {
  early: 'bg-green-100 text-green-800 border-green-400',
  moderate: 'bg-orange-100 text-orange-800 border-orange-400',
  severe: 'bg-red-100 text-red-800 border-red-400'
};

const ResultCard = ({ result }) => {
  if (!result) return null;

  const {
    imageUrl,
    disease,
    confidence,
    severity,
    treatment,
    yieldLossPercent,
    crop
  } = result;

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