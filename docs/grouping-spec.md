# Image Grouping + Similarity Spec

This spec collates the **grouping / “variants orbit original”** concept and the **similarity detection** ideas into a concrete DB + job/event design that fits the app’s current SQLite/WAL architecture and existing tables.

Where something depends on choices we didn’t lock down earlier, it’s marked **Not verified** and implemented as a parameter.

## 1. Goals

1. **Automatically group assets** into useful “sets”:

   * exact duplicates
   * near-duplicates (same scene, small changes)
   * variants (edits, crops, rotations, exports, scans, screenshots)
   * bursts / sequences (photos taken close together)
   * “same people” sets (face-driven)
2. **Support UI stacking** (one tile representing many related items) and “orbiting variants” exploration.
3. **Incremental + resilient processing**:

   * fast initial pass (so the library becomes usable quickly)
   * deeper analysis later (embeddings, face links, OCR)
4. Keep it compatible with:

   * existing **assets / derived_results / face_assignments**
   * existing **jobs / events** pipeline

## 2. Terms and data model concepts

### 2.1 Asset

Existing row in `assets`.

### 2.2 Group

A named container of assets, with a *reason/type* and optional *canonical* representative.

Examples:

* “Duplicate group”
* “Variant set”
* “Burst sequence”
* “Same people cluster”

### 2.3 Relationship (edge)

A *pairwise link* between two assets with a score + reason, used to build groups and to power UI adjacency browsing (“show me things like this”).

---

## 3. Use cases (what the system must support)

### 3.1 Duplicate handling

* Same file content (byte-identical) imported multiple times.
* Same image re-saved (different file hash) but visually identical.

### 3.2 Variant sets (“orbiting”)

One “best” item + orbiting variants:

* crops / rotations / straightening
* color corrected vs original
* AI restored vs scan
* exported versions (WhatsApp compression, Facebook, etc.)
* screenshots of photos
* montage/collage derived from originals (**Not verified** if you want this linked automatically)

### 3.3 Bursts / sequences

* Phones produce near-identical shots seconds apart.
* Want “pick best” within burst; optionally keep the rest collapsed.

### 3.4 Same-people groupings

* “All photos containing X and Y together”
* “Photos containing any of these people” (family event clustering)

### 3.5 Document-like assets

* scanned documents, receipts, forms
* similarity may come from OCR text + layout rather than visual features (**Not verified** whether to include in v1 grouping)

---

## 4. Recommended DB changes

You can do this in two ways.

### Option 1 (minimal schema change): store everything in `derived_results` (fast to implement)

* Pros: no migrations beyond conventions; flexible JSON.
* Cons: harder to index/query; harder to maintain “current grouping state”.

### Option 2 (recommended): add **first-class grouping tables** + keep heavy features in `derived_results`

* Pros: fast queries, stable UI, incremental recompute, clear semantics.
* Cons: migration work.

The rest of this spec assumes **Option 2**.

---

### 4.1 New tables

#### 4.1.1 `asset_groups`

Represents a group/stack/cluster.

```sql
CREATE TABLE asset_groups (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,                 -- 'duplicate' | 'near_duplicate' | 'variant_set' | 'burst' | 'people' | 'custom'
  status TEXT NOT NULL,               -- 'proposed' | 'confirmed' | 'rejected' | 'locked'
  title TEXT,                         -- optional user-facing label
  description TEXT,                   -- optional
  canonical_asset_id TEXT,            -- FK to assets.id (nullable)
  algorithm_version TEXT,             -- e.g. 'grouping-v1.2'
  params_json TEXT,                   -- JSON: thresholds/knobs used
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (canonical_asset_id) REFERENCES assets(id)
);

CREATE INDEX idx_asset_groups_type ON asset_groups(type);
CREATE INDEX idx_asset_groups_canonical ON asset_groups(canonical_asset_id);
```

#### 4.1.2 `asset_group_members`

Membership + role.

