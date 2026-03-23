# Selected-Subject Metadata And Manual Tiling Design

**Date:** 2026-03-21

## Goal

Add a reusable workflow entry point for manually selected subjects, expose a single-photo action that runs AI metadata on the current asset only, and make AI image tiling an explicit per-module experiment setting instead of a hidden global behavior.

## Why

The current metadata flow is aimed at folder ingest and broad automation. That is useful for throughput, but it leaves a gap in real-world experimentation and manual curation:

- there is no simple "run metadata on this photo" action in the single-photo view
- there is no reusable workflow subject for "these exact items I picked manually"
- AI image preparation is currently fixed, which makes it hard to compare overview-only analysis against tiled analysis on difficult photos such as panoramic group shots

The next slice should improve real-world progress on family-history photos without broadening into a larger workflow/platform rewrite.

## Constraints And Decisions

- The new reusable input subject is `selection`.
- `selection` is generic in shape and can hold multiple subject types.
- V1 supports only `asset` entries during expansion.
- Non-asset entries should be rejected clearly rather than silently ignored.
- Future subject resolution from groups/people/albums into assets is explicitly deferred and tracked as follow-up work.
- Manual tiling is a module setting on AI metadata generation, not a global default.
- The single-photo action should trigger a dedicated workflow rather than bypassing the workflow runtime.
- The same selected-subject workflow should later support batch multi-select UI with no runtime redesign.

## User Outcomes

### Single Photo

From the single-photo action menu, the user can trigger AI metadata generation for only the current asset. This should use the new selection-based workflow so that the one-photo flow and future multi-photo flow share the same runtime path.

### Arbitrary Manual Batch

The runtime can accept a selected list of subjects and fan them out into per-subject execution. This supports future manual workflows where the user chooses a difficult or meaningful subset that would be hard to reproduce with code.

### Tiling Experimentation

The user can choose whether AI metadata uses:

- `overview_only`
- `overview_plus_tiles`

This choice is passed as a workflow/module parameter so experimentation is explicit and auditable.

## Selection Subject Model

Add a new durable workflow subject type: `selection`.

Suggested payload shape:

```json
{
  "items": [
    { "subjectType": "asset", "subjectId": "asset-1" },
    { "subjectType": "asset", "subjectId": "asset-2" }
  ]
}
```

The selection object is only a container. It does not imply how downstream workflows consume its items.

### V1 Expansion Behavior

A dedicated runtime expansion module reads `selection.items` and emits per-subject execution inputs.

In V1:

- accept `asset` items
- de-duplicate repeated entries
- preserve input order
- reject non-asset entries with a clear processing issue or failed execution

This keeps the primitive generic without widening current runtime behavior too early.

## Workflow Design

Add a new workflow dedicated to AI metadata over manually selected assets.

High-level structure:

1. input subject: `selection`
2. expand selection into `asset` executions
3. run `runtime.generate_ai_metadata` for each asset

This workflow should be intentionally narrow. It does not need folder scanning, preview generation, face detection, or grouping. It exists to rerun AI metadata on already-known assets.

## Single-Photo Action

The single-photo action menu should gain a command such as `Analyze This Photo` or `Run Metadata`.

Behavior:

- construct a one-item `selection`
- trigger the selected-subject metadata workflow
- pass through AI settings including mock/live mode and tiling strategy
- reuse existing job/progress plumbing so the action behaves like other workflow-triggered work

This keeps the single-photo flow honest: it uses the same workflow infrastructure we want future batch selection features to use.

## AI Metadata Tiling Setting

Add a module/workflow parameter for image preparation strategy:

- `overview_only`
- `overview_plus_tiles`

### `overview_only`

Current behavior:

- prepare one resized overview image
- send one image part with structured output schema

### `overview_plus_tiles`

Experimental behavior:

- prepare one overview image
- prepare additional deterministic crops from the same original image
- send them in one Gemini request in a fixed order
- prompt explicitly names the overview and numbered crops as parts of the same original photo

The setting should be explicit in stored metadata or runtime diagnostics so test runs can be compared later.

## Tiling Strategy

V1 tiling should be deterministic and bounded.

Recommended approach:

- always include one overview image
- include up to four crop images
- each image part is resized to fit within the chosen Gemini image bound
- choose crop layout based on aspect ratio:
  - panoramic or wide: vertical slices with overlap
  - tall: horizontal slices with overlap
  - roughly square: 2x2 grid with overlap

This is intentionally simpler than adaptive smart crops. The goal is controlled experimentation on real images, not a fully automatic vision optimizer.

## Error Handling

- Invalid or empty selections should fail early with a clear message.
- Unsupported non-asset subject types in V1 should produce a clear issue, not partial silent success.
- If metadata generation fails for one selected asset, the workflow should record the failure at the subject level without corrupting successful outputs for other selected assets.
- If tiling is requested but image preparation fails, the module may fall back to overview-only only if that fallback is explicit and traceable; otherwise fail loudly.

## Testing Strategy

Add coverage for:

- `selection` subject registration and payload handling
- selection expansion from one item and multiple items
- rejection of non-asset subject types in V1
- selected-subject metadata workflow fan-out and persistence
- single-photo action wiring to the new workflow command
- AI metadata strategy parameter passing
- tiled image preparation boundaries and ordering

## Follow-Up TODO

- resolve non-asset selections into assets when resolvers exist for groups, people, and albums
- add multi-select UI entry points that reuse the same selection-based workflow
- compare output quality and cost between overview-only and overview-plus-tiles on real family-history fixtures
