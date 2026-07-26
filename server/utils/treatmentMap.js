// Static map: disease name (from ML model) → treatment advice
// NOTE: these are placeholder keys. Once the real model is trained,
// replace these keys with the EXACT class names your friend's model outputs.
// Crops in scope: wheat, rice, sugarcane, potato, maize, pigeonpea

const treatmentMap = {
  'Potato___Early_blight': 'Apply Mancozeb or Chlorothalonil fungicide. Remove infected leaves. Avoid overhead irrigation.',
  'Potato___Late_blight': 'Apply Metalaxyl or Copper-based fungicide immediately. Destroy infected plants to prevent spread.',
  'Wheat___Leaf_rust': 'Apply Propiconazole or Tebuconazole fungicide. Use resistant wheat varieties in future planting.',
  'Wheat___Healthy': 'No treatment needed. Continue regular monitoring.',
  'Rice___Blast': 'Apply Tricyclazole fungicide. Avoid excess nitrogen fertilizer, which increases susceptibility.',
  'Rice___Bacterial_leaf_blight': 'Use Copper oxychloride spray. Ensure balanced fertilization and proper field drainage.',
  'Sugarcane___Red_rot': 'Remove and destroy infected canes. Apply Carbendazim as a preventive measure. Use disease-free seed material.',
  'Maize___Leaf_spot': 'Apply Mancozeb spray at first sign of spotting. Rotate crops to reduce soil-borne spread.',
  'Pigeonpea___Wilt': 'Remove and burn infected plants. Use Trichoderma-based soil treatment for future sowings.',

  // Fallback for any disease not yet mapped
  'default': 'Consult a local agricultural expert for accurate treatment advice.'
};

const getTreatment = (disease) => {
  return treatmentMap[disease] || treatmentMap['default'];
};

export default getTreatment;