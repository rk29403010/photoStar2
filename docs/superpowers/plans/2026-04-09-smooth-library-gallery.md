# Smooth Library Gallery Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the library gallery into a calmer, windowed, justified browse rail that removes the visible page boundary, keeps interactions responsive, and uses browse-oriented preview sizes instead of stretching a single undersized thumbnail.

**Architecture:** Keep the library's data flow and selection behavior, but swap the current "render every loaded tile and fetch near the bottom" approach for a row-windowed justified rail with early prefetch and a scroll-settled overlay layer. Pair that UI change with a dedicated browse preview pipeline that generates multiple gallery-sized variants, keeps `thumbnail` as a compatibility alias, and lets the library choose the nearest raw preview size for each row profile.

**Tech Stack:** React 19, TypeScript, `react-virtuoso`, existing library gallery components, Sharp preview generation, better-sqlite3-backed asset queries, Node test runner, repo quality scripts.

---

## File Map

- Modify: `src/ui/components/LibraryView.tsx` - make `justified` the default browse mode, own the scroll-settled state, and thread viewport/prefetch signals into the gallery rail.
- Create: `src/ui/components/library/galleryBrowseRailModel.ts` - pure helpers for row-height bands, prefetch thresholds, and scroll-settled timing.
- Modify: `src/ui/components/library/libraryViewTimeline.tsx` - stop deriving the current timeline bucket from every mounted DOM tile and use virtualized viewport callbacks instead.
- Modify: `src/ui/components/layout/JustifiedLayout.tsx` - convert the current full-row renderer into a row-windowed justified rail.
- Modify: `src/ui/components/layout/LayoutModeRenderer.tsx` - pass viewport callbacks, row metrics, and settled-state props into the justified renderer.
- Modify: `src/ui/components/layout/LayoutEngine.tsx` - keep selection wiring intact while threading preview profile and overlay gating into tiles.
- Create: `src/ui/components/layout/tileOverlayModel.ts` - pure rules for which overlays render while the gallery is moving versus settled.
- Modify: `src/ui/components/layout/Tile.tsx` - gate captions and group chrome behind the settled state and pick browse previews using a preview profile.
- Modify: `src/shared/utils/libraryJustifiedLayout.ts` - add stable row-band options and row metadata that support virtualization without forcing perfect edge-to-edge packing.
- Create: `src/shared/utils/libraryBrowsePreview.ts` - choose the nearest browse preview variant for a tile profile.
- Create: `src/services/previews/previewVariants.ts` - shared preview-size definitions, browse crop policy, and preview-version constant used by both preview generators.
- Create: `src/services/handlers/assetPreviewQuery.ts` - SQL helpers for loading preview variants without further bloating `assetCommands.ts`.
- Modify: `src/services/jobs/previews.ts` - generate browse preview variants and keep `thumbnail` as the compatibility path that older consumers already understand.
- Modify: `src/services/workflowRuntime/modules/generatePreviewsModule.ts` - mirror the shared browse preview generation behavior used by the legacy preview job.
- Modify: `src/services/handlers/assetCommands.ts` - load preview-variant metadata for `get_assets` responses through the new helper.
- Modify: `src/services/handlers/assetPayloadModel.ts` - parse preview variants into the asset payload without breaking the existing `preview_path` field.
- Modify: `src/boundary/contracts/core.ts` - add an optional preview-variant field to `Asset`.
- Create: `tests/ui/gallery-browse-rail-model.test.cjs` - cover prefetch thresholds, row bands, and scroll-settled timing.
- Create: `tests/ui/tile-overlay-model.test.cjs` - cover which overlays disappear while scrolling.
- Create: `tests/core/library-browse-preview.test.cjs` - cover nearest-variant preview selection.
- Create: `tests/core/preview-variants.test.cjs` - cover the shared preview size definitions and browse crop policy.
- Modify: `tests/repo/gallery-time-jump-wiring.test.mjs` - assert the timeline rail is wired through the virtualized viewport path.
- Create: `tests/repo/gallery-browse-rail-wiring.test.mjs` - assert the justified rail uses windowed rendering and preview-profile plumbing.
- Modify: `tests/repo/gallery-justified-layout-wiring.test.mjs` - assert the library defaults to justified mode.

## Chunk 1: Browse-Rail Model

### Task 1: Lock down the scroll model before touching the renderer

**Files:**

- Create: `tests/ui/gallery-browse-rail-model.test.cjs`
- Create: `src/ui/components/library/galleryBrowseRailModel.ts`
- Modify: `src/ui/components/LibraryView.tsx`

- [ ] **Step 1: Write the failing model test**

Cover these pure behaviors:

