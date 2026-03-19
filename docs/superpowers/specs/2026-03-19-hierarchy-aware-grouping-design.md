# Hierarchy-Aware Grouping Design

**Date:** 2026-03-19

## Goal

Rework similarity grouping from an overlapping file-level graph into a strict hierarchy that models image-content relationships explicitly and supports stable collapse semantics for diagnostics, gallery, and the single-photo filmstrip.

The hierarchy order is:

- `duplicate`
- `near_duplicate`
- `variant_set`
- `burst`

Album and collection style groups remain overlapping. This redesign applies only to similarity groups.

## Why

The current grouping model mixes two incompatible ideas:

- group memberships as an overlapping graph
- collapse behavior as if groups were hierarchical

That mismatch creates several user-visible failures:

- collapsed counts can exceed ingest counts because overlapping memberships are treated like stack counts
- visually identical items can be mislabeled as `variant_set` instead of `duplicate` or `near_duplicate`
- burst grouping works on raw files rather than underlying image-content units
- the single-photo filmstrip inherits a flat orbit model that no longer matches the desired gallery behavior

The system needs a first-class hierarchy so that:

- duplicate and near-duplicate consolidation happens before higher-level grouping
- counts distinguish raw files from underlying images
- ambiguous matches are surfaced diagnostically instead of being stored as overlapping memberships

## Constraints And Decisions

- Similarity groups form a strict tree.
- Manual actions remain level-specific to the exact group the user is interacting with.
- Existing grouping data does not need in-place migration.
- The rollout can assume a factory reset followed by reimport/regroup.
- Representative selection is level-specific:
  - `duplicate`: highest quality
  - `near_duplicate`: highest quality
  - `variant_set`: most recent
  - `burst`: most recent, or any stable deterministic choice
- Ambiguous similarity matches should prefer `unassigned` plus diagnostics over storing multiple parents.
- Singleton groups should not be manufactured purely to keep the tree mathematically uniform. The hierarchy may be ragged.

## Similarity Tree Model

Keep `asset_groups` as the main node table and add explicit parent/child relations between groups.

### Tables

#### `asset_groups`

One row per concrete similarity node:

- `duplicate`
- `near_duplicate`
- `variant_set`
- `burst`

`canonical_asset_id` becomes the representative asset for the node.

#### `asset_group_members`

Direct asset children only.

This table no longer implies transitive membership for higher-level groups.

#### `asset_group_children`

New direct child-group relation:

- `parent_group_id`
- `child_group_id`
- `rank`
- `evidence_json`
- timestamps

This makes the similarity model an explicit tree instead of an inferred overlap graph.

Because the rollout can rely on a factory reset, the schema does not need a compatibility layer for legacy similarity memberships. It can be introduced in the simplest maintainable form and rebuilt from regrouping.

### Node Shapes

- `duplicate`
  - direct asset members only
- `near_duplicate`
  - direct children are duplicate groups when available
  - can also hold direct asset members when a lower-level duplicate node does not exist
- `variant_set`
  - direct children are near-duplicate groups when available
  - can also hold lower-level passthrough units
- `burst`
  - direct children are variant groups when available
  - can also hold lower-level passthrough units

This allows a strict but ragged tree without forcing singleton groups everywhere.

## Representative Selection Rules

### Duplicate Stage

Choose the highest-quality rendition:

1. highest pixel area
2. less-lossy format heuristic when detectable from extension or metadata
3. larger file size adjusted for resolution when useful
4. earlier deterministic tie-break by id/path

### Near-Duplicate Stage

Use the same quality-first rule as `duplicate`, because the representative should reflect the best rendition of effectively the same image content.

### Variant Set Stage

Choose the most recent meaningful version:

1. newest `exif_datetime`
2. newest `created_at`
3. deterministic tie-break by id/path

This matches the user mental model that variants are often edits or derived versions.

### Burst Stage

Choose a stable representative using:

1. newest `exif_datetime`
2. newest `created_at`
3. deterministic tie-break by id/path

This is intentionally simple for V1. Better subjective best-frame selection can come later.

