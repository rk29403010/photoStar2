# Selected-Subject Metadata And Manual Tiling Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable `selection` workflow input for manually chosen subjects, create a selected-subject AI metadata workflow used by the single-photo view, and introduce a manual tiling strategy toggle for AI metadata generation.

**Architecture:** Extend the existing workflow runtime rather than creating a side channel. Add a durable `selection` subject plus an expansion module that turns a selection payload into per-asset execution items, then add a narrow metadata workflow that consumes that expansion. Keep tiling as an explicit `runtime.generate_ai_metadata` parameter so experimentation stays local to that module and can be triggered from single-photo actions without changing folder-ingest defaults.

**Tech Stack:** TypeScript, React, SQLite via `better-sqlite3`, existing workflow runtime modules, node test runner, repo quality scripts

---

## File Structure

- Modify: `src/entrypoints/core/main.ts`
  Purpose: Register the new `selection` subject and expose the new metadata workflow command path.
- Create: `src/services/workflowRuntime/modules/expandSelectionModule.ts`
  Purpose: Expand a `selection` payload into ordered per-subject runtime executions, with V1 support for `asset` items only.
- Create: `src/services/workflowRuntime/workflows/selectedSubjectMetadataWorkflow.ts`
  Purpose: Define the narrow workflow that expands a selection and runs AI metadata on resulting assets.
- Modify: `src/services/workflowRuntime/modules/generateAiMetadataModule.ts`
  Purpose: Accept the manual image strategy parameter and pass it into the live AI runtime.
- Modify: `src/services/aiMetadata/liveRuntime.ts`
  Purpose: Prepare either overview-only or overview-plus-tiles image parts and send them in the Gemini request.
- Modify: `src/services/aiMetadata/geminiPrompts.ts`
  Purpose: Add prompt language that explains overview and crop parts when tiled mode is used.
- Modify: `src/boundary/contracts/core.ts`
  Purpose: Extend workflow-related command/result typing if needed for `selection` payloads and strategy parameters.
- Modify: `src/boundary/runtime/usePhotoLibrary.actions.ts`
  Purpose: Add a client action for triggering selected-subject metadata runs.
- Modify: `src/ui/components/single-photo/ActionOverlayControls.tsx`
  Purpose: Add the single-photo action that triggers metadata on the current asset via the new workflow.
- Test: `tests/core/workflow-runtime-selection-metadata.test.cjs`
  Purpose: Cover selection expansion, metadata workflow fan-out, and rejection of non-asset items.
- Modify: `tests/core/runtime-ai-metadata-live-runtime.test.cjs`
  Purpose: Extend live-runtime coverage to verify overview-only vs tiled image part behavior.
- Modify: `tests/core/workflow-runtime-ai-modes.test.cjs`
  Purpose: Verify the metadata module passes the image strategy through the workflow runtime.
- Test: `tests/repo/single-photo-metadata-action-wiring.test.mjs`
  Purpose: Verify the single-photo action menu wires the new command.

## Chunk 1: Selection Subject And Expansion

### Task 1: Add failing tests for selection expansion

**Files:**

- Create: `tests/core/workflow-runtime-selection-metadata.test.cjs`
- Modify: `src/entrypoints/core/main.ts`
- Create: `src/services/workflowRuntime/modules/expandSelectionModule.ts`

- [ ] **Step 1: Write the failing test**

Add tests that expect:

- a `selection` subject payload containing asset entries expands into ordered asset executions
- duplicate asset entries are collapsed deterministically
- non-asset selected subjects fail clearly in V1

- [ ] **Step 2: Run test to verify it fails**

Run: `node.exe --test tests/core/workflow-runtime-selection-metadata.test.cjs`
Expected: FAIL because the `selection` subject and expansion module do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `src/services/workflowRuntime/modules/expandSelectionModule.ts` and register the new `selection` subject in `src/entrypoints/core/main.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node.exe --test tests/core/workflow-runtime-selection-metadata.test.cjs`
Expected: PASS for selection expansion behavior.

## Chunk 2: Selected-Subject Metadata Workflow

### Task 2: Add failing tests for the new metadata workflow

**Files:**

- Create: `src/services/workflowRuntime/workflows/selectedSubjectMetadataWorkflow.ts`
- Create: `tests/core/workflow-runtime-selection-metadata.test.cjs`
- Modify: `src/entrypoints/core/main.ts`

- [ ] **Step 1: Write the failing test**

Extend the selection runtime test so a `selection` input with two assets runs AI metadata for both assets and persists one `ai_metadata` row per asset.

