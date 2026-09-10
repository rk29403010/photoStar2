# PhotoStar2 Semantic Relationships Refactor — Implementation Plan

**Status:** Revised implementation plan after implementation-readiness review and WP9 execution-granularity review  
**Review baseline:** feedback reviewed clean `main` at `888e510`; implementation must pin its own starting SHA in the Phase 1 ADR set.  
**Data policy:** Existing development data may be discarded when explicitly chosen, but the implementation itself must support durable manual data and safe schema evolution.  
**Implementation philosophy:** **expand → shadow/compare → cut over → contract**. Preserve good algorithms/UI; replace only structural assumptions that are wrong.

---

## 1. Goal

Move PhotoStar from the current persisted group-centric and face-index-centric architecture to the semantic/evidence architecture without a broad rewrite.

The implementation must preserve current useful behaviour while changing the structures beneath it.

### Keep/adapt wherever practical

- workflow runtime;
- duplicate hash logic;
- pHash/dHash similarity logic;
- grouping graph calculations;
- burst detection;
- representative heuristics;
- RetinaFace/SCRFD face detection;
- ArcFace embedding inference;
- face geometry/cropping;
- person thumbnail logic;
- gallery layout/virtualisation;
- editor operations/masks/documents;
- current metadata system;
- generic review UI patterns.

### Replace where the current concept is wrong

- nested `asset_groups` as semantic truth;
- source-bound generic `claim` records;
- loose polymorphic DB references;
- durable face identity based on `face_index`;
- machine clustering directly owning durable Person lifecycle;
- a single threshold deciding both evidence retention and action;
- client-only group collapse assumptions for a server-paged gallery;
- destructive schema reset as an implicit upgrade strategy.

---

# 2. Phase 1 scope

Phase 1 implements only what is required to establish the semantic kernel and cut current consumers over safely.

## 2.1 Included in Phase 1

- ADR/design decisions and pinned repo baseline;
- behaviour characterization/parity fixtures;
- numbered schema migration ledger;
- additive semantic entity registry;
- predicate manifests + generated registry;
- propositions;
- attestations/testimony;
- evidence links/locators for current use cases;
- append-only decisions/resolution cases;
- relationship and scalar-value projections;
- exact duplicate shadow projection;
- visual-similarity observations;
- CaptureSequence;
- server-side presentation query;
- presentation preferences (cover/show separately);
- gallery/editor cutover off group tables;
- contract/removal of old group tables after proof;
- stable VisualRegion/Face;
- feature-vector contract/storage;
- IdentityCluster separate from Person;
- Person redirects/lifecycle;
- weak face candidate retention;
- Contributor/testimony uncertainty;
- minimal Photograph membership needed by current version/copy semantics;
- hardening: reset, interrupted run, concurrency, scale, UI/runtime tests.

## 2.2 Explicitly deferred persistent schema

Unless a current Phase 1 vertical slice consumes it, do **not** add persistent tables for:

- physical Artefact;
- full TemporalConstraint system;
- audio/video timed locators;
- external archive locators;
- Place/Event/Object/Memory;
- Process Passport;
- full age-aware lifetime-anchor model;
- portable archive export format;
- vector index engine.

Their contracts and later implementation plans remain documented in the architecture document and in Section 10 below.

---

# 3. Delivery model: expand → cutover → contract

A “big bang” is acceptable at the product/schema concept level because test data can be blown away, but individual commits/work packages must still leave the branch coherent.

Therefore:

1. **Expand**: add new schema/services beside legacy structures.
2. **Shadow**: write/project new semantic results while legacy behaviour still runs.
3. **Compare**: use parity fixtures and runtime diagnostics to compare old/new outputs.
4. **Cut over**: move each reader/writer to the new path.
5. **Contract**: remove legacy readers/writers/tables only after repository search and behavioural gates prove they are unused.

Do not delete `asset_groups` at the beginning of Phase 1.

## 3.1 Mandatory durable implementation status and handoff

Chat history is **not** an implementation record. The repository must contain a live durable handoff document at:

`docs/architecture/semantic-relationships-implementation-status.md`

This file is mandatory for the remainder of Phase 1. It owns volatile implementation state that should not pollute the target architecture document or this migration plan.

It must record at least:

- repository and active branch;
- last materially assessed implementation HEAD and last known fully green HEAD;
- latest canonical CI/QA result and direct run/job link where available;
- current WP and sub-WP;
- what is complete and the evidence that proves it;
- current blocker and exact next action;
- implementation deviations/lessons that affect later work;
- a deferred/revisit ledger with explicit completion criteria;
- UI/functional acceptance matrix, including what has and has not been manually exercised;
- known transitional compatibility state and intentional skips;
- mandatory fresh-chat/bootstrap instructions.

Maintenance rules:

1. Read the status document before starting work in a new chat or agent session.
2. Verify the actual branch HEAD and latest canonical CI before trusting any SHA/status copied into the document.
3. Update the status document after every completed sub-WP, newly discovered blocker, meaningful plan deviation, deferred item, or canonical QA state change.
4. Do **not** mark a WP/sub-WP complete merely because code was committed. Its stated completion gate must be demonstrated.
5. Do **not** silently drop a deferred item. Remove it from the ledger only when its completion criterion is demonstrably satisfied, or explicitly supersede it with a documented architectural decision.
6. UI/functionality acceptance is continuous, not something postponed wholesale to WP16. Any sub-WP that changes a user journey must update the acceptance matrix and exercise the affected journey as far as the current implementation permits.
7. The architecture document remains the intended design; this implementation plan remains the route/gates; the status document remains the live execution/handoff record.

Because work is expected to move between chats frequently, every WP from WP10 onward is decomposed below into independently gated sub-WPs. A fresh chat may be used for every WP (or more often), and repository state must be sufficient to resume without relying on previous-chat memory.

---

# 4. Phase 1 work packages

Each package should be independently reviewable. Shared schema/contracts/registries should be owned by one integration stream; only leaf work should be parallelised after those boundaries exist.

WP1-WP9 retain their original package boundaries because they are already implemented or substantially in flight. Based on the WP9 execution experience, WP10-WP16 are explicitly decomposed into smaller sub-WPs. Each sub-WP must leave a coherent branch, satisfy its own listed gate, and update the mandatory implementation-status document before work moves on.

---

## WP1 — ADRs, repository pin and acceptance inventory