```sql
CREATE TABLE asset_group_members (
  group_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  role TEXT NOT NULL,                 -- 'member' | 'canonical' | 'preferred' | 'excluded'
  rank INTEGER,                       -- optional ordering in UI
  evidence_json TEXT,                 -- JSON: why it's in the group (scores, reasons)
  created_at TEXT NOT NULL,
  PRIMARY KEY (group_id, asset_id),
  FOREIGN KEY (group_id) REFERENCES asset_groups(id),
  FOREIGN KEY (asset_id) REFERENCES assets(id)
);

CREATE INDEX idx_group_members_asset ON asset_group_members(asset_id);
CREATE INDEX idx_group_members_group ON asset_group_members(group_id);
```

#### 4.1.3 `asset_similarity_edges`

Pairwise similarity store (sparse graph).

```sql
CREATE TABLE asset_similarity_edges (
  asset_id_a TEXT NOT NULL,
  asset_id_b TEXT NOT NULL,
  kind TEXT NOT NULL,                 -- 'visual' | 'face' | 'time' | 'metadata' | 'ocr' | 'hybrid'
  score REAL NOT NULL,                -- 0..1
  reason TEXT,                        -- short label: 'phash', 'clip', 'faces', 'burst'
  evidence_json TEXT,                 -- JSON: detailed metrics
  algorithm_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (asset_id_a, asset_id_b, kind),
  FOREIGN KEY (asset_id_a) REFERENCES assets(id),
  FOREIGN KEY (asset_id_b) REFERENCES assets(id)
);

CREATE INDEX idx_edges_a ON asset_similarity_edges(asset_id_a);
CREATE INDEX idx_edges_b ON asset_similarity_edges(asset_id_b);
CREATE INDEX idx_edges_kind_score ON asset_similarity_edges(kind, score);
```

**Canonical ordering rule**: always store `(min(asset_id), max(asset_id))` to prevent duplicates.

#### 4.1.4 `asset_features` (optional but useful)

A “thin indexed” table for fast lookup of core features, while keeping large payloads in `derived_results`.

```sql
CREATE TABLE asset_features (
  asset_id TEXT PRIMARY KEY,
  file_hash TEXT,                     -- redundant copy for join speed
  phash64 TEXT,                       -- hex string
  dhash64 TEXT,                       -- hex string
  ahash64 TEXT,                       -- hex string
  width INTEGER,
  height INTEGER,
  exif_datetime TEXT,
  dominant_color TEXT,                -- optional small feature
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (asset_id) REFERENCES assets(id)
);

CREATE INDEX idx_asset_features_phash ON asset_features(phash64);
CREATE INDEX idx_asset_features_exif_dt ON asset_features(exif_datetime);
```

If you don’t want this table, you can store hashes in `derived_results` but you’ll pay in query complexity/perf.

---

## 5. What goes in `derived_results` (and conventions)

Keep heavy/variable analysis in `derived_results` with consistent `task` names:

| task                 | purpose                 | data shape (summary)                                     |
| -------------------- | ----------------------- | -------------------------------------------------------- |
| `image_hashes_v1`    | aHash/dHash/pHash       | `{ phash64, dhash64, ahash64 }`                          |
| `image_embedding_v1` | global visual embedding | `{ model, dims, vector: [..] }`                          |
| `face_embeddings_v1` | per-face embeddings     | `{ model, faces: [{face_index, vector:[..]}] }`          |
| `ocr_text_v1`        | OCR                     | `{ blocks:[...], full_text:"..." }`                      |
| `quality_score_v1`   | photo quality metrics   | `{ overall, sharpness, noise, exposure, faces_ok, ... }` |

---

## 6. Similarity detection pipeline (incremental)

### 6.1 Stage A - deterministic exact duplicates (fast)

1. Use existing `assets.file_hash`:

   * group all assets where `file_hash` identical
   * create `asset_groups.type='duplicate'`
   * set canonical as:

     * highest resolution, else largest file_size, else earliest created_at (**Not verified** tie-break order)
2. Emit:

   * `GroupProposed` or `GroupCreated` event

### 6.2 Stage B - perceptual hash near-duplicates (fast-ish)

Compute `pHash/dHash/aHash` once per asset.

Similarity metric:

* `phash_hamming_distance <= T_phash_dup` => “near_duplicate”
* `<= T_phash_variant` => “variant_candidate”

