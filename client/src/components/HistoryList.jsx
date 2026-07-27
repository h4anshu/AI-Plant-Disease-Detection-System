import React from 'react';

const severityStyles = {
  early: 'border-emerald-500/30 text-emerald-700 bg-emerald-500/10',
  moderate: 'border-amber-500/30 text-amber-700 bg-amber-500/10',
  severe: 'border-rose-500/30 text-rose-700 bg-rose-500/10'
};

const HistoryList = ({ predictions }) => {
  if (!predictions || predictions.length === 0) {
    return (
      <div className="text-center py-16 px-4 max-w-md mx-auto">
        <div className="w-12 h-12 rounded-full bg-sage/10 text-sage flex items-center justify-center mx-auto mb-3 text-lg font-mono">
          00
        </div>
        <p className="font-display text-ink text-lg">No analysis records</p>
        <p className="font-mono text-xs text-ink/50 mt-1">
          Scan a plant leaf to generate your first diagnostic history.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-3">
      {predictions.map((p, index) => {
        const severityKey = p.severity?.toLowerCase() || 'early';
        const badgeStyle = severityStyles[severityKey] || severityStyles.early;
        const confidencePct = Math.round((p.confidence || 0) * 100);

        // Safe date parsing
        const dateObj = p.createdAt ? new Date(p.createdAt) : null;
        const formattedDate = dateObj && !isNaN(dateObj)
          ? dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
          : '—';

        return (
          <div
            key={p._id || index}
            className="group relative bg-white/70 backdrop-blur border border-ink/10 hover:border-ink/20 rounded-xl p-3.5 transition-all duration-200"
          >
            <div className="flex items-center gap-4">
              {/* Thumbnail */}
              <div className="relative shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-ink/10 bg-sage/5">
                <img
                  src={p.imageUrl}
                  alt={p.disease ? `${p.crop || 'Plant'} with ${p.disease}` : 'Analyzed leaf sample'}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>

              {/* Main Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-semibold tracking-wider text-sage uppercase">
                    {p.crop || 'Unknown Crop'}
                  </span>
                  <span className={`stamp border ${badgeStyle} text-[10px] tracking-wide px-2 py-0.5 rounded shrink-0`}>
                    {(p.severity || 'UNKNOWN').toUpperCase()}
                  </span>
                </div>

                <h3 className="font-display text-base font-semibold text-ink truncate mt-0.5">
                  {p.disease ? p.disease.replace(/_/g, ' ') : 'Healthy / Unidentified'}
                </h3>

                <div className="flex items-center justify-between mt-2 pt-2 border-t border-ink/5 text-[11px] font-mono text-ink/60">
                  <span>
                    Accuracy: <strong className="text-ink">{confidencePct}%</strong>
                  </span>
                  {p.yieldLossPercent !== null && p.yieldLossPercent !== undefined && (
                    <span>
                      Est. Loss: <strong className="text-rose-600">-{p.yieldLossPercent}%</strong>
                    </span>
                  )}
                  <span className="text-ink/40">{formattedDate}</span>
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