### Goal

Freeze the important design decisions before code starts moving.

### Add ADRs for

1. Proposition / attestation / append-only decision model.
2. `semantic_entities` registry + typed detail tables.
3. Predicate manifests/generated registry.
4. Source-of-truth matrix.
5. Reset/durability policy.
6. Presentation paging/collapse policy.
7. Stable VisualRegion/Face reconciliation.
8. Machine generation/supersession policy.

### Pin baseline

Record:

- repository commit SHA;
- schema version;
- relevant existing behaviour fixtures.

### Completion gate

No implementation begins until ADRs identify the authoritative source and cutover target for every current group/face/editor consumer.

---

## WP2 — Characterise current behaviour

### Goal

Preserve functions, not old tables.

### 2.1 Grouping and gallery

Add/strengthen tests for:

- exact duplicates;
- near-duplicate grouping;
- current variant grouping behaviour;
- burst detection;
- representative selection;
- locked representatives;
- explode/show-separately behaviour;
- hierarchy-aware filmstrip/cluster expansion;
- grouped and ungrouped server-side paging;
- filters/date ranges with grouped paging;
- stable selection/deep link behaviour where currently supported;
- permutation fixtures (same source set in different ingestion/order permutations).

### 2.2 Editor

Characterise the current `edit_version` group path in `photoEditCommands.ts`, including:

- render creates/updates locked edit-version grouping;
- preferred rendered version;
- source/parent edit lineage;
- gallery representative behaviour.

Also preserve existing edit tests:

- save/load;
- masks;
- render;
- unknown/unavailable recipes;
- parent edit documents.

### 2.3 Collection actions

Characterise current `collectionCommands.ts` behaviour:

- explode group;
- lock/change representative;
- any delete/unstack actions;
- resulting gallery state.

### 2.4 Faces/People

Characterise current actions across `peopleCommands.ts`, runtime action wiring and `PeopleView.tsx`:

- rename;
- merge;
- isolate/split;
- approve;
- reject;
- GEDCOM links;
- birth/death metadata;
- person thumbnails;
- current deep-link/selection behaviour;
- current face-index assumptions.

Add an explicit test that documents the current UI treating cosine similarity as a percentage so the cutover can deliberately replace it with a raw/labelled similarity presentation.

### 2.5 Reset

Characterise current `db.ts` soft-reset behaviour and which manual records are snapshot/restored.

### Completion gate

A behaviour matrix states for every current function:

- preserve unchanged;
- preserve with different internal structure;
- intentionally change (with rationale/new acceptance test).

---

## WP3 — Migration ledger and additive semantic kernel

### Goal

Add the new foundation without breaking legacy readers/writers.

### 3.1 Migration ledger

Introduce:

```text
schema_migrations(version, checksum, name, applied_at)
```

Requirements:

- transactional migrations;
- checksum verification;
- fail-fast errors;
- preflight;
- interrupted migration test;
- backup/checkpoint hook before destructive production migrations;
- explicit development-only reset command.

Remove swallowed migration failures once the new ledger owns upgrades.

### 3.2 Semantic entity registry

Add `semantic_entities` plus typed detail tables as they are exercised.

Initial types:

- Asset identity bridge/current Asset semantic identity;
- Photograph;
- VisualRegion;
- Face;
- IdentityCluster;
- Person bridge;
- Contributor;
- CaptureSequence.

### 3.3 Proposition kernel

Add:

- propositions;
- attestations;
- review responses;
- resolution cases;
- case propositions;
- decisions;
- decision items;
- evidence locator + attestation evidence;
- relationship projection;
- value projection.

### 3.4 DB rules

Implement:

- real foreign keys through `semantic_entities`;
- canonical proposition key;
- canonical symmetric ordering;
- one object/value mode according to manifest;
- indexes for subject traversal and object traversal;
- active/superseded indexes;
- uniqueness/idempotency constraints;
- tombstone/status rules.

### Completion gate

Kernel tests pass without any legacy consumer being cut over yet.

---

## WP4 — Predicate manifests and generated registry

### Goal

Fit semantic relationships into PhotoStar's extension architecture.

### Manifest contents

Each predicate manifest owns:

- key/version;
- allowed subject types;
- allowed object/value types;
- symmetry/transitivity/inverse/cardinality;
- qualifier/value JSON schema;
- auto-resolution policy;
- review policy;
- projection/collapse eligibility;
- user labels;
- migration/deprecation metadata.

### Generated registry

Add deterministic generated-registry build/check.

### Initial predicates only

Start with predicates actually exercised by Phase 1, such as:

- `derived_from`;
- `represents_photograph` / equivalent membership proposition;
- `depicts` where face identity cutover uses it;
- minimal supporting predicates needed by current flows.

Exact duplicates need not be stored as pairwise propositions; they can be virtual/digest-derived.

### Unknown/deprecated handling

Persist definition/version snapshots so unavailable extension predicates remain displayable and intact.

### Completion gate

Generated-registry checks are part of `qa:quick`/`qa:ready` path as appropriate.

---

## WP5 — Exact duplicates: shadow end-to-end slice

### Goal

Prove the new architecture and presentation query with the lowest-risk current grouping feature.

### New deterministic source

Use SHA-256/content digest equivalence.

Do **not** create pairwise exact-duplicate rows for every member.

Create a deterministic duplicate-set projection keyed by digest or generate virtual traversal from the digest index.

### Shadow path

While legacy groups still exist:

1. legacy duplicate grouping runs;
2. new duplicate-set projection runs;
3. parity diagnostics compare:
   - membership;
   - representative;
   - count;
   - filter behaviour;
   - paging output.

### Completion gate

Permutation fixtures show equivalent intended behaviour before any duplicate consumer is cut over.

---

## WP6 — Visual similarity, CaptureSequence and presentation preferences

### Goal

Move the remaining group semantics into observations/sequence/presentation without claiming false semantic truth.

### 6.1 Similarity observations

Reuse current pHash/dHash/graph code.

Persist raw similarity observations with generation provenance.

Connected components remain useful for candidate/presentation clustering but are not semantic transitive facts.

### 6.2 CaptureSequence

Reuse current burst detector but write an ordered `CaptureSequence` shadow structure.

Compare legacy burst-group membership/order/representative against the new presentation projection.

### 6.3 Presentation preferences

