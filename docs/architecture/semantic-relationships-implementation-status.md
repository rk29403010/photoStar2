# PhotoStar2 Semantic Relationships — Implementation Status and Handoff

**Purpose:** repository-resident execution state for the Phase 1 semantic-relationships refactor.  
**Authority:** companion to `semantic-relationships-architecture.md` and `semantic-relationships-implementation-plan.md`.  
**Rule:** repository HEAD + canonical QA outrank chat history, model memory, and commit existence.

## 1. Repository state

- Repository: `rk29403010/photoStar2`
- Branch: `task/semantic-relationships-phase1-foundation`
- Pull request: `#42`
- Last material implementation HEAD assessed: `fe24c88a93a90b2f6116bb9cf038c39fc1c9f331`
- Canonical quality gate: **GREEN**, run `34691265488`, job `103546812129`
- Current package: **WP13a — Contributor identity and attribution**

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

## 3. Current package — WP13a

### Goal

Add the smallest local Contributor identity/profile-selection layer required to attribute review/testimony decisions. Do not broaden this into authentication, accounts or cloud identity.

### Gate

Review/testimony writes have explicit Contributor attribution and historical attribution remains readable.

### Exact next action

1. Inventory existing contributor/actor/source attribution fields in semantic decisions, attestations and review-related schema/repositories.
2. Read the Contributor/testimony sections of `semantic-relationships-architecture.md` and existing migrations before choosing schema.
3. Define the minimal local Contributor identity and current-profile selection contract without auth semantics.
4. Wire explicit Contributor attribution into the review/testimony write path while retaining readable historical attribution.
5. Add executable attribution/history tests and run canonical QA.

Do not broaden WP13a into WP13b response normalization or WP13c conflict-resolution semantics.

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
| WP13 | **In progress — WP13a current** |
| WP14 | Partially implemented ahead of sequence |
| WP15 | Mostly not started |
| WP16 | Not started |

## 5. Deferred ledger

| WP | Item | Completion criterion |
| --- | --- | --- |
| WP10 | Remaining transitional `face_index` adapter statements | Do not widen frozen inventory; later contraction only with explicit proof |
| WP10/WP15 | Broader reset durability | WP15 durability matrix |
| WP11/WP16 | Vector lookup target missed | Indexed retrieval implemented/measured without weakening generation semantics |
| WP13 | Contributor uncertainty/testimony | WP13 completion gate |
| WP14 | Photograph completeness | All WP14 sub-gates |
| WP15 | Cross-domain durability | Explicit matrix + executable tests |
| WP16 | Skips/manual acceptance/scale | Acceptance matrix + final `qa:merge` |

## 6. Functional acceptance obligations

| Journey | Automated evidence | Remaining obligation |
| --- | --- | --- |
| People actions/metadata | WP10e/g + WP12c-g canonical green | Final manual/visual acceptance WP16 |
| Old Person ID survives merge | Redirect/GEDCOM/gallery-filter coverage + redirect-aware WP12f candidate commands | Final manual/visual acceptance WP16 |
| Weak candidates | WP12e persistence/policy + WP12f payload/UI characterization and candidate action tests | Final manual/visual acceptance WP16 |
| Candidate confidence wording | WP12f source characterization proves raw cosine uses `Similarity 0.xx` and not `%` | Final visual acceptance WP16 |
| Restart/rebuild preserves Person truth | WP10 reset + WP11 generation + WP12g rerun durability fixtures | Broader cross-domain matrix WP15 |
| Contributor attribution/uncertainty | Not yet implemented | WP13 |
| Final visual/manual acceptance | Not recorded | WP16 |

## 7. Significant decisions

- IdentityCluster is rebuildable machine analysis, never Person identity.
- Person lifecycle and redirects are durable; old Person IDs remain resolvable.
- Trusted candidate anchors are explicit accepted Face→Person decisions. Weak candidate evidence is rebuildable and separate from durable decisions.
- Candidate accept/reject writes durable semantic decisions against stable Face IDs; positional compatibility lookup is not a prerequisite for durable truth.
- Raw cosine is not a calibrated probability and must not be displayed as one.
- Machine reruns may replace machine clusters/candidate projections but cannot delete confirmed Person truth or override durable human rejection.
- WP10 frozen `face_index` inventory must not be widened casually.
- Numbered migrations are append-only/checksummed.

## 8. Fresh-chat bootstrap

1. Read root `AGENTS.md`, `docs/ai/AI_PROJECT_MAP.md`, and this file.
2. Read only the directly relevant architecture/implementation-plan section for the current WP.
3. Verify branch HEAD and canonical Actions result.
4. Inspect current WP code/tests; repository evidence outranks chat history.
5. Continue from **Exact next action**; demonstrate the gate before recording completion.
