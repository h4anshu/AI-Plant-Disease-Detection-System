import express from "express";
import multer from "multer";
const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const fakeResponses = [
  { disease: 'Potato___Early_blight', confidence: 0.92, severity: 'moderate' },
  { disease: 'Wheat___Leaf_rust', confidence: 0.87, severity: 'severe' },
  { disease: 'Wheat___Healthy', confidence: 0.98, severity: 'early' },
  { disease: 'Sugarcane___Red_rot', confidence: 0.79, severity: 'severe' }
];

app.post('/predict-disease', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file received' });
  }

  const random = fakeResponses[Math.floor(Math.random() * fakeResponses.length)];

  res.json({
    disease: random.disease,
    confidence: random.confidence,
    severity: random.severity,
    gradcam: null
  });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = 8000;
app.listen(PORT, () => console.log(`Mock ML service running on port ${PORT}`));