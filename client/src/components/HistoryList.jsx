const severityColors = {
  early: 'bg-green-100 text-green-800 border-green-400',
  moderate: 'bg-orange-100 text-orange-800 border-orange-400',
  severe: 'bg-red-100 text-red-800 border-red-400'
};

const HistoryList = ({ predictions }) => {
  if (!predictions || predictions.length === 0) {
    return <p className="text-center text-gray-500 mt-10">No predictions yet. Try analyzing a leaf first!</p>;
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col">
      {predictions.map((p, i) => {
        const s = severityColors[p.severity];
        return (
          <div key={p._id}>
            {i > 0 && <div className="vein-divider" />}
            <div className="flex gap-4 py-5">
              <img
                src={p.imageUrl}
                alt={p.disease}
                className="w-20 h-20 object-cover border border-ink/10 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-display text-lg text-ink truncate">
                    {p.disease.replace(/_/g, ' ')}
                  </p>
                  <span className={`stamp ${s.border} ${s.text} text-[10px] px-2 py-0.5 shrink-0 ml-3`}>
                    {p.severity.toUpperCase()}
                  </span>
                </div>
                <p className="font-mono text-xs text-sage capitalize">
                  {p.crop} · {(p.confidence * 100).toFixed(1)}% confidence
                  {p.yieldLossPercent !== null && ` · ${p.yieldLossPercent}% yield loss`}
                </p>
                <p className="font-mono text-[10px] text-ink/40 mt-1">
                  {new Date(p.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default HistoryList;