# Grouped Timeline Gallery Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current flat date-sorted gallery flow with a first-class grouped timeline path that makes decade browsing, jumping, and paging native instead of inferred.

**Architecture:** Keep the existing non-date gallery modes intact, but split date browsing into a dedicated grouped timeline model. The backend should expose timeline groups and group-aware paging, while the frontend should render date mode with `GroupedVirtuoso` using decade groups and justified rows as group items. The existing generic `LibraryView` shell remains, but the current faux-grouped `JustifiedLayout` plus timeline-jump glue stops being the source of truth for date mode.

**Tech Stack:** React, TypeScript, `react-virtuoso`, Node test runner, existing library/gallery runtime hooks, repo quality scripts.

---

## Chunk 1: Freeze The Target Data Model

### Task 1: Define the grouped timeline contract before touching runtime flow

**Files:**

- Create: `src/boundary/contracts/timelineGallery.ts`
- Modify: `src/boundary/contracts/core.ts`
- Modify: `src/shared/utils/libraryGallery.ts`
- Test: `tests/core/timeline-gallery-contract.test.mjs`

- [ ] **Step 1: Write the failing contract test**

Add a focused contract test that asserts the new date-mode model can represent:

- ordered timeline groups (`decade-2010`, `decade-2000`, ...),
- a visible label and stable sort key per group,
- summary metadata such as item count and loaded state,
- group items that are explicit row payloads or explicit asset payloads,
- jump targets that can be addressed by group id instead of inferred entry index.

- [ ] **Step 2: Run the contract test and confirm it fails**

Run: `node --test tests/core/timeline-gallery-contract.test.mjs`
Expected: FAIL because the grouped timeline contract does not exist yet.

- [ ] **Step 3: Add the new contract types**

Create `src/boundary/contracts/timelineGallery.ts` with a small, boring contract surface:

- `TimelineGroupId`
- `TimelineGroupSummary`
- `TimelineGroupRow`
- `TimelineGroupItem`
- `TimelineGalleryPage`
- `TimelineJumpTarget`

Export only the pieces the UI/runtime actually need. Update `src/boundary/contracts/core.ts` only if existing runtime message typing expects re-exported contracts.

- [ ] **Step 4: Add the minimum gallery utility typing**

Update `src/shared/utils/libraryGallery.ts` so date mode can branch on a future grouped timeline path without widening generic gallery types everywhere.

- [ ] **Step 5: Run the contract test again**

Run: `node --test tests/core/timeline-gallery-contract.test.mjs`
Expected: PASS

## Chunk 2: Create A Backend Timeline Path Instead Of More Flat Paging

### Task 2: Add group-aware timeline payload builders beside the existing flat asset paging

**Files:**

- Modify: `src/ui/hooks/usePhotoLibrary.gallery.ts`
- Modify: `src/boundary/runtime/usePhotoLibrary.commands.ts`
- Modify: `src/boundary/runtime/usePhotoLibrary.connection.ts`
- Modify: `src/boundary/runtime/usePhotoLibrary.connection.messages.ts`
- Test: `tests/repo/gallery-grouped-timeline-paging-wiring.test.mjs`

- [ ] **Step 1: Write the failing wiring test**

Add repo wiring coverage that asserts:

- date mode can request timeline group metadata separately from generic asset pages,
- the runtime can request one or more decade groups by id,
- jump handling does not depend on `offset`-based “load until section appears” logic,
- the existing flat `get_assets` path still exists for non-date modes.

- [ ] **Step 2: Run the wiring test and confirm it fails**

Run: `node --test tests/repo/gallery-grouped-timeline-paging-wiring.test.mjs`
Expected: FAIL because no grouped timeline request path exists yet.

- [ ] **Step 3: Add timeline request payload helpers**

Extend `src/ui/hooks/usePhotoLibrary.gallery.ts` with new payload helpers for:

- `get_timeline_groups`
- `get_timeline_group_page`
- optional `get_timeline_jump_target`

Keep the existing flat asset payload builders unchanged so non-date modes keep working.

- [ ] **Step 4: Thread the new commands through the runtime boundary**

Update the runtime command and connection layers so the UI can request:

- the ordered decade list,
- page data for a specific decade,
- an addressable jump target by group id if the backend supports it.

Keep this isolated from unrelated workflow or detail-loading code.

- [ ] **Step 5: Run the wiring test again**

Run: `node --test tests/repo/gallery-grouped-timeline-paging-wiring.test.mjs`
Expected: PASS

## Chunk 3: Introduce A Dedicated Date Timeline State Slice

