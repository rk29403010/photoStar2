# PhotoStar2 Semantic Relationships — Implementation Status and Handoff

**Purpose:** durable repository-resident execution state for the Phase 1 semantic-relationships refactor.  
**Authority:** this document is the required live handoff companion to `semantic-relationships-architecture.md` and `semantic-relationships-implementation-plan.md`.  
**Rule:** chat history, model memory and commit existence are not completion evidence. Verify repository HEAD and canonical QA before trusting this snapshot.

---

## 1. Mandatory maintenance contract

This file must remain current for the remainder of Phase 1.

Update it after every:

- completed sub-WP;
- newly discovered blocker;
- meaningful implementation deviation or architectural lesson;
- deferred/revisit item;
- canonical CI/QA state change;
- user-visible journey change or acceptance run.

A WP/sub-WP is complete only when its implementation-plan gate is demonstrated. A commit without a green required gate is **in progress**, not complete.

Do not remove deferred items silently. Remove them only when the recorded completion criterion is satisfied, or explicitly supersede them with a documented architectural decision.

UI/functional acceptance is continuous. WP16 consolidates final acceptance but is not permission to postpone checking user journeys changed by WP10-WP15.

### Document roles

- `semantic-relationships-architecture.md` — intended architecture and durable design decisions.
- `semantic-relationships-implementation-plan.md` — migration route, sub-WPs and acceptance gates.
- **this file** — volatile implementation state, blockers, deviations, deferred work, UI acceptance and exact restart instructions.

---

## 2. Repository state

