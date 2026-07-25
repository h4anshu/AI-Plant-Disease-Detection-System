const severityLossMap = {
  early: 10,      // 10% yield loss
  moderate: 30,   // 30% yield loss
  severe: 60      // 60% yield loss
};

const getYieldLoss = (severity) => {
  return severityLossMap[severity] ?? null;
};

export default getYieldLoss;