Introduce durable preferences for:

- chosen cover/representative;
- show separately/explode.

Explicitly separate these from semantic claims.

### 6.4 Legacy variant/near behaviour

For Phase 1 parity, define a **versioned presentation policy** that can reproduce current near/variant grouping from observations while legacy groups remain available for comparison.

Do not translate `variant_set` into semantic truth.

### Completion gate

Shadow presentation results match the accepted legacy behaviour or documented intentional differences.

---

## WP7 — Server-side `LibraryPresentationItem` paging

### Goal

Replace group-aware paging atomically; do not push cluster assembly into a client helper.

### Query contract

Add a server-side query returning:

```text
LibraryPresentationPage {
  items,
  nextCursor,
  projectionVersion
}
```

Each item includes:

- stable presentation key;
- representative Asset;
- cluster kind;
- member count;
- member summary;
- timeline/sort key;
- reason summary;
- expansion capability.

### Rules

Filtering, clustering/collapse, representative selection, sorting and cursor slicing happen on the server in one logical query path.

Representative must normally satisfy the active filter.

### Precedence

Lock a v1 precedence policy with tests. It must cover:

- edit versions outrank generic similarity;
- exact copies;
- resolved Photograph versions when available;
- legacy-compatible near/variant collapse;
- CaptureSequence layering;
- manual cover/show-separately preferences.

### Cursor stability

Cursor includes stable sort tuple + presentation key + projection version.

Projection invalidation triggers a clean reload rather than duplicate/missing cross-version pages.

### Expansion API

Add a dedicated cluster expansion endpoint for filmstrip/member navigation. Do not substitute generic neighbourhood traversal.

### Completion gate

Paging tests cover boundaries where a cluster spans what would have been two legacy pages, filter changes, cursor restart and representative changes.

---

## WP8 — Editor lineage projection and gallery/editor cutover

### Goal

Remove editor dependence on group tables without rewriting the editor.

### Keep authoritative

`photo_edit_documents` remains authoritative for edit recipes and lineage.

### Semantic projection

Generate:

- rendered Asset `derived_from` source Asset;
- current Photograph membership inheritance where policy says the edit remains the same historical photograph.

### Presentation

Replace locked `edit_version` group behaviour with explicit editor-lineage/presentation rules and preferences.

### Cut over

Move:

- `photoEditCommands.ts` group writes;
- gallery group readers relevant to edit versions;
- collection actions that manipulate edit-version groups.

### Completion gate

Editor characterization tests from WP2 pass through the new path.

---

## WP9 — Cut over grouping consumers, then contract group tables

### Goal

Finish the group replacement only after every reader/writer is gone.

### Cut over files/areas explicitly including

- `assetCommands.ts` grouped paging;
- `collectionCommands.ts` explode/lock/representative behaviour;
- `libraryGallerySelection.ts`;
- `LibraryView.tsx` and associated state/actions;
- group orbit/filmstrip APIs;
- runtime action wiring;
- group diagnostics;
- grouping workflow persistence.

### Search gate

Before deleting tables, repository search must prove no functional reader/writer remains for:

- `asset_groups`;
- `asset_group_members`;
- `asset_group_children`;
- `group_id`/`group_role` core payload fields;
- legacy group commands.

Documentation/tests referring to legacy behaviour may remain only when clearly historical.

### Contract

Only now remove old tables/types/services.

### Completion gate

Full grouping/gallery/editor parity suite passes with legacy tables absent.

---

## WP10 — Stable VisualRegion and Face

### Goal

Eliminate durable `(assetId, faceIndex)` identity while preserving existing face detection, geometry, People actions and user-created identity work.

### WP10a — Inventory and stable-identity contract

- Re-read the stable-region ADR and refresh the current file/schema/write-path inventory.
- Identify every durable and transitional `(asset_id, face_index)` dependency, including soft-reset snapshot/restore paths and payload wiring.
- Define stable VisualRegion/Face ID ownership, lifecycle and geometry-generation contract without yet cutting consumers over.

**Gate:** repository-resident inventory/search evidence identifies all durable face-index dependencies and the exact cutover targets.

### WP10b — Additive VisualRegion/Face persistence and mask integration

- Add/complete stable VisualRegion/Face persistence additively.
- Reuse existing `PhotoMaskMetadata`/analysis geometry rather than creating a second canonical mask store.
- Use normalized post-EXIF coordinates, recorded source dimensions, append-only geometry generations and provider/model provenance.
- Keep editor document mask snapshots immutable and separate.

**Gate:** stable regions/faces can coexist with the current face pipeline and existing mask/editor tests remain green.

### WP10c — Detection reconciliation engine

Implement deterministic one-to-one reconciliation using:

- IoU;
- landmarks when available;
- kind/provider-specific thresholds;
- deterministic tie-breaking;
- ambiguity margin;
- no auto-reuse on ambiguous match;
- tombstones for removed detections.

**Gate:** reconciliation produces stable IDs for deterministic non-ambiguous cases without mutating durable user intent.

### WP10d — Reconciliation regression and ambiguity suite

Cover at least:

- reordered faces;
- overlapping faces;
- swapped similar faces;
- geometry drift;
- added/removed detections;
- ambiguous candidates;
- provider/model/settings reruns where relevant.

**Gate:** permutation/jitter/add/remove/ambiguity fixtures are green and ambiguous matches demonstrably fail safe.

### WP10e — Durable People action cutover

Move persistent/manual face actions from face indexes to stable IDs/semantic decisions, explicitly including:

- rename/name assignment;
- merge/person assignment;
- isolate/split;
- approve;
- reject.

Do not remove transitional adapters until all current write paths have replacements.

**Gate:** new manual actions persist against stable identity and no newly written durable record requires `face_index`.

### WP10f — Reset and reimport preservation

Replace transitional reset/rebuild restoration that keys durable work by path + face index. Test soft reset, face-analysis reset and supported reimport/re-detection paths.

**Gate:** durable face-related user work follows the reconciled Face/VisualRegion identity across the tested reset/rerun cases.

### WP10g — People UI, payload and runtime-action cutover

Update all relevant consumers, explicitly including:

- `peopleCommands.ts`;
- face assignment payload assembly;
- `PeopleView.tsx`;
- runtime action wiring;
- thumbnails/deep links where stable face identity is exposed.

Exercise the affected People journeys and record them in the mandatory UI acceptance matrix.

