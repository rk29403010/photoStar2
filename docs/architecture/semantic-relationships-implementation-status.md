# PhotoStar2 Semantic Relationships — Implementation Status and Handoff

**Purpose:** repository-resident execution state for the Phase 1 semantic-relationships refactor.  
**Authority:** this is the live handoff companion to `semantic-relationships-architecture.md` and `semantic-relationships-implementation-plan.md`.  
**Rule:** chat history, model memory and commit existence are not completion evidence. Verify repository HEAD and canonical QA before trusting this snapshot.

---

## 1. Mandatory maintenance contract

Update this file after every completed sub-WP, blocker, meaningful deviation, deferred item, canonical QA state change, or user-visible acceptance run.

A WP/sub-WP is complete only when its implementation-plan gate is demonstrated. Do not remove deferred items silently. UI/functional acceptance is continuous; WP16 consolidates final acceptance but does not defer checking journeys changed earlier.

Document roles:

- `semantic-relationships-architecture.md` — intended architecture and durable design decisions.
- `semantic-relationships-implementation-plan.md` — migration route, sub-WPs and acceptance gates.
- **this file** — current state, evidence, blockers, deferred work, acceptance and restart instructions.

---

## 2. Repository state

- Repository: `rk29403010/photoStar2`
- Active branch: `task/semantic-relationships-phase1-foundation`
- Pull request: `#42`
- Last material implementation HEAD assessed: `546e155c5f77c9a694fee23cb9dadd4e3772ad8a`.
- Canonical quality-gate for that HEAD: **GREEN**, run `34683370717`, job `103525949367`.
- WP11d target-tier benchmark for that HEAD: **GREEN**, run `34683370667`.
- Current package: **WP12a — IdentityCluster model and clustering output**.

Before doing any work, fetch actual branch HEAD and canonical Actions state rather than assuming this SHA is still current.

### Recent package evidence

- WP9 remains complete at `5469dcc`; canonical run `34550734260`.
- WP10a-WP10g were completed and gated individually. WP10h durable `face_index` contraction then landed through `c33f379` / `5cad27f`; subsequent WP11 green gates prove the branch remains healthy after that contraction.
- WP11a generation lifecycle/provenance: `ef0e346` plus `0eac602`; covered by WP11a tests and green by the `f27ab60` checkpoint gate.
- WP11b Float32 feature-vector storage contract: `f27ab60`; canonical run `34655633138` green.
- WP11c ArcFace production/read-path cutover: `8c12da4`, `0265af6`, compatibility-test update `fe69910`; canonical run `34682338525` green.
- WP11d generation-aware retrieval: `90b8ee3`, current People reader cutover `c26efa6`, retrieval tests `d070281`, target benchmark `83a4498`; canonical run `34682676189` green.
- WP11e retry/compaction hardening: `546e155`; canonical run `34683370717` green. Retry reuses one running generation/vector identity, stale/failed unreferenced vector BLOBs are compactable through maintenance, active + immediate rollback generations are retained, generation metadata/lineage survives compaction, and typed durable `analysis_generation` semantic evidence pins reviewed machine evidence.

PhotoStar2's current runtime persistence is SQLite via `better-sqlite3`. Do not add PostgreSQL as an invented completion requirement.

---

## 3. Current work package

### WP12a — IdentityCluster model and clustering output

**State: NOT STARTED.**

WP11 is closed at green implementation HEAD `546e155c5f77c9a694fee23cb9dadd4e3772ad8a`.

### WP11 closure evidence

WP11 now satisfies the architecture's machine-generation lifecycle contract:

- immutable analysis generations carry workflow/step/subject execution provenance plus input/model/preprocessing/config identity;
- retries are idempotent: the same idempotency key/provenance returns the same running generation, and the same vector identity/data returns the same vector row rather than duplicating it;
- replacement generations do not displace the current successful generation until the replacement succeeds; stale concurrent replacements cannot overwrite a newer active generation;
- ArcFace production vectors are owned by stable Face IDs and analysis generations rather than legacy `derived_results.face_recognition` JSON ownership;
- current vector reads go through successful active generation heads and enforce compatible vector-space metadata;
- maintenance compaction deletes only stale vector BLOBs from terminal failed/superseded generations outside the retention set; generation metadata and supersession lineage remain intact;
- active generations and their immediate predecessor are retained for current use and rollback/debugging;
- the existing `semantic_evidence` mechanism now has a typed `analysis_generation` evidence kind, so reviewed/human-linked machine evidence is a real durable retention pin instead of inferred from generic `source_ref` strings;
- `tests/core/wp11e-analysis-generation-compaction.test.cjs` proves retry identity, retention, compaction, metadata preservation and human-evidence protection;
- canonical quality-gate run `34683370717` is green.

The repository investigation also confirmed that `visual_region_geometry_generations.source_analysis_generation_id` currently points to the legacy face-detection `derived_results` ID, not a WP11 `analysis_generations` row. Generic semantic `source_ref` fields therefore were deliberately not treated as generation references.

