# ADR-001: Non-destructive photo edit recipes

## Status

Accepted

## Context

Photo editing needs live previews, reorderable changes, masks, reusable styles,
high-resolution output, and explicit lineage without changing imported files.
The application is a local-first modular monolith and already stores physical
assets, previews, and canonical asset groups.

## Decision

Persist mutable edit documents as ordered JSON recipes with normalized masks.
Use one Sharp interpreter for preview and final rendering, materializing between
operations to preserve the user's order. Final output is a new ordinary asset in
a locked `edit_version` group whose latest render is canonical.

## Rationale

This keeps the first complete vertical slice small, keeps recipes inspectable,
and reuses the gallery's existing canonical-group behavior. Normalized geometry
allows the same recipe to run against preview and source resolution.

## Trade-offs

- JSON documents make stack saves transactional and simple, but concurrent
  per-layer editing would require revision checks or normalized layer rows.
- Materializing every operation preserves exact order but increases memory use
  for very large images.
- Current automatic masks use already-detected subject/face/region boxes.
  Pixel-accurate semantic masks require a separately shipped and tested
  segmentation model.

## Consequences

- Source assets remain immutable.
- Rendered versions work everywhere normal assets work.
- High-megapixel rendering should move behind the tracked workflow runtime when
  cancellation and disk-backed intermediate stages are added.
