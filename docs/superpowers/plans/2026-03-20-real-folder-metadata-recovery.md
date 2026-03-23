# Real Folder Metadata Recovery Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore one real-folder ingest path for the 400-photo working set so AI metadata is usable again in the app, while preserving paid Gemini outputs across rebuilds by default.

**Architecture:** Keep `folder_ingest_v1` and the existing single-photo review flow as the product path. Repair the runtime AI metadata module so it produces real metadata again, then add a durable metadata cache keyed by stable asset identity so DB rebuilds can be cheap without forcing Gemini re-spend. Treat grouping, workflow editing, and module-platform work as out of scope unless they directly unblock this path.

**Tech Stack:** TypeScript, Node.js, better-sqlite3, React 19, existing workflow runtime, existing single-photo info tabs, Gemini-backed metadata generation

---

## Scope guardrails

- The working set is one real folder of roughly `400` photos.
- Rebuilds are allowed and should be cheap.
- Paid Gemini metadata is durable by default and should survive routine rebuild/reset flows.
- Prompt/schema changes are out of scope unless the explicit goal is to improve metadata quality.
- Platform work is parked unless it unblocks `select folder -> ingest -> generate metadata -> browse single photo`.

## File structure

### Runtime and persistence

- Modify: `src/services/workflowRuntime/modules/generateAiMetadataModule.ts`
- Modify: `src/services/workflowRuntime/workflows/folderIngestWorkflow.ts`
- Modify: `src/services/handlers/systemWorkflowRuntimeCommands.ts`
- Modify: `src/services/handlers/systemCommands.ts`
- Modify: `src/data/db.ts`
- Create: `src/services/aiMetadata/aiMetadataCache.ts`
- Create: `src/services/aiMetadata/aiMetadataIdentity.ts`

### Asset projection and review UI

- Modify: `src/services/handlers/assetCommands.ts`
- Modify: `src/services/handlers/collectionCommands.ts`
- Modify: `src/services/handlers/assetPayloadModel.ts`
- Modify: `src/ui/components/single-photo/info-panel/AnalysisTab.tsx`
- Modify: `src/ui/components/single-photo/info-panel/PeopleTab.tsx`
- Modify: `src/ui/components/single-photo/info-panel/FileTab.tsx`

### Verification

- Modify: `tests/core/workflow-runtime-ai-modes.test.cjs`
- Modify: `tests/core/workflow-runtime-folder-ingest-orchestrator.test.cjs`
- Modify: `tests/core/workflow-runtime-folder-ingest-commands.test.cjs`
- Modify: `tests/core/asset-payload-model.test.cjs`
- Modify: `tests/core/reset-library-commands.test.cjs`
- Create: `tests/core/ai-metadata-cache.test.cjs`

## Chunk 1: Re-establish the failing real-user path

### Task 1: Capture the regression in tests before changing behavior

**Files:**

- Modify: `tests/core/workflow-runtime-folder-ingest-orchestrator.test.cjs`
- Modify: `tests/core/workflow-runtime-folder-ingest-commands.test.cjs`
- Modify: `tests/core/asset-payload-model.test.cjs`

- [ ] **Step 1: Add a failing ingest-level regression test**

Add coverage that `folder_ingest_v1` produces non-placeholder AI metadata for an ingested asset and that the resulting asset payload exposes it through `ai_metadata` and `caption`.

- [ ] **Step 2: Add a failing review-surface assertion**

Extend payload/model coverage so the projected asset still carries people suggestions, caption text, and analysis details into the single-photo model.

- [ ] **Step 3: Run focused tests and confirm the failure is real**

Run:
`npm.cmd run build:core:ts`

Run:
`node.exe --test tests/core/workflow-runtime-folder-ingest-orchestrator.test.cjs tests/core/workflow-runtime-folder-ingest-commands.test.cjs tests/core/asset-payload-model.test.cjs`

Expected:
Failure or placeholder-only assertions proving the runtime path is not yet delivering useful metadata.

## Chunk 2: Restore the runtime AI metadata path

### Task 2: Replace the stubbed AI metadata writer with the real execution path

**Files:**

- Modify: `src/services/workflowRuntime/modules/generateAiMetadataModule.ts`
- Modify: `src/services/workflowRuntime/workflows/folderIngestWorkflow.ts`
- Modify: `src/services/handlers/systemWorkflowRuntimeCommands.ts`
- Modify: `tests/core/workflow-runtime-ai-modes.test.cjs`
- Modify: `tests/core/workflow-runtime-folder-ingest-orchestrator.test.cjs`

- [ ] **Step 1: Isolate provider selection and request building**

Refactor `generateAiMetadataModule` into small helpers for:
`resolve mode`, `load settings`, `build request input`, `skip sensitive assets`, and `persist result`.

- [ ] **Step 2: Preserve existing `mock` and `off` behavior**

Keep deterministic test behavior for `mock` and zero-write behavior for `off` so verification remains cheap and stable.

- [ ] **Step 3: Wire the live path back to real metadata generation**

Use the existing Gemini-related settings already surfaced in the UI:

- `ai_metadata_v2_api_key`
- `gemini_api_key`
- `gemini_csv_path`

Do not redesign the schema. Restore the path that returns the current rich metadata shape.

- [ ] **Step 4: Keep workflow scope narrow**

Do not refactor unrelated workflow runtime machinery while restoring this path. Any workflow change must directly support `folder_ingest_v1 -> generate-ai-metadata`.

- [ ] **Step 5: Verify focused runtime behavior**

Run:
`npm.cmd run build:core:ts`

