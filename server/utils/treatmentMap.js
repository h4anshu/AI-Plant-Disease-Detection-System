/**
 * treatmentMap.js
 *
 * Real disease-management advice keyed by [crop][class_name], matching the
 * exact class names from ml-service/data/label_maps.json (post wheat
 * Yellow_Rust correction). Sourced from ICAR, state agricultural university
 * extension bulletins (TNAU, GBPUAT, RPCAU, CPRI), and Indian plant-pathology
 * literature. See project docs for full sourced report with citations.
 *
 * Lookup: treatmentMap[crop]?.[disease] ?? FALLBACK_TREATMENT
 */

const treatmentMap = {
  wheat: {
    BlackPoint:
      "Black point discolors the grain's germ end, caused by a fungal complex active in humid grain-fill conditions. Use clean, certified seed and avoid keeping black-pointed grain for sowing. Avoid late irrigation and excess humidity during grain filling. If recurring, treat seed with a systemic fungicide and spray propiconazole or thiophanate-methyl at the grain-filling stage.",
    FusariumFootRot:
      "Fusarium foot rot rots the crown and stem base, causing premature white heads and shrivelled grain. Rotate away from cereals for a season, deep-plough to bury infected stubble, and avoid moisture stress after flowering. Treat seed with carboxin+thiram (Vitavax Power) or a Trichoderma bioagent before sowing.",
    HealthyLeaf:
      "Your wheat leaf appears healthy. No disease symptoms detected. Continue regular crop management practices such as balanced fertilization, timely irrigation, and routine field monitoring.",
    LeafBlight:
      "Leaf blight (spot blotch) causes brown oval spots that enlarge and blight the leaf, common in warm, humid conditions in eastern UP. Grow resistant varieties, use healthy seed, and ensure balanced nutrition. Treat seed with carboxin+thiram (2.5 g/kg), then spray propiconazole 0.1% or tebuconazole+trifloxystrobin at boot-leaf stage, repeating after ~20 days if needed.",
    WheatBlast:
      "Wheat blast is a fast-acting, potentially devastating disease that bleaches the spike and can cause total yield loss. Use certified disease-free seed, sow early to avoid warm humid conditions at heading, and avoid wheat-after-wheat. Tebuconazole or tebuconazole+trifloxystrobin sprayed at heading can help, but efficacy is limited — report suspected cases to your local agriculture department immediately, as this is a quarantine-significant disease.",
  },

  rice: {
    Bacterialblight:
      "Bacterial leaf blight causes yellow-to-white drying along leaf margins and can wilt young seedlings. Grow resistant varieties, avoid excess nitrogen, and ensure good drainage. Spray streptocycline with copper oxychloride 0.25% at first symptoms — ordinary fungicides will not work since this is a bacterial disease.",
    Blast:
      "Rice blast causes spindle-shaped gray-centered spots on leaves and can rot the panicle neck, emptying grains. Grow resistant varieties, avoid excess nitrogen, and treat seed before sowing. Spray tricyclazole 75% WP (0.6 g/L) or a combination fungicide (azoxystrobin+difenoconazole, or tebuconazole+trifloxystrobin) at first leaf blast symptoms, repeating at heading to prevent neck blast.",
    Brownspot:
      "Brown spot causes many small sesame-seed-like brown spots and is strongly linked to poor soil fertility, especially low potassium, and drought stress. Correct soil nutrition (especially potassium) and use healthy seed. Spray propiconazole 0.1% or mancozeb 75% WP (2 g/L) at first symptoms — fixing soil fertility is as important as spraying.",
    Healthy:
      "Your rice leaf appears healthy. No disease symptoms detected. Continue balanced nutrition (including potassium), proper water management, and routine field monitoring.",
    Tungro:
      "Tungro is a virus spread by the green leafhopper, causing yellow-orange discoloration and stunting. There is no chemical cure — grow resistant varieties, plant in sync with neighbouring fields, and rogue out infected plants early. Control leafhopper populations with imidacloprid or thiamethoxam if numbers are high, though resistant varieties remain the real solution.",
  },

  sugarcane: {
    Banded_Chlorosis:
      "Banded chlorosis is NOT caused by a pathogen — it's cold-injury damage to young unrolled leaves, appearing as pale bands. No fungicide is needed; the crop typically outgrows it. Avoid very early planting into cold spells and maintain good nutrition and irrigation to support recovery.",
    BrownRust:
      "Brown rust produces reddish-brown pustules, mostly on the underside of leaves, reducing green leaf area. Grow resistant varieties, avoid dense planting, and maintain balanced phosphorus/potassium. Spray propiconazole 0.1% or a strobilurin fungicide at first appearance, with a second spray 3-4 weeks later if active — protection lasts only about 3-4 weeks, so timing matters.",
    Brown_Spot:
      "Brown spot causes oval red-brown spots with a yellow halo on older leaves, worsening in humid conditions on susceptible varieties. Grow resistant varieties, detrash and destroy affected lower leaves, and ensure good airflow. Spray mancozeb 75% WP (2 g/L) or carbendazim (1 g/L), alternated with propiconazole, every ~15 days; foliar potassium silicate 0.5% has also given strong control.",
    Dried_Leaves:
      "Dried leaves is a symptom, not a specific disease — first split a stalk to check for internal reddening or a sour smell (signs of red rot/wilt). If the stalk is healthy inside, treat as water/heat stress: irrigate adequately, detrash dried leaves, and maintain balanced nutrition. If red rot/wilt is confirmed, rogue and burn affected clumps, stop ratooning, and switch to resistant varieties.",
    Grassy_shoot:
      "Grassy shoot disease causes numerous thin, pale-yellow tillers giving a grassy appearance, spread through infected setts and leafhoppers. There is no direct chemical cure — use disease-free seed cane (ideally hot-water/aerated-steam treated), rogue affected clumps early, and control leafhopper vectors. Replacing infected seed with certified disease-free setts is the key step, especially before ratooning.",
    Healthy_Leaves:
      "Your sugarcane leaf appears healthy. No disease symptoms detected. Continue using healthy setts, balanced nutrition, proper irrigation, and routine field monitoring.",
    Pokkah_Boeng:
      "Pokkah Boeng causes chlorosis and twisting of top leaves with a 'knife-cut' appearance, worse in warm humid conditions. Grow resistant varieties, remove and destroy affected 'top rot' canes, and use disease-free setts. Spray carbendazim 0.1%, copper oxychloride 0.2%, or mancozeb 0.3% every 15 days; sett treatment with carbendazim before planting also helps — rotate with mancozeb to manage resistance.",
    Sett_Rot:
      "Sett rot enters through cut sett ends, rotting internal tissue with a characteristic pineapple smell, preventing bud germination. Use long, healthy setts with 3-4 buds, ensure good drainage, and select from disease-free fields. Soak setts in 0.05-0.1% carbendazim for about 15 minutes before planting — this pre-plant treatment is the decisive step.",
    Viral_Disease:
      "Viral diseases like mosaic cause mottled light-and-dark patches on young leaves, spread through infected setts and aphids. There is no chemical cure — use virus-free/tissue-culture-derived setts, grow resistant varieties, and rogue out infected plants. Controlling aphid vectors helps, but clean seed and resistant varieties are the real solution.",
    Yellow_Leaf:
      "Yellow leaf disease causes yellowing of the leaf midrib, spread through infected setts and aphids, and can severely reduce cane and juice yield. Use virus-free planting material from tissue culture, grow tolerant varieties, and rogue infected plants. There is no direct chemical cure — control aphid vectors and rely on clean seed.",
    smut:
      "Smut produces a distinctive black whip-like structure from the growing point, spread by airborne spores and infected setts. Grow resistant varieties, promptly rogue and destroy (bag and burn) smut whips before they release spores, and use disease-free seed. Dip setts in 0.1% propiconazole or triadimefon for 15-20 minutes before planting, and spray propiconazole 0.1% if symptoms appear.",
  },

  potato: {
    Early_blight:
      "Early blight causes brown spots with target-like concentric rings on older leaves, often on stressed or aging plants. Use healthy seed tubers, rotate crops, and avoid overhead irrigation. Spray mancozeb 75% WP 0.25% starting at 40-45 days, alternating with propiconazole 0.05-0.1% if disease is active, every 8-10 days.",
    Late_blight:
      "Late blight is the most destructive potato disease, causing rapidly spreading dark water-soaked blotches that can destroy a crop within days. Use healthy seed tubers, resistant varieties, and avoid overhead irrigation. Spray mancozeb 0.2% preventively at canopy closure, then switch to systemic combinations (cymoxanil+mancozeb, or dimethomorph+mancozeb) every 7-10 days once humid conditions favor disease — start protectant sprays before symptoms appear.",
    healthy:
      "Your potato leaf appears healthy. No disease symptoms detected. Continue proper earthing-up, balanced nutrition, and routine monitoring for blight, especially in cool, humid weather.",
  },

  maize: {
    Blight:
      "Northern leaf blight causes large cigar-shaped tan-grey lesions, favored by humid conditions. Grow resistant hybrids, rotate crops, and destroy infected residue. Spray mancozeb 75 WP 2.5 g/L preventively at 40-45 days in prone areas, or azoxystrobin+difenoconazole at first symptoms.",
    Common_Rust:
      "Common rust produces small, powdery, cinnamon-brown pustules on leaves. Resistant hybrids are the main control — avoid late planting and maintain balanced nutrition. If needed, spray tebuconazole 0.1% at first appearance, around 35 days after sowing.",
    Gray_Leaf_Spot:
      "Gray leaf spot causes long, narrow, rectangular tan-to-gray lesions bounded by leaf veins, worse in warm, humid, continuous-maize fields. Grow resistant hybrids and rotate away from maize, deep-ploughing to bury residue. Spray mancozeb 2 g/L or propiconazole 0.1% at first appearance, repeating every ~15 days if severe.",
    Healthy:
      "Your maize leaf appears healthy. No disease symptoms detected. Continue growing resistant hybrids, balanced nutrition, crop rotation, and routine field monitoring.",
  },

  pigeonpea: {
    Healthy:
      "Your pigeonpea leaf appears healthy. No disease symptoms detected. Continue growing resistant varieties, monitoring for mites and webbers, and routine field inspection.",
    Leaf_Spot:
      "Leaf spot causes grey-brown necrotic spots with reddish margins that coalesce, worse in cool, humid weather. Use disease-free seed, rotate crops, and avoid planting near perennial pigeonpea. Treat seed with captan or thiram (2 g/kg) before sowing, and spray carbendazim+mancozeb 0.2% or propiconazole 0.1% at first symptoms, repeating after 10-15 days.",
    Leaf_webber:
      "Leaf webber caterpillars web together leaflets and feed from inside, mostly during vegetative and flowering stages. Monitor fields regularly and remove/destroy webbed shoots. Since larvae are protected inside webs, use spinosad, chlorantraniliprole, or indoxacarb at first sign of webbing — contact insecticides work poorly against protected larvae.",
    Sterilic_mosaic:
      "Sterility mosaic ('green plague') causes bushy, pale plants with little to no pod formation, transmitted by tiny mites. There is no cure once infected — grow resistant varieties, rogue infected plants within the first ~40 days, and avoid ratoon pigeonpea near new crops. Seed treatment with imidacloprid plus foliar miticide sprays (fenazaquin or fenpyroximate) at 25, 40, and 55 days after sowing helps control the mite vector.",
  },
};

const FALLBACK_TREATMENT =
  "Consult a local agricultural expert for accurate treatment advice.";

/**
 * Look up treatment advice for a given crop + disease class.
 * @param {string} crop - e.g. "wheat", "rice"
 * @param {string} disease - exact class name from label_maps.json
 * @returns {string}
 */
function getTreatment(crop, disease) {
  return treatmentMap[crop]?.[disease] ?? FALLBACK_TREATMENT;
}

export { treatmentMap, getTreatment, FALLBACK_TREATMENT };