### WP11d performance evidence retained for later work

Target-tier benchmark evidence (250,000 vectors × 512 dimensions, 488.28125 MiB raw vector payload) measured native SQLite/BLOB candidate lookup at p95 **2334.8 ms** versus the **150 ms** architecture target, while sampled JS heap growth remained bounded at **3.1 MiB**.

Decision: an indexed retrieval proposal (`sqlite-vec` or equivalent) remains evidence-backed deferred work. WP11 lifecycle correctness is complete; the performance issue remains explicitly tracked for later implementation/measurement and must not be hidden by the WP11 closeout.

### Exact next action

Begin WP12a in plan order:

1. inspect the current clustering/People ownership path and existing characterization tests;
2. introduce the minimal `IdentityCluster` machine-output model required by the architecture;
3. adapt the existing clustering algorithm so rebuildable machine output creates/rebuilds IdentityClusters rather than creating/deleting durable Person truth as a side effect;
4. preserve existing People behaviour until replacement coverage exists;
5. satisfy the WP12a gate before advancing to WP12b.

Do not widen WP12a into the later Person lifecycle/redirect, weak-candidate or People UI packages prematurely.

---

## 4. Phase 1 WP status

| WP | State | Notes |
| --- | --- | --- |
| WP1 | Largely complete | ADR/foundation work exists; reconcile at final closeout. |
| WP2 | Largely complete | Characterization expanded during grouping migration; later work must refresh affected fixtures. |
| WP3 | Largely complete | Migration ledger + semantic kernel established; final durability closeout remains WP15. |
| WP4 | **Complete for current Phase 1 slice** | Manifest-owned predicates and generated registry are green. |
| WP5 | Complete for current Phase 1 slice | Exact-duplicate shadow/replacement path established. |
| WP6 | Substantially complete | Similarity/CaptureSequence/presentation preference path established. |
| WP7 | Substantially complete | Server-side presentation/expansion path established; final scale evidence remains WP16. |
| WP8 | Substantially complete | Editor group dependency replaced; Photograph closeout intersects WP14. |
| WP9 | **Complete** | Grouping/gallery/editor parity gate green with legacy group tables absent. |
| WP10 | **Complete** | Stable Face/VisualRegion identity, reconciliation, actions/reset cutover and durable positional-dependency contraction landed. |
| WP11 | **Complete** | Generation ownership, vector storage, ArcFace cutover, retrieval, retry/supersession and retention/compaction gates are green. |
| WP12 | **In progress** | WP12a IdentityCluster machine-output separation is next. |
| WP13 | Not started | Contributor testimony/uncertainty/review. |
| WP14 | **Partially implemented ahead of sequence** | Minimal Photograph/editor representation semantics exist from WP8; full audit remains. |
| WP15 | Mostly not started | Cross-domain durability/reset hardening remains. |
| WP16 | Not started | Scale/runtime/automated functional/manual visual acceptance. |

---

## 5. Deferred / revisit ledger

Do not remove an item until its completion criterion is demonstrated or explicitly superseded.

| WP | Item | Current state / reason | Completion criterion |
| --- | --- | --- | --- |
| WP4/WP10 | Predicate registry prerequisite | Resolved at `e3f074a6`; active authoring uses generated manifest ownership. | **Resolved.** |
| WP16 | Intentional skipped-test audit | Remaining intentional skips are not assumed resolved. | Every remaining skip has a current reason/WP or is removed/replaced before final acceptance. |
| WP10 | Durable `(asset_id, face_index)` identity | Durable manual/reset semantics have been contracted to stable Face/VisualRegion identity; detector order may remain as ephemeral/rebuildable compatibility projection. | **Resolved for WP10 durable-identity gate.** Later projection removal must not be conflated with durable identity. |
| WP10/WP15 | Soft-reset face preservation | Stable Face/VisualRegion reset preservation is green; cross-domain reset semantics remain broader WP15 work. | WP15 durability matrix proves all reset classes. |
| WP11 | Analysis-generation/vector lifecycle | Generation ownership, vector storage, current ArcFace cutover, retrieval, retry/supersession and retention/compaction are green. | **Resolved.** |
| WP11/WP16 | Target-tier vector lookup performance | Native scan p95 is 2334.8 ms vs 150 ms target; memory remains bounded. | Indexed retrieval proposal implemented/measured later without weakening generation compatibility semantics. |
| WP12 | Machine clustering vs Person lifecycle | Explicit IdentityCluster/Person separation remains. | Rebuild cannot create/delete durable confirmed Person truth; redirects/actions/deep links covered. |
| WP13 | Contributor uncertainty/testimony UI | Kernel groundwork exists; full attributed uncertainty/review workflow remains. | WP13 completion gate green; unknown != negative evidence and append-only testimony history. |
| WP14 | Early Photograph semantics from editor work | Some behavior landed ahead of WP14; completeness not audited against WP14a-e. | Every WP14 sub-gate demonstrated; no speculative Artefact schema. |
| WP15 | Cross-domain durability/reset matrix | Existing reset behavior remains partly transitional outside the WP10 face slice. | Explicit matrix plus executable tests; rebuilds cannot silently destroy durable human work. |
| WP16 | Real UI/manual acceptance at representative scale | Automated evidence exists but final current manual acceptance record does not. | WP16e/f/g gates green with matrix complete and final `qa:merge` green. |