## Grouping Pipeline

Processing must happen bottom-up:

1. `duplicate`
2. `near_duplicate`
3. `variant_set`
4. `burst`

Each stage consumes representatives from the level below rather than raw files.

### Duplicate

Input units:

- raw assets

Output units:

- duplicate groups
- singleton assets

Matching should be very strict and oriented around same rendition or effectively identical rendering, not just byte-equality.

### Near-Duplicate

Input units:

- duplicate representatives
- raw singleton assets

Output units:

- near-duplicate groups
- singleton lower-level units

This level models same image content across rescans, recompression, or different resolutions.

### Variant Set

Input units:

- near-duplicate representatives
- uncovered lower-level passthrough units

Output units:

- variant groups
- singleton lower-level units

This level should not use unrestricted transitive closure. A bridge match must not merge unrelated images into the same variant set.

Recommended rule:

- representative-anchored clustering

Every member must match the chosen anchor or medoid strongly enough to qualify. A chain like `A-B-C` must not merge if `A-C` is weak.

### Burst

Input units:

- variant representatives
- uncovered lower-level passthrough units

Output units:

- burst groups
- singleton lower-level units

Burst detection should describe temporally adjacent distinct images, not raw-file stacks. Time proximity alone is too weak as a general rule. If a burst is created with time-only evidence, diagnostics should flag it explicitly.

## Matching Intent By Level

- `duplicate`
  - same file hash is sufficient
  - same rendered image with metadata/container differences may also qualify
- `near_duplicate`
  - same image content across scan/export/compression/resolution differences
- `variant_set`
  - edited or derived versions of the same source image
- `burst`
  - temporally adjacent sequence of distinct underlying images

These boundaries matter:

- `duplicate` is not limited to exact digital copies
- a separately scanned enlargement of the same print is more likely `near_duplicate` than `duplicate`
- visually similar scenes should not drift upward into `near_duplicate` or `variant_set` merely because a graph edge exists

## Diagnostics And Read Model

Diagnostics should read the persisted tree directly rather than estimating hierarchy from overlapping memberships.

### Required Counts

Diagnostics and later UI read models must distinguish:

- raw file count
- underlying image count
- collapsed item count at the chosen display level

### Group Diagnostics Shape

Each group row should expose:

- `groupId`
- `groupType`
- `representativeAssetId`
- direct asset count
- descendant asset count
- direct child group count
- underlying image count
- summary text
- explainable flags

Suggested flags:

- `ambiguous_parent_candidate`
- `time_only_burst_match`
- `weak_visual_match`
- `singleton_passthrough`
- `missing_lower_level_match`
- `representative_not_best_quality`

Diagnostics should also expose a tree-oriented branch view so that a case like burst `f882` can be understood as a handful of underlying image-content units rather than as a flat file count.

## UI Contract Direction

The gallery and single-photo filmstrip should eventually consume the same hierarchy-aware read model.

Instead of asking for an asset's one primary group, the read model should derive:

- `display_node_id`
- `display_node_type`
- `representative_asset_id`
- `collapsed_descendant_file_count`
- `collapsed_underlying_image_count`
- `ancestor_group_ids`

The single-photo filmstrip should stop treating all grouped assets as one flat orbit. It should show siblings at the visible hierarchy level, with drill-down through child groups.

## First Slice Scope

The first implementation slice should deliver:

- the persisted hierarchy model
- representative-selection helpers
- hierarchy-aware diagnostics that show raw-file and underlying-image structure

Out of scope for the first slice:

- final gallery collapse migration
- final filmstrip migration
- subjective best-frame burst representative selection
- later `event` level grouping

## Success Criteria

This redesign is successful when:

- similarity groups persist as a strict tree rather than overlapping memberships
- a burst like `f882` can be inspected as a small number of underlying units even if it contains many raw files
- diagnostics clearly distinguish raw file counts from underlying image counts
- ambiguous cases are called out as diagnostics instead of being hidden in overlapping group memberships
- the model is suitable for later gallery and filmstrip migration without another conceptual rewrite
