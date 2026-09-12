# PhotoStar2 Semantic Relationships — Implementation Status and Handoff

**Purpose:** repository-resident execution state for the Phase 1 semantic-relationships refactor.  
**Authority:** companion to `semantic-relationships-architecture.md` and `semantic-relationships-implementation-plan.md`.  
**Rule:** repository HEAD + canonical QA outrank chat history, model memory, and commit existence.

## 1. Maintenance contract

Update this file after every completed sub-WP, blocker, meaningful deviation, deferred item, canonical QA state change, or user-visible acceptance run. A package is complete only when its implementation-plan gate is demonstrated.

## 2. Repository state

- Repository: `rk29403010/photoStar2`
- Active branch: `task/semantic-relationships-phase1-foundation`
- Pull request: `#42`
- Last material implementation HEAD assessed: `5c720a6547819be737de3733d57db740abb77d04`
- Canonical quality gate: **GREEN**, run `34686873656`, job `103535276383`
- Current package: **WP12d — Existing People action semantics and durable metadata**

Before working, fetch actual branch HEAD and Actions state rather than assuming this snapshot is still current.

## 3. Recent package evidence

- WP9 complete at `5469dcc`; canonical run `34550734260`.
- WP10 complete: stable VisualRegion/Face identity, reconciliation, stable-ID People actions/reset preservation, and durable `face_index` contraction. The frozen WP10 transitional inventory remains an active regression guard.
- WP11 complete: generation ownership/provenance, Float32 vector storage, ArcFace cutover, generation-aware retrieval, retry/supersession and retention/compaction. Final WP11 implementation `546e155`; canonical run `34683370717`.
- WP12a complete: IdentityCluster machine-output separation (`199fa2d`, compatibility fix `c1e85be`); canonical run `34684403167`. Machine clustering persists independently in `identity_clusters` / `identity_cluster_members` keyed by stable Face ID; rebuilds no longer delete People.
- WP12b complete: stable cluster reconciliation (`3a57c80`, fixture lint fix `81f0ab9`); canonical run `34684761693`. Mutual unique-best stable-Face overlap preserves machine cluster continuity; clear split/merge has at most one continuation; ties fail safe with fresh IDs.
- WP12c complete: Person lifecycle/redirect model (`453f11b`, WP10 inventory-preserving fix `5c720a6`); canonical run `34686873656`. `people.lifecycle_status` supports `provisional|confirmed|merged|retired`; `person_redirects` permanently maps historical IDs; redirect cycles are rejected; merges retain old Person rows as `merged` instead of deleting them; current lookups/actions resolve redirects; human actions confirm People; confirmed Person truth survives IdentityCluster replacement.

PhotoStar2 runtime persistence is SQLite via `better-sqlite3`. Do not invent PostgreSQL as a completion requirement.

## 4. Current work package — WP12d

### Goal

Reimplement/preserve existing People semantics and durable metadata across the new Person/IdentityCluster separation:

- rename;
- merge;
- isolate/split;
- approve;
- reject;
- GEDCOM linkage;
- birth/death metadata;
- thumbnail selection;
- deep links.

If candidate generation requires it, multiple trusted Person↔Face anchors may be persisted without implementing the later Lifetime Identity UI.

### Gate

Characterization tests for existing actions/metadata pass against Person/IdentityCluster separation.

### Exact next action

1. Inventory all People commands, metadata writers/readers, GEDCOM links, thumbnails and deep-link/person-filter entry points.
2. Identify paths still assuming machine cluster == Person or failing to resolve historical Person redirects.
3. Add characterization tests first for rename/merge/isolate/approve/reject and durable metadata/links.
4. Adapt only the failing semantics to current-Person resolution while preserving historical IDs and existing UI payloads.
5. Prove thumbnail/GEDCOM/birth/death metadata survive merge/redirect as intended.
6. Satisfy the WP12d gate before advancing to WP12e weak-candidate retention/threshold separation.

Do not widen WP12d into candidate-threshold redesign or People UI redesign; those are WP12e/f.

## 5. Phase 1 status