**Gate:** current People UI/action journeys operate on stable IDs and affected smoke/manual acceptance is recorded.

### WP10h — Contract durable `face_index` dependencies

- Repository search for remaining durable `face_index` dependencies.
- Remove obsolete manual compatibility storage/adapters only where replacement coverage exists.
- Preserve face index only as ephemeral detector ordering where still useful, never as durable identity.

**WP10 completion gate:** no durable manual face action or reset-preservation path depends on `face_index`; reconciliation and UI acceptance gates are green.

---

## WP11 — Machine generations and feature vectors

### Goal

Make face/model evidence reproducible, idempotent and safe across reruns without coupling vector lifecycle to Person lifecycle.

### WP11a — Generation/provenance schema and lifecycle

Add/complete analysis generation records with:

- workflow run;
- step run;
- subject execution;
- input fingerprint;
- model artifact checksum;
- preprocessing version;
- config hash;
- idempotency key;
- supersedes generation;
- lifecycle state.

Define the atomic generation rule: previous successful data remains active until a replacement generation completes successfully.

**Gate:** schema/lifecycle tests prove failed/incomplete generations cannot displace the active successful generation.

### WP11b — Feature-vector storage contract

Implement and validate:

- Float32 little-endian BLOB;
- dimensions;
- normalization;
- metric;
- model/feature key;
- checksums/config;
- generation ID;
- length/finite validation.

**Gate:** malformed vectors are rejected and valid vectors round-trip with explicit provenance.

### WP11c — Production/backfill and current-pipeline cutover

Adapt the existing ArcFace/current feature production path to generation-owned vector persistence, including any necessary backfill/rebuild path for development data.

**Gate:** current inference can produce a complete successful generation without legacy vector ownership being required by the active read path.

### WP11d — Retrieval contract and benchmark

- Define candidate/vector retrieval through the generation-aware contract.
- Benchmark target-tier lookup before introducing `sqlite-vec` or another vector index.
- Record measured evidence in the status document.

**Gate:** retrieval behaviour is correct and benchmark evidence exists to justify either staying with SQLite/native scanning or promoting an index proposal.

### WP11e — Retry, supersession and compaction hardening

- Prove idempotent retry and atomic supersession.
- Keep active + prior successful + human-referenced generations.
- Make stale unreferenced large BLOBs cleanable through maintenance.
- Test that compaction cannot delete human-referenced evidence.

**WP11 completion gate:** interrupted/retried model runs cannot corrupt active candidate data or duplicate vectors, and lifecycle/compaction rules are covered.

---

## WP12 — IdentityCluster, Person lifecycle and weak candidates

### Goal

Separate machine clustering from historical Person identity, preserve weaker candidate signals, and retain existing People behaviour across machine reruns.

### WP12a — IdentityCluster model and clustering output

Adapt the existing clustering algorithm initially rather than replacing it. Its output creates/rebuilds `IdentityCluster`, not Person.

**Gate:** clustering can rebuild machine IdentityClusters without creating/deleting confirmed Persons as a side effect.

### WP12b — Stable cluster reconciliation across reruns

Define and test how new machine cluster generations relate to prior clusters when memberships shift, split or merge. Machine cluster identity is rebuildable; durable human Person identity is not.

**Gate:** rerun/split/merge fixtures show deterministic cluster replacement/reconciliation without silently rewriting Person truth.

### WP12c — Person lifecycle and redirect model

Implement:

- provisional;
- confirmed;
- merged;
- retired;
- explicit `person_redirects(old_person_id, current_person_id, reason_decision_id, created_at)` / alias representation;
- redirect-cycle prevention;
- permanent old-ID resolution.

**Gate:** merge/redirect/old-ID/cycle tests are green and a confirmed Person survives machine cluster replacement.

### WP12d — Existing People action semantics and durable metadata

Explicitly reimplement/preserve current:

- rename;
- merge;
- isolate/split;
- approve;
- reject;
- GEDCOM linkage;
- birth/death metadata;
- thumbnail selection;
- deep links.

If needed by candidate generation, persist multiple trusted Person↔Face anchors without implementing the full age-aware Lifetime Identity UI.

**Gate:** characterization tests for existing actions/metadata pass against Person/IdentityCluster separation.

### WP12e — Weak candidates and threshold separation

Retain:

- top N;
- raw cosine;
- rank;
- runner-up;
- margin;
- model/generation.

Use separate settings for evidence retention, review surfacing, auto-action and minimum margin.

**Gate:** evidence below action threshold is retained where policy requires and rejection/acceptance cannot be inferred from a single threshold.

### WP12f — People UI/deep-link candidate cutover

- Move People candidate/review UI to the separated Face → IdentityCluster → Person model.
- Stop displaying raw cosine similarity as a percentage unless a calibrated probability exists; use raw score or labelled strength with explanation.
- Preserve thumbnail/deep-link behaviour through Person redirects.

**Gate:** affected People journeys and old deep links work through the new model and are recorded in the UI acceptance matrix.

### WP12g — Rerun durability, parity and contract gate

- Prove machine reruns cannot delete confirmed Persons or resurrect rejected identities as accepted without a new explicit decision.
- Search for and remove obsolete machine-cluster-directly-owns-Person assumptions once replacement coverage exists.

**WP12 completion gate:** IdentityCluster is demonstrably rebuildable and distinct from durable Person lifecycle; existing People actions and weak-candidate behaviour are covered end to end.

---

## WP13 — Contributor testimony and review experience

### Goal

Capture the user's real range of certainty and disagreement without collapsing testimony into current truth.

### WP13a — Contributor identity and attribution

Add local Contributor identity/profile selection sufficient to attribute decisions/testimony. Do not broaden this into an authentication rewrite.

**Gate:** review/testimony writes have explicit Contributor attribution and historical attribution remains readable.

### WP13b — Review-response and attestation normalization

Support at least:

- definite identification;
- tentative identification;
- possible identification;
- reject candidate;
- unsure between candidates;
- unknown/no clue;
- recognise but cannot name;
- abstain.

Normalize deliberately, for example:

- “Definitely Jean” -> supporting attestation with high subjective certainty;
- “I think Jean” -> supporting tentative attestation;
- “Not Jean” -> opposing attestation;
- “I don't know” -> attributed response, **no opposing attestation**;
- “Jean or Mary” -> ambiguous response and candidate propositions/attestations according to UI choice.

