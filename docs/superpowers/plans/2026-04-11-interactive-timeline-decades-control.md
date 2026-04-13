# Interactive Timeline Decades Control Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the gallery timeline slider with a pointer-driven decade rail that supports direct jumps, scrubbing, and viewport-synced selection.

**Architecture:** Keep the change local to the existing library timeline UI. Extract small pure helpers for bucket-label and pointer-index math, then wire a custom pointer-driven rail in `LibraryTimelineRail.tsx` that continues using existing `viewportBucketIndex` and `onSeekChange`.

**Tech Stack:** React, TypeScript, existing library timeline model helpers, npm quality scripts

---

## Chunk 1: Timeline Rail Interaction Model

### Task 1: Add failing tests for decade rail helper behavior

**Files:**

- Create: `src/ui/components/library/LibraryTimelineRail.test.tsx`
- Modify: `src/ui/components/library/LibraryTimelineRail.tsx`
- Test: `src/ui/components/library/LibraryTimelineRail.test.tsx`

- [ ] **Step 1: Write the failing test**

Write focused tests for:

- displayed label prefers the scrubbed decade while dragging
- displayed label falls back to viewport decade during normal scrolling
- pointer position maps to the expected bucket index

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- LibraryTimelineRail.test.tsx`
Expected: FAIL because the helper exports or behavior do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Add small exported helpers in `LibraryTimelineRail.tsx` for:

- displayed label resolution
- pointer-to-index mapping
- newest-first bucket index lookup if needed for rendering

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- LibraryTimelineRail.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/library/LibraryTimelineRail.tsx src/ui/components/library/LibraryTimelineRail.test.tsx
git commit -m "test: cover timeline rail decade mapping"
```

### Task 2: Replace the slider with a pointer-driven decade track

**Files:**

- Modify: `src/ui/components/library/LibraryTimelineRail.tsx`
- Modify: `src/ui/components/library/libraryViewTimeline.tsx`
- Test: `src/ui/components/library/LibraryTimelineRail.test.tsx`

- [ ] **Step 1: Write the failing test**

Add interaction tests that:

- click a decade row and expect `onSeekChange` with that decade
- pointer down and move on the track scrubs to another decade
- releasing the pointer ends scrubbing cleanly

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- LibraryTimelineRail.test.tsx`
Expected: FAIL because the current rail still renders a range input and lacks pointer scrubbing.

- [ ] **Step 3: Write minimal implementation**

Remove the `<input type="range">`, render a custom decade track, capture pointer input, and seek based on the hovered decade bucket.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- LibraryTimelineRail.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/library/LibraryTimelineRail.tsx src/ui/components/library/libraryViewTimeline.tsx src/ui/components/library/LibraryTimelineRail.test.tsx
git commit -m "feat: make the library timeline rail scrub by decade"
```

## Chunk 2: Verification

### Task 3: Run targeted quality and regression checks

**Files:**

- Modify: `src/ui/components/library/LibraryTimelineRail.tsx`
- Modify: `src/ui/components/library/libraryViewTimeline.tsx`
- Test: `src/ui/components/library/LibraryTimelineRail.test.tsx`

- [ ] **Step 1: Run focused tests**

Run: `npm.cmd test -- LibraryTimelineRail.test.tsx`
Expected: PASS

- [ ] **Step 2: Run staged quality checks**

Run: `npm.cmd run quality:staged`
Expected: PASS

- [ ] **Step 3: Run fast complexity guardrail if the component grew materially**

Run: `npm.cmd run complexity:staged -- --files=src/ui/components/library/LibraryTimelineRail.tsx,src/ui/components/library/libraryViewTimeline.tsx`
Expected: PASS

- [ ] **Step 4: Perform manual verification**

Verify in the library date-sort view that:

- the slider is gone
- clicking a decade jumps to that decade
- holding and moving on the rail scrubs the gallery
- keyboard and native scrollbar movement keep the highlighted decade in sync

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/library/LibraryTimelineRail.tsx src/ui/components/library/libraryViewTimeline.tsx src/ui/components/library/LibraryTimelineRail.test.tsx
git commit -m "chore: verify interactive timeline rail behavior"
```