### Task 3: Stop making `LibraryView` derive grouped timeline state from the flat display list

**Files:**

- Create: `src/ui/hooks/useTimelineGalleryState.ts`
- Modify: `src/ui/hooks/usePhotoLibrary.state.ts`
- Modify: `src/ui/hooks/usePhotoLibrary.ts`
- Modify: `src/ui/components/LibraryView.tsx`
- Modify: `src/ui/components/library/libraryViewHelpers.tsx`
- Test: `tests/repo/gallery-grouped-timeline-state-wiring.test.mjs`

- [ ] **Step 1: Write the failing wiring test**

Add coverage that asserts:

- date mode reads from a dedicated grouped timeline state slice,
- `LibraryView` no longer computes loaded decade ids from `buildGalleryTimeSections(displayItems, ...)` for the main date path,
- timeline jump state is keyed by group id / group index rather than section entry indexes from `JustifiedLayout`.

- [ ] **Step 2: Run the wiring test and confirm it fails**

Run: `node --test tests/repo/gallery-grouped-timeline-state-wiring.test.mjs`
Expected: FAIL because the state slice does not exist yet.

- [ ] **Step 3: Add a narrow timeline gallery state model**

Create `src/ui/hooks/useTimelineGalleryState.ts` with state for:

- ordered group summaries,
- loaded group pages,
- loading flags per group,
- active jump target,
- visible group id / index.

Keep the state shape small and explicit. Do not merge it into the existing generic asset state blob if that makes ownership less clear.

- [ ] **Step 4: Compose the new state into `usePhotoLibrary`**

Thread the grouped timeline slice through `usePhotoLibrary.state.ts` and `usePhotoLibrary.ts` so `LibraryView` receives date-mode timeline data without losing existing generic gallery props.

- [ ] **Step 5: Refactor `LibraryView` to branch cleanly**

Update `LibraryView.tsx` so it chooses between:

- the existing flat gallery path for non-date modes,
- the new grouped timeline path for `date` and `reverse-date`.

This is the point where `useLoadedTimelineSectionIds` should stop being the main date-mode source of truth.

- [ ] **Step 6: Run the wiring test again**

Run: `node --test tests/repo/gallery-grouped-timeline-state-wiring.test.mjs`
Expected: PASS

## Chunk 4: Build The Date Mode Renderer Around `GroupedVirtuoso`

### Task 4: Add a dedicated grouped timeline renderer instead of flattening headers and rows into one list

**Files:**

- Create: `src/ui/components/layout/GroupedTimelineLayout.tsx`
- Modify: `src/ui/components/layout/LayoutModeRenderer.tsx`
- Modify: `src/ui/components/layout/JustifiedLayout.tsx`
- Modify: `src/shared/utils/libraryJustifiedLayout.ts`
- Test: `tests/repo/gallery-grouped-timeline-renderer-wiring.test.mjs`

- [ ] **Step 1: Write the failing renderer wiring test**

Add coverage that asserts:

- date mode uses `GroupedVirtuoso`,
- each timeline group renders a decade header plus justified rows,
- non-date justified mode can continue using `JustifiedLayout`,
- the old header-row flattening path is no longer the main date-mode renderer.

- [ ] **Step 2: Run the wiring test and confirm it fails**

Run: `node --test tests/repo/gallery-grouped-timeline-renderer-wiring.test.mjs`
Expected: FAIL because the grouped renderer does not exist yet.

- [ ] **Step 3: Create `GroupedTimelineLayout.tsx`**

Build a dedicated renderer that:

- accepts ordered timeline groups,
- renders headers as real group headers,
- renders justified rows as group items,
- reports visible group/index changes back to the parent,
- scrolls by group index or group id, not by inferred flat entry offsets.

- [ ] **Step 4: Narrow `JustifiedLayout.tsx` back to generic justified rendering**

Keep `JustifiedLayout.tsx` for non-date justified rendering and shared row-packing behavior. Remove any timeline-specific logic that only exists because date mode was faking groups in a flat list.

- [ ] **Step 5: Teach `LayoutModeRenderer.tsx` to route date mode separately**

Update the layout switch so:

- grouped date mode uses `GroupedTimelineLayout`,
- other justified rendering keeps using `JustifiedLayout`,
- tiled/grid modes remain unchanged.

- [ ] **Step 6: Run the renderer wiring test again**

Run: `node --test tests/repo/gallery-grouped-timeline-renderer-wiring.test.mjs`
Expected: PASS

## Chunk 5: Rewrite Timeline Rail And Jumping Against Group Reality