**Gate:** domain tests prove every supported response maps to the intended proposition/attestation/response semantics.

### WP13c — Conflict, resolution and append-only history

Allow multiple contributors' attestations to remain side-by-side and a decision to remain disputed/deferred. Later decisions must not rewrite original testimony.

**Gate:** conflict and superseding-decision tests preserve original attributed evidence/history.

### WP13d — Review UI uncertainty and recovery states

New review/relationship UI must declare and implement:

- shared-feedback mode (loading/empty/error/success as appropriate);
- local error boundary;
- retry/recovery behaviour;
- accessible uncertainty wording.

**Gate:** UI smoke/manual acceptance covers the supported uncertainty choices plus loading/empty/error/retry states.

### WP13e — Durability and acceptance closeout

Exercise testimony across relevant restart/reset/rebuild paths and update the durable/rebuildable matrix where necessary.

**WP13 completion gate:** `unknown` is distinct from negative evidence, contributor attribution/history survives supported rebuilds, and later decisions never rewrite original testimony.

---

## WP14 — Minimal Photograph membership

### Goal

Introduce only the Photograph structure current/follow-on version semantics actually exercise. WP14 is an explicit Phase 1 work package; it was omitted from one earlier execution-decomposition discussion by mistake, not from the architecture or Phase 1 scope.

### Definition

One Photograph = one captured photographic image/exposure or deliberate authored composite treated as one historical photographic work.

### WP14a — Membership contract and current-state ownership

Define/confirm the minimal Photograph entity and authoritative current membership projection. Support membership from:

- whole Asset -> Photograph;
- VisualRegion -> Photograph, preserving the future album-extraction contract without adding Artefact now.

Pairwise “same photograph” machine/human propositions remain evidence/history; they do not become a second editable membership truth.

**Gate:** source-of-truth tests establish one authoritative resolved membership path and no competing editable membership store.

### WP14b — Asset/copy membership projection

Implement/verify current Asset -> Photograph membership for exact-copy/current representation semantics, including deterministic rebuild where appropriate.

**Gate:** copy/representation fixtures resolve to the intended Photograph without depending on legacy groups.

### WP14c — Editor inheritance policy

Document and test when crop/restoration/edit remains the same Photograph versus when a deliberate authored composite creates a new Photograph.

**Gate:** editor lineage tests explicitly cover same-Photograph inheritance and new-Photograph boundary cases.

### WP14d — Gallery/editor current-consumer verification

Cut over or verify any remaining current consumer that needs Photograph membership for version/copy presentation. Preserve `photo_edit_documents` as editor recipe/branch authority.

**Gate:** current copy/edit-version/gallery semantics exercise the Photograph path end to end without reintroducing grouping semantics.

### WP14e — Scope boundary and acceptance closeout

- Verify whole-Asset and VisualRegion membership contracts are coherent.
- Do not add physical Artefact, full temporal constraints or speculative future tables.
- Record any intentionally deferred richer Photograph/Artefact semantics in the deferred ledger.

**WP14 completion gate:** current copy/edit-version semantics have a clear Photograph membership path, including editor inheritance rules, without speculative Artefact schema.

---

## WP15 — Reset, durability and schema hardening

### Goal

Ensure the architecture is safe for the point where test data becomes valuable. Durability tests required by earlier WPs must be added as those WPs are implemented; WP15 is the cross-domain hardening pass, not permission to postpone known durability problems.

### WP15a — Durable/rebuildable inventory and reset matrix

Create/refresh a table-by-table/entity-by-entity reset matrix for:

- factory reset;
- soft library rebuild;
- face-analysis reset;
- relationship recomputation;
- asset removal/reimport;
- model replacement.

Durable by default includes:

- Contributors;
- testimony/review responses;
- human attestations/decisions;
- manually curated/confirmed People;
- redirects/aliases;
- GEDCOM links;
- manual/resolved Photograph membership;
- presentation preferences;
- edit documents;
- durable Asset identities.

Rebuildable by default includes:

- machine observations;
- vectors;
- IdentityClusters;
- machine-only candidates;
- current presentation projections.

**Gate:** every relevant table/entity has an explicit preserve/rebuild/destroy contract for each reset type.

### WP15b — Factory and soft-library reset implementation

Implement/verify explicitly destructive factory reset and non-destructive soft library rebuild according to the matrix.

**Gate:** automated tests prove soft rebuild preserves all declared durable human work and factory reset requires the explicit destructive path.

### WP15c — Domain reset/recompute paths

Implement/verify face-analysis reset, relationship recomputation and model replacement against the same ownership rules.

**Gate:** each domain reset replaces only rebuildable machine state and leaves declared durable state intact.

### WP15d — Asset removal/reimport reconciliation

Test supported remove/reimport cases, including ambiguous identity transfer. Never silently attach durable semantic identity when the reimport match is ambiguous.

**Gate:** deterministic reimport preserves intended durable identity; ambiguous cases fail safe and require review/new identity as designed.

### WP15e — Interrupted operations, retry and concurrency

Add/complete:

- interrupted migration;
- interrupted projection rebuild;
- failed model replacement;
- retry/idempotency;
- concurrent read during generation switch where applicable.

**Gate:** interrupted/retried operations cannot leave mixed authoritative generations or silently lose durable data.

### WP15f — Destructive-path and schema hardening closeout

Search for obsolete reset snapshots, swallowed migration/reset errors and transitional durability adapters that are no longer required. Exercise destructive reset QA from a clean development database.

**WP15 completion gate:** no normal upgrade/reset/rebuild path silently destroys durable human work and all reset classes have executable acceptance coverage.

---

## WP16 — Scale, runtime and visual acceptance

### Goal

Prove the new structure works beyond fixture scale and complete Phase 1 with measured runtime and real user-journey evidence. WP16 consolidates acceptance; it does not replace the continuous UI checks required by earlier sub-WPs.

### WP16a — Benchmark harness and representative data tiers

Benchmark at least:

- development: ~10k assets / 20k faces;
- target: ~100k assets / 250k faces;
- stretch sample or synthetic equivalent sufficient to expose query/memory failure modes.

**Gate:** repeatable benchmark data generation/loading and measurement procedure is documented in-repo.

### WP16b — Library/presentation performance

