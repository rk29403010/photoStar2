# PhotoStar2 Semantic Relationships — Implementation Status and Handoff

**Purpose:** repository-resident execution state for the Phase 1 semantic-relationships refactor.  
**Authority:** companion to `semantic-relationships-architecture.md` and `semantic-relationships-implementation-plan.md`.  
**Rule:** repository HEAD + canonical QA outrank chat history, model memory, and commit existence.

## 1. Repository state

- Repository: `rk29403010/photoStar2`
- Branch: `task/semantic-relationships-phase1-foundation`
- Pull request: `#42`
- Last material implementation HEAD assessed: `7f27c5d1676a44fd2f5c58241782863e78211503`
- Canonical quality gate: **GREEN**, run `34696835803`, job `103561650233`
- Current package: **WP13d — Review UI uncertainty and recovery states**

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
- WP13d implementation prepared: People candidate cards expose all WP13b response kinds with named ambiguous candidates; the command path records normalized attributed responses and preserves accepted/rejected projection behaviour. The review region declares inline loading/error/success/retry feedback and a local error boundary. Targeted WP12f/WP13a-d tests pass locally; canonical and runtime/manual acceptance remain outstanding.

## 3. Current package — WP13d

### Goal

Expose the supported identity-review uncertainty choices through an accessible review journey with explicit loading, empty, error, success and retry behaviour.

### Gate

UI smoke/manual acceptance covers the supported uncertainty choices plus loading, empty, error and retry states.

### Exact next action

1. Run canonical QA for the prepared WP13d vertical slice and inspect any exact failure before editing.
2. Exercise the People candidate-review journey in a real runtime: keyboard-labelled certainty selection, every uncertainty choice, named ambiguous candidates, empty state, save success, induced load/save error and retry.
3. Record runtime/manual evidence or any concrete blocker; do not mark WP13d complete from source-characterization tests alone.
4. Once the WP13d gate is demonstrated, advance the handoff to WP13e durability and acceptance closeout.

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
| Contributor attribution/history | WP13a-c domain tests + canonical run `34696835803` | WP13e durability |
| Identity uncertainty review | WP13d command/UI characterization tests cover all response wording plus loading/error/success/retry structure | Canonical + real-runtime keyboard/visual/error-recovery acceptance |
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
