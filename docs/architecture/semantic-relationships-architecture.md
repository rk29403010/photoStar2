# PhotoStar2 Semantic Relationships and Evidence Architecture

**Status:** Proposed architecture, revised after implementation-readiness review  
**Repository review baseline:** clean `main` at `888e510` as supplied by the review feedback. Before implementation begins, pin and record the actual repository commit being implemented against.  
**Scope:** Replace `asset_groups` as semantic truth with a constrained semantic/evidence kernel, while preserving working PhotoStar behaviour and extension architecture.  
**Migration policy:** Current development library data may be disposable, but destructive reset is a development choice, not an application migration strategy. The production architecture must already distinguish durable human work from rebuildable machine state.

---

## 1. Purpose

PhotoStar already has multiple systems that answer variations of the same questions:

> What is this thing? How is it related to something else? How certain are we? What evidence supports that conclusion? Who or what made the judgement?

Current and planned examples include:

- exact duplicate files;
- near-duplicate and visually similar photographs;
- edit lineage;
- bursts and shooting sequences;
- faces, identity clusters and durable people;
- several scans/copies/edits of one historical photograph;
- dates, places, objects and events;
- album pages, fronts/backs and other physical-object relationships;
- restoration provenance;
- oral-history testimony;
- timed video/audio evidence;
- external historical context.

The present `asset_groups` abstraction is limiting because it materialises several differently shaped relationships as nested containers with a canonical member. The current code already exposes the mismatch: similarity is first computed as edges/components, edit lineage is separately directional, group overlap requires diagnostics, gallery collapse is tightly coupled to group membership, and face identity has an unrelated assignment system.

This architecture introduces a **constrained semantic kernel** rather than a generic graph database.

The central rules are:

> **Observations are measurements, not facts.**

> **A proposition is the thing that may be true; attestations record who or what supports or opposes it.**

> **Human uncertainty, disagreement and lack of knowledge are first-class and attributed.**

> **Decisions are append-only; current facts are projections.**

> **Groups are presentation projections, not archival truth.**

> **Machine analysis structures are not automatically historical entities.**

> **Working subsystems remain authoritative where they already own a domain; semantic projections must not create a second editable truth.**

---

## 2. Architectural boundaries

### 2.1 What Phase 1 must establish

Phase 1 establishes the semantic kernel and cuts current grouping/face/review/editor consumers over to it. It includes:

- additive semantic schema and numbered migration ledger;
- proposition/attestation/evidence/decision model;
- current entity-relationship and current scalar-value projections;
- manifest-owned predicate definitions and generated registry;
- stable `VisualRegion` and `Face` identities;
- `IdentityCluster != Person`;
- explicit Person lifecycle and redirects;
- shared feature-vector storage;
- weak face candidate retention;
- contributor identity and uncertainty-aware testimony;
- `CaptureSequence`;
- server-side presentation paging and presentation preferences;
- minimal `Photograph` membership needed to replace current copy/version semantics;
- editor-lineage projection from existing edit documents;
- reset/durability semantics;
- behavioural parity tests and cutover gates.

### 2.2 What Phase 1 deliberately reserves but does not persist yet

Unless a current vertical slice actually consumes them, Phase 1 documents but defers persistent schema for:

- physical `Artefact`;
- full temporal/date constraint storage;
- audio/video/page/external locator columns;
- Place, Event, Object and Memory entities;
- advanced lifetime face anchors;
- full archive-export format;
- full vector index engine.

This avoids speculative schema while preserving the decisions needed to add those features later.

---

## 2.3 Delivery/cutover strategy

The target architecture may be a decisive replacement of the old group model, but implementation must follow **expand → shadow/compare → cut over → contract**.

- Add the semantic kernel alongside legacy group structures.
- Shadow-project current duplicate/similarity/sequence behaviour into the new model.
- Compare legacy/new results using permutation, paging, representative, explode and editor-version fixtures.
- Cut readers/writers over one domain at a time.
- Remove old tables only after repository search and behavioural gates prove there are no remaining consumers.

Disposable development data removes migration-data complexity; it does not justify intermediate commits that leave current consumers broken.

---

## 3. Database modelling strategy

The application wants strongly typed domain semantics, while many future relationships need a common traversal mechanism. A raw `subject_type + subject_id` design cannot provide useful SQLite referential integrity.

Phase 1 therefore uses a **semantic entity registry with typed detail tables**.

### 3.1 `semantic_entities`

Every addressable semantic entity has one durable ID in a registry:

```text
semantic_entities
-----------------
id TEXT PRIMARY KEY
type TEXT NOT NULL
status TEXT NOT NULL
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

Typed tables use the same ID as a real foreign key:

```text
people.id              -> semantic_entities.id
faces.id               -> semantic_entities.id
visual_regions.id      -> semantic_entities.id
identity_clusters.id   -> semantic_entities.id
photographs.id         -> semantic_entities.id
capture_sequences.id   -> semantic_entities.id
contributors.id        -> semantic_entities.id
```

SQLite therefore enforces that proposition subjects/objects reference real semantic entities. Predicate manifests and application validation enforce allowed type combinations.

### 3.2 Tombstones and deletion

Durable semantic IDs are not casually reused.

- Machine-only entities may be superseded/tombstoned.
- Manually touched entities remain resolvable.
- Merged Person IDs redirect permanently to the surviving Person.
- Deleting a current projection never deletes proposition/attestation history.
- Asset removal does not automatically erase historical human decisions about that asset/face.

### 3.3 Unknown persisted types

Persisted predicate/entity types introduced by an extension must remain readable after that extension disappears.

Unknown/deprecated types:

- remain stored;
- are exposed through a safe generic label/inspector;
- cannot be newly authored unless a current manifest owns them;
- are never silently discarded during projection rebuild.

---

## 4. Proposition, attestation and decision model

The earlier `Claim` model mixed the proposition with its source. That makes agreement, contradiction and later resolution unnecessarily ambiguous.

Phase 1 separates them.

### 4.1 Proposition

A `proposition` is the canonical statement being evaluated.

Examples:

```text
Face F17 depicts Person Jean
Asset A derived_from Asset B
VisualRegion R91 belongs_to Photograph P12
Photograph P12 has_date <value>
```

Conceptual shape:

```text
propositions
------------
id TEXT PRIMARY KEY
subject_entity_id TEXT NOT NULL
predicate_key TEXT NOT NULL
predicate_version INTEGER NOT NULL
object_entity_id TEXT NULL
value_type TEXT NULL
value_json TEXT NULL
qualifiers_json TEXT NULL
canonical_key TEXT NOT NULL
status TEXT NOT NULL
created_at TEXT NOT NULL

FK subject_entity_id -> semantic_entities.id
FK object_entity_id  -> semantic_entities.id
UNIQUE(canonical_key)
```

Rules:

- exactly one of `object_entity_id` or value payload is used unless the predicate manifest explicitly defines otherwise;
- value/qualifier payloads must validate against the predicate manifest schema;
- `canonical_key` is deterministic from normalized subject, predicate/version, object/value and qualifiers;
- symmetric predicates canonicalise subject/object order before key generation;
- propositions are not duplicated because three different witnesses discuss the same fact.

### 4.2 Attestation / testimony

An `attestation` records who or what took a stance on a proposition.

```text
attestations
------------
id TEXT PRIMARY KEY
proposition_id TEXT NOT NULL
source_kind TEXT NOT NULL
source_actor_entity_id TEXT NULL
source_observation_id TEXT NULL
stance TEXT NOT NULL
subjective_certainty TEXT NULL
raw_wording TEXT NULL
status TEXT NOT NULL
created_at TEXT NOT NULL
supersedes_attestation_id TEXT NULL
```

Stance is about the proposition:

- `supports`
- `opposes`
- `abstains` only when the response really refers to the proposition but declines judgement.

Human wording and subjective certainty are retained independently of system confidence.

### 4.3 Human responses that are not propositions

Some answers are useful but do not support or oppose any candidate proposition.

Examples:

- “I don't know who this is.”
- “Not a clue.”
- “I recognise him but can't remember his name.”
- “I can't tell whether that's Jean or Mary.”

Store these as attributed `review_responses` / testimony responses. They may generate zero or several attestations.

**`I don't know` must never be normalised into negative identity evidence.**

### 4.4 Agreement and conflict

If three people say Jean and one says Mary:

- there is one proposition `Face F depicts Jean` with three supporting attestations;
- there is one competing proposition `Face F depicts Mary` with one supporting attestation;
- any model evidence attaches through its own attestations/evidence;
- the system can display agreement and conflict directly.

### 4.5 Resolution cases

Some decisions involve explicit competing propositions. Introduce:

```text
resolution_cases
----------------
id
case_type
subject_entity_id
status
created_at
```

and:

```text
resolution_case_propositions
----------------------------
case_id
proposition_id
```

Typical cases:

- identity of one Face/IdentityCluster;
- which Photograph an Asset/region represents;
- mutually exclusive current date/place candidates.

### 4.6 Append-only decisions

Decisions are historical events, not mutable fields on propositions.

```text
decisions
---------
id
case_id NULL
proposition_id NULL
decider_kind
decider_entity_id NULL
policy_key NULL
reason NULL
created_at
```

```text
decision_items
--------------
decision_id
proposition_id
disposition
```