- Repository: `rk29403010/photoStar2`
- Active branch: `task/semantic-relationships-phase1-foundation`
- Pull request: `#42`
- [Branch](https://github.com/rk29403010/photoStar2/tree/task/semantic-relationships-phase1-foundation)
- [Implementation plan](https://github.com/rk29403010/photoStar2/blob/task/semantic-relationships-phase1-foundation/docs/architecture/semantic-relationships-implementation-plan.md)
- [Architecture](https://github.com/rk29403010/photoStar2/blob/task/semantic-relationships-phase1-foundation/docs/architecture/semantic-relationships-architecture.md)
- [Phase 1 foundation notes](https://github.com/rk29403010/photoStar2/blob/task/semantic-relationships-phase1-foundation/docs/architecture/semantic-relationships-phase1-foundation.md)

### SHA conventions in this document

Documentation-only commits can advance branch HEAD without changing the implementation being assessed. Therefore this document records a **last material production implementation HEAD** separately from contract/test-only WP checkpoint commits.

Before doing any work, fetch the actual branch HEAD and compare it with this snapshot.

### Current snapshot

- Last material production implementation HEAD assessed: `0223f5cff4d987f5c8a7be198cbb5cf0dc3ab871`.
- WP9 completion gate: **GREEN / WP9 COMPLETE**.
- [Canonical green quality-gate run for `5469dcc`](https://github.com/rk29403010/photoStar2/actions/runs/34550734260).
- WP10a contract/guard checkpoint: `184178e566bc386401e71c29e611f4402bca1cd6`.
- WP10a completion gate: **GREEN / WP10a COMPLETE**.
- [Canonical green quality-gate run for `184178e`](https://github.com/rk29403010/photoStar2/actions/runs/34559139522), job `103138080317`.
- [Descreen diagnostic run for `184178e`](https://github.com/rk29403010/photoStar2/actions/runs/34559139475): green.
- WP10b implementation checkpoint: `d7f62e118958f9cd609bde3af01c8271cd5c0238`.
- WP10b completion gate: **GREEN / WP10b COMPLETE**.
- [Canonical green quality-gate run for `d7f62e1`](https://github.com/rk29403010/photoStar2/actions/runs/34572434832).
- [Descreen diagnostic run for `d7f62e1`](https://github.com/rk29403010/photoStar2/actions/runs/34572434819): green.
- WP10c implementation checkpoint: `a131601794f6b27f68b5028394a0503f90b7d474`.
- WP10c completion gate: **GREEN / WP10c COMPLETE**.
- [Canonical green quality-gate run for `a131601`](https://github.com/rk29403010/photoStar2/actions/runs/34593962456).
- WP10d regression checkpoint: `756f7a9884220413f2d4c45a4bf511da4159d3bf`.
- WP10d completion gate: **GREEN / WP10d COMPLETE**.
- [Canonical green quality-gate run for `756f7a9`](https://github.com/rk29403010/photoStar2/actions/runs/34594221168).
- WP4 predicate-registry prerequisite checkpoint: `e3f074a6abbc8a5e9895c0db574dd633b512b731`.
- WP4 predicate-registry prerequisite gate: **GREEN**.
- [Canonical green quality-gate run for `e3f074a6`](https://github.com/rk29403010/photoStar2/actions/runs/34599873989).
- WP10e completion checkpoint: `879eb5bca104105995bbec7f5e8e96d186413944`.
- WP10e completion gate: **GREEN / WP10e COMPLETE**.
- [Canonical green quality-gate run for `879eb5b`](https://github.com/rk29403010/photoStar2/actions/runs/34600759748).
- WP10f implementation checkpoint: `0b12d654c4dd6a0f5c24a96cf567e11d8ce91eac`.
- WP10f completion gate: **GREEN / WP10f COMPLETE**.
- [Canonical green quality-gate run for `0b12d65`](https://github.com/rk29403010/photoStar2/actions/runs/34601385219).
- WP10g implementation checkpoint: `0223f5cff4d987f5c8a7be198cbb5cf0dc3ab871`.
- WP10g completion gate: **GREEN / WP10g COMPLETE**.
- [Canonical green quality-gate run for `0223f5c`](https://github.com/rk29403010/photoStar2/actions/runs/34603414830), including affected UI boot smoke.
- Current package: **WP10h — contract durable `face_index` dependencies**.

WP9's repository-defined completion gate remains satisfied. PostgreSQL is not part of the WP9 gate or PhotoStar2's current runtime persistence stack; the project uses SQLite (`better-sqlite3`). Do not add a PostgreSQL validation requirement unless the architecture is explicitly changed later.

---

## 3. Current work package

### WP10h — contract durable `face_index` dependencies

**State: IN PROGRESS.**

WP10g is closed at green head `0223f5cff4d987f5c8a7be198cbb5cf0dc3ab871`, canonical run `34603414830`.

### WP10g closure evidence

- People detail assignment payloads expose stable `face_id` and `visual_region_id`.
- Approve, reject and unmatch/isolate UI actions send stable `faceId`; the backend resolves any remaining detector position only inside the compatibility projection boundary.
- Runtime `isolateFace` wiring now accepts `faceId` rather than `assetId + faceIndex`.
- General asset and `AssetUpdated` face payloads carry stable `visual_region_id` and bind People through that region when stable mask identity is available.
- Existing `face_assignments.face_index` remains an internal rebuildable detector-order compatibility projection for the later WP10h contraction; no new durable human truth is keyed by it.
- `tests/core/wp10g-stable-people-actions.test.cjs` proves direct stable-Face semantic action persistence.
- `tests/core/asset-payload-model.test.cjs` characterizes stable VisualRegion identity in normal face/person payload assembly.
- Canonical quality-gate run `34603414830` is green and its affected UI boot smoke passed at an isolated browser runtime.
- Human visual interaction was not available from this remote GitHub session; that absence is recorded in the acceptance matrix rather than inferred as passed.

### Exact next action

Run the WP10h repository search/inventory against current HEAD, classify every remaining `face_index` use as ephemeral detector ordering, rebuildable compatibility projection or obsolete durable storage, then remove only the obsolete durable/manual/reset dependencies whose replacement coverage is green. Do not remove positional detector ordering that remains legitimately ephemeral.

---

## 4. Phase 1 WP status

This table is a navigation snapshot, not a substitute for each WP completion gate.

| WP | State | Notes |
| --- | --- | --- |
| WP1 | Largely complete | ADR/foundation work exists; reconcile at final closeout. |
| WP2 | Largely complete | Characterization expanded during grouping migration; later face/People work must refresh relevant fixtures. |
| WP3 | Largely complete | Migration ledger + semantic kernel established; final durability closeout remains WP15. |
| WP4 | **Complete for current Phase 1 slice** | Initial exercised predicates are manifest-owned; deterministic generated-registry checks and persisted definition snapshots are green at `e3f074a6`. |
| WP5 | Complete for current Phase 1 slice | Exact-duplicate shadow/replacement path established. |
| WP6 | Substantially complete | Similarity/CaptureSequence/presentation preference path established; later generation provenance intersects WP11. |
| WP7 | Substantially complete | Server-side presentation/expansion path established; final scale evidence is WP16. |
| WP8 | Substantially complete | Editor group dependency replaced by semantic/editor lineage path; Photograph closeout intersects WP14. |
| WP9 | **Complete** | Grouping/gallery/editor parity gate is green with legacy group tables absent at `5469dcc`; canonical run `34550734260`. |
| WP10 | **In progress** | WP10a-WP10g are complete; WP10h final durable `face_index` contraction/search gate is in progress. |
| WP11 | Not started | Machine generations + feature vectors. Split into WP11a-WP11e. |
| WP12 | Not started | IdentityCluster/Person lifecycle/weak candidates. Split into WP12a-WP12g. |
| WP13 | Not started | Contributor testimony/uncertainty/review. Split into WP13a-WP13e. |
| WP14 | **Partially implemented ahead of sequence** | Minimal Photograph/editor representation semantics exist from WP8 work; must be audited and completed through WP14a-WP14e rather than assumed complete. |
| WP15 | Mostly not started | Some transitional reset behavior exists; cross-domain durability hardening remains. Split into WP15a-WP15f. |
| WP16 | Not started | Scale/runtime/automated functional/manual visual acceptance. Split into WP16a-WP16g. |

### Why WP10-WP16 are split

WP9 combined too many independently risky concerns: consumer cutover, behavioural parity, selection semantics, bulk actions, timeline interaction, filmstrip/member navigation, stale-test migration, search gates and final schema contraction. That made failures harder to localize and handoff state harder to preserve.

For WP10 onward, each sub-WP has its own gate and status-file update. Large implementation chunks should not silently roll multiple sub-WPs together unless the combined change remains independently reviewable and all intermediate acceptance obligations are still recorded.

---

## 5. Deferred / revisit ledger

Each entry stays here until its completion criterion is satisfied or it is explicitly superseded.

### Resolved by WP9 close-out

- **Final legacy group schema contraction:** resolved. Legacy compatibility tables are no longer recreated, the compatibility schema is removed, stale legacy-dependent test assumptions were migrated/retired, and the WP9 search/parity/canonical QA gate is green at `5469dcc` / run `34550734260`.

### Active deferred items

| WP | Item | Current state / reason | Completion criterion |
| --- | --- | --- | --- |
| WP4/WP10 | Predicate registry prerequisite | Resolved at `e3f074a6`; active authoring uses generated manifest ownership and persisted definition snapshots retain unavailable definitions. | **Resolved.** |
| WP16 | Intentional skipped-test audit | WP9's required parity/canonical gate is green. Any remaining intentional skips are not assumed resolved merely because WP9 closed. | Before final Phase 1 acceptance, every remaining skip has an explicit current reason/WP or is removed/replaced by active coverage. |
| WP10 | Durable `(asset_id, face_index)` identity | WP10b now provides stable Face/VisualRegion persistence, but transitional People/manual/reset paths still use face indexes until the later cutovers. | WP10h search gate: no durable manual action or reset-preservation path depends on `face_index`. |
| WP10/WP15 | Soft-reset face preservation by path + face index | New manual truth is stable-ID semantic state. WP10f adds typed Face/VisualRegion reset preservation; legacy rows remain only for pre-cutover compatibility until contraction. | WP10f stable reset/reimport gate green; remove obsolete legacy snapshot/storage only when WP10h replacement/search coverage is green. |
| WP11 | Analysis-generation provenance/vector lifecycle | WP10b records detector result provenance for Region geometry, but the broader analysis/vector ownership model still predates the target generation contract. | WP11 completion gate green, including failed replacement + retry + compaction tests. |
| WP12 | Machine clustering vs Person lifecycle | Current People implementation still needs explicit IdentityCluster/Person separation. | IdentityCluster rebuild cannot create/delete durable confirmed Person truth; redirects/actions/deep links covered. |
| WP13 | Contributor uncertainty/testimony UI | Kernel groundwork exists but full attributed uncertainty/review workflow is ahead. | WP13 completion gate green with unknown != negative evidence and append-only testimony history. |
| WP14 | Early Photograph semantics from editor work | Some membership/archive-representation behavior landed ahead of WP14; scope/completeness has not been audited against WP14a-e. | Every WP14 sub-gate demonstrated; no speculative Artefact schema introduced. |
| WP15 | Cross-domain durability/reset matrix | Existing reset behavior is partly legacy/transitional. | Explicit matrix plus executable tests for every reset class; no normal rebuild silently destroys durable human work. |
| WP16 | Real UI/manual acceptance at representative scale | Automated tests exist, but a complete current Phase 1 manual acceptance record is not yet present. | WP16e/f/g gates green with matrix below complete and final `qa:merge` green. |

---

## 6. UI / functional acceptance matrix

Maintain this table continuously. `Not recorded` means exactly that; do not infer a working UI merely from unit/integration coverage.

| Journey | Automated evidence | Manual/visual evidence | Current status / next obligation |
| --- | --- | --- | --- |
| Fresh DB opens/migrates | WP10b stable Region/Face migration and canonical core suite are green at `d7f62e1` | Not recorded at current head | Automated WP10b obligation satisfied; retain manual smoke for later acceptance. |
| Representative ingest -> Library opens/renders | Existing core/integration coverage included in green canonical gate | Not recorded here | Record manual smoke when next exercising the Library; repeat when later WPs affect ingest/library. |
| Library paging/scrolling/collapse | Presentation paging tests exist | Not recorded here | Record manual journey by WP16; earlier if touched. |
| Select single photo | Presentation-native selection tests are green at WP9 close-out | Not recorded here | Manual/visual verification remains an acceptance obligation, not a WP9 blocker. |
| Range/drag/timeline selection | Selection/timeline tests adapted and green at WP9 close-out | Not recorded here | Manual/visual verification remains an acceptance obligation, not a WP9 blocker. |
| Select collapsed presentation/stack | Presentation-native selection tests exist | Not recorded here | Confirm selected tile count vs underlying bulk asset IDs during manual acceptance. |
| Bulk action expands correct underlying assets | Presentation-native bulk-selection tests exist | Not recorded here | Verify representative + hidden members during manual acceptance. |
| Presentation filmstrip/member expansion | Replacement contract/wiring tests exist | Not recorded here | Manual expand/navigation still to be recorded. |
| Open editor -> save/render -> return to Library | WP10b verifies editor mask snapshots remain separate; existing editor characterization/semantic-lineage tests remain green | Not recorded here | Manual journey by WP14/WP16; repeat on editor-affecting changes. |
| People view loads | WP10g canonical run `34603414830` includes a green affected UI boot smoke; People payload/action contract tests are green | Human visual interaction not available in the remote GitHub session | Stable-ID consumer wiring is green; retain full manual visual journey for WP16 acceptance. |
| Rename/merge/isolate/approve/reject person/face | WP10e stable semantic decisions + WP10g stable `faceId` UI/action wiring and core contract tests are green at `0223f5c` | Human visual interaction not available in the remote GitHub session | Stable Face identity cutover is automated/boot-smoke green; Person lifecycle/redirect semantics remain WP12. |
| Old Person/deep link survives merge redirect | Not implemented on target model | Not applicable yet | WP12c/f. |
| Uncertain testimony choices | Not implemented end to end | Not applicable yet | WP13b-d. |
| Loading/empty/error/retry states for new review UI | Not implemented end to end | Not applicable yet | WP13d and WP16e/f. |
| Restart/rebuild preserves durable manual state | WP10f stable Face/VisualRegion reset/reimport preservation is green at `0b12d65` | Not recorded on final target model | Cross-domain durability evidence remains WP15. |
| Representative large-library soak | Not yet final | Not yet | WP16a-f. |

Minimum manual smoke sequence for a significant user-facing checkpoint:

1. fresh DB;
2. ingest a representative mini-library;
3. open Library and inspect rendering/paging;
4. single/range/presentation/timeline selection;
5. bulk action over a collapsed presentation and verify underlying assets;
6. presentation filmstrip/member navigation;
7. editor open/save/return;
8. People view and affected People actions;
9. restart/rebuild when durability is affected;
10. inspect loading/empty/error/retry states for newly changed UI.

Record exceptions honestly when a later WP is required before a journey can be exercised.

---

## 7. Significant implementation decisions / deviations / lessons

### WP10c reconciliation cutover rule

Detector reruns now reconcile against stable VisualRegion geometry before persisting the new generation. Clear compatible matches reuse the existing Face/VisualRegion IDs; ambiguous matches fail safe, and removed detections are tombstoned without deleting history. This changes only stable detector identity ownership: durable People/manual actions remain on their transitional paths until WP10e-WP10g.

The initial `onnx_retina_10g` reconciliation policy is versioned and provider/model-specific. WP10d regression fixtures are the required evidence before treating its overlap/drift/ambiguity behaviour as closed.

### WP10b additive-coexistence rule

WP10b deliberately shadow-persists stable VisualRegion/Face identity while preserving the current detector result, positional mask IDs, events and `face_index` consumers. The detector result ID is a legitimate current source-analysis-generation identifier for geometry provenance. Stable identity reuse across a later detector run is not inferred from order or proximity in WP10b; deterministic reconciliation belongs to WP10c.

`PhotoMaskMetadata` remains the canonical analysis-mask metadata surface. A mask item may carry an optional `visualRegionId` under schema version 1 because existing readers are structurally tolerant and the additive field does not change the meaning of existing required fields. Editor-document mask snapshots remain intentionally separate.

### WP10a dependency-inventory rule

Do not treat a filename allowlist as sufficient evidence for the stable-face cutover. WP10a's final guard freezes the reviewed trimmed `face_index` statements and their maximum current multiplicity across maintained source. Newly exposed payload paths were individually inspected and classified before being admitted to the inventory. Reset/rerun and camel-case payload dependencies that a literal snake-case scan cannot prove remain explicit cutover targets in the WP10 contract document.

### WP9 execution-granularity lesson

The original WP9 boundary was too large operationally even though its architecture was coherent. The implementation plan now splits WP10-WP16 into smaller gated sub-WPs. This is an execution refinement, not a change to the target semantic architecture.

### Group replacement principle retained

Do not restore legacy group-table reads/writes merely to make old storage-layout tests pass. Preserve accepted behavior through presentation/relationship-native structures and retire obsolete structural assertions once replacement coverage exists.

### Exact-duplicate eligibility correction

Exact file-hash duplicates must not disappear merely because one Asset lacks visual-feature rows. Group-free eligible-asset loading was adapted so exact-copy evidence can exist independently of pHash/dHash availability.

### Burst transitivity correction

When exact/near/variant units collapse, burst matching must retain member-level timing evidence so an underlying sequence such as 0s -> 2s -> 4s can preserve the transitive bridge even if representatives alone would not.

### Selection semantics

Library selection now treats visible presentation items as selected units while bulk operations use the union of all underlying Asset IDs. Do not regress to reconstructing selection membership from legacy `Asset.group_id`.

### Migration-ledger contraction rule

Do not modify already-applied checksummed migration history simply to perform a later contraction. Existing development databases may have recorded an earlier migration and then had compatibility tables recreated; a new forward migration is the correct mechanism for the final post-compatibility drop. WP9's green contraction gate demonstrates that route at `5469dcc`.

### Persistence/gate clarification

PhotoStar2's current runtime persistence is SQLite via `better-sqlite3`. WP9's implementation plan does not require PostgreSQL validation. Do not invent an additional PostgreSQL completion gate from generic database expectations or stale assumptions.

---

## 8. Mandatory fresh-chat / new-agent bootstrap

Every new WP chat/session must begin from repository state, not from an assumed summary of the previous chat.

Required bootstrap sequence:

1. Read `docs/architecture/semantic-relationships-architecture.md`.
2. Read `docs/architecture/semantic-relationships-implementation-plan.md`.
3. Read `docs/architecture/semantic-relationships-phase1-foundation.md`.
4. Read **this file in full**.
5. Verify the actual checkout/branch is `task/semantic-relationships-phase1-foundation` unless this document explicitly records a later integration branch.
6. Fetch the actual branch HEAD; do not assume the SHA recorded here is still HEAD.
7. Check the latest canonical Actions/QA result for that HEAD.
8. Read the current WP/sub-WP, blocker, deferred ledger and UI acceptance obligations.
9. Inspect the relevant current code/tests before implementing; do not trust old chat descriptions over repository contents.
10. Continue from the recorded **Exact next action** or first incomplete sub-WP gate.
11. Never infer completion because commits exist. Run/verify the required gate and then update this file.
