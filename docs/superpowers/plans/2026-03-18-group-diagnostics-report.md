# Group Diagnostics Report Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an in-app, read-only grouping diagnostics screen that exposes suspicious group structures, overlap inflation, and asset-level drilldowns, while setting up a future hierarchy-aware filmstrip rework.

**Architecture:** Add a backend diagnostics command that computes a dataset-level grouping report from current group and membership tables, expose it through the existing runtime action layer, and render it in a dedicated in-app diagnostics view launched from the action menu. Keep the report model hierarchy-aware for inspection, but do not change grouping persistence or collapse logic in this slice.

**Tech Stack:** TypeScript, React, existing boundary/runtime command architecture, SQLite-backed handlers, node test runner, repo quality scripts

---

## File Structure

- Create: `src/boundary/contracts/groupDiagnostics.ts`
  Purpose: Shared types for summary rows, issue flags, and drilldown payloads.
- Create: `src/services/handlers/groupDiagnosticsCommands.ts`
  Purpose: Backend command handler that builds and returns the diagnostics report.
- Create: `src/shared/utils/groupDiagnosticsModel.ts`
  Purpose: Shared pure helpers for suspicion flags, count rollups, and collapse estimates.
- Create: `src/ui/components/group-diagnostics/GroupingDiagnosticsView.tsx`
  Purpose: Main diagnostics screen UI.
- Create: `src/ui/components/group-diagnostics/groupDiagnosticsViewModel.ts`
  Purpose: UI-only filtering and expansion helpers.
- Modify: `src/services/handlers/index` or equivalent command registration file(s)
  Purpose: Register the new diagnostics command.
- Modify: `src/boundary/runtime/usePhotoLibrary.actions.ts`
  Purpose: Add a frontend action for requesting the diagnostics report.
- Modify: `src/ui/components/ActionPanel.tsx`
  Purpose: Add the action-menu entry that opens the diagnostics screen.
- Modify: `src/ui/hooks/useAppRuntimeUi.ts`
  Purpose: Persist/open diagnostics screen state if needed.
- Modify: `src/ui/App.tsx`
  Purpose: Thread diagnostics state and data loading into the app shell.
- Modify: `src/ui/components/app/AppMainContent.tsx`
  Purpose: Render the diagnostics screen as a new app view or controlled panel.
- Test: `tests/core/group-diagnostics-command.test.cjs`
  Purpose: Backend aggregation and suspicion-flag coverage.
- Test: `tests/ui/group-diagnostics-view-model.test.cjs`
  Purpose: UI filter and row modeling coverage.
- Test: `tests/repo/group-diagnostics-wiring.test.mjs`
  Purpose: Wiring coverage for action menu, runtime action, and main content route.

## Chunk 1: Shared Report Model And Backend Command

### Task 1: Add shared diagnostics contracts

**Files:**

- Create: `src/boundary/contracts/groupDiagnostics.ts`
- Test: `tests/core/group-diagnostics-command.test.cjs`

- [ ] **Step 1: Write the failing test**

Add a contract-oriented test in `tests/core/group-diagnostics-command.test.cjs` that imports the backend command response and expects:

- dataset summary fields
- group summary rows
- expandable member rows
- issue flags array

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests\core\group-diagnostics-command.test.cjs`
Expected: FAIL because the diagnostics contract/command does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `src/boundary/contracts/groupDiagnostics.ts` with explicit exported types for:

- `GroupDiagnosticsSummary`
- `GroupDiagnosticsGroupRow`
- `GroupDiagnosticsAssetRow`
- `GroupDiagnosticsReport`

- [ ] **Step 4: Run test to verify it still fails for the next missing piece**

Run: `node --test tests\core\group-diagnostics-command.test.cjs`
Expected: FAIL because the backend command is still missing.

- [ ] **Step 5: Commit**

```bash
git add src/boundary/contracts/groupDiagnostics.ts tests/core/group-diagnostics-command.test.cjs
git commit -m "test: define group diagnostics report contract"
```

### Task 2: Add pure diagnostics aggregation helpers

**Files:**

- Create: `src/shared/utils/groupDiagnosticsModel.ts`
- Test: `tests/core/group-diagnostics-command.test.cjs`

- [ ] **Step 1: Write the failing test**

Extend `tests/core/group-diagnostics-command.test.cjs` with a fixture covering:

- overlapping memberships
- a burst containing lower-level grouped assets
- a likely type mismatch placeholder

Assert:

- summary counts are computed
- overlap counts are correct
- underlying image estimate differs from raw file count where expected

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests\core\group-diagnostics-command.test.cjs`
Expected: FAIL because aggregation helpers do not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/shared/utils/groupDiagnosticsModel.ts` with focused helpers such as:

- `buildDiagnosticsSummary(...)`
- `buildGroupDiagnosticsRows(...)`
- `buildSuspicionFlags(...)`

Keep them pure and fixture-driven.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests\core\group-diagnostics-command.test.cjs`
Expected: PASS for pure aggregation behavior.