Dispositions include:

- `accepted`
- `rejected`
- `disputed`
- `deferred`

A new decision supersedes the current resolution state by projection policy, but old decisions remain auditable.

This removes ambiguity between “accepted negative evidence” and “rejected positive claim”: the proposition is stable, attestations can support/oppose it, and the decision disposition is explicit.

---

## 5. Evidence model

### 5.1 Observation

An Observation records a machine/deterministic measurement or extraction.

Examples:

- ArcFace cosine similarity `0.584`;
- pHash distance `4`;
- OCR candidate `1887`;
- face detection geometry;
- image-quality score.

Conceptual fields:

```text
observations
------------
id
subject_entity_id
observation_type
object_entity_id NULL
metric NULL
numeric_value NULL
value_json NULL
analysis_generation_id
status
created_at
```

Raw scores stay raw. Cosine `0.61` is not `61% probability`.

### 5.2 Evidence linkage

Evidence is many-to-many and is primarily linked to attestations:

```text
attestation_evidence
--------------------
attestation_id
evidence_locator_id
role
weight NULL
```

Roles:

- support;
- contradict;
- context.

This means several independent observations can support one model attestation, and several attestations can independently support the same proposition.

### 5.3 Evidence locators — Phase 1

Phase 1 supports only locator kinds exercised by current features:

- whole Asset;
- Face;
- VisualRegion;
- Observation;
- contributor/review response;
- edit document / edit mask reference where needed.

The serialized locator contract is versioned so later variants can add:

- audio/video time spans;
- document page/region;
- external archive record.

Do not add unused nullable time/page/external DB columns in Phase 1.

---

## 6. Current projections

History is rich; normal UI queries need fast current state.

Phase 1 therefore has two separate rebuildable projections.

### 6.1 Relationship projection

Entity-to-entity facts:

```text
relationship_projection
-----------------------
subject_entity_id
predicate_key
object_entity_id
source_proposition_id
resolution_case_id NULL
updated_at
```

Examples:

- Face depicts Person;
- Asset/VisualRegion represents Photograph;
- Asset derived_from Asset.

### 6.2 Value projection

Current scalar/structured values:

```text
value_projection
----------------
subject_entity_id
predicate_key
value_type
value_json
source_proposition_id
resolution_case_id NULL
updated_at
```

This is required for dates and other non-entity facts even before richer future date tooling exists.

### 6.3 Projection safety

- Projections are rebuildable.
- Deleting projections cannot destroy observations, attestations, decisions or durable entities.
- Projection rebuild must be deterministic for a fixed active history and registry version.

---

## 7. Predicate extension architecture

A manually edited global predicate catalogue would conflict with PhotoStar's manifest-owned extension architecture.

### 7.1 Manifest ownership

Each semantic predicate is owned by a versioned manifest.

A manifest defines:

- predicate key/version;
- allowed subject entity types;
- allowed object entity types or value schema;
- symmetry;
- transitivity/equivalence semantics;
- inverse predicate;
- cardinality;
- qualifier schema;
- automatic-resolution policy;
- review policy;
- projection eligibility;
- presentation-collapse eligibility;
- user-facing labels;
- migration/deprecation metadata.

### 7.2 Generated registry

Build a deterministic generated registry from manifests as part of the existing generated-registry workflow.

Application code consumes the generated registry rather than importing arbitrary predicate definitions across features.

### 7.3 Persisted predicate catalogue snapshot

Persist enough definition metadata/version to interpret old propositions even if a plugin/extension is later unavailable.

Unknown/deprecated predicates remain visible and preserved.

---

## 8. Source-of-truth matrix

Phase 1 must not introduce multiple editable truths for the same domain.

| Domain | Authoritative source | Semantic role |
|---|---|---|
| Exact file identity | SHA-256/content digest on Asset | Deterministic equivalence set; do not materialise O(n²) pairwise claims |
| Broad visual similarity | machine observations | Candidate/signal only |
| Same historical Photograph | resolved representation membership | Current semantic state; pairwise propositions are evidence/history |
| Edit recipe/branch | `photo_edit_documents` | Authoritative; semantic `derived_from` regenerated from editor records |
| Existing asset metadata during Phase 1 | existing metadata system/projection | Remains authoritative; semantic adapters are one-way until deliberate unification |
| Face detector geometry | active detector generation + stable region reconciliation | Machine observation/history |
| Human identity correction | proposition/attestation/decision | Durable semantic truth/history |
| Presentation cover/show-separately | presentation preferences | UI-only; must not silently create semantic evidence |

### 8.1 Exact duplicates are a set, not quadratic claims

If 50 files share the same SHA-256 digest, PhotoStar should not create 1,225 pairwise exact-duplicate propositions.

