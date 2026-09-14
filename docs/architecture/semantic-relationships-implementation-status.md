# PhotoStar2 Semantic Relationships — Implementation Status and Handoff

**Purpose:** repository-resident execution state for the Phase 1 semantic-relationships refactor.  
**Authority:** companion to `semantic-relationships-architecture.md` and `semantic-relationships-implementation-plan.md`.  
**Rule:** repository HEAD + canonical QA outrank chat history, model memory, and commit existence.

## 1. Repository state

- Repository: `rk29403010/photoStar2`
- Branch: `task/semantic-relationships-phase1-foundation`
- Pull request: `#42`
- Last integrated WP15 checkpoint: `06d7c443c10d0e29a377456863d32a9e23666957`
- Canonical local merge gate: **GREEN** at `06d7c44` — 392 passed, 1 skipped core tests and affected UI smoke passed.
- Published PR head: `06d7c44`; remote quality-gate/benchmark/CodeQL are in progress as of 2026-09-13.
- Current package: **WP16g — Final gates, publication, and reconciliation**

Always verify actual HEAD/Actions before continuing.

## 2. Recent evidence

- WP9 complete: legacy grouping tables removed; canonical run `34550734260`.
- WP10 complete: stable VisualRegion/Face identity, reconciliation, stable-ID People actions/reset preservation and durable `face_index` contraction. Frozen WP10 transitional statement inventory remains a regression guard.
- WP11 complete through `546e155`; canonical run `34683370717`. Native vector scan performance remains deferred to WP16 (250k×512 p95 2334.8 ms vs 150 ms target; bounded heap growth).
- WP12a complete: IdentityCluster storage/separation; canonical run `34684403167`.
- WP12b complete: deterministic stable cluster reconciliation; canonical run `34684761693`.
- WP12c complete: Person lifecycle (`provisional|confirmed|merged|retired`) and permanent cycle-safe redirects; canonical run `34686873656`.
- WP12d complete: redirect-aware action/metadata/navigation parity; canonical run `34687156154`.
- WP12e complete: weak Face→Person candidate evidence; canonical run `34687663108`. `face_person_candidates` retains top-N raw cosine/rank/runner-up/margin plus real model/preprocessing/generation provenance. Candidate policy separates retention/review/auto-action/minimum-margin/count. Trusted anchors are explicit accepted Face→Person decisions, not machine cluster centroids.
- WP12f complete: People candidate review reads `face_person_candidates`; candidate approve/reject carries stable Face ID + durable Person ID; raw cosine is labelled `Similarity 0.xx`, never a probability percentage. Canonical run `34690912171`.
- WP12g complete: rerun fixtures prove confirmed Person lifecycle survives machine IdentityCluster disappearance/rebuild and candidate recomputation restores durable rejection rather than resurrecting acceptance. Runtime audit confirmed machine projection rebuild is followed by durable manual semantic projection, and no evidence-backed production rewrite was required. Final WP12 contract/project-map gate passed canonical run `34691265488`.
- WP13a complete: local Contributor profiles support explicit selection; new attestations and decisions retain durable Contributor entity attribution while pre-WP13 null attribution remains readable.
- WP13b complete: all specified identity review responses normalize into attributed responses, propositions and attestations without turning unknown/recognise/abstain into negative evidence.
- WP13c complete: competing attributed testimony remains side-by-side; disputed/deferred/accepted decisions supersede append-only. Decision history ordering follows the supersession chain rather than second-resolution timestamps and random UUIDs. Canonical run `34696835803`.
- WP13d implementation canonical-green: People candidate cards expose all WP13b response kinds with named ambiguous candidates; the command path records normalized attributed responses and preserves accepted/rejected projection behaviour. The review region declares inline loading/error/success/retry feedback and a local error boundary. Targeted WP12f/WP13a-d tests pass and canonical run `34698288634` (job `103565454011`) is green; runtime/manual acceptance remains outstanding.
- WP14 complete through a-e: whole-Asset and VisualRegion Photograph membership now resolve through `photographMembershipRepository.ts`; exact copies inherit unique Photograph membership without legacy groups; disputed evidence is not guessed; restoration/crop/ordinary edit lineage preserves Photograph identity while explicit authored composites create a stable new Photograph. `photo_edit_documents` remains authoritative for edit recipes and branch lineage. PR `#43` merged at `43208c04ef1edabe268a8adc61ea28f8faf319ab`; post-merge canonical run `34699825589` (job `103569488019`) is green.
- WP15 complete at `06d7c44`: authoritative reset matrix, WP13 testimony snapshot, durable library snapshot, replacement-then-swap soft reset recovery, face-analysis reset invalidation, relationship publication rollback, strict legacy migration compatibility, and fingerprint-safe asset binding. `qa:ready` passed (147 UI tests plus UI smoke) and `qa:merge` passed (392 core tests, one intentional skip, plus UI smoke). The checkpoint is published to PR #42; assess Sonar only after it analyzes this head.
- WP16a initial measurement: the repeatable development tier seeded 20k 512-d vectors in 1729.6 ms and measured 1059.5 ms p95 active-vector lookup (0.8 MiB observed heap growth). This misses the 150 ms interaction target before target-tier execution, confirming the existing WP11d index-evaluation blocker rather than a new WP15 regression.
- WP16b complete: the initial 10k-asset exact-copy page measured 291.2 ms p95. Numbered migration `20260913_002_exact_copy_presentation_hash_index` adds the existing query's `assets(file_hash)` access path. A rebuildable exact-copy cache, invalidated by relevant Asset changes and atomically refreshed on the next read, replaces full-table window ranking for normal pages. Numbered migration `20260913_004_exact_copy_presentation_cache_order` indexes cached default chronology: target tier page offset 10,000 measures 18.2 ms p95 for 100k Assets (24.7 MiB SQLite), and stretch tier offset 50,000 measures 62.3 ms p95 for 500k Assets (125.0 MiB SQLite), both below the 150 ms target. Cache materialization remains an explicit rebuild cost (6745.4 ms at stretch). Migration `20260913_005_capture_sequence_presentation_cache` stores the full existing composed capture projection and pages it from SQLite; Asset and CaptureSequence/member changes invalidate it. The real-proposal benchmark measured 0.8 ms p95 at development (10k Assets/2.5k sequences) and 1.2 ms p95 at target (100k Assets/25k sequences); rebuild cost is 1025.6 ms and 11395.1 ms respectively. Lazy range selection now measures 65.4 ms p95 at target (100k visible items) and deferred bulk Asset expansion measures 73.9 ms while preserving legacy selection-state compatibility and photo-before-presentation expansion order. `syncBurstCaptureSequenceProposals` rebuilds the capture projection inside the tracked grouping workflow after a successful proposal replacement; normal reads retain the last successful projection while dirty, so the 11.4-second target rebuild is no longer an interaction-path cost. WP16 acceptance still needs the documented handoff gate and the WP13d runtime obligation.
- WP16c complete with one explicit architecture follow-up: the real candidate-review query measured 6.5 ms p95 at development (20k Faces / 100k candidates) and 57.7 ms p95 at target (250k Faces / 1.25m candidates). Pairwise IdentityCluster reconciliation initially took 66035 ms for 5k four-Face clusters; stable-Face membership indexing reduced it to 79-97 ms, and the 62.5k-cluster target completed in 858.4 ms with 118.7 MiB observed heap growth. Existing reconciliation contract tests remain green. Exact native vector retrieval still misses the interaction target at 2334.8 ms p95 for 250k by 512-d vectors; the Phase 1 decision is to keep current generation semantics and require a measured local vector-index proposal before treating candidate generation as interactive.
- WP16d complete: the consolidated scale matrix records presentation and candidate interaction p95, projection rebuild costs, heap ceilings and SQLite growth. The production compaction path deleted 20k of 60k development vectors in 1508.2 ms and 250k of 750k target vectors in 24754.3 ms while retaining the active generation plus its immediate predecessor. Target heap growth was 0.7 MiB. The 3070.4 MiB target file remained allocated after logical deletion and shrank to 2040.1 MiB after an explicit 40915.8 ms `VACUUM`; compaction and reclamation remain maintenance operations, not interaction paths.
- WP16e complete: an initial full core run exposed a dirty-empty capture presentation cache returning no Assets on fresh databases. Reads now synchronously build only when no last-successful projection exists, while populated dirty caches preserve the deliberate tracked-workflow behavior. The affected library tests passed, followed by the full core suite (394 passed, one intentional skip), all 147 UI tests, and isolated desktop `ui:smoke --force` with a visible root and no browser/runtime errors. The automated acceptance matrix links fresh ingest, library paging/scrolling, selection/bulk expansion, presentation member expansion, editor persistence/rendering, People actions, uncertain testimony and recovery states to executable evidence.
- WP16f complete: 500-iteration target soaks measured 2.3 ms p95 / 0.1 MiB heap drift for warmed 100k-Asset pages and 70.9 ms p95 / 2.8 MiB drift for full 100k-item lazy range selection; Asset expansion remained 61.0 ms. The current branch-owned runtime at web 5913/backend 5914 rendered the library, real fixture preview, single-photo viewer, editor registry, People and restored identity-review candidate. The review showed raw `Similarity 0.81`, all eight certainty responses, named ambiguity and unclipped controls; person details closed without reopening. The one-Asset fixture cannot visually exercise multi-item scrolling, merge or isolation, so those remain backed by the full suites and target fixtures rather than a misleading manual claim.
- WP16g in progress: generated registry checks, `qa:ready`, standalone `ui:smoke --force`, and the code/test portions of `qa:merge` are green at `478fc28`. The final merge command stops at Markdown lint because the pre-existing, user-owned `AGENTS.md` has duplicate blank lines and lacks one final newline. This task will not rewrite that unrelated instruction file; remove those formatting defects, then rerun `qa:merge` at the same or a descendant head before publication.