- the library defaults to a calmer justified browse mode
- prefetch becomes active before the viewport reaches the final buffered rows
- row heights snap into a small set of browse bands
- the scroll-settled state stays false while scroll events keep arriving and flips true only after the idle delay

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `node.exe --test tests/ui/gallery-browse-rail-model.test.cjs`
Expected: FAIL because `galleryBrowseRailModel.ts` does not exist yet.

- [ ] **Step 3: Write the minimal model implementation**

Create `src/ui/components/library/galleryBrowseRailModel.ts` with focused helpers such as:

- `getDefaultGalleryLayoutMode(): 'justified'`
- `getBrowseRowHeightBand(containerWidth: number): number`
- `shouldPrefetchBufferedRows(remainingRows: number, viewportRowCount: number): boolean`
- `getScrollSettledState(lastScrollAt: number, now: number, delayMs: number): boolean`

Keep the file pure so it can be unit-tested without React hooks.

- [ ] **Step 4: Thread the model into `LibraryView.tsx`**

Use the model helpers to:

- initialize `layoutMode` to `justified`
- compute the active row-height band for the gallery
- own a small scroll-settled state source that later chunks can pass into the renderer

Do not rewrite the paging implementation yet; only add the state plumbing needed for the next chunk.

- [ ] **Step 5: Run the targeted test again**

Run: `node.exe --test tests/ui/gallery-browse-rail-model.test.cjs`
Expected: PASS

- [ ] **Step 6: Commit the chunk**

Run:

```bash
git add tests/ui/gallery-browse-rail-model.test.cjs src/ui/components/library/galleryBrowseRailModel.ts src/ui/components/LibraryView.tsx
git commit -m "feat: add smooth gallery rail model"
```

## Chunk 2: Windowed Justified Rail

### Task 2: Replace full mounted justified rows with a virtualized rail

**Files:**

- Modify: `src/shared/utils/libraryJustifiedLayout.ts`
- Modify: `src/ui/components/layout/JustifiedLayout.tsx`
- Modify: `src/ui/components/layout/LayoutModeRenderer.tsx`
- Modify: `src/ui/components/layout/LayoutEngine.tsx`
- Modify: `src/ui/components/library/libraryViewTimeline.tsx`
- Create: `tests/repo/gallery-browse-rail-wiring.test.mjs`
- Modify: `tests/repo/gallery-time-jump-wiring.test.mjs`
- Modify: `tests/repo/gallery-justified-layout-wiring.test.mjs`

- [ ] **Step 1: Write the failing wiring tests**

Add repo assertions that prove:

- justified mode is now the default library layout
- the justified renderer goes through a virtualized row path rather than rendering every row directly
- the timeline viewport bucket is updated from virtualized viewport callbacks instead of scanning all mounted tiles

- [ ] **Step 2: Run the targeted wiring tests to verify they fail**

Run:

```bash
node.exe --test tests/repo/gallery-browse-rail-wiring.test.mjs tests/repo/gallery-time-jump-wiring.test.mjs tests/repo/gallery-justified-layout-wiring.test.mjs
```

Expected: FAIL because the new browse-rail wiring does not exist yet.

- [ ] **Step 3: Extend the justified layout helper**

Update `src/shared/utils/libraryJustifiedLayout.ts` so it can:

- build row metadata for a stable row-height band
- keep a little slack at row ends instead of forcing perfect width fill
- expose row indices and heights in a form the renderer can virtualize

Do not add DOM logic here; keep it pure.

- [ ] **Step 4: Rewrite `JustifiedLayout.tsx` around row virtualization**

Use the existing `react-virtuoso` dependency to render justified rows as a variable-height list that mounts only the viewport plus overscan.

The component should:

- accept row height / viewport callbacks from `LibraryView`
- compute justified rows from the loaded dataset
- expose the visible row range or top visible selection key back to the timeline helper
- preserve tile click and selection behavior by continuing to call the existing render callback

- [ ] **Step 5: Update `LayoutModeRenderer.tsx`, `LayoutEngine.tsx`, and `libraryViewTimeline.tsx`**

Thread through the new justified-rail props without growing `LayoutEngine.tsx` into a monolith:

- `LayoutModeRenderer.tsx` should pass the row-band and viewport callbacks
- `LayoutEngine.tsx` should keep tile interaction code unchanged where possible
- `libraryViewTimeline.tsx` should derive the visible bucket from virtualized viewport data instead of `querySelectorAll('[data-selection-key]')`

- [ ] **Step 6: Run the targeted wiring tests again**

Run:

```bash
node.exe --test tests/repo/gallery-browse-rail-wiring.test.mjs tests/repo/gallery-time-jump-wiring.test.mjs tests/repo/gallery-justified-layout-wiring.test.mjs
```