Thresholds (**Not verified** defaults):

* `T_phash_dup = 6`
* `T_phash_variant = 12`

Implementation detail:

* SQLite can’t do Hamming distance cheaply without helper UDF.

  * Either compute in sidecar and store edges.
  * Or store as 64-bit INTEGER and use bit ops if using SQLite extensions (**Not verified** whether you allow extensions).

Output:

* insert edges in `asset_similarity_edges(kind='visual', reason='phash')`
* build groups by connected components above threshold.

### 6.3 Stage C - embedding similarity (slower, better)

Compute image embeddings (CLIP-like or ONNX model).

Similarity:

* cosine similarity > `T_embed_variant` => variant/near-duplicate candidate
* > `T_embed_related` => “related” (for browsing, not necessarily grouping)

Thresholds (**Not verified** defaults depend on model):

* `T_embed_variant = 0.93`
* `T_embed_related = 0.85`

Store:

* embedding in `derived_results.task='image_embedding_v1'`
* sparse edges for top-K neighbors per asset (K=10..30) to keep DB bounded (**Not verified** K default: 20)

### 6.4 Stage D - burst/sequence detection (metadata)

Using `assets.exif_datetime` (and optionally `original_path` adjacency):

* group into bursts if within `T_burst_seconds` and visually similar enough (pHash or embedding).
* If no visual features yet, do a provisional burst by time alone and mark `status='proposed'`.

Threshold (**Not verified**):

* `T_burst_seconds = 3` (burst) and `T_sequence_seconds = 30` (sequence)

### 6.5 Stage E - face-driven similarity (when available)

Using:

* `face_assignments` (person_id presence)
* optionally face embeddings (clustering confidence)

Rules:

* If two assets share same set of person_ids (or high overlap), raise a `kind='face'` edge score.
* Use this mainly to power “related” and “people group” clustering, not to merge variant sets.

---

## 7. Group formation rules (how edges become groups)

Groups should be created by dedicated “group builders” that run per group type:

### 7.1 Duplicate groups

* purely from file_hash equality
* status can be `confirmed` automatically (very low false positives)

### 7.2 Near-duplicate groups

* require both:

  * visual edge above threshold (pHash or embedding)
  * and dimension ratio close OR one is a crop/downscale of the other (**Not verified**: crop detection heuristic below)

Crop/downscale heuristic:

* if aspect ratios match within 2% and one resolution is smaller => likely downscale variant
* if aspect ratios differ but embedding very high => possible crop variant

### 7.3 Variant sets (“orbit”)

A variant set is a stricter near-duplicate group with a canonical:

* canonical selection heuristic:

  1. highest “quality_score_v1.overall” if available
  2. else highest resolution
  3. else largest file_size
* members include:

  * edits/crops/screenshots that map strongly to canonical
* ordering (`rank`) for UI:

  1. canonical
  2. close variants (highest similarity)
  3. more distant variants

### 7.4 Burst groups

* time window + moderate similarity
* canonical is “best shot” by quality score (if available), else sharpest proxy (**Not verified**), else largest resolution.

---

## 8. Jobs + Events design

### 8.1 Jobs (new types)

Add job `type` values (existing `jobs` table supports this).

1. `compute_image_hashes`

   * iterates assets without `image_hashes_v1`
2. `build_duplicate_groups`

   * groups by file_hash
3. `build_phash_edges`

   * for assets with phash, find candidates and store edges
4. `build_embedding_edges`

   * compute embeddings + store top-K neighbor edges
5. `build_groups_from_edges`

   * creates/updates `asset_groups` and memberships
6. `build_bursts`
7. `build_face_related_edges`
8. `reconcile_groups`

   * handles merges/splits and “locked” groups

### 8.2 Events (new types)

Use `events` as immutable ledger.

Suggested event types + payloads:

* `AssetFeaturesComputed`

  * `{ asset_id, tasks: ['image_hashes_v1', ...], versions: {...} }`
* `SimilarityEdgesUpdated`

  * `{ asset_id, kind, added: n, removed: n, algorithm_version }`
* `GroupProposed`

  * `{ group_id, type, canonical_asset_id, member_asset_ids, evidence_summary }`
