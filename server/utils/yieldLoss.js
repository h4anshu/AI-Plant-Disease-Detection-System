// Yield-loss % lookup table, sourced from published agronomy literature
// (ICAR institutes, IRRI, state ag universities, peer-reviewed plant pathology studies).
// Confidence tags: HIGH = India-specific or severity-resolved data; MED = solid international
// data, no India-specific figure; LOW = interpolated/proxy, flagged for future refinement.

const yieldLossTable = {
  wheat: {
    BlackPoint:       { early: 0,  moderate: 0,  severe: 0,  confidence: "high" }, // quality defect, not tonnage loss
    FusariumFootRot:  { early: 5,  moderate: 10, severe: 35, confidence: "med" },
    LeafBlight:       { early: 10, moderate: 22, severe: 44, confidence: "high" },
    WheatBlast:       { early: 10, moderate: 30, severe: 55, confidence: "med" },
    HealthyLeaf:      { early: 0,  moderate: 0,  severe: 0,  confidence: "high" }
  },
  rice: {
    Bacterialblight: { early: 10, moderate: 25, severe: 75, confidence: "high" },
    Blast:           { early: 10, moderate: 25, severe: 60, confidence: "high" },
    Brownspot:       { early: 6,  moderate: 20, severe: 45, confidence: "high" },
    Tungro:          { early: 15, moderate: 45, severe: 85, confidence: "high" },
    Healthy:         { early: 0,  moderate: 0,  severe: 0,  confidence: "high" }
  },
  sugarcane: {
    BrownRust:        { early: 8,  moderate: 16, severe: 30, confidence: "high" },
    Brown_Spot:       { early: 6,  moderate: 14, severe: 18, confidence: "med" },
    Grassy_shoot:     { early: 10, moderate: 40, severe: 70, confidence: "high" },
    Pokkah_Boeng:     { early: 10, moderate: 25, severe: 60, confidence: "med" },
    Sett_Rot:         { early: 15, moderate: 30, severe: 47, confidence: "med" }, // establishment-stage loss, not foliar
    Viral_Disease:    { early: 10, moderate: 25, severe: 50, confidence: "low" }, // label ambiguous, assumes mosaic (SCMV)
    Yellow_Leaf:      { early: 15, moderate: 34, severe: 50, confidence: "high" },
    smut:             { early: 15, moderate: 40, severe: 70, confidence: "high" },
    Banded_Chlorosis: { early: 0,  moderate: 0,  severe: 0,  confidence: "high" }, // NOT a disease - cold/abiotic injury
    Dried_Leaves:     { early: 10, moderate: 25, severe: 50, confidence: "low" },  // nonspecific symptom, proxied via red rot
    Healthy_Leaves:   { early: 0,  moderate: 0,  severe: 0,  confidence: "high" }
  },
  potato: {
    Early_blight: { early: 5, moderate: 25, severe: 50, confidence: "high" },
    Late_blight:  { early: 8, moderate: 20, severe: 50, confidence: "high" },
    healthy:      { early: 0, moderate: 0,  severe: 0,  confidence: "high" }
  },
  maize: {
    Blight:         { early: 16, moderate: 40, severe: 80, confidence: "high" }, // Turcicum/Northern Corn Leaf Blight
    Common_Rust:    { early: 10, moderate: 26, severe: 49, confidence: "low" },  // no India-specific data (US sweet-corn source)
    Gray_Leaf_Spot: { early: 10, moderate: 30, severe: 60, confidence: "low" },  // no India-specific data, interpolated
    Healthy:        { early: 0,  moderate: 0,  severe: 0,  confidence: "high" }
  },
  pigeonpea: {
    Leaf_Spot:       { early: 15, moderate: 35, severe: 70, confidence: "low" }, // Alternaria data used as proxy; Cercospora-specific absent
    Leaf_webber:     { early: 15, moderate: 40, severe: 68, confidence: "med" }, // insect pest, not pathogen - route to IPM advisory downstream
    Sterilic_mosaic: { early: 40, moderate: 65, severe: 97, confidence: "high" },
    Healthy:         { early: 0,  moderate: 0,  severe: 0,  confidence: "high" }
  },
  // ---- New crops (Sep 2026). Literature ranges mapped onto early/moderate/severe; sources in
  // ml-service/NEW_CROPS_REPORT.md.
  groundnut: {
    Leaf_Spot:            { early: 10, moderate: 25, severe: 50, confidence: "med" },  // TNAU/ICRISAT: foliar leaf spots ~50% pod loss
    Rust:                 { early: 10, moderate: 25, severe: 50, confidence: "med" },  // >70% only when combined with leaf spot
    Alternaria_Leaf_Spot: { early: 5,  moderate: 12, severe: 22, confidence: "med" },  // pod loss up to 22% (fodder up to 63%)
    Rosette:              { early: 20, moderate: 50, severe: 90, confidence: "low" },  // GRD data is African; Indian rosette-type viruses proxied
    Nutrition_Deficiency: { early: 8,  moderate: 16, severe: 24, confidence: "low" },  // iron chlorosis: Fe+citric acid recovered 16-24% pod yield
    Healthy:              { early: 0,  moderate: 0,  severe: 0,  confidence: "high" }
  },
  blackgram: {
    Yellow_Mosaic:  { early: 20, moderate: 50, severe: 80, confidence: "high" }, // India: 30-80%, up to 100%
    Leaf_Crinkle:   { early: 20, moderate: 45, severe: 80, confidence: "high" }, // India: 35-81%
    Powdery_Mildew: { early: 10, moderate: 20, severe: 40, confidence: "low" },  // proxied from mungbean foliar-disease range (20-60%)
    Anthracnose:    { early: 10, moderate: 25, severe: 50, confidence: "low" },  // proxied from mungbean foliar-disease range (20-60%)
    Healthy:        { early: 0,  moderate: 0,  severe: 0,  confidence: "high" }
  },
  apple: {
    Alternaria_Leaf_Blotch: { early: 5,  moderate: 15, severe: 30, confidence: "low" }, // defoliation-driven; no severity-resolved yield data
    Mosaic:                 { early: 10, moderate: 25, severe: 46, confidence: "med" }, // 25% mild to 50% severe strains (international)
    Healthy:                { early: 0,  moderate: 0,  severe: 0,  confidence: "high" }
  },
  banana: {
    Sigatoka_Leaf_Spot:       { early: 10, moderate: 30, severe: 60, confidence: "med" },  // India: up to 65% in epidemics
    Bract_Mosaic_Virus:       { early: 15, moderate: 30, severe: 70, confidence: "high" }, // India (Nendran): mean 30%, up to 70%
    Panama_Wilt:              { early: 20, moderate: 60, severe: 100, confidence: "med" }, // affected plants usually lost
    Moko_Wilt:                { early: 20, moderate: 60, severe: 100, confidence: "low" }, // plant death; little Indian data
    Pestalotiopsis_Leaf_Spot: { early: 2,  moderate: 5,  severe: 10, confidence: "low" },  // minor leaf spot, interpolated
    Insect_Pest:              { early: 5,  moderate: 10, severe: 20, confidence: "low" },  // label does not name the pest
    Healthy:                  { early: 0,  moderate: 0,  severe: 0,  confidence: "high" }
  }
};

/**
 * Look up estimated yield-loss % for a given crop/disease/severity.
 * @param {string} crop - e.g. "wheat"
 * @param {string} disease - exact class name from label_maps.json
 * @param {string} severity - "healthy" | "early" | "moderate" | "severe"
 * @returns {number|null} yield loss percentage, or null if crop/disease combo not found
 */
const getYieldLoss = (crop, disease, severity) => {
  if (severity === "healthy") return 0;
  const diseaseEntry = yieldLossTable[crop]?.[disease];
  if (!diseaseEntry) return null;
  return diseaseEntry[severity] ?? null;
};

export default getYieldLoss;
export { yieldLossTable };