- [ ] **Step 5: Commit**

```bash
git add src/shared/utils/groupDiagnosticsModel.ts tests/core/group-diagnostics-command.test.cjs
git commit -m "feat: add grouping diagnostics aggregation model"
```

### Task 3: Add backend diagnostics command

**Files:**

- Create: `src/services/handlers/groupDiagnosticsCommands.ts`
- Modify: existing services handler registration file(s)
- Test: `tests/core/group-diagnostics-command.test.cjs`

- [ ] **Step 1: Write the failing test**

Add an integration-style backend test that seeds:

- `assets`
- `asset_groups`
- `asset_group_members`

Then calls the new diagnostics command and asserts:

- report shape matches the contract
- suspicious rows are present
- `f882`-like overlap scenarios are represented as raw count vs underlying estimate

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests\core\group-diagnostics-command.test.cjs`
Expected: FAIL because the command is not registered.

- [ ] **Step 3: Write minimal implementation**

Implement `groupDiagnosticsCommands.ts` and register the command. Query:

- groups
- memberships
- asset payload fields needed for thumbnails/clickthrough

Feed rows into `groupDiagnosticsModel.ts` and respond with a `GroupDiagnosticsReport`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests\core\group-diagnostics-command.test.cjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/handlers/groupDiagnosticsCommands.ts tests/core/group-diagnostics-command.test.cjs
git commit -m "feat: expose grouping diagnostics report command"
```

## Chunk 2: Runtime Wiring And Diagnostics Screen

### Task 4: Add runtime/frontend action for diagnostics

**Files:**

- Modify: `src/boundary/runtime/usePhotoLibrary.actions.ts`
- Test: `tests/repo/group-diagnostics-wiring.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/repo/group-diagnostics-wiring.test.mjs` asserting:

- a diagnostics action exists in the runtime actions file
- the action menu contains a diagnostics entry
- app main content renders the diagnostics screen path

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests\repo\group-diagnostics-wiring.test.mjs`
Expected: FAIL because wiring is absent.

- [ ] **Step 3: Write minimal implementation**

Add a runtime action like `getGroupDiagnosticsReport()` that calls the backend command and returns the shared report type.

- [ ] **Step 4: Run test to verify partial progress**

Run: `node --test tests\repo\group-diagnostics-wiring.test.mjs`
Expected: FAIL only on remaining UI wiring.

- [ ] **Step 5: Commit**

```bash
git add src/boundary/runtime/usePhotoLibrary.actions.ts tests/repo/group-diagnostics-wiring.test.mjs
git commit -m "feat: add runtime action for group diagnostics report"
```

### Task 5: Add diagnostics screen UI model and component

**Files:**

- Create: `src/ui/components/group-diagnostics/groupDiagnosticsViewModel.ts`
- Create: `src/ui/components/group-diagnostics/GroupingDiagnosticsView.tsx`
- Test: `tests/ui/group-diagnostics-view-model.test.cjs`

- [ ] **Step 1: Write the failing test**

Create `tests/ui/group-diagnostics-view-model.test.cjs` covering:

- suspicious-only filtering
- all/suspicious toggle behavior
- expandable rows
- summary badges/count formatting

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests\ui\group-diagnostics-view-model.test.cjs`
Expected: FAIL because the view model/component do not exist.

