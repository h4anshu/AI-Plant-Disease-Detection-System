// Offline only: would re-ranking an UNCERTAIN checkup's top-3 by environment fit help? Evaluated by
// scripts/eval_fusion.js on labelled checkups. Production runs FUSION_MODE=explain and never calls this
// (server.js refuses to start with anything else in production). Never touches an "ok" diagnosis.
export const DEFAULT_ALPHA = 0.3;
export const F_MIN = 0.5;
export const F_MAX = 1.5;

// fit score 0..1 -> multiplier 0.5..1.5; unknown fit changes nothing
export const fusionFactor = (score) => (score == null ? 1 : Math.min(F_MAX, Math.max(F_MIN, 0.5 + score)));

// { status, top3: [{disease, probability}] }, scores: { disease: score|null } -> top3 in the new order,
// with renormalised probabilities: p_i * f(score_i)^alpha / sum_j (...)
export function rerank({ status, top3 }, scores, alpha = DEFAULT_ALPHA) {
  if (status !== 'uncertain' || !top3?.length) return top3 ?? null;
  const w = top3.map((t) => ({ ...t, weight: t.probability * fusionFactor(scores[t.disease]) ** alpha }));
  const total = w.reduce((s, t) => s + t.weight, 0);
  if (!(total > 0)) return top3;
  return w.map(({ weight, ...t }) => ({ ...t, probability: Math.round((weight / total) * 10000) / 10000 }))
    .sort((a, b) => b.probability - a.probability);
}
