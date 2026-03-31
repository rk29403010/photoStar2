# Coordinate Normalization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize all stored in-photo rectangles to normalized `{ x, y, width, height }`, migrate legacy rows, and update consumers and docs to use the unified contract.

**Architecture:** Add a shared image-rectangle normalization utility, move all producers to canonical write-time persistence, convert consumers to the canonical shape, and run an idempotent DB backfill for legacy stored rows. Keep storage JSON-based, but ensure every rectangle inside those JSON blobs follows one contract.

**Tech Stack:** TypeScript, Better SQLite3, React, node:test, repo quality scripts

---

## Chunk 1: Canonical Geometry Utilities

### Task 1: Add failing tests for canonical rectangle helpers

**Files:**

- Create: `tests/core/photo-box-normalization.test.cjs`
- Modify: `src/services/faces/faceImageGeometry.ts`

- [ ] **Step 1: Write the failing test**

Cover:

- canonical `{ x, y, width, height }` passes through unchanged
- legacy `[x1, y1, x2, y2]` converts to canonical form
- mixed-scale `0..1000` boxes convert to `0..1`
- invalid and zero-area boxes are rejected
- canonical boxes can be converted to unit corners and pixel crops

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- tests/core/photo-box-normalization.test.cjs`
Expected: FAIL because helper APIs do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Add focused helpers in `src/services/faces/faceImageGeometry.ts` for:

- canonical box type
- normalization from supported legacy inputs
- conversion to unit corners
- conversion to pixel crop rectangles

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- tests/core/photo-box-normalization.test.cjs`
Expected: PASS

### Task 2: Verify shared geometry code stays green

**Files:**

- Test: `tests/core/face-image-geometry.test.cjs`

- [ ] **Step 1: Run existing geometry coverage**

Run: `npm.cmd test -- tests/core/face-image-geometry.test.cjs`
Expected: PASS

## Chunk 2: Producer Write Paths

### Task 3: Add failing tests for canonical face detection persistence

**Files:**

- Modify: `tests/core/workflow-runtime-face-recognition-module.test.cjs`
- Modify: `src/services/workflowRuntime/modules/detectFacesModule.ts`

- [ ] **Step 1: Write the failing test**

Assert persisted `face_detection` rows store canonical objects instead of legacy arrays.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- tests/core/workflow-runtime-face-recognition-module.test.cjs`
Expected: FAIL because the module still writes `box: [x1, y1, x2, y2]`.

- [ ] **Step 3: Write minimal implementation**

Update detection persistence to normalize detector output into canonical boxes before JSON storage.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- tests/core/workflow-runtime-face-recognition-module.test.cjs`
Expected: PASS

### Task 4: Add failing tests for canonical AI metadata persistence

**Files:**

- Modify: `tests/core/photo-metadata-machine-blocks.test.cjs`
- Modify: `src/services/aiMetadata/liveEvidencePersistence.ts`
- Modify: `src/services/photoMetadata/repository.ts`
- Modify: `src/services/photoMetadata/validation.ts`
- Modify: `src/services/photoMetadata/types.ts`

- [ ] **Step 1: Write the failing test**

Assert that stored machine blocks and projection rows persist normalized `{ x, y, width, height }` boxes for subjects and ROIs even when the incoming payload uses legacy scale values.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- tests/core/photo-metadata-machine-blocks.test.cjs`
Expected: FAIL because mixed-scale boxes are currently stored unchanged.

- [ ] **Step 3: Write minimal implementation**

Normalize subject and ROI boxes during evidence persistence and projection save.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- tests/core/photo-metadata-machine-blocks.test.cjs`
Expected: PASS

## Chunk 3: Consumer Updates

### Task 5: Add failing tests for single-photo consumer behavior

**Files:**

- Modify: `src/ui/components/single-photo/singlePhotoPeopleModel.test.ts`
- Modify: `src/ui/components/single-photo/singlePhotoPeopleModel.ts`
- Modify: `src/ui/components/layout/Tile.tsx`

- [ ] **Step 1: Write the failing test**

Assert the single-photo model and overlay consumers read canonical face, subject, and ROI boxes without `0..1000` scale guessing.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- src/ui/components/single-photo/singlePhotoPeopleModel.test.ts`
Expected: FAIL because the UI still contains legacy normalization behavior.

- [ ] **Step 3: Write minimal implementation**

Remove source-specific scaling from UI readers and make local faces use canonical boxes too.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- src/ui/components/single-photo/singlePhotoPeopleModel.test.ts`
Expected: PASS

### Task 6: Add failing tests for thumbnail cropping from canonical boxes

**Files:**

- Modify: `tests/core/workflow-runtime-store.test.cjs`
- Modify: `src/services/faces/peopleResolution.ts`

- [ ] **Step 1: Write the failing test**

Assert person thumbnail crop generation still works when stored face boxes are canonical `{ x, y, width, height }`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- tests/core/workflow-runtime-store.test.cjs`
Expected: FAIL because thumbnail logic assumes `[x1, y1, x2, y2]`.

- [ ] **Step 3: Write minimal implementation**

Convert thumbnail crop generation to use shared canonical-to-pixel helpers.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- tests/core/workflow-runtime-store.test.cjs`
Expected: PASS

## Chunk 4: Legacy Data Migration

### Task 7: Add failing tests for one-off coordinate backfill

**Files:**

- Modify: `tests/core/photo-metadata-repository.test.cjs`
- Modify: `src/data/db.ts`
- Modify: `src/data/dbSchema.ts`

- [ ] **Step 1: Write the failing test**

Seed legacy face-detection rows and legacy AI metadata rows, run DB startup/backfill, and assert stored JSON is rewritten to canonical normalized boxes.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- tests/core/photo-metadata-repository.test.cjs`
Expected: FAIL because no coordinate backfill exists.

- [ ] **Step 3: Write minimal implementation**

Add an idempotent DB backfill routine invoked during DB initialization to rewrite legacy stored coordinate payloads safely.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- tests/core/photo-metadata-repository.test.cjs`
Expected: PASS

## Chunk 5: Documentation And Verification

### Task 8: Update authoring guidance

**Files:**

- Modify: `docs/workflow-module-authoring-v3.md`

- [ ] **Step 1: Update the module guide**

Document the canonical coordinate contract and require modules to normalize before persistence.

- [ ] **Step 2: Sanity check wording**

Read the updated section and confirm it explicitly covers units, origin, and write-time normalization.

### Task 9: Run focused verification

**Files:**

- Test: `tests/core/photo-box-normalization.test.cjs`
- Test: `tests/core/workflow-runtime-face-recognition-module.test.cjs`
- Test: `tests/core/photo-metadata-machine-blocks.test.cjs`
- Test: `src/ui/components/single-photo/singlePhotoPeopleModel.test.ts`
- Test: `tests/core/photo-metadata-repository.test.cjs`

- [ ] **Step 1: Run targeted tests**

Run the focused tests added or changed in this slice.

- [ ] **Step 2: Run staged quality checks**

Run: `npm.cmd run quality:staged`
Expected: PASS for this task’s changed files.

- [ ] **Step 3: Run full quality if the touched set is broad**

Run: `npm.cmd run quality`
Expected: PASS before handoff if the final change footprint is substantial.