- [ ] **Step 3: Write minimal implementation**

Create:

- `groupDiagnosticsViewModel.ts` for filtering and expansion helpers
- `GroupingDiagnosticsView.tsx` for the read-only screen UI

Include:

- top summary strip
- suspicious/all toggle
- group rows
- expandable asset drilldown

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests\ui\group-diagnostics-view-model.test.cjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/group-diagnostics/groupDiagnosticsViewModel.ts src/ui/components/group-diagnostics/GroupingDiagnosticsView.tsx tests/ui/group-diagnostics-view-model.test.cjs
git commit -m "feat: add grouping diagnostics screen"
```

### Task 6: Wire the diagnostics screen into the app

**Files:**

- Modify: `src/ui/components/ActionPanel.tsx`
- Modify: `src/ui/hooks/useAppRuntimeUi.ts`
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/components/app/AppMainContent.tsx`
- Test: `tests/repo/group-diagnostics-wiring.test.mjs`

- [ ] **Step 1: Write the failing test**

Extend `tests/repo/group-diagnostics-wiring.test.mjs` to assert:

- action menu entry exists
- app state can open the diagnostics screen
- app main content renders the new view

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests\repo\group-diagnostics-wiring.test.mjs`
Expected: FAIL on missing app wiring.

- [ ] **Step 3: Write minimal implementation**

Add:

- action-menu entry
- UI state for opening/closing diagnostics
- app shell wiring
- diagnostics screen rendering

Ensure rows can navigate back into gallery/single-photo context using existing selection/open flows.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests\repo\group-diagnostics-wiring.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/ActionPanel.tsx src/ui/hooks/useAppRuntimeUi.ts src/ui/App.tsx src/ui/components/app/AppMainContent.tsx tests/repo/group-diagnostics-wiring.test.mjs
git commit -m "feat: wire grouping diagnostics screen into app"
```

## Chunk 3: Verification And Filmstrip Follow-On Guardrails

### Task 7: Add regression coverage for filmstrip follow-on assumptions

**Files:**

- Modify: `tests/ui/variant-filmstrip-model.test.cjs`
- Optionally add notes/comments in: `src/ui/components/single-photo/variantFilmstripModel.ts`

- [ ] **Step 1: Write the failing test**

Add a test describing the future expectation that filmstrip logic is orbit-based today and must later accept hierarchy-aware diagnostics/group structures.

The test should not require the filmstrip rework now, but it should pin current assumptions clearly so the later rewrite is deliberate.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests\ui\variant-filmstrip-model.test.cjs`
Expected: FAIL because the expectation is not yet documented in tests/helpers.

- [ ] **Step 3: Write minimal implementation**

Add the smallest supporting helper/comment/model adjustment needed to make the expectation explicit without changing current filmstrip behavior.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests\ui\variant-filmstrip-model.test.cjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/ui/variant-filmstrip-model.test.cjs src/ui/components/single-photo/variantFilmstripModel.ts
git commit -m "test: document filmstrip assumptions for future grouping hierarchy"
```

### Task 8: Run targeted and full verification

**Files:**

- Modify any failing implementation files from previous tasks

- [ ] **Step 1: Run focused tests**

Run:

```bash
node --test tests\core\group-diagnostics-command.test.cjs
node --test tests\ui\group-diagnostics-view-model.test.cjs
node --test tests\repo\group-diagnostics-wiring.test.mjs
node --test tests\ui\variant-filmstrip-model.test.cjs
```

Expected: all pass.

- [ ] **Step 2: Run staged quality**

Run:

```bash
npm run quality:staged
```

Expected: pass.

- [ ] **Step 3: Run full quality**

Run:

```bash
npm run quality
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: add group diagnostics report"
```

## Notes For Execution

- Keep the first implementation read-only.
- Do not change grouping persistence or classification rules in this slice.
- Do not rework the single-photo filmstrip in this slice.
- Reuse the diagnostics report model later when reworking:
  - grouping hierarchy
  - gallery collapse semantics
  - single-photo filmstrip behavior
