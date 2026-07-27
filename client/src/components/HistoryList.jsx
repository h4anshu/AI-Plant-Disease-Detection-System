const severityStyles = {
  early: { border: 'border-field', text: 'text-field', label: 'LOW RISK' },
  moderate: { border: 'border-wheat', text: 'text-wheat', label: 'MEDIUM RISK' },
  severe: { border: 'border-clay', text: 'text-clay', label: 'HIGH RISK' }
};

const HistoryList = ({ predictions }) => {
  if (!predictions || predictions.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="font-display text-2xl text-ink/50 italic mb-2">No checkups yet.</p>
        <p className="font-mono text-xs text-sage uppercase tracking-widest">
          Check a leaf to start your record
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-4">
      {predictions.map((p, index) => {
        const severityKey = p.severity?.toLowerCase() || 'early';
        const s = severityStyles[severityKey] || severityStyles.early;
        const confidencePct = Math.round((p.confidence || 0) * 100);

        const dateObj = p.createdAt ? new Date(p.createdAt) : null;
        const formattedDate = dateObj && !isNaN(dateObj)
          ? dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
          : '—';

        return (
          <div key={p._id || index} className="card-specimen p-4 relative">
            <span
              className={`stamp absolute -top-2 -right-2 ${s.border} ${s.text} bg-parchment text-[10px] px-2 py-0.5`}
            >
              {s.label}
            </span>

            <div className="flex gap-4">
              <img
                src={p.imageUrl}
                alt={p.disease ? `${p.crop || 'plant'} with ${p.disease}` : 'Analyzed leaf'}
                className="w-16 h-16 object-cover border border-ink/10 shrink-0"
              />

              <div className="flex-1 min-w-0">
                <span className="font-mono text-[10px] text-sage uppercase tracking-widest">
                  {p.crop || 'Unknown crop'}
                </span>
                <h3 className="font-display text-lg text-ink leading-snug truncate">
                  {p.disease ? p.disease.replace(/_/g, ' ') : 'Healthy'}
                </h3>

                <div className="vein-divider my-2" />

                <div className="flex items-center gap-4 font-mono text-[11px] text-ink/60">
                  <span>Sure: <strong className="text-ink">{confidencePct}%</strong></span>
                  {p.yieldLossPercent !== null && p.yieldLossPercent !== undefined && (
                    <span>Crop at risk: <strong className="text-clay">{p.yieldLossPercent}%</strong></span>
                  )}
                  <span className="text-ink/40 ml-auto">{formattedDate}</span>
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