# Face & Pet Detection / Recognition – Technical Approach (Accuracy-First)

## Design priorities

- Accuracy over speed (background processing acceptable)
- Robust on degraded / historic photos (c. 1890s onward)
- Wide pose tolerance (profiles, partial faces, occlusion)
- Age-invariant recognition (baby → elderly)
- Separate but compatible pipeline for pets (dogs, cats)
- Local execution preferred (ONNX), AI used only as bootstrap

---

## 1. Face detection (humans)

### Recommended model class

- **RetinaFace (ResNet-50 or equivalent, ONNX)**

### Rationale

- Strong performance on:
  - extreme head poses (±90° profiles)
  - partial / occluded faces
  - low contrast, grain, damage, uneven lighting
- Includes facial landmarks (eyes, nose, mouth) required for robust alignment
- Better historical-photo performance than lightweight or YOLO-style detectors

### Configuration guidance

- Prefer **high recall**, then suppress duplicates in post-processing
- Non-Max Suppression (NMS): ~0.6–0.7
- Minimum face size: allow small faces, but configurable per batch
- Enable landmark-based duplicate suppression (overlapping eye geometry)

---

## 2. Face recognition (humans)

### Recommended model class

- **ArcFace (ResNet-100 preferred, ONNX)**
  - Fallback: ArcFace + ResNet-50 if memory constrained

### Rationale

- Best-performing open architecture for:
  - age-invariant identity (children ↔ elderly)
  - degraded inputs
  - long time-span identity consistency
- Produces stable 512-D embeddings suitable for clustering

### Matching strategy

- Cosine similarity (never binary match)
- Typical interpretation bands:
  - ≥ 0.80 – same person (very likely)
  - 0.65–0.80 – plausible match
  - 0.50–0.65 – weak / uncertain
  - < 0.50 – different person

### Alignment (critical)

- Always align faces using landmarks before embedding
- Store aligned crops if possible (debug + future reprocessing)

---

## 3. Age variation handling

- ArcFace embeddings are largely age-invariant, but:
  - Expect lower similarity for infant ↔ adult matches
- Mitigation:
  - Allow looser thresholds for large estimated age gaps
  - Prefer clustering over direct matching for early ingestion
  - Store multiple embeddings per person across life stages

---

## 4. Duplicate detection mitigation

Duplicates are treated as a detector issue, not recognition.

Mitigations (in order):

1. Increase NMS threshold
2. Landmark-based overlap suppression
3. Discard lower-confidence boxes with near-identical landmark geometry
4. Optional second-pass merge of highly similar aligned crops

---

## 5. Pets (dogs & cats)

### Detection

- **Separate detector required**
  - COCO-based animal detector or dedicated dog/cat face detector
  - Human face detectors should NOT be reused

### Recognition (identity-level)

- **Separate embedding model per species**
  - Dog face recognition ≠ human face recognition
- Expect:
  - Lower inter-class separation than humans
  - More pose/coat variability
- Treat pet recognition as:
  - clustering + human confirmation
  - weaker confidence thresholds

### Data separation

- Humans and pets use:
  - different detectors
  - different embedding spaces
  - different thresholds
- Unified UI, separate technical pipelines

---

## 6. Clustering & workflow

### Ingestion

- Detect faces → align → embed → store embeddings
- No forced identity assignment during ingestion

### Identity discovery

- Use unsupervised clustering (e.g. HDBSCAN / agglomerative)
- Allow “unknown” clusters
- Promote clusters to named identities only after confirmation

### Future-proofing

- Version embeddings by model (e.g. arcface_r100_v1)
- Never mix embeddings from different models
- Retain original crops for re-embedding if models change

---

## 7. Summary recommendation to Antigrav

- Human detection: **RetinaFace (ResNet-50/100, ONNX)**
- Human recognition: **ArcFace (ResNet-100, ONNX)**
- Alignment mandatory
- High-recall detection + post-process duplicate suppression
- Separate detection & recognition models for pets
- Clustering-first, confirmation-driven identity assignment

This balances historical-photo robustness, extreme poses, ageing, and long-term maintainability.
