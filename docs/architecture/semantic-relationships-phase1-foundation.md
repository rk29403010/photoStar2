# Semantic relationships Phase 1 foundation

Status: accepted implementation baseline for the Phase 1 relationships/evidence refactor.

Reviewed code baseline: `888e510278b7fd25815b5f6d625cfaa52e61b0f6` (`main`).

This note pins the implementation rules that must remain true while the new semantic model is introduced. It is deliberately narrower than the full product architecture: it describes the safe cutover path from the current codebase.

## Delivery strategy

Use **expand → shadow/compare → cut over → contract**.

1. Add new schema and services alongside the current group/face structures.
2. Shadow-write or derive equivalent semantic results from existing algorithms.
3. Compare old and new behaviour using the existing grouping, gallery, edit and reset tests plus new parity tests.
4. Cut individual consumers over only when the replacement has behavioural parity.
5. Remove old tables/types only after repository search and behavioural gates prove there are no remaining readers or writers.

A development database may be deliberately discarded while this work is underway. That permission does not make destructive migration/reset behaviour acceptable in the product.

## Code that should be preserved where practical

Keep and adapt rather than rewrite:

- workflow runtime and module/plugin machinery;
- pHash/dHash and grouping graph calculations;
- duplicate and burst detection algorithms;
- gallery layout, paging and virtualisation behaviour;
- RetinaFace/SCRFD and ArcFace inference;
- editor operations, render pipeline, edit documents and mask snapshots;
- current metadata blocks/assertions/projection until a deliberate later unification.

Replace concepts whose semantics are wrong:

- persisted nested groups as archival truth;
- durable face identity based on `face_index`;
- machine face clusters directly defining durable `Person` identity;
- one threshold deciding whether weak observations exist at all;
- binary human review that cannot retain uncertainty or disagreement.

## Existing behaviour that is a cutover gate

The current test suite already characterises several hidden dependencies. Do not remove the legacy structures until the replacement preserves these behaviours:

- `photo-edit-commands.test.cjs`: rendered edits create an `edit_version` relationship today and preserve source/rendered assets;
- `reset-library-commands.test.cjs`: soft reset, factory reset and face reset have different preservation semantics;
- `workflow-runtime-grouping*.test.cjs`: duplicate, hierarchy, near-similarity, variant and burst behaviour;
- `library-gallery*.test.cjs`: grouped/ungrouped gallery behaviour;
- `group-orbit-command.test.cjs`: member expansion/navigation;
- collection command tests: representative locking and explode/show-separately behaviour;
- people command/runtime tests: rename, merge, isolate, approve/reject and GEDCOM-link behaviour.

`explode/show separately` is a presentation preference. It must not be converted into semantic evidence that two assets are different photographs.

## Authoritative-source rules for Phase 1

| Fact | Authoritative source during Phase 1 | Semantic use |
| --- | --- | --- |
| Exact file copy | file/content digest equivalence | deterministic projection; do not create quadratic pairwise claims |
| Visual similarity | current similarity algorithms | observation/candidate only |
| Edit recipe and edit ancestry | `photo_edit_documents` | semantic derivation is regenerated from editor records |
| Existing date/location metadata | current metadata projection/assertions | one-way adapter only during Phase 1 |
| Current gallery collapse | server-side presentation query after cutover | rebuildable presentation projection |
| Human identity judgement | attributed testimony/attestation | durable; never silently overwritten by model reruns |

## Reset and recomputation matrix

The semantic implementation must make durability explicit before each new table becomes authoritative.

| Operation | Durable data retained | Rebuildable data cleared/recomputed |
| --- | --- | --- |
| Factory reset | nothing except application-shipped defaults | everything |
| Soft library rebuild | contributors, testimony, explicit human decisions, curated People/Photographs, redirects/aliases, GEDCOM links, edit documents, presentation preferences | assets derived from ingest as appropriate, observations, vectors, machine clusters, presentation projections |
| Face-analysis reset | human Person records/testimony/decisions | face detections where requested, face vectors, machine candidates/clusters |
| Relationship recomputation | human attestations/decisions and authoritative editor/metadata records | machine observations and projections for the affected predicate/provider |
| Asset remove/reimport | stable durable semantics must resolve through durable asset identity/content identity where possible | asset-local machine analysis and projections |
| Model replacement | human work and previous successful generation remain available until replacement succeeds | new model generation becomes active atomically after successful completion |

The current soft-reset implementation still preserves some face work through path + `face_index`; this is a known transitional limitation, not the target contract.

## Database migration rule

All **new** schema changes use the numbered migration ledger introduced with this refactor:

- append-only migration IDs;
- SHA-256 checksum;
- applied timestamp;
- one transaction per migration;
- fail on changed already-applied migration;
- fail on duplicate IDs;
- do not record a failed migration.

The current legacy best-effort migration list remains temporarily for compatibility with existing development databases. Do not add new migrations to that list. Removing the legacy runner is a later contract step after the new baseline/cutover is complete.

Before durable user data exists, an explicit development-only reset may still be used instead of writing migration code for throwaway intermediate schemas.

## Shadow semantic kernel

The first numbered semantic migration adds the minimum shared kernel:

- typed semantic entities that can point at existing native records or future archive concepts;
- propositions representing possible statements inside an explicit conflict scope;
- append-only supporting/opposing attestations with source and optional confidence;
- addressable evidence references attached to attestations;
- explicit decisions that supersede previous decisions while retaining history.

Confidence is evidence metadata, not an automatic truth-election mechanism. In the shadow resolver:

- one supported and uncontested proposition is `proposed`;
- competing supported propositions are `disputed`;
- support plus active opposition is `disputed`;
- no supported proposition is `unresolved`;
- only an explicit decision can produce `accepted` or `rejected`.

Attestation supersession is constrained to the same semantic scope so a model rerun or human correction can replace its previous statement without deleting history or accidentally invalidating an unrelated claim.

### Reset gate before human cutover

The semantic kernel is currently shadow-only. No supported UI command writes durable human semantic data to it yet.

**Do not cut a human action over to these tables until soft-reset preservation is implemented and tested.** The preservation closure must retain any entities/propositions required by durable human/import attestations, their evidence, and explicit decisions, while machine-only attestations remain rebuildable.

This is deliberately a cutover gate rather than premature reset plumbing for tables that no current user path writes to.

## Exact duplicate shadow slice

Exact file copies are the first deterministic relationship projection:

1. exact-copy membership is derived directly from content digest equivalence;
2. one stable semantic set is used rather than N² pairwise duplicate links;
3. the existing duplicate representative-selection heuristic is reused;
4. the existing group writer remains authoritative for current UI behaviour;
5. parity tests compare new membership and representative selection against the existing duplicate groups;
6. insertion order must not change the semantic projection.

## Next vertical slice

With the migration ledger, exact-copy projection, and semantic kernel in shadow mode, the next cutover proof is a **server-side `LibraryPresentationItem` projection**.

Before any gallery reader is switched, prove that the new projection preserves:

- collapse/grouping before pagination;
- grouped and ungrouped filters;
- representative selection;
- timeline ordering/seek semantics;
- locked edit-version presentation behaviour.

After that parity gate is green, introduce Photograph/Representation semantics and then move face identity only after reset durability and disagreement handling are proven.
