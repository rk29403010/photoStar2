# Justified Library Gallery Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a justified library-gallery layout mode that produces tighter rows for mixed-aspect-ratio photos without breaking existing gallery interactions.

**Architecture:** Keep the current `tiled` and `grid` modes intact, add a new `justified` mode, and move the row-packing math into a small helper so `LayoutEngine` stays reviewable. Reuse the existing `Tile` component and selection wiring so the change is mostly a layout/rendering swap rather than a gallery rewrite.

**Tech Stack:** React, TypeScript, Node test runner, existing library gallery components, repo quality scripts.

---

## Chunk 1: Layout Math

### Task 1: Add failing tests for justified row packing

**Files:**

- Create: `tests/core/library-justified-layout.test.cjs`
- Create: `src/shared/utils/libraryJustifiedLayout.ts`

- [ ] **Step 1: Write the failing test**

Add tests that verify:

- mixed aspect ratios are packed into multiple rows,
- each item in a row shares the same rendered height,
- row widths fit the available container width within a small tolerance,
- missing width/height falls back to a square-ish ratio instead of crashing.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/core/library-justified-layout.test.cjs`
Expected: FAIL because `buildJustifiedLayoutRows` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `src/shared/utils/libraryJustifiedLayout.ts` with:

- a small aspect-ratio helper,
- a row-packing function,
- typed row/item output for the renderer.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/core/library-justified-layout.test.cjs`
Expected: PASS

## Chunk 2: Gallery Wiring

### Task 2: Add a wiring test for the new layout mode

**Files:**

- Modify: `tests/repo/gallery-group-id-toggle-wiring.test.mjs`
- Modify: `src/shared/utils/libraryLayout.ts`
- Modify: `src/ui/components/LibraryView.tsx`
- Modify: `src/ui/components/library/LibraryToolbar.tsx`

- [ ] **Step 1: Write the failing test**

Add a wiring assertion that the library layout mode union and toolbar options include `justified`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/repo/gallery-group-id-toggle-wiring.test.mjs`
Expected: FAIL because the new mode is not exposed yet.

- [ ] **Step 3: Write minimal implementation**

Update the layout mode union and the toolbar select so the new mode is selectable.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/repo/gallery-group-id-toggle-wiring.test.mjs`
Expected: PASS

## Chunk 3: Renderer

### Task 3: Render justified rows without growing `LayoutEngine` past guardrails

**Files:**

- Create: `src/ui/components/layout/JustifiedLayout.tsx`
- Modify: `src/ui/components/layout/LayoutEngine.tsx`
- Modify: `src/ui/components/layout/Tile.tsx`

- [ ] **Step 1: Add the smallest failing coverage needed**

If renderer behavior is not already covered by the row-packing tests, add one focused test or repo wiring assertion for the justified renderer path.

- [ ] **Step 2: Run the failing test**

Run the targeted test command for the coverage added in step 1.
Expected: FAIL for the new renderer path.

- [ ] **Step 3: Implement the renderer**

Create `JustifiedLayout.tsx` to:

- accept visible items and current gallery callbacks,
- use a resize observer or container measurement to derive row layout,
- render explicit rows,
- pass all existing tile interactions through unchanged.

Keep `LayoutEngine.tsx` as the switchboard that chooses between:

- existing CSS grid rendering for `tiled` and `grid`,
- the new justified renderer for `justified`.

Adjust `Tile.tsx` only as needed to avoid internal letterboxing in justified mode.

- [ ] **Step 4: Run the targeted tests again**

Run the same targeted test command(s) used above.
Expected: PASS

## Chunk 4: Verification

### Task 4: Run repo guardrails for touched files

**Files:**

- Verify: touched source, test, and docs files from the tasks above

- [ ] **Step 1: Pause the managed dev session before editing application code**

Run: `npm.cmd run dev:pause`
Expected: session pauses cleanly.

- [ ] **Step 2: Run fast staged quality checks while iterating**

Run: `npm.cmd run quality:staged`
Expected: PASS for staged files, or actionable failures to fix.

- [ ] **Step 3: Run complexity guardrail explicitly for touched files**

Run: `npm.cmd run complexity:staged -- --files=src/shared/utils/libraryJustifiedLayout.ts,src/ui/components/layout/JustifiedLayout.tsx,src/ui/components/layout/LayoutEngine.tsx,src/ui/components/layout/Tile.tsx,src/shared/utils/libraryLayout.ts,src/ui/components/LibraryView.tsx,src/ui/components/library/LibraryToolbar.tsx`
Expected: PASS

- [ ] **Step 4: Resume the managed dev session**

Run: `npm.cmd run dev:resume`
Expected: session resumes cleanly.

- [ ] **Step 5: Run broader handoff verification**

Run: `npm.cmd run quality`
Expected: PASS, or report exact remaining failures honestly.
