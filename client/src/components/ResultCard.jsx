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
    <div className="max-w-xl mx-auto mt-8 bg-white rounded-lg shadow p-6">
      <img
        src={imageUrl}
        alt="Analyzed leaf"
        className="w-full max-h-72 object-cover rounded-lg mb-4"
      />

      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xl font-bold text-gray-800">
          {disease.replace(/_/g, ' ')}
        </h3>
        <span
          className={`text-sm font-semibold px-3 py-1 rounded-full border ${severityColors[severity]}`}
        >
          {severity.toUpperCase()}
        </span>
      </div>

      <p className="text-sm text-gray-500 mb-1">Crop: <span className="font-medium capitalize">{crop}</span></p>

      <div className="mb-4">
        <p className="text-sm text-gray-500 mb-1">Confidence</p>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className="bg-green-600 h-2.5 rounded-full"
            style={{ width: `${(confidence * 100).toFixed(0)}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-1">{(confidence * 100).toFixed(1)}%</p>
      </div>

      <div className="mb-4">
        <p className="text-sm font-semibold text-gray-700 mb-1">Treatment Advice</p>
        <p className="text-sm text-gray-600">{treatment}</p>
      </div>

      {yieldLossPercent !== null && (
        <div className="bg-yellow-50 border border-yellow-300 rounded p-3">
          <p className="text-sm font-semibold text-yellow-800">
            Estimated Yield Loss: {yieldLossPercent}%
          </p>
        </div>
      )}
    </div>
  );
};

export default ResultCard;