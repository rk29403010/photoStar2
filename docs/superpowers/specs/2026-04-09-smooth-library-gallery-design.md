# Smooth Library Gallery Design

## Goal

Make the PhotoStar library scroll at least as smoothly as Google Photos, even if that means showing fewer rows at once and regenerating gallery previews to fit the new browse experience.

## Current Context

- `src/ui/components/LibraryView.tsx` currently loads more assets only when the scroll container gets near the bottom and appends the next page into the same mounted gallery.
- `src/boundary/runtime/usePhotoLibrary.constants.ts` sets `ASSET_PAGE_SIZE` to `48`, which creates a visible "block" boundary when the next chunk arrives late.
- `src/ui/components/layout/LayoutEngine.tsx` renders every loaded gallery item, so scroll cost grows with the number of loaded assets instead of staying flat.
- `src/ui/components/layout/JustifiedLayout.tsx` computes rows for the full loaded dataset and does not yet window rows by viewport.
- `src/ui/components/layout/Tile.tsx` keeps hover captions, group pills, stack badges, and other overlay behavior live on every tile, including animated caption reveal.
- `src/services/jobs/previews.ts` and `src/services/workflowRuntime/modules/generatePreviewsModule.ts` currently generate only two preview sizes: `thumbnail: 256` and `large: 1080`, both using `fit: 'inside'`.

## Observed Problems

The current library experience has two distinct failures compared with Google Photos:

- reaching the end of a loaded block causes a noticeable pause, then a burst of new thumbnails
- normal scrolling feels subtly jittery rather than calm and continuous

The user feedback points to a combined cause rather than one single bottleneck:

- paging happens too close to the visible frontier
- the gallery keeps too much UI mounted and active while scrolling
- preview images are small enough that the browser often has to stretch them into larger display slots
- hover and overlay behavior adds visual noise while the viewport is in motion
- the current library still prioritizes density and feature richness over browse smoothness

## Product Direction

The library view should become an unapologetically browse-first surface:

- smoothness beats maximum density
- justified layout can become the default if it is the smoothest option
- larger thumbnails are acceptable and preferred
- regenerating previews is acceptable if it produces a better browse rail
- light crop or zoom is acceptable for browse thumbnails, especially for extreme historical aspect ratios
- multiple preview sizes are acceptable if that reduces runtime resizing work

At the same time, the library should stop trying to be the future storytelling surface. The richer "photo book" experience with highlighted images, inserted text, and deliberate curation belongs in a separate mode.

## Approved Direction

Replace the current append-as-you-scroll gallery with a buffered, windowed, justified browse rail that:

- renders only visible rows plus overscan
- fetches ahead of the user before the frontier becomes visible
- prefers calmer, larger rows over dense walls of tiny thumbnails
- uses browse-oriented previews that are close to their displayed size
- suppresses non-essential overlay work until the scroll settles

The library should feel continuous rather than paged. If a user can still feel where one `48`-asset block ended and the next began, the redesign has not met the bar.

## Experience Principles

### Calm rail over dense wall

The default library should show fewer rows than today. Each image should stay on screen slightly longer and have more room, which reduces both decoding pressure and perceived chaos.

### Continuous reveal over burst append

New rows should arrive before the user reaches the visible frontier. The user should not hit an empty edge, a loader gap, or a synchronized "all thumbnails appeared" moment.

### Stable motion over clever packing

The browse rail should avoid unnecessary resize churn. Slight slack at row ends is acceptable if it prevents repeated relayout and keeps motion visually steady.

### Settled overlays over live chrome

While the user is actively scrolling, tiles should mostly behave like images, not mini dashboards. Hover captions, group pills, and similar affordances should return only after a short idle delay.

## Architecture

### 1. Buffered data pipeline

Replace bottom-threshold paging with row-aware prefetching.

The next chunk should be requested when the user is approaching the end of the buffered rows rather than when they are already at the bottom of the mounted container. The prefetch trigger should be based on remaining visible rows or viewport heights, not a fixed pixel remainder alone.

The buffer should always aim to stay ahead of the viewport so the gallery can reveal the next rows seamlessly.

### 2. Windowed justified rendering

The justified gallery should become a row-windowed surface instead of a full mounted list of every loaded tile.

Use the existing justified-row computation as the basis for a row model, but render only:

- the rows inside the viewport
- a small overscan region above and below

The dependency set already includes `react-virtuoso`, which is a good fit for a variable-height row list. The implementation can use that library or an equivalent row-window abstraction, but the important design constraint is that mounted row count must stay roughly flat as the loaded dataset grows.