---

## 6. UI / functional acceptance matrix

`Not recorded` means exactly that; automated evidence must not be promoted to human visual evidence.

| Journey | Automated evidence | Manual/visual evidence | Current obligation |
| --- | --- | --- | --- |
| Fresh DB opens/migrates | WP10/WP11 migrations exercised by canonical core suite | Not recorded at current head | Retain manual smoke for final acceptance. |
| Representative ingest -> Library | Existing integration/core coverage green | Not recorded | Repeat when later WPs affect ingest/library. |
| Library paging/selection/collapse | Presentation and selection tests green from WP9 | Not recorded | Manual verification by WP16. |
| Bulk action expands hidden members | Presentation-native bulk-selection tests green | Not recorded | Verify representative + hidden members manually. |
| Filmstrip/member expansion | Replacement wiring tests exist | Not recorded | Manual navigation remains. |
| Editor save/render/return | Editor characterization/semantic-lineage tests green | Not recorded | Manual journey by WP14/WP16. |
| People view loads | WP10g UI boot smoke plus payload/action tests; WP11c/d vector read path core tests green | Human visual interaction unavailable in remote GitHub session | Person lifecycle semantics remain WP12. |
| Rename/merge/isolate/approve/reject | Stable Face semantic-action tests green | Not recorded | Redirect/Person lifecycle remains WP12. |
| Old Person/deep link survives merge | Not implemented on target model | Not applicable | WP12c/f. |
| Uncertain testimony choices | Not implemented end to end | Not applicable | WP13b-d. |
| New review loading/empty/error/retry | Not implemented end to end | Not applicable | WP13d and WP16. |
| Restart/rebuild preserves manual state | Stable face/reset evidence plus WP11 generation retry/compaction evidence green | Not recorded on final target model | Continue through WP12 then WP15 cross-domain proof. |
| Representative large-library soak | WP11d isolated vector benchmark exists; not a full app soak | Not yet | WP16. |

---

## 7. Significant implementation decisions / lessons

### WP11 generation ownership and compaction

Machine vectors are owned by immutable analysis generations with explicit workflow/step/subject provenance. A failed replacement cannot displace the previous active successful generation. Retry identity is generation/vector-idempotent. The ArcFace producer writes stable Face-owned vectors and the active read path does not require legacy `derived_results.face_recognition` ownership.

Compaction preserves generation metadata/lineage and removes only eligible large vector BLOBs. Active + immediate rollback generations are lifecycle-pinned. Durable reviewed generation evidence uses typed `semantic_evidence(kind='analysis_generation')`; generic `source_ref` strings are not guessed to be generation references.

### WP11d retrieval/index decision

Candidate retrieval is a generation-aware contract, not raw table access. Compatibility across model/preprocessing/config/metric space is enforced before distance comparison. Native SQLite BLOB scanning is memory-bounded but fails target latency by a large margin at 250k x 512-D, so an index proposal is evidence-backed deferred work. Do not add an index that bypasses generation heads or compares incompatible vector spaces.

### Stable face identity

Detector reruns reconcile against stable VisualRegion geometry. Clear compatible matches reuse stable Face/VisualRegion IDs; ambiguity fails safe. Durable People/manual action truth is not keyed by detector ordering.

### Group replacement and selection

Do not restore legacy group-table ownership to satisfy old structural tests. Library selection treats visible presentation items as selected units while bulk actions use the union of underlying Asset IDs.

### Migration rule

Do not rewrite checksummed applied migration history for later contraction. Use forward migrations. PhotoStar2 runtime persistence is SQLite (`better-sqlite3`).

### Execution granularity

WP9 was operationally too large. WP10 onward is deliberately split into independently gated sub-WPs; do not silently roll later work across package boundaries without preserving intermediate evidence.

---

## 8. Mandatory fresh-chat / new-agent bootstrap

1. Read root `AGENTS.md` from the active branch.
2. Read `docs/ai/AI_PROJECT_MAP.md`.
3. Read `semantic-relationships-architecture.md`.
4. Read `semantic-relationships-implementation-plan.md`.
5. Read `semantic-relationships-phase1-foundation.md` and **this file in full**.
6. Verify active branch and actual HEAD; do not trust the recorded SHA blindly.
7. Check the latest canonical Actions result for that HEAD.
8. Read the current WP, deferred ledger and acceptance obligations.
9. Inspect current code/tests before changing anything; repository evidence outranks chat history.
10. Continue from **Exact next action** or the first incomplete sub-WP gate.
11. Never infer completion because commits exist. Verify the required gate, then update this file.