Use the digest as deterministic membership evidence and expose virtual `exact_duplicate_of` traversal or presentation grouping as needed.

### 8.2 Photograph definition

For Phase 1, a `Photograph` means:

> one captured photographic image/exposure, or one deliberately authored composite photographic work that is treated as a single historical photographic image.

Therefore:

- file copies, recompressions and rescans do not create new Photographs;
- restorations/crops remain representations/derivatives of the same Photograph when their historical identity is preserved;
- separate frames in a burst are separate Photographs;
- a deliberately authored collage/composite may be a new Photograph;
- uncertain membership remains unresolved rather than forcing a merge.

---

## 9. Durable Asset identity and reset semantics

Stable semantic work cannot depend only on recreatable `assets.id` values.

### 9.1 Durable Asset identity

Evolve the existing asset-identity concept into an explicit durable identity record used across soft rebuilds.

A live `assets` analysis record refers to a durable Asset identity.

Soft reimport reconciliation policy:

1. exact prior path + compatible fingerprint -> reuse identity;
2. missing prior path + unique safe identity match -> may reattach according to explicit policy;
3. ambiguous digest match among exact duplicates -> do not silently transfer identity;
4. changed content at the same path -> treat as replacement/new identity unless explicitly reconciled.

Asset path changes that cannot be safely reconciled may require a relink review rather than guessing.

### 9.2 Reset matrix

The implementation must maintain a table-by-table reset policy for at least:

#### Factory reset

Explicit destructive operation. Removes library semantic data after confirmation.

#### Soft library rebuild

Preserve:

- durable Asset identities;
- Contributors;
- human review responses/testimony;
- propositions/attestations/decisions that represent human work;
- manually curated/confirmed People and redirects;
- GEDCOM links;
- resolved Photograph membership and manual Photograph entities;
- presentation preferences;
- edit documents.

Rebuild/supersede:

- live analysis Asset rows as appropriate;
- machine observations;
- feature vectors;
- IdentityClusters;
- presentation projections;
- machine-only candidates.

#### Face-analysis reset

Preserve stable Face/VisualRegion identity where reconciliation succeeds and all human testimony/decisions. Rebuild detector geometry generations, embeddings, candidates and clusters.

#### Relationship recomputation

Preserve human attestations/decisions. Generate a new machine generation, then atomically switch projections after success.

#### Model replacement

Previous successful generation remains active until the replacement succeeds. Failed replacement never supersedes good data.

#### Asset removal/reimport

Tombstone current availability without erasing durable semantic history. Reattach only under explicit identity rules.

---

## 10. Schema migrations

`schema_meta` alone is insufficient.

Use a numbered migration ledger:

```text
schema_migrations
-----------------
version
checksum
name
applied_at
```

Requirements:

- transactional, fail-fast migrations;
- checksum verification;
- preflight schema/version check;
- backup/checkpoint strategy before destructive production upgrades;
- interrupted-upgrade recovery tests;
- no swallowed migration errors;
- explicit development-only reset tool.

The current test-data phase may choose the reset tool for large local changes, but normal application startup must not silently wipe incompatible data.

---

## 11. Stable `VisualRegion` and `Face`

### 11.1 VisualRegion

`VisualRegion` provides durable semantic identity for a part of an image.

Phase 1 needs it for faces and for integration with existing stable mask metadata. Future uses include text, objects, inscriptions, album crops and damage.

### 11.2 Coordinate contract

All region reconciliation uses a defined coordinate space:

- normalized `[0,1]` coordinates;
- relative to the image after canonical EXIF orientation;
- source pixel width/height retained with each geometry generation;
- geometry versions are append-only; do not overwrite old evidence in place.

### 11.3 Geometry generations

A VisualRegion has one durable semantic ID and one or more geometry generations.

Each generation stores:

- source analysis generation;
- normalized geometry;
- source dimensions/orientation;
- detector/provider/version;
- status.

### 11.4 Deterministic reconciliation

On rerun:

1. partition old/new detections by compatible kind;
2. calculate match candidates using IoU plus landmark/geometry evidence when available;
3. enforce one-to-one assignment;
4. use deterministic tie-breaking;
5. if the best match is ambiguous within configured margin, **do not auto-reuse the stable ID**;
6. create a new region/face and retain the old one as superseded/unmatched rather than guessing;
7. tombstone removed detections without deleting their history.

Thresholds are provider/kind-versioned settings, not magic global constants.

Tests must include:

- reordered detections;
- small geometry movement;
- added/removed face;
- overlapping faces;
- swapped near-identical faces;
- ambiguous reconciliation;
- soft rebuild/reimport.

### 11.5 Reuse existing mask infrastructure

