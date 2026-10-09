# PlantGuard colour system: research, experiments, decision (v2)

**Status: adopted and built (9 Oct 2026).** The tokens are in `client/src/index.css` (`@theme`), all seven landing sections use them, and `mapStyle.js` uses the map ramp. See §4.6 for what is built where. (The approval item in task.md's Pending list is the user's to tick.)
v1 was built from your colour lists. **v2 (this file) adopts the palette of the hero image you generated** (Pine, Leaf, Sage, Parchment, Rust), after testing it; section 3.11 has the verdict and the three adjustments it needed.
Everything is reproducible: `docs/colour-system/experiments/` (the lab and its dated output `RESULTS.txt`), `docs/colour-system/hero-reference.jpg` (your image) and `docs/colour-system/preview.html` (a mock landing page: `?theme=t2`, `&f=protan|deutan|tritan|gray|squint`, `&sheet=1` for the swatches).

## 1. The decision

**"Herbarium": warm parchment, one deep pine family, your Rust as the single vivid accent.**
Your hero palette fits professionally: four of its five colours land close to what v1 had already derived for the same job (role by role: Pine 1.7, Parchment 0.3, Leaf 4.5 from the old Palm leaf, Sage 3.4 from the old wash, in ΔE), and the fifth (Rust) works once it is split into two jobs. So v2 *uses your five colours exactly* and adds only what they do not cover (text inks, the alternate band, water blue, an ochre for "early", a butter accent on dark bands).