| WP | State | Notes |
| --- | --- | --- |
| WP1 | Largely complete | Foundation/ADR work; reconcile final closeout. |
| WP2 | Largely complete | Characterization exists; refresh affected fixtures as needed. |
| WP3 | Largely complete | Migration ledger + semantic kernel established; final durability work remains WP15. |
| WP4 | Complete for Phase 1 slice | Manifest-owned predicates/generated registry green. |
| WP5 | Complete for Phase 1 slice | Exact-duplicate replacement path established. |
| WP6 | Substantially complete | Similarity/CaptureSequence/presentation preference established. |
| WP7 | Substantially complete | Presentation/expansion path established; final scale evidence WP16. |
| WP8 | Substantially complete | Editor group dependency replaced; Photograph closeout intersects WP14. |
| WP9 | **Complete** | Legacy grouping tables absent; parity gate green. |
| WP10 | **Complete** | Stable Face/VisualRegion identity and durable action/reset cutover green. |
| WP11 | **Complete** | Machine-generation/vector lifecycle green. |
| WP12 | **In progress** | WP12a-c complete; WP12d is current. |
| WP13 | Not started | Contributor testimony/uncertainty/review. |
| WP14 | Partially implemented ahead of sequence | Minimal Photograph/editor semantics exist; full audit remains. |
| WP15 | Mostly not started | Cross-domain durability/reset hardening. |
| WP16 | Not started | Scale/runtime/automated functional/manual visual acceptance. |

## 6. Deferred / revisit ledger

| WP | Item | Current state | Completion criterion |
| --- | --- | --- | --- |
| WP10 | Durable `(asset_id, face_index)` identity | Durable semantics moved to stable Face/VisualRegion; detector position remains transitional projection. | Resolved for WP10; do not widen frozen inventory. |
| WP10/WP15 | Soft-reset preservation | Face slice green; broader domains remain. | WP15 matrix proves all reset classes. |
| WP11/WP16 | Vector lookup performance | 250k×512 native SQLite/BLOB benchmark p95 2334.8 ms vs 150 ms target; heap growth ~3.1 MiB. | Indexed retrieval implemented/measured without weakening generation semantics. |
| WP12 | Person/IdentityCluster separation | Storage, machine reconciliation and lifecycle/redirect are green; action/metadata/candidate/UI closeout remains. | Full WP12 completion gate. |
| WP13 | Contributor testimony/uncertainty | Not yet implemented end-to-end. | WP13 gate. |
| WP14 | Photograph semantics | Early editor semantics landed ahead of package. | All WP14 sub-gates. |
| WP15 | Cross-domain durability | Transitional behavior remains outside face slice. | Explicit durability/reset matrix + tests. |
| WP16 | Skips/manual acceptance/scale | Final audit not yet done. | WP16 acceptance matrix + final `qa:merge`. |

## 7. Functional acceptance obligations

| Journey | Automated evidence | Manual/visual evidence | Remaining obligation |
| --- | --- | --- | --- |
| Fresh DB/migrations | WP10-12 migrations exercised in canonical suite | Not recorded | Final smoke WP16. |
| Library/group/editor parity | WP9/editor suites green | Not recorded | Manual WP14/WP16. |
| People view loads | WP10 UI boot/payload tests + WP11/12 core tests | Not recorded | Continue WP12 semantics/UI. |
| Rename/merge/isolate/approve/reject | Stable Face action tests + WP12c redirect/lifecycle tests | Not recorded | WP12d characterization/parity. |
| Old Person ID/deep link survives merge | Redirect model exists | Not recorded | WP12d/f end-to-end coverage. |
| Restart/rebuild preserves manual Person truth | WP10 reset + WP11 generation + WP12a-c preservation evidence | Not recorded | WP12g + WP15. |
| Large-library performance | WP11d vector benchmark only | Not recorded | WP16 soak/index follow-up. |

## 8. Significant decisions

### IdentityCluster versus Person

IdentityCluster is rebuildable machine analysis, not a semantic Person. Cluster IDs may be reconciled for useful continuity but never define historical human identity. Person has independent durable lifecycle and permanent redirects.

### Person lifecycle and redirects

- `provisional`: machine-created compatibility Person not yet human-confirmed.
- `confirmed`: durable human Person truth.
- `merged`: historical Person retained with redirect to a current Person.
- `retired`: durable inactive Person that is not merged.
- Redirect resolution is permanent and cycle-safe; old IDs must remain resolvable rather than being reused/deleted.

### Frozen WP10 inventory

The WP10 repository test intentionally freezes remaining transitional `face_index` statements. Later work must not casually alter/add those statements. If semantics can be changed while preserving the frozen statement shape, do that; otherwise any inventory change requires explicit review and contraction evidence.

### Migration rule

Numbered migrations are append-only/checksummed. Never rewrite an applied migration to implement later contraction.

## 9. Fresh-chat bootstrap

1. Read root `AGENTS.md` from the active branch.
2. Read `docs/ai/AI_PROJECT_MAP.md`.
3. Read `semantic-relationships-architecture.md`.
4. Read `semantic-relationships-implementation-plan.md`.
5. Read `semantic-relationships-phase1-foundation.md` and this file.
6. Verify actual branch HEAD and current canonical Actions result.
7. Inspect current WP code/tests; repository evidence outranks chat history.
8. Continue from **Exact next action** / first incomplete sub-WP gate.
9. Never infer completion merely because commits exist; demonstrate the gate, then update this file.