Do not create a second canonical mask store.

`PhotoMaskMetadata` already provides stable, versioned analysis-owned masks with provenance.

`VisualRegion` provides semantic identity **over** the relevant mask/geometry contract.

- accepted reusable analysis masks remain in the existing canonical mask metadata system;
- editor documents keep intentional immutable mask snapshots;
- VisualRegion may reference the canonical mask metadata item/source;
- future region types reuse the same semantic identity approach.

---

## 12. Face identity architecture

### 12.1 Face

A Face is a durable semantic entity tied to a VisualRegion, not to a transient array index.

`face_index` may remain an ephemeral detector-run attribute only.

### 12.2 IdentityCluster

An `IdentityCluster` is rebuildable machine analysis.

It is not a Person.

Several clusters may resolve to the same Person, and one erroneous cluster may later split into several people.

### 12.3 Person lifecycle

Person states include at least:

- provisional;
- confirmed;
- merged;
- retired.

Machine reruns may retire/rebuild provisional machine-only structures, but must not silently delete a confirmed/manually touched Person.

### 12.4 Redirects and aliases

Person merges create durable redirects/aliases:

```text
person_redirects
----------------
old_person_id
current_person_id
reason_decision_id
created_at
```

Rules:

- old IDs remain resolvable permanently;
- redirect cycles are forbidden;
- deep links resolve through redirects;
- GEDCOM links, birth/death metadata, thumbnails and propositions are remapped/projection-aware rather than silently discarded.

### 12.5 Merge/split/isolate semantics

Current actions must remain representable:

- rename -> edit durable Person label/metadata;
- merge -> resolution plus redirect;
- isolate/split -> new cluster/person resolution without erasing old testimony;
- approve -> append decision;
- reject -> opposing attestation/decision as appropriate.

### 12.6 Person face anchors

Phase 1 may introduce the **minimal** persisted concept needed to avoid making one averaged centroid fundamental:

```text
person_face_anchors
-------------------
person_id
face_id
status
role
source_decision_id NULL
```

Phase 1 does not need age-aware/lifetime-anchor UX. The structure merely allows multiple trusted face exemplars to exist without another schema rewrite.

---

## 13. Weak face evidence

ArcFace remains a useful model. The change is how its output is retained and acted on.

For each Face/cluster, candidate retrieval may retain:

- top-N Person/anchor candidates;
- raw cosine score;
- candidate rank;
- second-best score;
- winner margin;
- model/preprocessing generation.

Separate settings govern:

- evidence-retention floor;
- review threshold;
- auto-action threshold;
- minimum winner margin;
- candidate count.

A candidate below auto-action threshold may still be valuable evidence.

A manual rejection becomes durable opposing testimony/hard-negative evidence; it is not deleted simply because the candidate is no longer shown.

---

## 14. Feature vectors and machine generations

### 14.1 Analysis generation

Machine results are grouped into explicit generations.

Each generation records:

- workflow run ID;
- step run ID;
- subject execution ID;
- input Asset/content fingerprint;
- provider/model/version;
- model artifact checksum where available;
- preprocessing version;
- configuration hash;
- idempotency key;
- generation it supersedes;
- status (`running`, `successful`, `failed`, `superseded`).

### 14.2 Atomic supersession

Never supersede the previous successful generation before the replacement succeeds.

Pattern:

1. create new `running` generation;
2. write observations/vectors to it idempotently;
3. mark generation successful;
4. in one transaction, switch active generation/projections and supersede the old successful generation;
5. failed generation remains diagnostic and old good data stays active.

### 14.3 Feature vector contract

Phase 1 vector storage defines:

- `Float32` little-endian BLOB;
- dimensions;
- normalization (`unit_l2` / none);
- distance/similarity metric;
- feature/model key;
- model artifact/checksum;
- preprocessing/config hash;
- source content fingerprint;
- analysis generation ID;
- active/superseded state.

Validation includes BLOB length = dimensions × 4 and finite values.

Uniqueness is version/generation aware; retries are idempotent.

### 14.4 Compaction

Do not keep unbounded machine history by accident.

Initial policy:

- keep active successful generation;
- keep previous successful generation for rollback/debugging;
- keep any generation referenced by a durable human decision/evidence link;
- failed generations may retain metadata while large unreferenced BLOBs are eligible for cleanup;
- expose a maintenance/compaction path rather than deleting during normal queries.

### 14.5 Privacy/deletion/export

Vectors are local derived biometric/visual data.

- deleting a library/Person according to explicit user action must include derived vectors according to the reset/deletion policy;
- export is opt-in and documented;
- normal portable archive export need not include embeddings unless explicitly selected.

---

## 15. Scale assumptions and performance gates

