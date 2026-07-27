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