Measure paged `LibraryPresentationItem` query p50/p95, cluster expansion and affected selection/bulk-action paths at representative scale.

**Gate:** measurements meet accepted targets or the status document records the measured blocker and concrete remediation decision.

### WP16c — Face candidate/clustering/vector performance

Measure face candidate lookup p50/p95, relevant clustering/reconciliation throughput and vector retrieval path at representative scale.

**Gate:** measurements justify the current storage/query strategy or provide evidence for an explicit index/architecture follow-up.

### WP16d — Projection, memory and SQLite growth

Measure:

- projection rebuild throughput;
- memory ceiling;
- SQLite DB/vector growth;
- large-generation replacement/compaction behaviour.

**Gate:** no unrecorded scale blocker remains for the accepted Phase 1 target tier.

### WP16e — Automated functional/UI smoke journeys

Run affected `ui:smoke` and integration journeys, covering at minimum:

- fresh DB + representative ingest;
- library open/render/paging/scrolling;
- single/range/presentation/timeline selection;
- bulk actions expanding the correct underlying assets;
- presentation filmstrip/member expansion;
- editor open/save/return-to-library;
- People load/review/merge/isolate as implemented;
- uncertain testimony;
- loading/empty/error/retry states.

**Gate:** automated journeys are green and the mandatory UI acceptance matrix points to the evidence.

### WP16f — Manual visual acceptance and large-library soak

Manually verify the affected library/editor/People/review journeys, including visual layout/interaction quality, and run a representative large-library soak sufficient to expose memory/query/interaction regressions.

**Gate:** manual acceptance is explicitly recorded; unresolved defects are blockers or ledgered follow-ups with owner/completion criteria, never implicit omissions.

### WP16g — Final Phase 1 gate and documentation closeout

- Run relevant `qa:quick`, `qa:ready`, generated checks, `ui:smoke`, runtime evidence and final `pnpm.cmd run qa:merge`.
- Reconcile architecture/plan/status documents with the delivered implementation.
- Close/supersede every deferred ledger item that is required by the Phase 1 completion gate.

**WP16/Phase 1 completion gate:** all Section 9 gates are satisfied, the canonical merge gate is green, runtime/visual acceptance is recorded, and the durable implementation-status document contains an unambiguous completed handoff state.

---

# 5. Source-of-truth implementation matrix

This matrix is a required deliverable and should live in the repo near the ADRs.

| Fact/domain | Authoritative writer | Rebuildable projection |
|---|---|---|
| File digest/exact copy set | ingest/hash subsystem | presentation exact-copy set / virtual relationship |
| Visual similarity | analysis generation | similarity candidate/presentation projection |
| Edit recipe/branch | `photo_edit_documents` | semantic `derived_from`, presentation version info |
| Existing date/location/caption metadata in Phase 1 | existing metadata subsystem | optional one-way semantic explanation adapters |
| Face detector geometry | active analysis generation | stable VisualRegion/Face current geometry |
| Human face identification/rejection | proposition + attestation + decision | current `depicts` relationship |
| Person merge | explicit decision/redirect | resolved current Person ID |
| Photograph membership | explicit resolved membership/proposition decision | current representation projection |
| Cover/show separately | presentation preference | LibraryPresentationItem output |

Any implementation that creates a second editable writer for one row in this matrix requires an ADR first.

---

# 6. Detailed file/change map

The exact file list should be refreshed against the pinned implementation SHA, but Phase 1 must explicitly inspect/cut over at least the current areas identified by review.

### Data/schema

- `src/data/dbSchema.ts` — additive schema, later contract old tables.
- `src/data/db.ts` — migration ledger, reset semantics, no swallowed migrations.

### Current grouping

- `src/services/workflowRuntime/modules/grouping/groupingGraph.ts` — **keep** graph utilities.
- `groupingQueries.ts` — **adapt** to observations/shadow projections.
- `groupingHierarchy.ts` — **reuse** heuristics in presentation policy where valid.
- `groupingUnits.ts` — **adapt** away from nested persisted groups.
- `groupingPersistence.ts` — **substantially replace**, then retire.

### Asset/gallery commands

- `src/services/handlers/assetCommands.ts` — replace group-aware paging with server presentation query.
- `src/services/handlers/collectionCommands.ts` — split presentation explode/cover from semantic rejection.
- `src/shared/utils/libraryGallerySelection.ts` — simplify to consume server presentation items; no semantic grouping logic in client helper.
- `src/ui/components/LibraryView.tsx` — adapt state/actions, preserve layout/virtualisation.
- group orbit/filmstrip contracts/handlers — replace with presentation expansion + semantic neighbourhood as separate APIs.

### Editor

- `src/services/handlers/photoEditCommands.ts` — remove locked `edit_version` group writer only after semantic/editor presentation replacement exists.
- `src/boundary/contracts/photoEditor.ts` — preserve recipes/masks; add semantic IDs/adapters only where required.
- `src/services/photoEditing/assetMaskMetadata.ts` — keep canonical mask metadata; integrate VisualRegion references, do not duplicate mask storage.

### Faces/People

- `src/services/faces/arcFaceRecognizer.ts` — keep inference, adapt vector persistence.
- `src/services/faces/peopleResolution.ts` — split cluster/candidate/projection responsibilities; no durable Person deletion.
- face detector/suppression/geometry files — keep algorithms, add reconciliation layer.
- `src/services/handlers/peopleCommands.ts` — migrate all durable actions from face index to stable IDs/decisions.
- `src/ui/components/PeopleView.tsx` — new stable IDs, uncertainty/review, no raw cosine-as-percentage.
- asset payload assembly/runtime action wiring — update stable IDs and new commands.

### GEDCOM

- preserve existing links and ensure Person merge/redirect logic resolves them correctly.

### Review UI

- adapt existing review components/services to proposition/attestation/decision model;
- add shared feedback states + local error boundaries.

---

# 7. Phase 1 test matrix

## 7.1 Proposition/attestation

- two agreeing contributors -> one proposition, two attestations;
- conflicting identities -> competing propositions in one resolution case;
- supporting/opposing stance preserved;
- `I don't know` -> response only, no negative attestation;
- decision history append-only;
- old decision remains inspectable after new decision;
- scalar value projection and entity relationship projection both rebuild correctly.

## 7.2 Predicate registry

