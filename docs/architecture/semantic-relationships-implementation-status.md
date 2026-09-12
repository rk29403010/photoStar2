# PhotoStar2 Semantic Relationships — Implementation Status and Handoff

**Purpose:** repository-resident execution state for the Phase 1 semantic-relationships refactor.  
**Authority:** companion to `semantic-relationships-architecture.md` and `semantic-relationships-implementation-plan.md`.  
**Rule:** repository HEAD + canonical QA outrank chat history, model memory, and commit existence.

## 1. Repository state

- Repository: `rk29403010/photoStar2`
- Branch: `task/semantic-relationships-phase1-foundation`
- Pull request: `#42`
- Last material implementation HEAD assessed: `29f0d44b294557940e5330a7dc2fc0fbb6dca61b`
- Canonical quality gate: **GREEN**, run `34687663108`, job `103537383377`
- Current package: **WP12f — People UI/deep-link candidate cutover**

Always verify actual HEAD/Actions before continuing.

## 2. Recent evidence

- WP9 complete: legacy grouping tables removed; canonical run `34550734260`.
- WP10 complete: stable VisualRegion/Face identity, reconciliation, stable-ID People actions/reset preservation and durable `face_index` contraction. Frozen WP10 transitional statement inventory remains a regression guard.
- WP11 complete through `546e155`; canonical run `34683370717`. Native vector scan performance remains deferred to WP16 (250k×512 p95 2334.8 ms vs 150 ms target; bounded heap growth).
- WP12a complete: IdentityCluster storage/separation; canonical run `34684403167`.
- WP12b complete: deterministic stable cluster reconciliation; canonical run `34684761693`.
- WP12c complete: Person lifecycle (`provisional|confirmed|merged|retired`) and permanent cycle-safe redirects; canonical run `34686873656`.
- WP12d complete: redirect-aware action/metadata/navigation parity; canonical run `34687156154`.
- WP12e complete: weak Face→Person candidate evidence (`9bb56ae`, complexity refactor `e946bf8`, compile cleanup `29f0d44`); canonical run `34687663108`. `face_person_candidates` retains top-N raw cosine/rank/runner-up/margin plus real model/preprocessing/generation provenance. Candidate policy has separate retention/review/auto-action/minimum-margin/count settings. Trusted anchors come from explicit accepted Face→Person decisions, not machine cluster centroids. Accepted/rejected decisions remain separate authoritative semantic state; score never manufactures a human decision.

## 3. Current package — WP12f

### Goal

Cut People candidate/review presentation to the separated Face → candidate evidence → durable Person model while preserving redirects/deep links. Do not present raw cosine as a probability/percentage unless calibrated.

### Gate

Affected People journeys and old deep links work through the new model and are recorded in the UI acceptance matrix.

### Exact next action

1. Inventory current People candidate/review rendering and commands, especially any `face_assignments.is_suggested` / confidence-percentage assumptions.
2. Add a redirect-aware candidate command/payload sourced from `face_person_candidates` and durable Person metadata.
3. Present raw cosine as a labelled similarity score/strength, not `% confidence`; surface rank/margin/provenance where useful without overloading the UI.
4. Keep confirm/reject actions on stable Face ID + durable Person ID and ensure old Person IDs/deep links resolve to current IDs.
5. Add UI/payload characterization and boot/smoke coverage for the changed People journey.
6. Run the package gate before advancing to WP12g rerun durability/parity closeout.

Do not broaden WP12f into WP13 contributor testimony/uncertainty semantics.

## 4. Phase status

| WP | State |
| --- | --- |
| WP1-3 | Largely complete; final reconciliation/durability closeout remains |
| WP4-5 | Complete for Phase 1 slice |
| WP6-8 | Substantially complete; later closeouts remain |
| WP9 | **Complete** |
| WP10 | **Complete** |
| WP11 | **Complete** |
| WP12 | **In progress — WP12a-e complete; WP12f current** |
| WP13 | Not started |
| WP14 | Partially implemented ahead of sequence |
| WP15 | Mostly not started |
| WP16 | Not started |

## 5. Deferred ledger

| WP | Item | Completion criterion |
| --- | --- | --- |
| WP10 | Remaining transitional `face_index` adapter statements | Do not widen frozen inventory; later contraction only with explicit proof |
| WP10/WP15 | Broader reset durability | WP15 durability matrix |
| WP11/WP16 | Vector lookup target missed | Indexed retrieval implemented/measured without weakening generation semantics |
| WP12 | Candidate UI + rerun closeout | Full WP12 completion gate |
| WP13 | Contributor uncertainty/testimony | WP13 gate |
| WP14 | Photograph completeness | All WP14 sub-gates |
| WP15 | Cross-domain durability | Explicit matrix + executable tests |
| WP16 | Skips/manual acceptance/scale | Acceptance matrix + final `qa:merge` |

## 6. Functional acceptance obligations

| Journey | Automated evidence | Remaining obligation |
| --- | --- | --- |
| People actions/metadata | WP10e/g + WP12c/d green | Candidate UI WP12f |
| Old Person ID survives merge | Redirect/GEDCOM/gallery-filter core coverage green | UI old-link journey WP12f |
| Weak candidates | WP12e persistence/policy integration green | UI wording/actions WP12f |
| Restart/rebuild preserves Person truth | WP10 reset + WP11 generation + WP12a-e | WP12g + WP15 |
| Final visual/manual acceptance | Not recorded | WP16 |

## 7. Significant decisions

- IdentityCluster is rebuildable machine analysis, never Person identity.
- Person lifecycle and redirects are durable; old Person IDs remain resolvable.
- Trusted candidate anchors are explicit accepted Face→Person decisions. Weak candidate evidence is rebuildable and separate from durable decisions.
- Raw cosine is not a calibrated probability and must not be displayed as one.
- WP10 frozen `face_index` inventory must not be widened casually.
- Numbered migrations are append-only/checksummed.

## 8. Fresh-chat bootstrap

1. Read root `AGENTS.md`, `docs/ai/AI_PROJECT_MAP.md`, and this file.
2. Read only the directly relevant architecture/implementation-plan section for the current WP.
3. Verify branch HEAD and canonical Actions result.
4. Inspect current WP code/tests; repository evidence outranks chat history.
5. Continue from **Exact next action**; demonstrate the gate before recording completion.