Phase 1 should benchmark at explicit tiers instead of assuming a tiny test library.

Suggested engineering tiers:

| Tier | Assets | Faces | 512-d face vectors |
|---|---:|---:|---:|
| Development | 10k | 20k | ~40 MB raw vector BLOBs |
| Target | 100k | 250k | ~0.5 GB raw vector BLOBs |
| Stretch | 500k | 1m | ~2 GB raw vector BLOBs |

These figures exclude SQLite/index overhead and other vector types.

Performance goals:

- paged library presentation query: p95 < 150 ms for normal interactive filters on target tier after warm-up;
- single-face candidate lookup: p95 < 150 ms at target tier;
- projection rebuild may be batch/background work but must be restartable/idempotent;
- memory use must remain bounded; candidate search must not load the entire target vector set into JS objects if it materially exceeds the configured worker memory ceiling.

A local vector index (`sqlite-vec` or equivalent) is introduced only when measured brute-force/query implementation cannot meet target latency/memory at the target tier. Benchmark before adopting it.

---

## 16. CaptureSequence

A burst is not a pairwise relationship set.

Phase 1 introduces an ordered `CaptureSequence` because current burst functionality consumes it immediately.

```text
capture_sequences
-----------------
id
kind
status
created_at
```

```text
capture_sequence_members
------------------------
sequence_id
photograph_or_asset_entity_id
ordinal
captured_at NULL
confidence NULL
source_generation_id NULL
```

The first kind is `burst`; future kinds may include reconstructed film-roll/scan sequence.

Sequence membership is semantic/analytical state. The preferred gallery cover is a separate presentation preference.

---

## 17. Photograph — Phase 1 minimum

`Photograph` is retained in Phase 1 because same-photo/copy/version semantics require it, but keep the implementation narrow.

Phase 1 needs:

- durable Photograph entity;
- resolved membership/projection from Asset (and eventually VisualRegion) to Photograph;
- manual/decision provenance;
- editor inheritance policy.

Do not build full physical-object/material/process modelling in Phase 1.

### 17.1 Region source support

The future model must allow a VisualRegion on an album-page Asset to represent a Photograph.

Therefore the membership/source contract is entity based, not hard-coded to whole Asset only:

```text
RepresentationSource = Asset | VisualRegion
RepresentationTarget = Photograph   (Phase 1)
```

Future targets may include Artefact.

---

## 18. Presentation model and paging

The existing library uses server-side paging/virtualisation. A client helper receiving `Asset[] + PresentationCluster[]` is insufficient.

### 18.1 Server-side presentation query

Phase 1 introduces an atomic paged query:

```text
LibraryPresentationPage
-----------------------
items[]
next_cursor
projection_version
```

Each item is either a standalone Asset/Photograph representation or a presentation cluster and contains:

- stable presentation key;
- representative Asset ID;
- cluster kind;
- visible member count;
- compact member summary;
- timeline/sort key;
- relationship/reason summary;
- whether expansion is available.

Filtering, collapse policy, representative selection, sorting and pagination happen **before** page slicing so items do not duplicate/disappear across pages.

### 18.2 Stable cursor

Cursor contains the stable sort tuple plus presentation key/projection version needed for deterministic continuation.

Projection rebuild invalidation must be explicit; the UI can restart paging rather than silently splice incompatible pages.

### 18.3 Collapse precedence

Phase 1 presentation policy is versioned and initially preserves current useful behaviour.

Rules:

1. editor lineage / resolved Photograph membership outranks generic visual similarity;
2. exact digest equivalence may collapse within the relevant representation unit;
3. near/visual-similarity collapse is a **presentation projection**, not semantic `same Photograph` truth;
4. CaptureSequence collapse operates on the units produced by the earlier stages;
5. manual presentation preferences override automatic representative choice where valid.

The precise v1 order is locked by legacy parity fixtures before cutover.

### 18.4 Representative behaviour under filters

Representative must be chosen from members that are eligible under the current filter unless a product rule explicitly permits an out-of-filter cover. Default Phase 1 rule: representative must be visible/eligible.

Priority can include:

1. manual cover preference;
2. current editor-preferred/rendered version where the existing UI requires it;
3. existing quality/recency heuristic;
4. deterministic ID tie-break.

### 18.5 “Show separately” versus semantic rejection

These are different actions:

- **Show separately / explode** = presentation preference only.
- **Not the same Photograph** = negative semantic attestation/decision.

Never make presentation actions silently rewrite semantic truth.

### 18.6 Cluster expansion API

A generic relationship-neighbourhood query does not replace the current filmstrip/expansion use case.

Provide a specific cluster-expansion endpoint returning:

- ordered members;
- substructure/reason;
- representative preference;
- relevant edit/version hierarchy;
- pagination if a cluster can be large.

