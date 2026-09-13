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
- Current package: **WP16b — Library/presentation performance**

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
- WP16b: the initial 10k-asset exact-copy page measured 291.2 ms p95. Numbered migration `20260913_002_exact_copy_presentation_hash_index` adds the existing query's `assets(file_hash)` access path. A rebuildable exact-copy cache, invalidated by relevant Asset changes and atomically refreshed on the next read, replaces full-table window ranking for normal pages. Numbered migration `20260913_004_exact_copy_presentation_cache_order` indexes cached default chronology: target tier page offset 10,000 measures 18.2 ms p95 for 100k Assets (24.7 MiB SQLite), and stretch tier offset 50,000 measures 62.3 ms p95 for 500k Assets (125.0 MiB SQLite), both below the 150 ms target. Cache materialization remains an explicit rebuild cost (6745.4 ms at stretch). Capture-sequence expansion and bulk-selection measurements remain open.

## 3. Current package — WP16b

### Goal

Measure existing presentation queries and document the evidence needed for a deliberate indexing or query-shape decision.

### Gate

Presentation paging, expansion and bulk-action paths have representative measurements and an explicit remediation decision for any missed target.

### Exact next action

1. Measure capture-sequence expansion and bulk selection at the same tiers.
2. Diagnose and optimize stretch-tier exact-copy paging without weakening the durable projection contract.
3. Keep the existing WP13d real-runtime acceptance obligation in the WP16 acceptance ledger.

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
| WP13 | **In progress — WP13d current** |
| WP14 | **Complete** |
| WP15 | **Complete — published checkpoint `06d7c44`; remote CI pending** |
| WP16 | **In progress — WP16b current** |

## 5. Deferred ledger

| WP | Item | Completion criterion |
| --- | --- | --- |
| WP10 | Remaining transitional `face_index` adapter statements | Do not widen frozen inventory; later contraction only with explicit proof |
| WP10/WP15 | Broader reset durability | Complete at `06d7c44`; matrix and behavioral fixtures cover reset classes |
| WP11/WP16 | Vector lookup target missed | Indexed retrieval implemented/measured without weakening generation semantics |
| WP13 | Contributor uncertainty/testimony | WP13 completion gate |
| WP15 | Cross-domain durability | Complete: matrix, targeted fixtures, `qa:ready`, and `qa:merge` passed at `06d7c44` |
| WP16 | Skips/manual acceptance/scale | Acceptance matrix + final `qa:merge` |

## 6. Functional acceptance obligations

| Journey | Automated evidence | Remaining obligation |
| --- | --- | --- |
| People actions/metadata | WP10e/g + WP12c-g canonical green | Final manual/visual acceptance WP16 |
| Old Person ID survives merge | Redirect/GEDCOM/gallery-filter coverage + redirect-aware WP12f candidate commands | Final manual/visual acceptance WP16 |
| Weak candidates | WP12e persistence/policy + WP12f payload/UI characterization and candidate action tests | Final manual/visual acceptance WP16 |
| Candidate confidence wording | WP12f source characterization proves raw cosine uses `Similarity 0.xx` and not `%` | Final visual acceptance WP16 |
| Restart/rebuild preserves Person truth | WP10 reset + WP11 generation + WP12g rerun durability fixtures | Broader cross-domain matrix WP15 |
| Contributor attribution/history | WP13a-c domain tests + canonical run `34696835803` | WP13e durability |
| Identity uncertainty review | WP13d command/UI characterization tests plus canonical run `34698288634` cover all response wording and loading/error/success/retry structure | Real-runtime keyboard/visual/error-recovery acceptance |
| Photograph membership/edit lineage | WP14a-e membership, exact-copy and photo-edit policy/provenance tests + post-merge canonical run `34699825589` | None for WP14 |
| Final visual/manual acceptance | Not recorded | WP16 |

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
