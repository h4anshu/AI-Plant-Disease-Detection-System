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
    <div className="grid gap-4 max-w-3xl mx-auto mt-6 px-4">
      {predictions.map((p) => (
        <div key={p._id} className="flex gap-4 bg-white rounded-lg shadow p-4">
          <img
            src={p.imageUrl}
            alt={p.disease}
            className="w-24 h-24 object-cover rounded"
          />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-gray-800">{p.disease.replace(/_/g, ' ')}</h4>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${severityColors[p.severity]}`}>
                {p.severity.toUpperCase()}
              </span>
            </div>
            <p className="text-sm text-gray-500 capitalize">Crop: {p.crop}</p>
            <p className="text-sm text-gray-500">Confidence: {(p.confidence * 100).toFixed(1)}%</p>
            {p.yieldLossPercent !== null && (
              <p className="text-sm text-yellow-700">Yield Loss: {p.yieldLossPercent}%</p>
            )}
            <p className="text-xs text-gray-400 mt-1">
              {new Date(p.createdAt).toLocaleString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default HistoryList;