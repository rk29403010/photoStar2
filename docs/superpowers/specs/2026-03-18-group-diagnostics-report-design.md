# Group Diagnostics Report Design

**Date:** 2026-03-18

## Goal

Add an in-app, read-only diagnostics view for grouping quality so we can inspect suspicious duplicate, near-duplicate, variant, and burst results at both the group and asset level. The report should make overlap, collapse inflation, and likely type mismatches legible enough to discuss concrete data issues and should lay the groundwork for a later hierarchy-aware regrouping rework.

## Why

The current gallery pills are useful for spotting that a photo participates in multiple groups, but they are not sufficient for understanding:

- why collapsed totals exceed ingest totals
- whether a group type is wrong
- whether a burst is counting raw files instead of underlying image units
- whether lower-level duplicate or near-duplicate structure should have been resolved before higher-level burst grouping

The current single-photo filmstrip is also built around a flat group orbit model. Any future grouping rework will need diagnostics and filmstrip behavior to share a richer hierarchy model rather than diverging further.

## User Workflow

1. Open the diagnostics screen from the action menu.
2. Review a dataset summary showing ingest count, grouped/collapsed count, overlap count, and suspicious-case counts.
3. Switch between `Suspicious only` and `All`.
4. Inspect top-level group rows.
5. Expand a group to see member assets, all memberships, collapse impact, and suspicion flags.
6. Click through to gallery or single-photo view to inspect the actual photos.

## Scope

### In Scope for V1

- New in-app diagnostics screen opened from the action menu
- Read-only dataset report
- Top-level summary metrics
- Group-first rows with asset-level drilldown
- Toggle between `Suspicious only` and `All`
- Navigation from report rows to existing photo views
- Explicit reporting of:
  - raw file count
  - overlap count
  - underlying image estimate
  - suspicion flags

### Out of Scope for V1

- Editing or correcting groups from the report
- Rewriting the grouping algorithm itself
- Reworking gallery collapse behavior
- Reworking the single-photo filmstrip

## Information Architecture

### Top Summary

The diagnostics header should show:

- total assets in the current dataset
- displayed/collapsed total under current grouping assumptions
- total group memberships
- overlapping asset count
- counts of suspicious groups and suspicious assets

This should answer the first sanity-check question quickly: "Why does this dataset collapse to 26 when ingest was 20?"

### Group Report Rows

Each row should represent a group and include:

- group id suffix
- group type
- file count
- overlap count
- underlying image estimate
- suspicion badges
- short explanatory summary

Example summary:

`8 files, est. 3 underlying images, 6 members also belong to lower-level groups`

### Asset Drilldown

Expanding a group should show each asset with:

- short asset identifier
- thumbnail
- all memberships
- primary group
- collapse-impact notes
- suspicion flags

This is where misclassification and overlap become discussable at the concrete file level.

## Report Model

V1 should not depend solely on the existing "one group orbit" model. It should introduce a diagnostics-focused report model that can represent:

- raw assets
- raw groups
- raw memberships
- overlap relationships
- provisional lower-level rollups used for diagnostics

The model should distinguish between:

- `file_count`: number of raw assets in a group
- `underlying_image_estimate`: count after rolling lower-level duplicate/near-duplicate structure up for inspection
- `overlap_count`: number of assets that also participate in other groups

This gives the report a useful hierarchy-aware shape even before the grouping pipeline itself is reworked.

## Suspicion Flags

V1 should compute a small set of explainable flags, for example:

- `overcount_on_collapse`
- `multi_group_overlap`
- `possible_type_mismatch`
- `possible_missing_duplicates`
- `missing_lower_level_rollup`

These flags should be deterministic and explainable from current data, not black-box scores.

## Backend Shape

Add a backend command that returns a dataset-level grouping diagnostics payload. The payload should include:

- dataset summary
- group summaries
- asset drilldowns keyed by group
- issue counts

The implementation can infer provisional parent/child relationships for reporting from current memberships. It does not need to mutate the underlying grouping tables.

## UI Shape

The diagnostics surface should be its own in-app screen rather than a modal or dashboard card. That gives enough room for:

- summary metrics
- filters/toggles
- expandable rows
- thumbnails
- future links into hierarchy-aware tools

The action menu is the correct launch point for V1.

## Relationship to Future Grouping Rework

This report should be designed so it survives the eventual regrouping rewrite.

Future work should use the same underlying model to:

- collapse gallery counts by hierarchy
- drive a hierarchy-aware single-photo filmstrip
- explain how duplicate, near-duplicate, variant, and burst levels roll into each other

The single-photo filmstrip must be reworked during the later grouping rewrite so it no longer assumes a flat orbit membership model.

## Testing

V1 should include:

- backend tests for diagnostics aggregation and flagging
- UI/model tests for suspicious filtering and summary rendering
- wiring tests for the new action-menu entry and view activation

## Success Criteria

The feature is successful when:

- a user can explain why collapsed totals differ from ingest totals
- a suspicious group like `f882` can be inspected in enough detail to discuss whether it should collapse to 3 underlying images instead of 8 files
- a questionable group like `0b5a` can be called out as a likely type mismatch using shared vocabulary
- the report forms a credible foundation for a later hierarchy-aware grouping and filmstrip rework
