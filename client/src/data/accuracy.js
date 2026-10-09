// Per-crop accuracy shown on the landing page. Copied from ml-service/models/metrics.json (sorted best to worst);
// src/test/Honest.test.jsx fails if this file and metrics.json ever disagree.
// cv = true: 5-fold grouped CV (stricter); false: one random 15% holdout split. The two are not directly comparable.
export const ACCURACY = [
  { crop: 'rice', acc: 0.9978, lo: 0.9946, hi: 1.0, n: 927, cv: false },
  { crop: 'wheat', acc: 0.9958, lo: 0.9875, hi: 1.0, n: 240, cv: false },
  { crop: 'potato', acc: 0.9814, lo: 0.9659, hi: 0.9938, n: 323, cv: false },
  { crop: 'banana', acc: 0.9676, lo: 0.9627, hi: 0.9726, n: 4634, cv: true },
  { crop: 'blackgram', acc: 0.9623, lo: 0.9503, hi: 0.9742, n: 1007, cv: true },
  { crop: 'apple', acc: 0.9488, lo: 0.9247, hi: 0.9699, n: 332, cv: true },
  { crop: 'maize', acc: 0.9428, lo: 0.9237, hi: 0.9603, n: 629, cv: false },
  { crop: 'sugarcane', acc: 0.927, lo: 0.9103, hi: 0.9428, n: 1014, cv: false },
  { crop: 'groundnut', acc: 0.9269, lo: 0.9159, hi: 0.9366, n: 2367, cv: true },
  { crop: 'pigeonpea', acc: 0.8108, lo: 0.7432, hi: 0.8784, n: 148, cv: false },
];