---

## 19. Editor integration

Keep the existing editor and its contracts.

`photo_edit_documents` remains authoritative for:

- source/rendered Assets;
- parent edit lineage;
- operation recipes;
- immutable edit-document mask snapshots.

On successful render, semantic adapters regenerate current editor relationships, such as:

```text
rendered Asset derived_from source Asset
rendered Asset represents same Photograph when policy says historical identity is preserved
```

The semantic layer does not become a second editor.

Current locked `edit_version` group behaviour must be characterised before cutover and reproduced through editor-lineage/presentation rules before group tables are removed.

---

## 20. Metadata integration

Phase 1 does not rewrite the existing asset metadata block/assertion/projection system.

Source-of-truth rule:

- current metadata remains authoritative for existing date/location/caption features;
- semantic proposition adapters may consume/explain that metadata one-way;
- there is no two-way editable synchronization in Phase 1;
- later unification requires its own ADR and migration plan.

---

## 21. Human testimony and contributor identity

A Contributor is the actor giving evidence, not necessarily the Person depicted.

Store enough to know exactly who made a decision/statement.

Responses distinguish:

- definite identification;
- tentative identification;
- possible identification;
- explicit rejection;
- unsure between named candidates;
- unknown/no clue;
- recognise but cannot name;
- abstain.

Subjective certainty is testimony metadata, not system probability.

A confidently wrong answer is retained as historical testimony and may later be contradicted/rejected by decision.

---

## 22. Phase 1 invariants

1. Manual semantic work survives machine reruns and soft rebuilds.
2. Face identity does not depend on detector array order.
3. Stable VisualRegion geometry history is append-only.
4. Ambiguous region reconciliation does not guess.
5. Raw model scores are not displayed as probabilities unless calibrated.
6. `I don't know` does not create negative identity evidence.
7. Multiple agreeing witnesses attach to one proposition rather than creating duplicated facts.
8. Conflicting propositions/attestations coexist.
9. Decisions are append-only and auditable.
10. Symmetric predicates canonicalise subject/object order.
11. Non-transitive similarity is not promoted transitively into semantic truth.
12. `derived_from` remains acyclic.
13. Presentation projections can be rebuilt without deleting semantic history.
14. Confirmed/manually touched People survive machine reruns.
15. Old merged Person IDs permanently resolve to the current Person.
16. Exact-copy membership uses digest equivalence rather than O(n²) stored pairwise facts.
17. Failed machine generations never displace a successful active generation.
18. Current entity relationships and scalar values both have explicit projections.
19. UI presentation preferences never silently create semantic evidence.
20. Current editor/metadata domains retain one authoritative source.

---

# 23. Reserved future architecture

The following sections record enough design intent to resume after Phase 1 without rediscovering foundational decisions. They are **not** permission to add speculative Phase 1 tables.

---

## 23A. Physical Artefact / album / Process Passport

### Why it exists

A scan file, the photographic image it depicts, and the surviving physical print/negative/page are different things.

Future features needing a physical object include:

- front/back pairing;
- album pages;
- print mounts/borders;
- Capture Doctor;
- Relightable Evidence;
- Process Passport;
- materiality/preservation.

### Reserved conceptual entity

```text
Artefact
--------
id
kind
status
```

Potential kinds:

- print;
- negative;
- album page;
- postcard;
- letter/document;
- plaque/headstone surface capture target;
- unknown physical object.

### Representation contract

Future generic representation source/target should support:

```text
Asset or VisualRegion -> Artefact
Asset or VisualRegion -> Photograph
Artefact embodies -> Photograph
```

with a view qualifier such as:

- front;
- back;
- edge;
- oblique-light detail;
- full view.

### Process Passport

A process proposition belongs primarily to Artefact, e.g. `process_is chromogenic_print`.

Evidence may combine:

- exemplar retrieval;
- physical questionnaire;
- reverse/edge view;
- date compatibility;
- classifier observations.

Do not attach physical-process truth directly to a JPEG Asset if the statement is really about the physical print.

---

## 23B. Temporal/date constraints

Phase 1 current metadata stays authoritative and `value_projection` can carry current scalar/range values. Full forensic dating is later.

Reserved value contract:

```text
TemporalConstraint
------------------
kind: exact | circa | range | before | after | same_period
start NULL
end NULL
reference_entity_id NULL
qualifiers
```

Later Date Workbench should combine:

- exact stamps;
- metadata;
- contributor testimony;
- Person birth/death;
- event ordering;
- sequence ordering;
- process/material evidence;
- objects/clothing/signs.

Do not persist a large specialized temporal schema until the dating vertical slice exercises it.

---

