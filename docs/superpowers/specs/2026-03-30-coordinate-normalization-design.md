# In-Photo Coordinate Normalization Design

**Date:** 2026-03-30

## Goal

Standardize every stored in-photo rectangle so the app has one coordinate contract regardless of source:

- local face detections
- external AI subject detections
- external AI regions of interest
- any future module that stores image-space rectangles

The UI and downstream consumers should no longer care which module produced a box. They should only know how to draw and crop a canonical rectangle.

## Canonical Coordinate Contract

All stored in-photo rectangles use:

```ts
{
  x: number,
  y: number,
  width: number,
  height: number
}
```

Rules:

- values are normalized fractions in the inclusive `0..1` image space
- origin is the top-left of the original photo
- `x` and `y` represent the top-left corner
- `width` and `height` represent extents relative to the full image
- persisted values must be clamped to the visible image bounds
- zero-area or negative-area boxes are invalid and must not be stored

## Why This Shape

The current system mixes two ideas:

- local face detection stores normalized `[x1, y1, x2, y2]`
- AI metadata stores `{ x, y, width, height }`, but the values can arrive in mixed scales and the UI rescales them on read

That means the UI currently contains source-specific normalization logic. This design moves all normalization to write-time so the stored dataset becomes authoritative.

## Scope

This slice covers:

- canonical write-time normalization for local and external producers
- canonical read-time consumption in the UI and thumbnail generation
- one-off conversion of legacy rows already stored in the database
- documentation updates for module authors so future modules follow the contract

This slice does not change the visual appearance of overlays beyond using the new standard source data.

## Affected Data Paths

### 1. Local Face Detection

`runtime.detect_faces` currently persists normalized `[x1, y1, x2, y2]` boxes in `derived_results.task = 'face_detection'`.

It should instead persist canonical normalized `{ x, y, width, height }` rectangles.

### 2. AI Metadata Evidence

`runtime.generate_ai_metadata` persists:

- raw machine evidence in `photo_metadata_blocks`
- resolved projection JSON in `photo_metadata_projection.subjects_json`
- resolved projection JSON in `photo_metadata_projection.regions_of_interest_json`

Those payloads currently accept mixed-scale boxes and leave interpretation to consumers. They must be normalized before persistence.

### 3. UI Consumers

Overlay and panel code should consume canonical boxes directly. No UI model should guess whether a box is in `0..1`, `0..1000`, or another scale.

### 4. Thumbnail And Crop Consumers

Person thumbnail generation and any other crop logic must convert from canonical `{ x, y, width, height }` into pixel crop regions locally, rather than assuming `[x1, y1, x2, y2]`.

## Normalization Strategy

Introduce one shared image-rectangle helper layer for:

- validating rectangle shape
- detecting and converting supported legacy formats
- clamping to image bounds
- converting canonical boxes to alternate forms only for local computation

Supported inputs should include:

- canonical normalized `{ x, y, width, height }`
- legacy normalized `[x1, y1, x2, y2]`
- legacy mixed-scale `{ x, y, width, height }` where values are in a `0..1000` style unit system

Unsupported or invalid boxes should be dropped rather than partially stored.

## Storage Decision

The database schema remains JSON-based for these payloads. We are changing the contents, not introducing new columns.

That keeps the migration targeted and avoids broad schema churn.

## Read-Side Decision

Consumers should only read canonical rectangles.

For code that still needs corners or pixel crops, provide explicit conversion helpers:

- canonical box -> `[x1, y1, x2, y2]`
- canonical box -> pixel crop rectangle using asset dimensions

This keeps the canonical stored format separate from temporary computational shapes.

## Migration Plan

Add a one-off migration routine that rewrites legacy stored coordinates into canonical form for:

- `derived_results.data` where `task = 'face_detection'`
- `photo_metadata_blocks.data`
- `photo_metadata_projection.subjects_json`
- `photo_metadata_projection.regions_of_interest_json`

Migration requirements:

- idempotent: rerunning it must not distort already-normalized boxes
- conservative: non-coordinate fields must remain unchanged
- safe: invalid boxes should be omitted instead of causing the whole asset to fail
- observable: log or count migrated rows for verification

The migration should run as part of database startup or schema migration handling so existing libraries are upgraded automatically.

## Documentation Requirement

Update the workflow/module creation guide so every module author sees the contract clearly:

- any module storing image rectangles must convert to normalized `{ x, y, width, height }` before persistence
- stored rectangles use top-left origin in full-image space
- UI consumers are allowed to assume canonical boxes and should not contain source-specific scaling logic

## Testing Strategy

Add or update tests for:

- canonical rectangle normalization helper behavior
- local face detection persistence shape
- AI metadata persistence shape for subjects and ROIs
- UI models reading canonical subject and ROI boxes without scale guessing
- person thumbnail crop generation from canonical face boxes
- one-off migration converting legacy DB rows safely

## Success Criteria

- all stored face, subject, and ROI rectangles use canonical normalized `{ x, y, width, height }`
- all relevant consumers read one shape without source-specific branching
- legacy databases are upgraded automatically
- module authoring docs explicitly require canonical write-time normalization