Expected: PASS

- [ ] **Step 7: Commit the chunk**

Run:

```bash
git add src/shared/utils/libraryJustifiedLayout.ts src/ui/components/layout/JustifiedLayout.tsx src/ui/components/layout/LayoutModeRenderer.tsx src/ui/components/layout/LayoutEngine.tsx src/ui/components/library/libraryViewTimeline.tsx tests/repo/gallery-browse-rail-wiring.test.mjs tests/repo/gallery-time-jump-wiring.test.mjs tests/repo/gallery-justified-layout-wiring.test.mjs
git commit -m "feat: virtualize justified gallery rows"
```

## Chunk 3: Overlay Gating And Scroll Calm

### Task 3: Strip motion noise out of the moving gallery

**Files:**

- Create: `src/ui/components/layout/tileOverlayModel.ts`
- Create: `tests/ui/tile-overlay-model.test.cjs`
- Modify: `src/ui/components/layout/Tile.tsx`
- Modify: `src/ui/components/layout/LayoutEngine.tsx`
- Modify: `src/ui/components/LibraryView.tsx`

- [ ] **Step 1: Write the failing overlay test**

Cover these rules:

- captions stay hidden while scroll is active
- group-id pills stay hidden while scroll is active
- selection borders remain visible while scroll is active
- settled state restores overlays without changing tile size

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `node.exe --test tests/ui/tile-overlay-model.test.cjs`
Expected: FAIL because the overlay model does not exist yet.

- [ ] **Step 3: Implement the overlay model**

Create `src/ui/components/layout/tileOverlayModel.ts` with a single responsibility: given `selected`, `showGroupIds`, `isHovered`, and `isScrollSettled`, decide which overlay layers should render.

- [ ] **Step 4: Thread the model through `Tile.tsx` and the gallery shell**

Update `Tile.tsx`, `LayoutEngine.tsx`, and `LibraryView.tsx` so that:

- active scroll suppresses caption and group overlay rendering
- any remaining overlay reveal is visual-only and does not affect layout dimensions
- selection, click, and double-click behavior stays unchanged

Avoid adding more branching directly inside `Tile.tsx` than the guardrails allow; keep the policy in the new model file.

- [ ] **Step 5: Run the targeted test again**

Run: `node.exe --test tests/ui/tile-overlay-model.test.cjs`
Expected: PASS

- [ ] **Step 6: Commit the chunk**

Run:

```bash
git add src/ui/components/layout/tileOverlayModel.ts tests/ui/tile-overlay-model.test.cjs src/ui/components/layout/Tile.tsx src/ui/components/layout/LayoutEngine.tsx src/ui/components/LibraryView.tsx
git commit -m "feat: defer gallery overlays until scroll settles"
```

## Chunk 4: Browse Preview Generation

### Task 4: Generate gallery-sized browse previews instead of one undersized thumbnail

**Files:**

- Create: `src/services/previews/previewVariants.ts`
- Create: `tests/core/preview-variants.test.cjs`
- Modify: `src/services/jobs/previews.ts`
- Modify: `src/services/workflowRuntime/modules/generatePreviewsModule.ts`

- [ ] **Step 1: Write the failing preview-config test**

Cover these expectations:

- browse preview definitions live in one shared module
- the config exposes more than one browse preview size
- `thumbnail` remains defined as the compatibility alias older code still expects
- the preview version changes when the browse variant set changes

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `node.exe --test tests/core/preview-variants.test.cjs`
Expected: FAIL because the shared preview config does not exist yet.

- [ ] **Step 3: Implement the shared preview config**

Create `src/services/previews/previewVariants.ts` with:

- the canonical list of preview variants
- a simple browse crop policy for gallery previews
- the shared preview version constant

Start with a simple center-weighted crop policy for browse previews. Do not block this chunk on face-aware cropping.

- [ ] **Step 4: Update both preview generators**

Modify `src/services/jobs/previews.ts` and `src/services/workflowRuntime/modules/generatePreviewsModule.ts` to use the shared config and emit:

- a compatibility `thumbnail`
- at least one medium browse preview
- at least one larger browse preview
- the existing large/detail preview

Keep the implementation deterministic so existing libraries can be regenerated by bumping the preview version.

- [ ] **Step 5: Run the targeted test again**

Run: `node.exe --test tests/core/preview-variants.test.cjs`
Expected: PASS

- [ ] **Step 6: Commit the chunk**

Run:

```bash
git add src/services/previews/previewVariants.ts tests/core/preview-variants.test.cjs src/services/jobs/previews.ts src/services/workflowRuntime/modules/generatePreviewsModule.ts
git commit -m "feat: generate browse-oriented gallery preview variants"
```