Run:
`node.exe --test tests/core/workflow-runtime-ai-modes.test.cjs tests/core/workflow-runtime-folder-ingest-orchestrator.test.cjs tests/core/workflow-runtime-folder-ingest-commands.test.cjs`

Expected:
`mock` passes stay green, `off` still skips writes, and the restored live path is separately structured so it can be exercised manually without disturbing fast tests.

## Chunk 3: Make paid Gemini metadata durable across rebuilds

### Task 3: Add a cache boundary that survives default reset flows

**Files:**

- Create: `src/services/aiMetadata/aiMetadataCache.ts`
- Create: `src/services/aiMetadata/aiMetadataIdentity.ts`
- Modify: `src/data/db.ts`
- Modify: `src/services/workflowRuntime/modules/generateAiMetadataModule.ts`
- Modify: `src/services/handlers/systemCommands.ts`
- Create: `tests/core/ai-metadata-cache.test.cjs`
- Modify: `tests/core/reset-library-commands.test.cjs`

- [ ] **Step 1: Define a stable metadata identity**

Key cached entries by a stable asset identity that survives rebuilds, preferring:

1. `asset_identities.guid` when available
2. `file_hash`
3. `original_path` as fallback

Also store enough provenance to invalidate intentionally later:

- prompt/version identifier
- provider
- model/tier
- created timestamp

- [ ] **Step 2: Add durable cache storage**

Add a dedicated cache table or preserved snapshot state for paid AI metadata. Keep it separate from ephemeral ingest/runtime rows so “rebuild library” does not imply “repay Gemini.”

- [ ] **Step 3: Read-before-write in the metadata module**

Before calling Gemini on `live`, check the cache for a compatible hit. Only make a paid request when:

- no cached entry exists
- the user explicitly requests regeneration
- the stored prompt/version is intentionally invalidated

- [ ] **Step 4: Update reset semantics**

Routine reset/rebuild flows should preserve the paid metadata cache.
Add or document a distinct explicit wipe path for “throw away paid metadata too.”

- [ ] **Step 5: Verify preservation behavior**

Run:
`npm.cmd run build:core:ts`

Run:
`node.exe --test tests/core/ai-metadata-cache.test.cjs tests/core/reset-library-commands.test.cjs`

Expected:
Default reset behavior preserves cached AI metadata, while explicit invalidation remains possible.

## Chunk 4: Reconnect the review flow to restored metadata

### Task 4: Make the single-photo review path trustworthy again

**Files:**

- Modify: `src/services/handlers/assetCommands.ts`
- Modify: `src/services/handlers/collectionCommands.ts`
- Modify: `src/services/handlers/assetPayloadModel.ts`
- Modify: `src/ui/components/single-photo/info-panel/AnalysisTab.tsx`
- Modify: `src/ui/components/single-photo/info-panel/PeopleTab.tsx`
- Modify: `src/ui/components/single-photo/info-panel/FileTab.tsx`
- Modify: `tests/core/asset-payload-model.test.cjs`

- [ ] **Step 1: Verify projection completeness**

Ensure the query/projection path still carries restored AI metadata, caption fallback, timestamp context, and people suggestion fields into the asset payload.

- [ ] **Step 2: Tighten the single-photo tabs only where needed**

Fix rendering gaps that block real review:

- missing caption/date/location presentation
- missing people suggestion visibility
- unclear “this came from AI/cache/live run” status

Do not redesign the review UI; keep this a repair task.

- [ ] **Step 3: Re-run focused verification**

Run:
`npm.cmd run build:core:ts`

Run:
`node.exe --test tests/core/asset-payload-model.test.cjs`

Expected:
The asset model exposes the metadata needed for the existing per-photo review flow.

## Chunk 5: Prove the 400-photo happy path and stop

### Task 5: Validate the real working set instead of expanding scope

**Files:**

- Review: `src/services/workflowRuntime/modules/generateAiMetadataModule.ts`
- Review: `src/services/handlers/assetPayloadModel.ts`
- Review: `src/ui/components/single-photo/info-panel/AnalysisTab.tsx`
- Review: `src/ui/components/single-photo/info-panel/PeopleTab.tsx`
- Review: `src/ui/components/single-photo/info-panel/FileTab.tsx`

- [ ] **Step 1: Run the local quality gate while iterating**

Run:
`npm.cmd run quality:staged`

Expected:
PASS for changed files.

- [ ] **Step 2: Run one real-folder ingest on the 400-photo working set**

Manual acceptance checklist:

- folder ingest completes
- metadata appears on ingested photos
- single-photo review is usable
- resetting/rebuilding does not lose paid Gemini metadata by default

- [ ] **Step 3: Record any failures as product bugs, not platform invitations**

Only queue follow-up work if it blocks:

- real ingest
- paid metadata preservation
- per-photo review

Everything else goes to the parking lot.

- [ ] **Step 4: Run the full quality gate before handoff**

Run:
`npm.cmd run quality`

Expected:
PASS, or explicit documentation of unrelated pre-existing failures.

## Parking lot

These do **not** belong in the active slice unless the happy path proves they are blocking:

- workflow editor improvements
- pluggable module packaging
- generalized third-party module downloads
- broader grouping quality work beyond what helps metadata review
- architectural cleanup that does not affect ingest, persistence, or per-photo review
- prompt/schema redesign for better metadata quality

## Acceptance summary

This plan is complete when all of the following are true:

- A real folder can be ingested again through `folder_ingest_v1`.
- The app shows useful metadata in the existing single-photo review flow.
- Default rebuild/reset flows do not destroy paid Gemini metadata.
- The project has one proven, repeatable path for the 400-photo working set.
