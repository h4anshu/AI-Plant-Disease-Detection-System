// Static map: disease name (from ML model) → treatment advice
// NOTE: exact keys must match your friend's model's output class names exactly

const treatmentMap = {
  'Potato___Early_blight': 'Apply Mancozeb or Chlorothalonil fungicide. Remove infected leaves. Avoid overhead irrigation.',
  'Potato___Late_blight': 'Apply Metalaxyl or Copper-based fungicide immediately. Destroy infected plants to prevent spread.',
  'Wheat___Leaf_rust': 'Apply Propiconazole or Tebuconazole fungicide. Use resistant wheat varieties in future planting.',
  'Wheat___Healthy': 'No treatment needed. Continue regular monitoring.',
  'Mustard___Alternaria_blight': 'Apply Mancozeb spray. Ensure proper spacing between plants for air circulation.',
  'Sugarcane___Red_rot': 'Remove and destroy infected canes. Apply Carbendazim as a preventive measure. Use disease-free seed material.',

  // Fallback for any disease not yet mapped
  'default': 'Consult a local agricultural expert for accurate treatment advice.'
};

const getTreatment = (disease) => {
  return treatmentMap[disease] || treatmentMap['default'];
};

export default getTreatment;