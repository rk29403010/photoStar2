# PhotoStar2 Semantic Relationships — Implementation Status and Handoff

**Purpose:** repository-resident execution state for the Phase 1 semantic-relationships refactor.  
**Authority:** companion to `semantic-relationships-architecture.md` and `semantic-relationships-implementation-plan.md`.  
**Rule:** repository HEAD + canonical QA outrank chat history, model memory, and commit existence.

## 1. Repository state

- Repository: `rk29403010/photoStar2`
- Branch: `task/semantic-relationships-phase1-foundation`
- Pull request: `#42`
- Last material implementation HEAD assessed: `95feb8325a3d3ca1e73e72d4eff29e58c3b1693b`
- Canonical quality gate: **GREEN**, run `34690912171`, job `103545849555`
- Current package: **WP12g — rerun durability, parity and contract gate**

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
- WP12f complete: candidate review UI now reads `face_person_candidates`, while confirmed photos retain the transitional assignment projection. Candidate approve/reject carries stable Face ID + durable Person ID. Raw cosine is labelled `Similarity 0.xx`, never a probability percentage. Stable old-Person redirects remain enforced at the command/navigation boundaries. Candidate actions record semantic decisions directly against stable Face entities; legacy mask position is needed only for the compatibility projection. Canonical run `34690912171`.

## 3. Current package — WP12g

### Goal

Close WP12 by proving rerun durability and removing obsolete assumptions that machine clusters directly own durable Person truth where replacement coverage now exists.

### Gate

Machine reruns cannot delete confirmed Persons or resurrect rejected identities as accepted without a new explicit decision. IdentityCluster remains demonstrably rebuildable and distinct from durable Person lifecycle, with existing People actions and weak-candidate behaviour covered end to end.

### Exact next action

1. Inventory People rerun/reset/rebuild paths and direct IdentityCluster→Person compatibility assumptions.
2. Add executable rerun fixtures proving confirmed Person lifecycle survives cluster rebuild/disappearance.
3. Prove explicit rejection remains durable across rerun and cannot become accepted without a new explicit human decision.
4. Remove only obsolete machine-cluster-directly-owns-Person assumptions for which replacement coverage is already proven; do not widen WP10 `face_index` inventory.
5. Re-run existing People action/candidate characterization to prove parity.
6. Update `docs/ai/AI_PROJECT_MAP.md` for the final WP12 durable/rebuildable model and run the canonical WP12 completion gate.

Do not broaden WP12g into WP13 contributor testimony/uncertainty semantics.

## 4. Phase status

| WP | State |
| --- | --- |
| WP1-3 | Largely complete; final reconciliation/durability closeout remains |
| WP4-5 | Complete for Phase 1 slice |
| WP6-8 | Substantially complete; later closeouts remain |
| WP9 | **Complete** |
| WP10 | **Complete** |
| WP11 | **Complete** |
| WP12 | **In progress — WP12a-f complete; WP12g current** |
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
| WP12 | Rerun/contract closeout | WP12g completion gate |
| WP13 | Contributor uncertainty/testimony | WP13 gate |
| WP14 | Photograph completeness | All WP14 sub-gates |
| WP15 | Cross-domain durability | Explicit matrix + executable tests |
| WP16 | Skips/manual acceptance/scale | Acceptance matrix + final `qa:merge` |

## 6. Functional acceptance obligations

| Journey | Automated evidence | Remaining obligation |
| --- | --- | --- |
| People actions/metadata | WP10e/g + WP12c/d/f canonical green | Final rerun parity WP12g |
| Old Person ID survives merge | Redirect/GEDCOM/gallery-filter coverage + redirect-aware WP12f candidate commands | Final manual/visual acceptance WP16 |
| Weak candidates | WP12e persistence/policy + WP12f payload/UI characterization and candidate action tests | Final manual/visual acceptance WP16 |
| Candidate confidence wording | WP12f source characterization proves raw cosine uses `Similarity 0.xx` and not `%` | Final visual acceptance WP16 |
| Restart/rebuild preserves Person truth | WP10 reset + WP11 generation + WP12a-f | WP12g + broader WP15 matrix |
| Final visual/manual acceptance | Not recorded | WP16 |

## 7. Significant decisions

- IdentityCluster is rebuildable machine analysis, never Person identity.
- Person lifecycle and redirects are durable; old Person IDs remain resolvable.
- Trusted candidate anchors are explicit accepted Face→Person decisions. Weak candidate evidence is rebuildable and separate from durable decisions.
- Candidate accept/reject writes durable semantic decisions against stable Face IDs; positional compatibility lookup is not a prerequisite for durable truth.
- Raw cosine is not a calibrated probability and must not be displayed as one.
- WP10 frozen `face_index` inventory must not be widened casually.
- Numbered migrations are append-only/checksummed.

## 8. Fresh-chat bootstrap

1. Read root `AGENTS.md`, `docs/ai/AI_PROJECT_MAP.md`, and this file.
2. Read only the directly relevant architecture/implementation-plan section for the current WP.
3. Verify branch HEAD and canonical Actions result.
4. Inspect current WP code/tests; repository evidence outranks chat history.
5. Continue from **Exact next action**; demonstrate the gate before recording completion.