- allowed subject/object accepted;
- invalid combination rejected;
- symmetric canonicalisation deterministic;
- unknown/deprecated persisted predicate remains readable;
- generated registry deterministic/checksummed.

## 7.3 Group parity/presentation

- exact copy parity;
- near/variant presentation parity;
- burst -> CaptureSequence parity;
- locked representative parity;
- explode/show separately parity;
- editor version priority;
- server paging across cluster boundaries;
- filter/date range representative eligibility;
- cursor invalidation/restart;
- cluster expansion ordering.

## 7.4 Reset/durability

- soft rebuild preserves human testimony/decisions/People/Photographs/preferences/edit docs;
- face reset preserves human identity history;
- failed replacement generation leaves old successful data active;
- ambiguous asset reimport does not silently transfer semantic identity;
- factory reset is explicitly destructive.

## 7.5 Stable regions/faces

- result reordering;
- slight movement;
- overlapping/swapped faces;
- added/removed detections;
- ambiguous reconciliation;
- geometry history append-only;
- mask reference remains valid.

## 7.6 Person lifecycle

- rename;
- merge redirect;
- redirect cycle prevention;
- old deep link resolves;
- isolate/split;
- approve/reject;
- multiple IdentityClusters -> one Person;
- GEDCOM/birth/death preserved;
- confirmed Person survives machine rerun.

## 7.7 Vectors/generations

- BLOB shape validation;
- idempotent retry;
- generation atomic switch;
- model/config/input fingerprint change creates new generation;
- compaction cannot delete human-referenced generation.

## 7.8 Editor/metadata

- existing editor behaviour unchanged;
- semantic edit lineage regenerates from authoritative edit document;
- metadata remains one-way authoritative in Phase 1.

---

# 8. Quality and merge gates

The canonical merge gate is **not** a generic `npm run quality`.

Use the repository's canonical pnpm/Windows-compatible QA flow and refresh exact commands against the pinned implementation SHA.

Required gate intent:

1. `pnpm.cmd run qa:quick` during development where applicable.
2. `pnpm.cmd run qa:ready` before integration handoff.
3. generated-registry/check-generated validation.
4. affected `ui:smoke` suites.
5. runtime evidence for server paging, projection rebuild and face candidate paths.
6. manual visual acceptance for changed gallery/People/review UI.
7. final `pnpm.cmd run qa:merge` before merge.
8. mandatory `semantic-relationships-implementation-status.md` update after every sub-WP/canonical QA state change and before handing work to a fresh chat/agent.

New review/relationship UI must have:

- declared loading/empty/error/success feedback modes;
- local error boundaries;
- recoverable retry where appropriate.

A green unit/integration gate does not substitute for the affected functional/UI journey when a sub-WP changes user-visible behaviour. Conversely, a manual smoke check does not substitute for the canonical automated gate.

---

# 9. Phase 1 completion gate

Phase 1 is complete only when all of the following are true:

1. ADRs and source-of-truth matrix are committed and match implementation.
2. Numbered migration ledger is authoritative; migration errors fail fast.
3. Semantic entity FK model is active.
4. Propositions and attestations are separate.
5. Append-only decisions and competing resolution cases work.
6. Entity relationship and scalar value projections both exist.
7. Predicate manifests/generated registry are the only path for authoring known predicates.
8. Exact duplicate sets are digest-derived without quadratic pair rows.
9. Legacy grouping has been shadow-compared before cutover.
10. Server-side `LibraryPresentationItem` paging owns collapse/filter/sort/paging atomically.
11. Explode/show-separately is presentation-only and distinct from semantic rejection.
12. Cluster expansion is available independently of semantic neighbourhood traversal.
13. Editor version behaviour no longer writes group tables and remains functionally equivalent.
14. Repository search proves no old group reader/writer remains before group tables are dropped.
15. Old group tables/types are removed only after that proof.
16. Stable VisualRegion/Face reconciliation passes overlap/swap/reset tests.
17. No durable face action relies on `face_index`.
18. IdentityCluster is distinct from Person.
19. Person merge/redirect/split/approve/reject/GEDCOM/deep-link behaviour is covered.
20. Weak face candidates, runner-up and margin are retained beneath action thresholds.
21. Raw cosine is not presented as a probability.
22. Human uncertainty and `I don't know` semantics are correct and attributed.
23. Machine generations have input/model/preprocessing/config provenance and atomic supersession.
24. Feature-vector storage contract and compaction rules are implemented.
25. Soft reset/rebuild preserves all declared durable human data.
26. Minimal Photograph membership is exercised without speculative Artefact/temporal tables.
27. Scale/runtime benchmarks meet accepted target or document the measured blocker/next action.
28. Relevant `qa:quick`, `qa:ready`, generated checks, `ui:smoke`, runtime evidence, manual visual acceptance and final `pnpm.cmd run qa:merge` pass.
29. The mandatory implementation-status document is current, every Phase-1-required deferred item is closed/superseded explicitly, and the UI acceptance matrix records the final functional state.

---

# 10. Post-Phase-1 implementation roadmap

These sections are deliberately detailed enough to resume later. They are **not Phase 1 tasks** unless the user explicitly promotes one.

---

## 10A. Physical Artefact / album intelligence / front-back pairing

### Trigger to start

A vertical feature needs to distinguish the physical surviving object from both Asset and Photograph.

Likely triggers:

- front/back scans;
- album-page extraction;
- Capture Doctor;
- Process Passport;
- Relightable Evidence.

### Planned schema

Add `Artefact` typed semantic entity.

Add representation propositions/membership supporting:

```text
Asset -> Artefact
VisualRegion -> Artefact
Artefact embodies -> Photograph
```

Add view qualifiers:

- front;
- back;
- edge;
- detail;
- oblique light;
- full.

### Album work

1. detect child-photo VisualRegions on page Asset;
2. resolve each region to Photograph;
3. preserve page coordinates;
4. attach caption/handwriting regions;
5. keep page itself as Artefact;
6. only then build Album Archaeology UI.

### Acceptance principle

Extracting a child Photograph never destroys the spatial/object identity of the original album page.

---

## 10B. Photographic Process Passport

### Prerequisites

- Artefact;
- views/regions;
- proposition/evidence kernel;
- vector retrieval.

### Plan

