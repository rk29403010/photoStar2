# Grouping Runtime Design

**Date:** 2026-03-14

**Status:** Approved in brainstorming

**Related docs:**

- `docs/superpowers/specs/2026-03-13-folder-ingest-v1-design.md`
- `docs/architecture.md`

## Goal

Restore real similar-photo grouping in the runtime-native folder ingest path.

The current runtime module reports success but does not build any groups. The
replacement must match legacy grouping functionality while improving grouping
accuracy where it is practical to do so inside this slice.

## Scope

This design covers the runtime-native `runtime.group_similar_photos` module
only.

It does not redesign the whole ingest graph or split grouping into multiple new
workflow nodes in this pass.

## Product intent

Grouping should work on the runtime ingest path without depending on older
coordinator-driven workers.

The module must:

- rebuild duplicate groups
- rebuild burst groups
- rebuild variant groups
- compare newly ingested assets against the existing library, not just the
  current batch
- preserve protected user outcomes such as locked groups

## Decision

The approved design is:

- keep grouping as a single `once_per_batch` runtime module
- make the module self-sufficient by backfilling missing grouping prerequisites
  for changed assets
- keep writing to canonical grouping tables
- preserve legacy output categories (`duplicate`, `burst`, `variant_set`)
- improve burst and variant accuracy by replacing greedy anchor clustering with
  graph-based connected-component clustering

## Why this shape

This keeps the change inside one vertical slice:

- the runtime workflow starts producing real grouping results again
- the module does not rely on separate coordinator jobs
- the ingest graph stays stable while grouping logic becomes real
- accuracy can improve without forcing a larger workflow refactor

## Runtime module contract

`runtime.group_similar_photos` remains a runtime-native module with:

- capability: `group`
- run mode: `once_per_batch`
- accepted subject type: `asset`

The module uses `batchSubjects` as the changed asset set for the run, but it may
load additional library assets to compare against those changed assets.

## Data dependencies

The legacy grouping logic depends on fields that the current runtime ingest path
does not always prepare.

Before grouping, the module must ensure the changed assets have:

- `assets.file_hash`
- `assets.width`
- `assets.height`
- `assets.exif_datetime`
- `asset_features.phash64`
- `asset_features.dhash64`

The module should backfill only missing prerequisite data for changed assets.
It should not rescan or recompute the entire library during a normal ingest run.

## Module flow

The module runs in four ordered stages.

### 1. Prerequisite backfill

For each changed asset:

- fill `file_hash` if missing
- fill `width` and `height` if missing
- fill `exif_datetime` with the best available fallback if missing
- fill `asset_features` hashes if missing

If prerequisite generation fails for one asset, record a `processing_issues`
row and skip that asset from any grouping pass that depends on the missing data.
Do not fail the entire module for isolated asset-level issues.

### 2. Duplicate grouping

Duplicate grouping remains exact-match based on `file_hash`.

The module should:

- collect any library assets whose `file_hash` matches a changed asset hash
- rebuild duplicate groups for those hashes
- preserve `locked` duplicate groups
- reconcile non-locked duplicate groups deterministically

Exact duplicates should continue to write canonical rows under
`asset_groups.type = 'duplicate'`.

### 3. Burst grouping

Burst grouping uses time proximity plus visual similarity.

The module should:

- start from changed assets with timestamps
- include nearby library assets within the configured burst window
- require time proximity
- use perceptual hash distance when hashes are available
- avoid modifying protected groups

The old implementation greedily assigned candidates to the first matching
anchor. The new runtime module should instead build burst similarity edges and
form burst groups from connected components of the impacted graph.

This should reduce cluster splitting and weak first-match assignments.

### 4. Variant grouping

Variant grouping uses perceptual similarity outside duplicate groups.

The module should:

- compare changed assets to eligible library assets using `phash64`
- exclude assets already grouped as exact duplicates from variant grouping
- write visual similarity edges for qualified matches
- form groups from connected components instead of greedy anchor assignment

Variant groups continue to write canonical rows under
`asset_groups.type = 'variant_set'`.

## Library comparison model

Grouping must work across old and new assets.

The runtime module should treat changed assets as the impact seed, then load
only the additional library assets needed to evaluate:

- exact duplicate matches by shared `file_hash`
- burst candidates inside the time window
- variant candidates with available perceptual hashes

The module should not be limited to assets from the current ingest batch.

## Persistence model

The runtime module writes to existing canonical tables:

- `asset_groups`
- `asset_group_members`
- `asset_similarity_edges`

The module should keep the current group categories and canonical member
selection behavior:

- larger resolution preferred
- larger file size as a secondary tie-break
- timestamp as a stable final tie-break where relevant

Each written group should include threshold or parameter details in
`params_json` so the generated result is inspectable and tuning changes are
reviewable.

## Cleanup and reconciliation

The module owns cleanup for the grouping kinds it writes.

For impacted assets, it should:

- remove stale non-protected `burst` and `variant_set` groups before rewrite
- rebuild affected non-protected `duplicate` groups deterministically
- delete and rebuild affected `asset_group_members`
- delete and rebuild affected `asset_similarity_edges` for grouping kinds owned
  by the module

The module must preserve:

- `locked` groups
- unrelated groups that do not involve impacted assets

Confirmed or protected user intent should not be overwritten casually.

## Error handling

The module must distinguish local data issues from batch-fatal failures.

### Asset-level issues

Examples:

- unreadable image during hash generation
- missing source file
- malformed image metadata

For these:

- write a `processing_issues` row
- skip the asset from the affected grouping pass
- continue processing the rest of the batch

### Batch-fatal failures

Examples:

- unrecoverable SQL errors
- invalid schema assumptions
- filesystem failures that make continued writes unsafe

For these:

- fail the runtime step
- surface the workflow run as failed

## Accuracy improvements

This slice is allowed to improve accuracy as long as canonical outputs stay in
the same storage model.

Approved improvements:

- replace greedy burst clustering with graph-based connected components
- replace greedy variant clustering with graph-based connected components
- keep deterministic cleanup and rebuild rules for impacted assets

Not in scope for this pass:

- new ML models
- embedding-based visual grouping
- UI-driven threshold editing
- new group categories

## Verification requirements

The implementation should add or update tests to prove:

- the runtime grouping module writes real grouping rows instead of no-op success
- changed assets can group against older library assets
- stale proposed groups for impacted assets are replaced
- locked groups remain intact
- graph-based clustering avoids the known greedy split case
- prerequisite backfill allows grouping to work even when runtime scan inserted
  incomplete asset records

## Non-goals

This pass does not:

- add a separate workflow node for feature preparation
- redesign face grouping
- redesign AI metadata
- replace the whole scan module
- introduce new UI for grouping review

## Recommended implementation order

1. extract shared grouping helper functions for prerequisite backfill and
   impacted-asset cleanup
2. implement duplicate grouping inside the runtime module
3. implement burst and variant edge building plus connected-component
   clustering
4. add runtime integration and cleanup-preservation tests
5. verify with staged quality checks, then full quality for the slice
