# Justified Library Gallery Design

## Goal

Make the PhotoStar library gallery feel tighter and more Google Photos-like for mixed historical scans and odd aspect ratios, without forcing aggressive crop loss.

## Current Context

- The gallery currently uses a span-based CSS grid in [src/ui/components/layout/LayoutEngine.tsx](C:/Users/robin/Projects/photoStar2/src/ui/components/layout/LayoutEngine.tsx).
- Tile sizing is derived from a small preset ratio list in [src/shared/utils/libraryLayout.ts](C:/Users/robin/Projects/photoStar2/src/shared/utils/libraryLayout.ts).
- Tile media currently renders previews with `objectFit: 'contain'` in [src/ui/components/layout/Tile.tsx](C:/Users/robin/Projects/photoStar2/src/ui/components/layout/Tile.tsx), which preserves full images but introduces visible internal letterboxing.
- Preview generation currently writes `thumbnail` previews at `256px` wide using `fit: 'inside'` in [src/services/jobs/previews.ts](C:/Users/robin/Projects/photoStar2/src/services/jobs/previews.ts) and [src/services/workflowRuntime/modules/generatePreviewsModule.ts](C:/Users/robin/Projects/photoStar2/src/services/workflowRuntime/modules/generatePreviewsModule.ts).

## Problem Summary

The current layout combines:

- coarse aspect-ratio bucketing,
- span-based grid packing,
- variable grid cell height,
- and contained images inside fixed tile shells.

That combination leaves visible dead space inside tiles and produces a looser, more irregular wall than the reference Google Photos view.

## Approved Direction

Add a new justified gallery layout mode that:

- uses each asset's real aspect ratio,
- computes rows against the available container width,
- applies a shared target row height per row,
- slightly scales each row to fit edge-to-edge,
- and avoids internal letterboxing by matching each tile shell to the rendered image size.

This should live alongside the existing `tiled` and `grid` modes so the behavior can be compared safely in-app.

## UX Decisions

- The new mode should prioritize a tight gallery wall over preserving the current hero-style mosaic behavior.
- The default visual should remain uncropped where practical; the first slice should not introduce per-image crop loss.
- The new layout should preserve current overlays, selection behavior, and click targets.
- Gaps should stay small, comparable to the current `2px` spacing.

## Architecture

### Layout Computation

Extract justified-row math into a focused helper instead of growing `LayoutEngine`.

The helper should:

- accept visible gallery items plus container width,
- derive each item aspect ratio from real asset dimensions,
- pack rows until they reach a target width,
- compute per-item pixel width and row height,
- handle a looser final row so it does not become visually stretched.

### Rendering

Keep `LayoutEngine` responsible for gallery interaction wiring, but allow it to render a separate justified container when the new mode is active.

The justified path should:

- render rows explicitly,
- size each tile shell using the computed width/height,
- preserve existing selection and hover interactions,
- reuse the existing `Tile` component for overlays and event handling.

### Media Presentation

`Tile` should support a fill mode that avoids `contain`-style letterboxing in justified rows. Since the tile shell will already match the intended aspect ratio, standard image fill can preserve the whole preview without black padding.

## Preview Sizing

The first slice can keep the current preview-generation algorithm, but the new layout should be designed so thumbnail density can be raised cleanly afterward.

Recommended follow-up:

- increase `thumbnail` previews from `256` to `384` or `512`,
- bump preview version to force regeneration,
- verify sharper rendering on wider desktop rows.

This follow-up is optional for the first implementation slice.

## Testing Strategy

Add focused tests for:

- justified row packing using mixed aspect ratios,
- final-row behavior,
- fallback aspect ratio handling when width/height are missing,
- wiring for the new gallery layout mode.

## Out Of Scope

- Replacing the current `tiled` mode.
- Changing sort/grouping behavior.
- Thumbnail regeneration in the same slice unless the implementation proves it is necessary for acceptable visual quality.