- [ ] **Step 2: Run test to verify it fails**

Run: `node.exe --test tests/core/workflow-runtime-selection-metadata.test.cjs`
Expected: FAIL because the selected-subject metadata workflow is not registered yet.

- [ ] **Step 3: Write minimal implementation**

Create `src/services/workflowRuntime/workflows/selectedSubjectMetadataWorkflow.ts` and register it in `src/entrypoints/core/main.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node.exe --test tests/core/workflow-runtime-selection-metadata.test.cjs`
Expected: PASS.

## Chunk 3: AI Metadata Strategy Parameter

### Task 3: Add failing tests for strategy forwarding

**Files:**

- Modify: `tests/core/workflow-runtime-ai-modes.test.cjs`
- Modify: `src/services/workflowRuntime/modules/generateAiMetadataModule.ts`

- [ ] **Step 1: Write the failing test**

Add a test asserting that when workflow parameters include `imageStrategy: 'overview_plus_tiles'`, the AI metadata runtime receives that exact value.

- [ ] **Step 2: Run test to verify it fails**

Run: `node.exe --test tests/core/workflow-runtime-ai-modes.test.cjs`
Expected: FAIL because the module does not pass the image strategy parameter through.

- [ ] **Step 3: Write minimal implementation**

Update `src/services/workflowRuntime/modules/generateAiMetadataModule.ts` so the live runtime receives `imageStrategy`, defaulting to `overview_only`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node.exe --test tests/core/workflow-runtime-ai-modes.test.cjs`
Expected: PASS.

### Task 4: Add failing tests for tiled image preparation

**Files:**

- Modify: `tests/core/runtime-ai-metadata-live-runtime.test.cjs`
- Modify: `src/services/aiMetadata/liveRuntime.ts`
- Modify: `src/services/aiMetadata/geminiPrompts.ts`

- [ ] **Step 1: Write the failing test**

Extend the live-runtime test to assert:

- `overview_only` sends one image part
- `overview_plus_tiles` sends one overview plus bounded numbered crops
- tiled mode prompt identifies overview and crop semantics explicitly

- [ ] **Step 2: Run test to verify it fails**

Run: `node.exe --test tests/core/runtime-ai-metadata-live-runtime.test.cjs`
Expected: FAIL because the runtime still sends one image part only.

- [ ] **Step 3: Write minimal implementation**

Update `src/services/aiMetadata/liveRuntime.ts` and `src/services/aiMetadata/geminiPrompts.ts` to support `overview_plus_tiles`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node.exe --test tests/core/runtime-ai-metadata-live-runtime.test.cjs`
Expected: PASS.

## Chunk 4: Single-Photo Action Wiring

### Task 5: Add failing wiring test for the single-photo action

**Files:**

- Create: `tests/repo/single-photo-metadata-action-wiring.test.mjs`
- Modify: `src/boundary/runtime/usePhotoLibrary.actions.ts`
- Modify: `src/ui/components/single-photo/ActionOverlayControls.tsx`

- [ ] **Step 1: Write the failing test**

Add a repo wiring test that expects the single-photo action menu to call a runtime action dedicated to selected-subject metadata on the current asset.

- [ ] **Step 2: Run test to verify it fails**

Run: `node.exe --test tests/repo/single-photo-metadata-action-wiring.test.mjs`
Expected: FAIL because the action does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Add the runtime action in `src/boundary/runtime/usePhotoLibrary.actions.ts` and wire the single-photo menu in `src/ui/components/single-photo/ActionOverlayControls.tsx`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node.exe --test tests/repo/single-photo-metadata-action-wiring.test.mjs`
Expected: PASS.

## Chunk 5: Verification

### Task 6: Run focused verification and changed-file quality checks

**Files:**

- Modify: any changed files above

- [ ] **Step 1: Run focused tests**

Run:

```bash
node.exe --test tests/core/workflow-runtime-selection-metadata.test.cjs tests/core/workflow-runtime-ai-modes.test.cjs tests/core/runtime-ai-metadata-live-runtime.test.cjs tests/repo/single-photo-metadata-action-wiring.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Build core output**

Run: `npm.cmd run build:core:ts`
Expected: PASS.

- [ ] **Step 3: Run changed-file quality checks**

Run: `npm.cmd run quality:changed`
Expected: PASS.

- [ ] **Step 4: Record deferred work**

Ensure the implementation leaves a clear TODO for:

- resolving non-asset selections into assets when resolvers exist

Plan complete and saved to `docs/superpowers/plans/2026-03-21-selected-subject-metadata-and-tiling.md`. Ready to execute.