## Chunk 5: Preview Selection In The Library Payload

### Task 5: Let the library choose the nearest raw preview size for each row profile

**Files:**

- Create: `src/shared/utils/libraryBrowsePreview.ts`
- Create: `src/services/handlers/assetPreviewQuery.ts`
- Create: `tests/core/library-browse-preview.test.cjs`
- Modify: `src/services/handlers/assetCommands.ts`
- Modify: `src/services/handlers/assetPayloadModel.ts`
- Modify: `src/boundary/contracts/core.ts`
- Modify: `src/ui/components/layout/Tile.tsx`
- Modify: `src/ui/components/layout/LayoutEngine.tsx`

- [ ] **Step 1: Write the failing preview-selection test**

Cover these rules:

- the library picks the nearest preview size at or above the requested tile profile when possible
- it falls back to the compatibility `thumbnail` when variant metadata is missing
- it prefers modest downscale over upscale

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `node.exe --test tests/core/library-browse-preview.test.cjs`
Expected: FAIL because the preview-selection helper does not exist yet.

- [ ] **Step 3: Implement the preview-selection helper and asset contract**

Create `src/shared/utils/libraryBrowsePreview.ts` and extend `Asset` in `src/boundary/contracts/core.ts` with a preview-variants field, for example:

- compatibility `preview_path`
- optional browse preview map keyed by variant name

Keep the contract additive so older callers still work.

- [ ] **Step 4: Extract preview-variant SQL loading**

Create `src/services/handlers/assetPreviewQuery.ts` so `assetCommands.ts` can load preview-variant metadata without growing even larger.

Then update `assetCommands.ts` and `assetPayloadModel.ts` so `get_assets` continues returning `preview_path` plus the new variant map.

- [ ] **Step 5: Update the tile resolver**

Modify `LayoutEngine.tsx` and `Tile.tsx` so the justified browse rail can request a preview profile and `Tile.tsx` can resolve the best available preview variant for that profile. Keep non-library callers working by falling back to `preview_path`.

- [ ] **Step 6: Run the targeted test again**

Run: `node.exe --test tests/core/library-browse-preview.test.cjs`
Expected: PASS

- [ ] **Step 7: Commit the chunk**

Run:

```bash
git add src/shared/utils/libraryBrowsePreview.ts src/services/handlers/assetPreviewQuery.ts tests/core/library-browse-preview.test.cjs src/services/handlers/assetCommands.ts src/services/handlers/assetPayloadModel.ts src/boundary/contracts/core.ts src/ui/components/layout/Tile.tsx src/ui/components/layout/LayoutEngine.tsx
git commit -m "feat: select gallery previews by row profile"
```

## Chunk 6: Verification And Handoff

### Task 6: Prove the rail feels better and leaves the repo clean

**Files:**

- Verify: all touched source, test, and docs files

- [ ] **Step 1: Pause the managed dev session before editing application code**

Run: `npm.cmd run dev:pause`
Expected: if a managed session exists in this worktree it pauses cleanly; otherwise report that no worktree-owned session was running.

- [ ] **Step 2: Run the focused automated tests**

Run:

```bash
node.exe --test tests/ui/gallery-browse-rail-model.test.cjs tests/ui/tile-overlay-model.test.cjs tests/core/preview-variants.test.cjs tests/core/library-browse-preview.test.cjs tests/repo/gallery-browse-rail-wiring.test.mjs tests/repo/gallery-time-jump-wiring.test.mjs tests/repo/gallery-justified-layout-wiring.test.mjs
```

Expected: PASS

- [ ] **Step 3: Run the fast staged guardrails**

Run: `npm.cmd run quality:staged`
Expected: PASS for staged files.

- [ ] **Step 4: Run the broader repo verification**

Run: `npm.cmd run quality`
Expected: PASS, or a concise report of any pre-existing or newly introduced failures.

- [ ] **Step 5: Manually verify the gallery rail**

Check a mixed-aspect-ratio library and confirm:

- the old 48-item boundary is no longer visible
- the next rows arrive before the frontier is exposed
- scroll no longer feels jittery when captions and group overlays are suppressed
- justified mode feels calmer with fewer rows and larger thumbnails
- thumbnails stay crisp at the new row sizes

- [ ] **Step 6: Resume the managed dev session if it was paused**

Run: `npm.cmd run dev:resume`
Expected: the worktree-managed session resumes cleanly, or report that nothing needed resuming.

- [ ] **Step 7: Close out with explicit git hygiene**

Run:

```bash
git status --short
git diff --cached --stat
```

Expected: only intended files remain staged, with no unexplained leftovers.