## 3. Current package — WP16g

### Goal

Run final quality, generated-registry, runtime and integration gates at the exact publication head, then reconcile the status and deferred ledger.

### Gate

`qa:ready` and `qa:merge` pass at the exact head; publication evidence is recorded without claiming remote integration prematurely.

### Exact next action

1. Commit the WP16f benchmark and acceptance checkpoint.
2. Run generated-registry checks, `qa:ready`, `ui:smoke`, and final `qa:merge`.
3. Publish the exact validated head and record remote check / PR state.

## 4. Phase status

| WP | State |
| --- | --- |
| WP1-3 | Largely complete; final reconciliation/durability closeout remains |
| WP4-5 | Complete for Phase 1 slice |
| WP6-8 | Substantially complete; later closeouts remain |
| WP9 | **Complete** |
| WP10 | **Complete** |
| WP11 | **Complete** |
| WP12 | **Complete** |
| WP13 | **Complete — automated, durability and real-runtime acceptance recorded** |
| WP14 | **Complete** |
| WP15 | **Complete — published checkpoint `06d7c44`; remote CI pending** |
| WP16 | **In progress — WP16g current** |

## 5. Deferred ledger

| WP | Item | Completion criterion |
| --- | --- | --- |
| WP10 | Remaining transitional `face_index` adapter statements | Do not widen frozen inventory; later contraction only with explicit proof |
| WP10/WP15 | Broader reset durability | Complete at `06d7c44`; matrix and behavioral fixtures cover reset classes |
| WP11/WP16 | Vector lookup target missed | Implement and measure a local vector-index proposal without weakening generation semantics before candidate generation becomes interactive |
| WP13 | Contributor uncertainty/testimony | Complete: normalized attributed responses, reset/reopen durability and runtime review evidence |
| WP15 | Cross-domain durability | Complete: matrix, targeted fixtures, `qa:ready`, and `qa:merge` passed at `06d7c44` |
| WP16 | Skips/manual acceptance/scale | Acceptance and scale evidence complete; final `qa:merge` pending |

