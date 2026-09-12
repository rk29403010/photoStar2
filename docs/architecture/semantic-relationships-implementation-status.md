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
- Last material implementation HEAD assessed: `5d0c158580a5fdf2aef0fab5624e891001f072ec`
- Canonical quality gate: **GREEN**, run `34687156154`, job `103536030029`
- Current package: **WP12e — Weak candidates and threshold separation**

Before working, fetch actual branch HEAD and Actions state rather than assuming this snapshot is current.

## 3. Recent package evidence

- WP9 complete at `5469dcc`; canonical run `34550734260`.
- WP10 complete: stable VisualRegion/Face identity, reconciliation, stable-ID People actions/reset preservation, and durable `face_index` contraction. The frozen WP10 transitional inventory remains an active regression guard.
- WP11 complete: machine generation/vector lifecycle through `546e155`; canonical run `34683370717`. Target-tier native vector scan remains a WP16 performance follow-up (250k×512 p95 2334.8 ms vs 150 ms target; bounded heap growth).
- WP12a complete: IdentityCluster machine-output separation (`199fa2d`, compatibility fix `c1e85be`); canonical run `34684403167`.
- WP12b complete: stable IdentityCluster reconciliation (`3a57c80`, fixture lint fix `81f0ab9`); canonical run `34684761693`.
- WP12c complete: Person lifecycle/redirect model (`453f11b`, WP10 inventory-preserving fix `5c720a6`); canonical run `34686873656`.
- WP12d complete: redirect-aware durable metadata/navigation (`5d0c158`); canonical run `34687156154`. Merge keeps canonical birth/death/thumbnail metadata and fills only missing values from merged People, copies GEDCOM links to the canonical Person while retaining historical rows, GEDCOM link/unlink/list resolves old IDs, and person gallery filters follow redirect chains. Existing WP10e/g tests cover stable Face manual actions; WP12c covers command-level merge/old-ID lifecycle; WP12d characterization covers the metadata/deep-link gaps.

PhotoStar2 runtime persistence is SQLite via `better-sqlite3`. Do not invent PostgreSQL as a completion requirement.

## 4. Current work package — WP12e

### Goal

Retain weak Person/Face candidate evidence instead of collapsing recognition to one threshold. Preserve top-N, raw cosine, rank, runner-up, winner margin and model/generation provenance. Separate evidence-retention, review, auto-action, minimum-margin and candidate-count settings. Manual rejection/acceptance must remain durable explicit decisions, not be inferred from a score threshold.

### Gate

Evidence below action threshold is retained where policy requires and rejection/acceptance cannot be inferred from a single threshold.

### Exact next action

1. Inventory current candidate/threshold behaviour and generation metadata available from active face vectors.
2. Add minimal rebuildable weak-candidate persistence linked to stable Face, durable Person and real analysis generation provenance.
3. Generate top-N Person candidates from trusted Face→Person evidence/anchors; preserve raw cosine/rank/runner-up/margin.
4. Introduce separately named/configurable retention, review, auto-action, margin and count policy values; remove the hard-coded single-threshold assumption from new candidate semantics.
5. Keep current durable accepted/rejected semantic decisions authoritative and visible alongside candidate evidence; do not let reruns turn score changes into human decisions.
6. Add policy + persistence/integration fixtures and satisfy WP12e before WP12f People UI/deep-link candidate cutover.

Do not redesign the People UI in WP12e; WP12f owns presentation/calibration wording and candidate UI cutover.

## 5. Phase 1 status

| WP | State | Notes |
| --- | --- | --- |
| WP1-3 | Largely complete | Foundation/kernel/migration work; final reconciliation/durability closeout remains. |
| WP4-5 | Complete for Phase 1 slice | Predicate registry and exact-duplicate replacement green. |
| WP6-8 | Substantially complete | Similarity/presentation/editor replacement established; later closeouts remain. |
| WP9 | **Complete** | Legacy grouping tables absent; parity gate green. |
| WP10 | **Complete** | Stable Face/VisualRegion identity and durable action/reset cutover green. |
| WP11 | **Complete** | Machine-generation/vector lifecycle green. |
| WP12 | **In progress** | WP12a-d complete; WP12e current. |
| WP13 | Not started | Contributor testimony/uncertainty/review. |
| WP14 | Partially implemented ahead of sequence | Minimal Photograph/editor semantics exist; full audit remains. |
| WP15 | Mostly not started | Cross-domain durability/reset hardening. |
| WP16 | Not started | Scale/runtime/automated functional/manual visual acceptance. |

## 6. Deferred / revisit ledger

| WP | Item | Current state | Completion criterion |
| --- | --- | --- | --- |
| WP10 | Transitional `face_index` projection | Durable semantics use stable Face/VisualRegion; frozen inventory guards remaining adapter statements. | Do not widen; later contraction only with explicit evidence. |
| WP10/WP15 | Soft-reset preservation | Face slice green; broader domains remain. | WP15 durability matrix. |
| WP11/WP16 | Vector lookup performance | Native scan misses 150 ms target substantially. | Indexed retrieval implemented/measured without weakening generation semantics. |
| WP12 | Person/IdentityCluster separation | Storage, cluster reconciliation, lifecycle/redirect and existing metadata/action parity green; weak candidate/UI/rerun closeout remains. | Full WP12 completion gate. |
| WP13 | Contributor testimony/uncertainty | Not yet implemented end-to-end. | WP13 gate. |
| WP14 | Photograph semantics | Early editor semantics landed ahead of package. | All WP14 sub-gates. |
| WP15 | Cross-domain durability | Transitional behavior remains outside face slice. | Explicit durability/reset matrix + tests. |
| WP16 | Skips/manual acceptance/scale | Final audit not yet done. | WP16 acceptance matrix + final `qa:merge`. |

## 7. Functional acceptance obligations

| Journey | Automated evidence | Remaining obligation |
| --- | --- | --- |
| Fresh DB/migrations | WP10-12 migrations exercised in canonical suite | Final manual smoke WP16. |
| Library/group/editor parity | WP9/editor suites green | Manual WP14/WP16. |
| People actions | WP10e/g stable-ID actions + WP12c redirect lifecycle + WP12d metadata/deep-link parity | Candidate semantics/UI WP12e/f. |
| Old Person ID survives merge | Redirect, GEDCOM and gallery-filter coverage green | UI old-link journey WP12f. |
| Restart/rebuild preserves manual Person truth | WP10 reset + WP11 generation + WP12a-d evidence | WP12g + WP15. |
| Large-library performance | WP11d vector benchmark only | WP16 soak/index follow-up. |

## 8. Significant decisions

- IdentityCluster is rebuildable machine analysis, never historical Person identity.
- Person lifecycle is durable (`provisional|confirmed|merged|retired`); redirects are permanent and cycle-safe.
- Merge metadata policy is non-destructive: canonical values win; only missing birth/death/thumbnail values are filled; GEDCOM links are projected to the canonical Person while historical rows remain.
- WP10's frozen `face_index` inventory must not be widened casually.
- Numbered migrations are append-only/checksummed; never rewrite applied migration history.

## 9. Fresh-chat bootstrap

1. Read root `AGENTS.md` from the active branch.
2. Read `docs/ai/AI_PROJECT_MAP.md` and this status file.
3. Read only the directly relevant architecture/implementation-plan section for the current WP.
4. Verify actual branch HEAD and canonical Actions result.
5. Inspect current WP code/tests; repository evidence outranks chat history.
6. Continue from **Exact next action** / first incomplete sub-WP gate.
7. Demonstrate the gate before recording completion.