| Job | Token | Hex | Measured |
|---|---|---|---|
| Page | `paper` | `#F5F0E2` | your **Parchment** (v1's `#F4EFE1` was ΔE 0.3 away) |
| Card | `card` | `#FBF8F0` | unchanged from today |
| Alternate band | `latte` | `#EEE1CD` | ink on it 11.1:1 |
| Calm wash, icon discs | `sage-wash` | `#DCE4D1` | your **Sage**; ink on it 11.0:1. Named `-wash` on purpose, see 4.3 |
| Text / secondary text | `ink` / `ink-2` | `#162F22` / `#2F493B` | 12.6:1 / 8.6:1 on paper (7.6:1 on latte) |
| Button, links, raised dark card | `primary` | `#193D2B` | your **Pine**; paper text on it 10.6:1; ΔE 21.6 from the nearest competitor green |
| Button hover | `primary-hover` | `#0B2E1E` | paper text 13.0:1 |
| Dark band | `bg-dark` | `#072618` | same hue as Pine (160°); paper on it 14.2:1 |
| Dark-band text | `on-dark` / `on-dark-2` | `#F5F0E2` / `#D5D5C7` | 14.2:1 / 10.9:1 |
| Life, bars, decoration | `leaf` | `#6C854D` | your **Leaf**; 3.6:1 on paper, so a mark, never body text |
| Green text | `leaf-text` | `#475E23` | 6.4:1 on paper |
| **Bright accent** | `rust` | `#D85D2D` | your **Rust**: illustration, display numbers ≥ 24px, map bin, shapes. 3.3:1 on paper, so **not small text, not a button fill with text** |
| **Deep rust** | `rust-deep` | `#98370C` | same hue (40°), darker: small text, badges, "moderate", REDSI line. 6.4:1 both ways |
| Accent on dark | `butter` | `#F2DB8F` | 11.8:1 on `bg-dark`, 8.8:1 on Pine. **My addition; optional** (fallback: parchment button) |
| Water / rain data | `water` / `water-wash` | `#0B5369` / `#D2EDF4` | 7.5:1 |
| Status marks | healthy / early / moderate / severe | `#6C854D` `#AE9900` `#98370C` `#700004` | Leaf, ochre, rust-deep, your Red Inferno; ΔE ≥ 10.0 under every vision type |
| Map bins | 3–4 / 5–9 / 10–24 / 25+ | `#F2D98B` `#D9A441` `#D85D2D` `#700004` | monotone; every step ≥ ΔE 12 under any vision (today: 9.1) |
| Chart lines | NDVI / NDRE / REDSI | `#6F9364` `#0A3C62` `#98370C` | ΔE 15.1 apart (today: 6.3) |

Status tints and per-status text colours are in the swatch sheet and in `tokens()` in the lab.

**Why this, in five lines**
1. **It is the colour of the subject, and of the image you chose.** Real leaf photos sit at OKLCH hue ≈ 128°, your Leaf is 128°, Pine is the same hue as my v1 dark (160°). Rust (40°) is orange like the wheat leaf rust in your hero's example.
2. **It is not a competitor.** The stock "Agriculture / Farm Tech" palette (`#15803D`) is ΔE 0.4 from DeHaat's brand green; Plantix and Fasal are blue. Pine is at least ΔE 21.6 from every one of them.
3. **Every pair passes before it ships.** 33 text/surface pairs plus status, map and chart separation are asserted in code (4.5); body text is held to 7:1 because glare cuts contrast (3.9).
4. **It survives colour blindness and a black-and-white printer**: status is never colour alone (lightness steps + a fill-level glyph + a word).
5. **One vivid colour against a muted field.** Itten's saturation contrast is why Rust works as the only saturated colour, and why it must stay rare.

**Decisions needed from you**
1. Approve `t2` with your hero palette (or ask for `t3` ink-sea / `t1` olive: section 3.8).
2. Keep `butter`? It is the only colour not in your palette. Without it, dark-band buttons become parchment with Pine text (14.2:1) and dark-band numbers become `on-dark`.
3. How the illustration is used (3.11): the hero art has English text and a baked-in background. Recommended: use only the plant illustration as an image, build the text and cards in code (Hindi!), and give the hero a background of `#F2EAD6`.

## 2. Method

1. **Measure the subject**: cluster the colours of real leaf photos.
2. **Audit the neighbourhood**: what colours do competing sites actually ship?
3. **Declare the rules first**, then **measure every colour you gave me** (the lists, and later the hero image) against them.
4. **Eliminate**, then **solve the gaps** with a seeded random search instead of picking by eye.
5. **Build the system from rules** (OKLCH lightness steps) and **test it in context**: one mock page, three variants, vision filters, glare model.
6. **Lock it with a contract** so a later edit that breaks contrast fails a script.

| Rule | Threshold | Basis |
|---|---|---|
| Body text | ≥ 7:1 and APCA Lc ≥ 75 | WCAG AAA; farmers read outdoors (3.9) |
| Any text / component text | ≥ 4.5:1 | WCAG AA |
| Unlabelled marks (map bins, chart lines, focus ring) | ≥ 3:1 | WCAG 1.4.11 |
| Status colours apart under protan, deutan, tritan | ΔE ≥ 10 (OKLab ×100) | one just-noticeable difference ≈ 2, so 5 of them. **My rule of thumb, not from a study** |
| Distance from competitor brand colours | ΔE ≥ 15 | same caveat |
| Saturation | chroma ≤ 0.14; **one exception, Rust, ≤ 0.18** | no cluster of real leaf pixels is above 0.14 (exception: 5, 3.11) |
| Adjacent severity steps in grey | ΔL ≥ 0.08 | a B/W print must keep them apart |

## 3. Evidence

### 3.1 The site today fails its own rules (E0)
Measured on the shipped tokens: `text-sage` labels 3.18:1, `text-clay` eyebrows 3.76:1, **RiskStrip "high" chip text 2.97:1**, `text-wheat` 2.11:1, and body copy `ink/70` is 4.54:1 (passes AA, fails the 7:1 target). These need fixing whichever palette you choose.

### 3.2 What a leaf actually looks like (`leaf_palette.py`, PlantDoc)
326 photos (120 healthy, 206 diseased; 12 random per class; seeded), clustered in OKLab:
- Healthy leaf: five of six clusters are leaf green at hue **118–131°**, chroma **0.05–0.14**, lightness 0.32–0.82 (`#85B14C #648B3D #4C632C #C0CF87 #2D3818`); the sixth (6% of pixels, `#C4735E`, hue 36°) is a salmon-brown that is most likely hands or soil. The diseased photos' green clusters sit at 120–134°.
- Lesion pixels (the non-green part of diseased photos, 7% of pixels): all five clusters at hue **62–76°**, chroma 0.06–0.08 (`#A27C4F #7D5B36 #C59F6D #E5C391 #593A1D`).

So brown/tan/butter (your option 3) and olive-green (palm leaf, option 5) are the colours of symptom and leaf. The teal greens and the blues are not. (Your hero illustration draws its lesions as ochre, hue 92°; see 3.11.)

### 3.3 What competitors ship (`audit_sites.py`, homepage CSS, 2026-10-09)
Plantix `#0158DA` (blue, 91% of its chromatic CSS), Fasal `#3898EC`, DeHaat `#0F8040`, BigHaat `#298E4D` and Tailwind `#22C55E`, Cropin neon lime `#B8FF5A` on dark, Syngenta amber `#FFAA00` + blue. Farmer apps are either "app green" or tech blue. **Control:** the palette database's agriculture answer `#15803D` is ΔE 0.4 from DeHaat; `#22C55E` is identical to BigHaat's. Generic equals a competitor.

### 3.4 Your five groups, measured (E1–E4)
| Group | Verdict | Where it went |
|---|---|---|
| 1 Greens | Mid-greens (`#50987B` 7.6, `#51B42F` 5.2, Forest `#228B22` 4.3, Fern 4.8, `#215C46` 11.9) are all ΔE < 12 from DeHaat/BigHaat, and `#215C46`'s hue (165°) is 37° off the leaf. `#51B42F` (chroma 0.19, 2.3:1) is more saturated than any real leaf pixel. The **deep** Evergreen (`#05472A`, ΔE 18) is distinct. Your dark olive `#4A4C15` is also distinct (ΔE 15.5, 7.8:1) but a dark olive band reads khaki-brown (3.8). | The idea of Evergreen is now your **Pine** (same hue family, 160°). |
| 2 Ink Blue + Eucalyptus | Cool-cool, handsome, but nothing warm: it cannot say "disease", and sits 77° from the leaf. | Ink Blue → `water` (rain data). Eucalyptus hue = finalist `t3`. |
| 3 Chocolate, Butter, Olive, Latte | Matches the lesion hue (chocolate 57°). Butter can **never** be text or a mark on paper (1.1:1). | Latte → `latte`. Butter → accent on dark. Chocolate's hue informed v1's sienna; v2 uses the Rust hue instead (section 5). |
| 4 Blues | Every blue except Powder/Sky has chroma 0.14–0.21 (above any leaf); Sapphire, Royal and Cobalt are ΔE 5–9 from Plantix's blue. | Blue only as the *water* data colour. |
| 5 Stone, Inferno, Palm | Covers healthy, severe and dark surface. Palm leaf is 3.0:1 on paper. | Red Inferno verbatim. Palm leaf is superseded by the hero's **Leaf** (same hue, 128° vs 125°, but 3.6:1). |

**Role coverage (E2):** no group covers more than 3 of the 6 jobs (healthy, early, moderate, severe, water, dark surface). The system is a combination, not a pick.

### 3.5 Severity under colour blindness (E5, E6, E6b, E6d, E12b)
Four levels, worst-case ΔE over normal, protan, deutan, tritan:

| Scheme | Worst pair | Min ΔE |
|---|---|---|
| Conventional traffic light (`#2E7D32 #F9A825 #EF6C00 #C62828`) | healthy~severe, deutan | **4.3** |
| Site today (field, wheat, clay, dark clay) | healthy~severe, deutan | **4.3** |
| Your lists used naively (palm, butter, chocolate, inferno) | moderate~severe, tritan | **8.0** (6.6 under the other CVD convention) |
| v1 (`#628763 #B79307 #8E5100 #700004`), superseded | healthy~early, protan | 10.7 |
| **v2: Leaf `#6C854D`, ochre `#AE9900`, rust-deep `#98370C`, Inferno `#700004`** | healthy~early, protan | **10.0** (10.1 under the other convention) |
| Hero palette with the bright Rust `#D85D2D` as "moderate" | leaf~rust, protan | **4.7**: fails |

Three things to know. **(a)** The bright Rust cannot be the status colour: at the same lightness as the green it collapses for protan users, the classic orange/green trap. A *darker* rust (L 0.47) at the same hue passes, which is why Rust is split into `rust` and `rust-deep`. **(b)** v2's margin over the ΔE 10 rule is thin (10.04), because I pinned "healthy" to your exact Leaf; letting it float reaches 11.4 (`#7CA183`, paler and bluer, further from your palette). **(c)** I bent one rule: requiring every chip dot to be ≥ 3:1 on paper caps separation at about 9; allowing 2.5:1 gets above 10. Each chip also has a ≥ 4.5:1 label, a glyph and a border; anything unlabelled (map, charts) keeps 3:1.

**Tints do not carry meaning.** The four decorative tint fills are ΔE 0.1 apart under tritan and merge under deuteranopia too; the filter screenshots confirm it. Meaning rides on border darkness, the fill-level glyph (✓ ◔ ◑ ●) and the word.

### 3.6 Map ramp and chart series (E7, E6c)
Today's bins are monotone but only ΔE 9.1 apart under deuteranopia; ColorBrewer YlOrBr-4 (the reference ramp) 9.4. v2's butter → ochre → **Rust** → inferno is monotone (L 0.89 → 0.34) and every step is ≥ ΔE 12.0 under any vision (v1 with clay: 13.9; Rust costs a little but ties the map to the brand). Chart lines: today's trio (field, clay, purple) is ΔE 6.3 apart; a draft of mine with similar darkness merged at 5.1; the search spreads lightness (0.62 / 0.35 / 0.47) and reaches **15.1** with `rust-deep` as the REDSI line. Lines also differ by dash style.

### 3.7 Gradients (E8)
Green → green pairs (`#215C46 → #50987B`, `#05472A → #7C9254`…) interpolate almost identically in sRGB, OKLab and OKLCH, so the space does not matter for them. It matters for big hue gaps: latte → evergreen loses 11–13% chroma in sRGB/OKLab, sky → evergreen 8–9%, while OKLCH keeps chroma but swings 60–96° of hue. `#B5652E → #700004` has visibly uneven steps in sRGB (0.12 vs 0.03). **Rule:** write gradients `in oklab`; keep every stop dark enough for the text on top (`#215C46 → #50987B` gives paper text only 3.0:1 at the light end: decoration only).

### 3.8 Which dark? Three finalists, one variable (E9, E10, screenshots)
Everything identical except the hue of the dark family (olive 125° / evergreen 160° / ink-sea 205°). All three pass the full contract, so contrast cannot decide; the in-context renders did:

| Finalist | Hue to leaf | In context |
|---|---|---|
| `t1` olive-leaf | 3° | Reads khaki-brown. Dark yellow-green loses its "green" identity, so the brand's dark looks like the **lesion colour**. Rejected. |
| **`t2` evergreen** | 32° | Clearly green at L 0.24, calm, premium; leaf-green bars harmonise. **Chosen**, and it is the hue of your Pine. |
| `t3` ink-sea | 77° | Most distinct from competitors, but reads fintech/marine. Runner-up. |

This verdict is my judgement from the renders, not a measurement.

### 3.9 Glare (E11)
Model only (the ambient offset F is assumed; no outdoor device test): at F = 0.1 the 4.5:1 body text the site has today falls to 3.4:1, while 7:1 text keeps ≥ 4.5:1 (`ink-2`: 8.6 → 4.9; `ink`: 12.6 → 5.9). `rust-deep` as small text: 6.4 → 4.2, so keep it for short labels, not paragraphs.

### 3.10 Vision filters
The mock page rendered through Machado 2009 matrices (protan, deutan, tritan), grayscale and a squint blur, with the v2 tokens. Chips, risk strip and map stay readable in all of them; in grayscale the map ramp and chips keep a clean light-to-dark order. Weak spot: under protan/deutan the Early → Moderate → Severe borders become an olive-to-black ladder (ordered by darkness, but close), and in the risk strip the Low and High *fills* turn the same beige. The glyph (quarter, half, full circle) and the label do the separating.

### 3.11 Your generated hero image (E12, `hero_image_probe.py`)
**Does the image use the stated hexes?** Mostly. Measured on the pixels: CTA and care-plan card `#1E3E2C` (Pine, ΔE 0.7), the MODERATE badge `#D96129` and the eyebrow text `#D36637` (Rust, ΔE 1.0–1.8), headline `#143323`, italic headline `#4C6534` (a darker green than the stated Leaf, ΔE 10.9: the italic is set in a text-safe green, which is what `leaf-text` is for), lesions drawn ochre `#C4A435` (hue 92°). The flat background is `#F2EAD6`–`#F3EBD8`, **not** the stated Parchment (ΔE 1.6–1.9).

**The five colours against the rules:**
| | Hex | Verdict |
|---|---|---|
| Pine | `#193D2B` | Passes everything: 10.6:1, ΔE ≥ 21.6 from competitors, ≈ v1's primary (ΔE 1.7). **Adopt exactly.** |
| Parchment | `#F5F0E2` | ≈ v1's paper (ΔE 0.3). **Adopt.** |
| Sage | `#DCE4D1` | A calmer, greyer version of v1's leaf wash (ΔE 3.4); ink on it 11.0:1. **Adopt as `sage-wash`.** |
| Leaf | `#6C854D` | 3.6:1 on paper (better than Palm leaf's 3.0), 128°. A mark and display colour, not label text; **adopt**, with `leaf-text` for text. ΔE 6.6 from BigHaat's green, so it must never be the brand's main colour. |
| Rust | `#D85D2D` | Chroma 0.166 (above the 0.14 cap), 3.3:1. **Adopt, with limits** (below). |

**Rust, as the image uses it, fails twice.** The eyebrow is 12px mono caps at 3.34:1 (needs 4.5) and the MODERATE badge is near-white on Rust at 3.79:1 (needs 4.5). Darkening to the same hue at L 0.47 (`#98370C`) gives 6.4:1 both ways, and it also fixes the colour-blindness problem in 3.5. So: **`rust` for illustration, display numbers ≥ 24px, shapes and the map; `rust-deep` for small text, badges, the moderate status and the REDSI line.** The image's badge design (filled, parchment text) survives unchanged, just in `rust-deep`.

**Rust breaks my chroma cap, openly.** I held everything to chroma ≤ 0.14 and moved v1's moderate colour from a vivid rust to sienna to obey it. Your image shows why one saturated accent is worth an exception: saturation contrast (one vivid colour against a muted field) is the whole look of the hero. So Rust alone may reach 0.18; `rust-deep` (0.139) and every status colour stay under 0.14.

**The seam.** The plant crop on the stated Parchment shows a faint box (edge ΔE 1.9, about one just-noticeable difference). Tested: (A) raw on Parchment: visible; (B) hero background set to `#F2EAD6`: seamless, and your layout already has a hairline under the hero; (C) feathered edge: seamless but fades the soil and the right leaf. Recommendation: B, or regenerate the art on a transparent or flat `#F5F0E2` background.

**Also:** the image bakes English into the raster ("SCAN ACTIVE", "LEAF ANATOMY", the headline, the cards). The site is bilingual and the numbers are live, so use the plant illustration as an image and build the text and cards in code.

## 4. The system

### 4.1 Usage rules
1. **Proportion:** paper, card, latte and sage-wash ≈ 60%+; dark ≈ 25–30% (two bands, the trust section and the final CTA, plus the footer); accents < 10%.
2. **Buttons:** one primary per section. Pine on light bands; `butter` (or parchment) on dark bands. Never Rust and never Red Inferno as a button fill (Rust 3.3:1 against its text; Inferno means "severe").
3. **Rust:** display numbers ≥ 24px, illustration, shapes, the map bin. **Rust-deep:** anything small. Never put Rust in the status ladder.
4. **Status:** colour + glyph + word, always. Fills (tints) are decoration. Risk levels low/medium/high reuse healthy/early/moderate.
5. **Leaf green is never text on paper** (3.6:1): use `leaf-text`. Leaf bars sit on `bg-dark` (3.9:1), not on a Pine card (2.9:1).
6. **Blue means water.** Rain and weather only.
7. **Gradients** `in oklab`, dark stops only behind text.
8. **Chroma ≤ 0.14** for everything except Rust (≤ 0.18). No neon, no pure black or white.
9. **Hindi** uses the same tokens; the Lc ≥ 75 rule matters more there because Devanagari strokes are thinner.

### 4.2 Landing page: sections and surfaces (derived from what the site actually does)
| # | Section | Surface | Shows | Colour job |
|---|---|---|---|---|
| 1 | Hero | paper (`#F2EAD6` behind the illustration) | headline, plant illustration, floating result and care-plan cards in code | Pine button, Rust accents, Pine care-plan card |
| 2 | How it works (3 steps) | paper | photograph → diagnose → treat | sage-wash icon discs |
| 3 | One photo, five answers | latte | disease + confidence, severity scale, treatment, yield loss, Grad-CAM | the four status chips, introduced as a legend |
| 4 | Honest by design | **dark** | quality gate, "not sure", Grad-CAM, per-crop accuracy with CI, pigeonpea as weakest | butter numbers, leaf bars |
| 5 | Ten crops | paper | crop chips | neutral |
| 6 | Around the leaf | latte | risk strip, rain vs normal, NDVI/NDRE/REDSI | status colours, water blue, chart trio |
| 7 | Map | paper | privacy-safe hexagons (≥ 3 reporters) | the map ramp |
| 8 | Language and report | latte | EN/HI switch, PDF report | status chips on a paper "page" |
| 9 | Final CTA + footer | **dark** | one action | butter button |

### 4.3 Migration from today's tokens
`parchment` → `paper` (ΔE 0.3, safe) · `card` unchanged · `ink #1F3B2C` → `ink #162F22` · `ink/70` → `ink-2` · `field` → `primary` (Pine) for buttons, `leaf-text` for accents · `field-dark` → `primary-hover` · `clay` text → `rust-deep` (clay stays only where a map bin used it, now Rust) · `wheat` → `early` mark / `butter` on dark · **`sage` (today's text colour `#7A8B6F`, 3.2:1) → `leaf-text`**.
**Name trap:** your hero's Sage `#DCE4D1` is a different colour from today's `--color-sage`. It is `sage-wash` here; reusing the name `sage` would turn every `text-sage` label near-invisible.
Also: FieldHealth series (`#4A6741 #B5652E #7A5C99`) → `ndvi / ndre / redsi`; `mapStyle.js` BINS → the map ramp (`geo.test.jsx` reads `BINS` by index, so new hexes will not break it). `client/src/assets/hero.png` is the leftover purple Vite template art: unused, outside this palette.

### 4.4 Interaction states (specified, not yet built)
Hover: `primary` → `primary-hover` (paper text 13.0:1). Focus-visible: 3px `ink` outline, 3px offset (butter on dark), both ≥ 3:1. Links: `primary`, underlined. Disabled: ink at ~40% with no shadow. Chips: border darkens one step on hover. Only button hover/focus is demonstrated in the preview.

### 4.6 As built (landing page, Oct 2026)
- **Where the tokens live:** `client/src/index.css`, `@theme` block (`--color-paper/card/latte/ink/ink-2/pine/pine-hover/bg-dark/leaf/leaf-text/sage-wash/rust/rust-deep/butter/butter-wash/water`, status marks, map ramp, chart series). `--color-sage` (old text colour) is no longer used for text.
- **Built sections are 7, not 9:** hero, how, honest, map, around the leaf, report, closing band + footer. "One photo, five answers" and "Ten crops" are covered inside Hero/How and Honest/Map instead of getting their own section; the *only dark band* is the closing one (the Honest section stayed light).
- **Section tones** (decorative backgrounds only, text colours unchanged): hero warm parchment, how light sage → deeper sage, honest warm latte, map cool sage-blue (`#D2EDF4` into sage), around butter-sage, report butter-cream, closing deep pine. Joins are asymmetric SVG-mask waves (`--edge-a…f`), see [LANDING_PAGE.md](LANDING_PAGE.md) §3.
- **Rules kept in code:** Rust `#D85D2D` only at ≥ 24 px or marks, small rust text uses `rust-deep`; status never by colour alone (glyph + word); charts use the colour-blind-checked trio with dash styles; floors: no text under 11 px on the landing page.
- **Layout breakpoint:** 1184 px (`--breakpoint-lg: 74rem`): navbar and canvas sections switch together.
- **Not re-measured:** contrast of body text on the new section tones (the 33-pair contract was written for paper and card).

### 4.5 The contract
`node docs/colour-system/experiments/colour_lab.mjs e10` re-checks 33 text/surface pairs plus status separation, map ramp order and step size, chart-series separation and the chroma cap, for all three finalists. `tokens()` and `check()` are importable, so a test in `client/` can assert it later.

## 5. What I changed my mind on, and what went wrong
- **Cross-check found a real discrepancy.** My colour-blindness simulation disagreed with `culori` by up to 66/255. Cause: culori applies the Machado matrices to gamma-encoded RGB, the paper specifies linear light. I kept the paper's version and report the other as a robustness check (it never changed a verdict).
- **Rules bent, openly:** chip-dot contrast 3:1 → 2.5:1 (3.5); **v2: Rust is allowed chroma up to 0.18** while everything else stays ≤ 0.14 (3.11); v2's status margin is 10.04 against a ΔE 10 rule (3.5).
- **v1 argued that sienna was "nearer the lesion hue".** That argument no longer drives the choice: the image's own lesions are ochre (92°), its rust is 40°, and my PlantDoc sample is a mixed set of non-Indian crops. Rust fits because **wheat leaf rust is orange** and because you chose it, not because 62–76° says so.
- **A rule I got wrong:** "tint must differ from paper by 1.05:1". Tints are meant to be subtle; the edge is the border. Dropped.
- **Exemptions removed:** two secondary-text pairs were exempted from my own APCA rule; I darkened the colours instead.
- **Two wrong statements of mine, fixed:** a sentence under the glare table (said 4.5:1 → 2.2:1), and the first colour-blind screenshots were rendered with draft status colours; re-rendered with the final tokens.
- **A name collision caught before it shipped:** the hero's `Sage` vs today's `--color-sage` (4.3).

## 6. Limits: what this does not prove
- **Names are not standards.** "Evergreen", "Eucalyptus", "Ink Blue", "Butter", "Latte" have different hex values in every source; I used the most-cited and listed each in `colour_lab.mjs`. "Stone brown" (`#8B7765`) is assumed and "Ice" was skipped (no source). I read `5IB42F` as `#51B42F`.
- **The hero image is one AI-generated picture.** Its stated palette and its pixels differ (1.6–1.9 ΔE on the background); I sampled regions by hard-coded coordinates in a 1536×1024 layout. Regenerating it will move the colours again.
- **Leaf palette:** 326 web photos, mostly non-Indian crops, uncontrolled lighting. The hue is stable across clusters; the exact hexes are not a standard.
- **Competitor audit:** CSS colour declarations on one day's homepage, not rendered area. AgroStar left out (Wix default blue); Bayer and Farmonaut blocked the request.
- **No real devices, no sunlight test, no users.** Glare is a model with an assumed offset; sRGB only; Hindi rendering not tested separately; no farmer has seen this.
- **Colour-blindness simulation** covers full dichromacy; milder forms are easier than what was tested.
- **Colour books:** I could not read Itten, Albers or Munsell; I applied their principles (saturation contrast, simultaneous contrast, test in context) from secondary summaries.
- **Trend research** is mostly interiors/paint and agency blogs: weak evidence, used only as a sanity check.
- **Fonts were held fixed** (Fraunces, Inter, IBM Plex Mono) so colour is the only variable; your image uses a similar serif/sans/mono trio. A design linter flags Fraunces/Inter as very common; typography is a separate decision.
- **No motion or live interaction** was explored.

## 7. Sources
Named-colour values: [Wikipedia A–F](https://en.wikipedia.org/wiki/List_of_colors:_A%E2%80%93F), [N–Z](https://en.wikipedia.org/wiki/List_of_colors:_N%E2%80%93Z), [Figma: Evergreen](https://www.figma.com/colors/evergreen/), [Shutterstock: Ink Blue](https://www.shutterstock.com/color/ink-blue), [htmlcolorcodes: Eucalyptus](https://htmlcolorcodes.com/colors/eucalyptus/), [octet: Butter Yellow](https://octet.design/colors/names/butter-yellow-fffd74/).
Method: [OKLCH in CSS (Evil Martians)](https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl) · Machado, Oliveira and Fernandes 2009, doi 10.1109/TVCG.2009.113 · [Itten's seven contrasts](https://worqx.com/color/itten.htm), [Getty/Bauhaus](https://www.getty.edu/research/exhibitions_events/exhibitions/bauhaus/new_artist/form_color/color/) · [60-30-10 on the web](https://inkbotdesign.com/60-30-10-rule/) · [colour-blind-safe palettes (Okabe-Ito etc.)](https://arxiv.org/pdf/2303.04918).
Trends (weak evidence): [Davey & Krista 2026](https://daveyandkrista.com/2026-brand-color-trends/), [Kontra](https://kontra.agency/?p=7330), [Livingetc, olive vs sage](https://www.livingetc.com/advice/olive-vs-sage-green), [Homes & Gardens](https://www.homesandgardens.com/interior-design/outdated-color-trends-2026).
Data: PlantDoc (in `_dataset_backup/`), competitor homepages (fetched 2026-10-09), the `ui-ux-pro-max` palette database, your generated hero image.

## 8. Re-run
```
cd docs/colour-system/experiments
node colour_lab.mjs            # everything (or: e0 e1 … e12 e12b | css)
python -I leaf_palette.py "<path>/PlantDoc-Dataset-master.zip" 12
python -I audit_sites.py       # needs network
python -I hero_image_probe.py  # reads ../hero-reference.jpg
```
Open `docs/colour-system/preview.html?theme=t2` in a browser (it loads Google Fonts and the repo's own test photos from `ml-service/tests/fixtures/golden/`).