### 3. Stable row bands

The library should use calmer, larger target row heights than today and snap them into a small set of browse bands rather than freely recomputing a "perfect" height for every tiny change.

This makes display size more predictable and helps the preview pipeline provide images that are already near their rendered dimensions.

The rail does not need to perfectly justify every row edge-to-edge if that creates unnecessary churn. A little unused width is a better trade than visible instability.

### 4. Scroll-settled UI layers

Introduce an explicit "scroll active" state for the gallery.

While scroll is active:

- do not show hover captions
- do not show group id pills
- do not animate caption overlays
- avoid any non-essential hover chrome

While scroll is settled:

- restore hover affordances after a short delay
- keep the reveal visual-only so it does not change tile dimensions or row height

Selection borders and direct click targets should remain available throughout.

## Thumbnail Strategy

### Browse previews become a dedicated pipeline

The current `256px` thumbnail is too small for the calmer, larger-row browse experience. The library should stop relying on one undersized preview for all browse contexts.

Introduce multiple browse-oriented preview sizes so the gallery can choose the nearest native asset for the current row band and mostly downscale in the browser rather than scaling tiny images upward.

Representative sizes can be tuned during implementation, but the design direction is:

- at least one medium browse preview for normal desktop gallery rows
- at least one larger browse preview for wider or taller justified rows
- continued support for larger detail-oriented previews outside the library rail

### Raw size where possible

The gallery should prefer using previews at or near their raw encoded size instead of asking the browser to do significant runtime resizing work.

This means:

- choose the nearest browse preview size above the rendered tile size when available
- avoid stretching the smallest preview into large row slots
- keep the display contract biased toward modest downscale rather than upscale

### Light crop for extreme ratios

The user explicitly approved light crop or zoom for browse thumbnails, especially for older images with unusual aspect ratios.

The browse pipeline should support a simple crop mode for the library rail:

- clamp extreme aspect ratios into a calmer browse range
- use a simple heuristic first, such as center-weighted crop
- prefer face-preserving crop if face boxes are already available
- keep the original image and less-processed previews for views where full framing matters

The first slice does not need advanced saliency. "Simple but stable" is good enough if it produces a better scroll.

## View Boundary

This redesign is only for the high-speed library browse surface.

The future storytelling mode should remain out of scope for this work. That later mode can support:

- curated photo sequences
- highlighted hero images
- inserted text
- more elegant tiled composition
- manual or AI-assisted narrative layout

The library should not carry those responsibilities if they compromise browse smoothness.

## Rollout Plan

### Slice 1: Calm the current gallery

- make justified mode the default library layout if it remains the smoothest path
- increase row height and reduce on-screen density
- gate non-essential overlays behind a scroll-settled state
- remove hover-caption animation while the gallery is moving

### Slice 2: Remove the visible block boundary

- prefetch earlier based on buffered rows
- ensure the next content arrives before the user reaches the frontier
- reveal new rows progressively instead of in one obvious burst

### Slice 3: Window the rail

- virtualize justified rows
- keep mounted row count bounded by viewport plus overscan
- hold row geometry stable enough that the viewport does not "breathe" as data arrives

### Slice 4: Rebuild browse previews

- add multiple browse preview sizes
- add a browse-thumbnail crop mode
- regenerate previews by bumping the preview version
- select preview variants to stay near raw display size

## Testing Strategy

Add coverage for both behavior and feel-critical wiring:

### Row and buffer logic

- row-window calculations for justified rows with variable heights
- prefetch trigger behavior before the visible frontier
- stable row-band assignment for changing container widths

### Preview selection

- choosing the nearest browse preview for a rendered tile size
- fallback behavior when only a subset of preview variants exists
- crop-mode behavior for extreme aspect ratios

### UI gating

- scroll-active versus scroll-settled overlay behavior
- hover caption suppression while scrolling
- ensuring overlay restoration does not alter layout dimensions

### Manual verification

Validate with a mixed historical library containing odd portrait, square, panorama, and scan-like aspect ratios. The redesign should specifically prove:

- no noticeable pause at the old page boundary
- no "all thumbnails appear at once" burst
- visibly calmer scrolling than the current gallery
- crisp thumbnails at the new row sizes
- responsive click and selection behavior during background loading

## Out Of Scope

- building the future storytelling or photo-book view
- perfect saliency-aware browse crops
- changing the single-photo detail view beyond any preview-selection plumbing it needs
- preserving the current library density if it conflicts with scroll quality