### Task 5: Make the timeline rail talk to real groups instead of inferred sections

**Files:**

- Modify: `src/ui/components/library/libraryTimelineJump.ts`
- Modify: `src/ui/components/library/libraryViewPresentation.tsx`
- Modify: `src/ui/components/library/libraryTimelineModel.ts`
- Modify: `src/ui/components/library/libraryViewTimeline.ts`
- Modify: `src/ui/components/library/libraryBrowseRailState.ts`
- Test: `tests/repo/gallery-grouped-timeline-jump-wiring.test.mjs`

- [ ] **Step 1: Write the failing jump wiring test**

Add coverage that asserts:

- decade buttons target real group ids,
- deep jumps request missing groups directly instead of paging `offset` forward blindly,
- viewport decade highlighting follows visible group state from the grouped virtualizer,
- date-mode jumping is no longer coupled to `sectionEntryIndexes` from `JustifiedLayout`.

- [ ] **Step 2: Run the wiring test and confirm it fails**

Run: `node --test tests/repo/gallery-grouped-timeline-jump-wiring.test.mjs`
Expected: FAIL because jump behavior is still built around the old section model.

- [ ] **Step 3: Refactor `libraryTimelineJump.ts` around group ids**

Change the hook so it owns:

- requested group id,
- resolved group index when available,
- targeted load requests for missing groups,
- fallback only when the grouped path is unavailable.

- [ ] **Step 4: Update presentation and rail state**

Make the timeline rail consume:

- ordered group summaries from the grouped state slice,
- visible group id/index from the renderer,
- explicit jump handlers that target groups.

The rail should not need to infer decade visibility from generic scroll containers anymore.

- [ ] **Step 5: Run the jump wiring test again**

Run: `node --test tests/repo/gallery-grouped-timeline-jump-wiring.test.mjs`
Expected: PASS

## Chunk 6: Preserve Backward Compatibility While We Migrate

### Task 6: Keep the rest of the app stable while date mode changes under it

**Files:**

- Modify: `src/ui/components/library/LibraryPanelContent.tsx`
- Modify: `src/ui/components/library/LibraryGalleryPane.tsx`
- Modify: `src/ui/components/app/AppMainContent.tsx`
- Modify: `tests/repo/gallery-browse-rail-wiring.test.mjs`
- Modify: `tests/repo/gallery-time-jump-wiring.test.mjs`

- [ ] **Step 1: Add focused regression assertions where existing tests are too broad**

Cover the specific promises we need to preserve:

- info panel wiring,
- selection wiring,
- non-date layout mode rendering,
- existing browse rail behavior outside date mode.

- [ ] **Step 2: Run the targeted regression tests and confirm the current branch still fails on the new date-mode expectations**

Run:

- `node --test tests/repo/gallery-browse-rail-wiring.test.mjs`
- `node --test tests/repo/gallery-time-jump-wiring.test.mjs`

Expected: at least one failure tied to the old date-mode implementation.

- [ ] **Step 3: Update the shell components only as needed**

Thread the new grouped timeline props through the shell components without widening their responsibilities. Avoid rewriting app-level structure unless the grouped timeline path truly needs it.

- [ ] **Step 4: Run the targeted regression tests again**

Run the same targeted commands.
Expected: PASS

## Chunk 7: Runtime Evidence And Handoff Verification

### Task 7: Verify the new model in the real app, not just by wiring tests

**Files:**

- Verify: touched source, test, and docs files
- Modify: `docs/todo.md`

- [ ] **Step 1: Add one follow-up note for durable verification**

Update `docs/todo.md` with a concise follow-up to add a repo-owned grouped timeline smoke test if one still does not exist after implementation.

- [ ] **Step 2: Run focused quality checks while iterating**

Run: `npm.cmd run quality:staged`
Expected: PASS for staged files, or actionable failures to fix.

- [ ] **Step 3: Run the full handoff gate**

Run: `npm.cmd run quality`
Expected: PASS

- [ ] **Step 4: Verify the visible runtime behavior in the in-app browser**

Using the managed runtime at `http://localhost:6093/`, verify:

- `2000s`, `1990s`, `1980s`, `1970s`, and `1940s` each jump to the requested decade,
- the view does not snap back to `2010s`,
- decade highlighting follows the visible group,
- no offset-0 reset storm appears in console/runtime logs.

- [ ] **Step 5: Record honest residual risk before merge**

If any part of the grouped timeline path still falls back to flat paging, document the exact remaining edge so we do not mistake “better” for “finished.”