* `GroupUpdated`

  * `{ group_id, changes: {added:[], removed:[], canonical_changed?:...} }`
* `GroupLockedByUser`

  * `{ group_id }`
* `GroupRejectedByUser`

  * `{ group_id }`

---

## 9. UI requirements (what DB must make easy)

### 9.1 Default library grid

* Each tile represents either:

  * a single asset, or
  * a group canonical with a stack count badge
* Query: “give me canonical tiles” with pagination.

Suggested view/query concept:

* include assets that are **not** members of any group as canonical
* include canonical assets of groups

### 9.2 Open group (“orbit view”)

* Show canonical center + orbiting variants ordered by rank/similarity
* Show reason tags (“duplicate”, “crop”, “burst”, “edit?”)

### 9.3 Actions

* “Select canonical”
* “Remove from group”
* “Lock group”
* “Split group” (optional v2)

These must translate into DB state changes:

* update `asset_group_members.role`
* set `asset_groups.status='locked'` to prevent auto-rebuild from overriding

---

## 10. Query patterns (examples Antigrav can wire into repo/services)

### 10.1 Find group for an asset

```sql
SELECT g.*
FROM asset_groups g
JOIN asset_group_members m ON m.group_id = g.id
WHERE m.asset_id = ?;
```

### 10.2 Get tiles for main grid

One approach:

* a tile row is either a canonical group or an ungrouped asset

```sql
-- canonical group tiles
SELECT
  g.canonical_asset_id AS asset_id,
  g.id AS group_id,
  g.type AS group_type
FROM asset_groups g
WHERE g.canonical_asset_id IS NOT NULL

UNION ALL

-- ungrouped assets
SELECT
  a.id AS asset_id,
  NULL AS group_id,
  NULL AS group_type
FROM assets a
LEFT JOIN asset_group_members m ON m.asset_id = a.id
WHERE m.asset_id IS NULL;
```

(You’ll likely wrap this in a CTE and apply ORDER BY / LIMIT/OFFSET.)

### 10.3 Get orbit members for a group

```sql
SELECT m.asset_id, m.role, m.rank, m.evidence_json
FROM asset_group_members m
WHERE m.group_id = ?
ORDER BY
  CASE WHEN m.role='canonical' THEN 0 ELSE 1 END,
  COALESCE(m.rank, 999999);
```

---

## 11. Rebuild + reconciliation rules (important)

### 11.1 Non-destructive rebuild

When algorithms rerun:

* If `asset_groups.status='locked'`, do not change membership automatically.
* For unlocked groups:

  * allow canonical to change only if confidence is high (**Not verified**) or keep stable to avoid UI churn.

### 11.2 Merges and splits

When two groups become connected by new edges:

* merge if both are same `type` and neither is locked.
  When a group becomes disconnected:
* split into multiple groups (v2 if you want to avoid complexity now)

---

## 12. Performance constraints

1. Keep `asset_similarity_edges` sparse:

   * store only top-K neighbors per asset per kind.
2. Prefer Stage A + Stage B early so UI stacking works quickly.
3. Embeddings and OCR can be deferred.

---

## 13. Implementation sequence (recommended)

1. Add tables: `asset_groups`, `asset_group_members`, `asset_similarity_edges` (+ optional `asset_features`).
2. Implement `build_duplicate_groups` from `file_hash`.
3. Implement `compute_image_hashes` + `build_phash_edges`.
4. Implement `build_groups_from_edges` to create:

   * `near_duplicate`
   * `variant_set`
   * `burst` (time-first provisional)
5. Add “lock group” user action so the system can’t thrash groups.
6. Add embeddings later.

---

## 14. Open parameters (marking what needs final choice)

1. **Thresholds** (pHash Hamming, embedding cosine, burst windows) - defaults in this doc are **Not verified**.
2. **Canonical selection** priority (quality score vs resolution vs file_size).
3. Whether to treat **OCR/document similarity** as a first-class grouping type in v1.

If you want, I can provide a “constants” block (single JSON object) that Antigrav can drop into config and version via `algorithm_version`, so rebuilds remain reproducible.