## 6. Functional acceptance obligations

| Journey | Automated evidence | Remaining obligation |
| --- | --- | --- |
| People actions/metadata | WP10e/g + WP12c-g canonical green plus current People runtime | None |
| Old Person ID survives merge | Redirect/GEDCOM/gallery-filter coverage + redirect-aware WP12f candidate commands | None; one-Asset manual fixture limitation recorded |
| Weak candidates | WP12e persistence/policy + WP12f payload/UI characterization and current candidate runtime | None |
| Candidate confidence wording | WP12f characterization plus current `Similarity 0.81` runtime evidence | None |
| Restart/rebuild preserves Person truth | WP10 reset + WP11 generation + WP12g rerun durability fixtures | Broader cross-domain matrix WP15 |
| Contributor attribution/history | WP13a-c domain tests, WP13e reset/reopen durability and runtime response inspection | None |
| Identity uncertainty review | WP13d tests and repository-recorded keyboard/error-recovery evidence plus current visual close/reopen pass | None |
| Photograph membership/edit lineage | WP14a-e membership, exact-copy and photo-edit policy/provenance tests + post-merge canonical run `34699825589` | None for WP14 |
| Final visual/manual acceptance | Recorded in `semantic-relationships-local-acceptance.md` | None |

## 7. Significant decisions

- IdentityCluster is rebuildable machine analysis, never Person identity.
- Person lifecycle and redirects are durable; old Person IDs remain resolvable.
- Trusted candidate anchors are explicit accepted Face→Person decisions. Weak candidate evidence is rebuildable and separate from durable decisions.
- Candidate accept/reject writes durable semantic decisions against stable Face IDs; positional compatibility lookup is not a prerequisite for durable truth.
- Raw cosine is not a calibrated probability and must not be displayed as one.
- Machine reruns may replace machine clusters/candidate projections but cannot delete confirmed Person truth or override durable human rejection.
- Photograph membership has one resolved service path: whole Assets use current Photograph archive representations with exact-copy projection, while VisualRegions use current accepted `represents_photograph` semantic decisions. Unresolved/disputed evidence is preserved rather than guessed.
- Non-destructive restoration, crop and ordinary edits preserve historical Photograph identity; an explicitly authored composite may create a new Photograph. `photo_edit_documents` remains authoritative for edit recipes and branch lineage.
- WP10 frozen `face_index` inventory must not be widened casually.
- Numbered migrations are append-only/checksummed.

## 8. Fresh-chat bootstrap

1. Read root `AGENTS.md`, `docs/ai/AI_PROJECT_MAP.md`, and this file.
2. Read only the directly relevant architecture/implementation-plan section for the current WP.
3. Verify branch HEAD and canonical Actions result.
4. Inspect current WP code/tests; repository evidence outranks chat history.
5. Continue from **Exact next action**; demonstrate the gate before recording completion.