## 23C. Advanced Identity Solver / Lifetime Identity Anchors

Build on:

- stable Face;
- IdentityCluster;
- Person redirects;
- weak candidate observations;
- minimal person-face anchors;
- GEDCOM links;
- future temporal constraints.

Later work:

1. label trusted anchors by age/date/era;
2. deterministic birth/death/duplicate-in-photo filters;
3. co-occurrence and album/sequence context;
4. GEDCOM branch context;
5. age-aware candidate ranking;
6. explain positive and contradictory evidence;
7. benchmark top-1/top-3 on held-out known faces.

Kinship similarity remains weak evidence only, never biological fact.

---

## 23D. Place Solver / Place Threads

Reserved `Place` entity can later accumulate:

- manual identification;
- GPS;
- same-place retrieval;
- OCR/sign evidence;
- family context;
- coarse global geolocation;
- historical map evidence.

Use observations/attestations/propositions and explicit uncertainty. Global geolocation never writes automatic truth by itself.

UI later:

- Place page;
- Location Workbench;
- same-place thread;
- Stand Here/rephotography.

---

## 23E. Object Threads / Same-Similar-Echo

Use `VisualRegion` + region vectors + an Object entity.

Keep these meanings separate:

- same physical object;
- similar kind of object;
- looser visual/cultural echo.

Automatic embedding similarity remains observation/candidate evidence until confirmed/resolved.

---

## 23F. Living Knowledge Rescue / Memory Session

The Phase 1 Contributor/attestation model is intentionally designed for this later feature.

Future entities/contracts:

```text
InterviewSession
Recording
TranscriptSpan
Speaker
```

Future EvidenceLocator variant:

```text
asset_id + start_time + end_time
```

Workflow:

1. rank high-value uncertainty;
2. select likely contributor;
3. show photograph/question;
4. record original audio;
5. word-time transcript;
6. diarise speaker;
7. attach exact span to proposed proposition/attestation;
8. retain disagreement and `I don't know` separately.

Knowledge-gap scoring may use who has already been asked, but contributor “reliability scores” require a later explicit design.

---

## 23G. Home Movie Threads / VideoMoment

Reserved timed-locator contract supports:

```text
VideoMoment
-----------
id
asset_id
start_time
end_time
```

Later retrieval can combine:

- keyframe vectors;
- transcript;
- faces/People;
- Place/Event links;
- still-photo similarity.

Real footage is evidence; interpolation/generative motion remains a labelled derivative.

---

## 23H. Restoration authenticity / Capture Doctor / Relightable Evidence

Build later on:

- editor authoritative lineage;
- VisualRegion;
- Photograph membership;
- future Artefact/view links;
- provenance-rich observations.

Potential later features:

- deterministic/reference-assisted/generative operation classification;
- affected-region provenance;
- before/after OCR/face/object checks;
- best-pixel multi-copy restoration;
- capture-quality observations;
- multi-light/RTI view sets;
- authenticity map.

---

## 23I. Unified retrieval / Explainable Discovery

The semantic kernel and vector contract are designed so a later retrieval service can combine:

- whole-image similarity;
- Face/Person;
- Place;
- Object;
- OCR/text;
- date;
- sequence;
- relationships.

Results should return reason codes/evidence, enabling:

- Visual Neighbourhood;
- Find this, but...;
- Same/Similar/Echo;
- counterfactual search using real evidence;
- search by conversation.

---

## 23J. Portable archive survival/export

Phase 1 requirement: durable semantic IDs and values must be serialisable and not dependent on in-memory-only objects.

Later export may include:

```text
originals/
metadata/
people.json
photographs.json
artefacts.json
propositions.json
attestations.json
decisions.json
relationships.json
checksums.txt
index.html
```

Embeddings/vectors are optional derived exports, not required for human archival survival.

---

## 24. Architectural completion gate for Phase 1

Phase 1 architecture is established only when:

- the proposition/attestation/decision model has replaced source-bound generic claims;
- DB referential integrity uses semantic entity IDs rather than loose type/id pairs;
- predicate manifests/generated registry are in place;
- additive cutover has completed and old group readers/writers are gone before old group tables are contracted;
- server-side presentation paging replaces group-aware paging without regressions;
- current explode/lock/edit-version behaviours have explicit replacements;
- reset/durability rules are implemented and tested;
- stable Face/VisualRegion reconciliation is operational;
- Person redirects/lifecycle cover current merge/isolate/approve/reject flows;
- weak face observations survive beneath action thresholds;
- exact duplicates are represented without quadratic stored relationships;
- editor and metadata source-of-truth rules are unambiguous;
- machine generations are provenance-rich, idempotent and atomically superseded;
- the reserved future sections can be implemented without another foundational semantic redesign.