1. define process vocabulary/versioned manifest;
2. build trusted exemplar set;
3. add manual guided physical checklist;
4. benchmark exemplar retrieval first;
5. add zero-shot classifier only as a comparison signal;
6. store candidate process observations;
7. ask for extra reverse/edge/oblique views when information gain is high;
8. project accepted process to Artefact;
9. feed process evidence into dating/restoration/preservation without silently changing pixels.

---

## 10C. Date Workbench / Time Fog

### Trigger

Date evidence becomes a first-class vertical rather than merely existing metadata.

### Add reserved temporal structure

```text
TemporalConstraint
  exact | circa | range | before | after | same_period
```

Allow event/entity references for before/after.

### Evidence sources

- existing metadata;
- burned-in OCR dates;
- contributor testimony;
- Person birth/death/age;
- sequence/album order;
- object/clothing clues;
- later Process Passport;
- known events.

### UI

- current range + confidence/uncertainty;
- evidence/contradiction list;
- before/after constraints;
- compact high-value questions;
- Time Fog range rendering.

---

## 10D. Advanced Identity Solver / Lifetime Anchors

### Prerequisites

- stable Face/VisualRegion;
- IdentityCluster;
- Person redirects;
- weak candidates;
- GEDCOM;
- later temporal constraints.

### Plan

1. extend minimal Person↔Face anchors with date/age/era metadata;
2. deterministic impossibility filters;
3. candidate scoring from multiple anchors;
4. co-occurrence and family-tree context;
5. album/sequence context;
6. contradictory evidence;
7. casefile UI with top 3–5 candidates;
8. held-out benchmark top-1/top-3;
9. only then test specialist age/kinship models.

---

## 10E. Place Solver / Place Threads

### Add

`Place` semantic entity and geographic qualifiers.

### Evidence pipeline

- manual Place;
- GPS;
- same-place visual retrieval;
- OCR/sign VisualRegions;
- family known places;
- sequence/event context;
- coarse GeoCLIP-style prior;
- historical maps.

### UI

- Place timeline/page;
- Location Workbench;
- evidence inspector;
- later Revisit/Stand Here.

Never let one global geolocation model write authoritative location automatically.

---

## 10F. Object Threads / Same-Similar-Echo

### Add

Object entity + VisualRegion membership.

### Keep three semantics distinct

- same physical object;
- similar object/type;
- visual/cultural echo.

### Plan

1. region embeddings;
2. candidate retrieval;
3. user confirmation;
4. proposition/attestation storage;
5. Object Thread;
6. relationship inspector;
7. later Life of an Object narrative view.

---

## 10G. Living Knowledge Rescue / Memory Session

### Prerequisites

Phase 1 Contributor/testimony model.

### Add

- InterviewSession;
- Recording Asset;
- TranscriptSpan;
- speaker identity;
- timed EvidenceLocator variant.

### Workflow

1. rank unresolved questions by information gain;
2. pick likely knowledgeable contributor;
3. show one photo/question;
4. record original audio;
5. transcribe + diarise;
6. preserve exact time-coded wording;
7. generate candidate propositions/attestations;
8. human confirms extraction;
9. track contributor knowledge boundaries.

Do not infer contributor reliability automatically without a dedicated design review.

---

## 10H. Home Movie Threads / VideoMoment

### Add

`VideoMoment(asset_id,start,end)` semantic entity/locator.

### Plan

1. scene/keyframe extraction;
2. keyframe vectors;
3. transcript where available;
4. Face/Person candidates;
5. still-to-video retrieval;
6. moment-level search;
7. provenance-aware “Still to Motion”.

Real surviving footage outranks interpolation/generative animation.

---

## 10I. Capture Doctor / Relightable Evidence

### Prerequisites

Artefact representation views.

### Capture Doctor

Store observations for:

- glare;
- perspective;
- clipping;
- focus/shake;
- border completeness;
- illumination uniformity.

Recommend recapture before restoration when better evidence is realistically obtainable.

### Relightable Evidence

Represent multiple directional-light Assets as views of one Artefact; align them and expose interactive relighting while linking inscription VisualRegions and testimony/transcription propositions.

---

## 10J. Restoration authenticity / reference-assisted restoration

### Build on

- authoritative edit documents;
- Photograph membership;
- VisualRegion;
- later Artefact/multi-copy representation.

### Plan

1. classify edit operations as deterministic/reference-assisted/generative;
2. link affected regions;
3. attach reference source Assets/Photographs;
4. run semantic guardrails before/after;
5. expose authenticity map;
6. selective restoration;
7. reference-assisted faces;
8. best-pixel multi-copy restoration.

---

## 10K. Unified retrieval / Explainable Discovery

### Plan

Create one retrieval service that combines:

- image/region vectors;
- Person;
- Place;
- Object;
- OCR/text;
- dates;
- sequence;
- semantic relationships.

Every result returns reason codes/evidence.

Products enabled:

- Visual Neighbourhood;
- Find this, but...;
- Same/Similar/Echo;
- counterfactual search using real evidence;
- Search by Conversation.

Introduce a local vector index only after the Phase 1 benchmark gate demonstrates the need.

---

## 10L. Portable archive survival/export

### Goal

Ensure manual semantic work remains usable outside PhotoStar.

### Plan

1. versioned JSON serialization for semantic entities/propositions/attestations/decisions;
2. sidecar/standard metadata where appropriate;
3. checksums/fixity;
4. human-readable index pages;
5. explicit source paths and editor lineage;
6. optional derived/vector export, off by default.

A future Archive Survival Test should verify the archive is intelligible without the running PhotoStar application.

---

# 11. Future-feature compatibility checklist

Before adding a later feature, answer:

1. Is this a semantic Entity or only machine analysis?
2. Is the output an Observation, a Proposition, an Attestation, or a Decision?
3. Does it use an existing authoritative source of truth?
4. Does it require a stable VisualRegion?
5. Is its evidence whole-Asset, region, time span, document page or external record?
6. Does it introduce a new predicate manifest or value schema?
7. Is the relationship symmetric/transitive/directional/cardinality-constrained?
8. Is uncertainty human, model, or resolution uncertainty?
9. Is this current semantic truth or merely presentation clustering?
10. What survives a model reset, soft rebuild and asset reimport?
11. Can old persisted extension data remain readable if the feature disappears?
12. What behavioural test demonstrates the feature without asserting internal table layout?

This checklist is intended to stop future features from recreating isolated silos or weakening the semantic kernel.
