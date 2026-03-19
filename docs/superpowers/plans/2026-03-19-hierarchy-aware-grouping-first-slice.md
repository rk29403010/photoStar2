# Hierarchy-Aware Grouping First Slice Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a strict similarity hierarchy for `duplicate -> near_duplicate -> variant_set -> burst`, persist parent/child structure and representative choices, and update diagnostics to show raw-file and underlying-image structure from that hierarchy.

**Architecture:** Extend the existing grouping schema instead of creating a parallel system. Add explicit child-group links, refactor grouping persistence to write a bottom-up tree, and update the diagnostics command plus diagnostics UI to read the hierarchy directly. Assume rollout happens after a factory reset and reimport, so the implementation can skip legacy data migration scaffolding. Keep gallery collapse and the single-photo filmstrip on the old runtime path for now, but shape the diagnostics payload so those clients can migrate onto it later.

**Tech Stack:** TypeScript, React, SQLite via `better-sqlite3`, existing workflow runtime modules, node test runner, repo quality scripts

---

## File Structure

- Modify: `src/data/db.ts`
  Purpose: Add the child-group table and any supporting indexes for strict hierarchy traversal.
- Modify: `src/services/workflowRuntime/modules/groupSimilarPhotosModule.ts`
  Purpose: Change grouping order to `duplicate -> near_duplicate -> variant_set -> burst`.
- Modify: `src/services/workflowRuntime/modules/grouping/groupingPersistence.ts`
  Purpose: Persist direct asset members, child-group links, representative choices, and hierarchy-safe rebuild behavior.
- Modify: `src/services/workflowRuntime/modules/grouping/groupingQueries.ts`
  Purpose: Build bottom-up grouping units and stop treating burst/variant inputs as raw files.
- Create: `src/services/workflowRuntime/modules/grouping/groupingHierarchy.ts`
  Purpose: Pure helpers for representative selection, passthrough units, and parent/child assembly.
- Modify: `src/boundary/contracts/groupDiagnostics.ts`
  Purpose: Expand diagnostics contracts to include descendant counts, child counts, representative ids, and hierarchy flags.
- Modify: `src/shared/utils/groupDiagnosticsModel.ts`
  Purpose: Build tree-aware diagnostics rows and summary counts from persisted hierarchy data.
- Modify: `src/services/handlers/groupDiagnosticsCommands.ts`
  Purpose: Query the new hierarchy tables and return the expanded diagnostics payload.
- Modify: `src/ui/components/group-diagnostics/groupDiagnosticsView.tsx`
  Purpose: Render branch structure, direct-vs-descendant counts, and representative information.
- Modify: `src/ui/components/group-diagnostics/groupDiagnosticsViewModel.ts`
  Purpose: Add branch flattening, tree expansion helpers, and hierarchy-aware filtering.
- Test: `tests/core/workflow-runtime-grouping.test.cjs`
  Purpose: Runtime coverage for hierarchy persistence, representative rules, and non-transitive variant grouping.
- Test: `tests/core/group-diagnostics-command.test.cjs`
  Purpose: Diagnostics coverage for raw-file counts, underlying-image counts, and tree structure.
- Test: `tests/ui/group-diagnostics-view-model.test.cjs`
  Purpose: UI model coverage for branch expansion and hierarchy-aware summary rendering.

## Chunk 1: Schema And Pure Hierarchy Rules

### Task 1: Add hierarchy persistence schema

**Files:**

- Modify: `src/data/db.ts`
- Test: `tests/core/workflow-runtime-grouping.test.cjs`

- [ ] **Step 1: Write the failing test**

Add a schema-oriented runtime test in `tests/core/workflow-runtime-grouping.test.cjs` that expects:

- `asset_group_children` to exist
- child links to be inserted for higher-level similarity groups
- no asset to belong to multiple parent similarity branches at the same level

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/core/workflow-runtime-grouping.test.cjs`
Expected: FAIL because the schema and persistence behavior do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Update `src/data/db.ts` to add:

- `asset_group_children`
- supporting indexes on `parent_group_id` and `child_group_id`

Keep the schema simple for reset-and-reimport rollout. Do not add compatibility code for legacy similarity hierarchy data.

- [ ] **Step 4: Run test to verify the schema exists**

Run: `node --test tests/core/workflow-runtime-grouping.test.cjs`
Expected: FAIL later in persistence assertions, but not because the table is missing.

- [ ] **Step 5: Commit**

```bash
git add src/data/db.ts tests/core/workflow-runtime-grouping.test.cjs
git commit -m "feat: add similarity hierarchy child-group schema"
```

### Task 2: Add representative-selection and hierarchy helpers

**Files:**

- Create: `src/services/workflowRuntime/modules/grouping/groupingHierarchy.ts`
- Test: `tests/core/workflow-runtime-grouping.test.cjs`

- [ ] **Step 1: Write the failing test**

Add focused tests for:

- duplicate representative prefers higher resolution / less-lossy rendition
- near-duplicate representative uses the same quality-first rule
- variant representative prefers most recent
- burst representative prefers most recent
- passthrough units are represented without creating synthetic singleton groups

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/core/workflow-runtime-grouping.test.cjs`
Expected: FAIL because hierarchy helper functions do not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/services/workflowRuntime/modules/grouping/groupingHierarchy.ts` with small pure helpers such as:

- `selectDuplicateRepresentative(...)`
- `selectNearDuplicateRepresentative(...)`
- `selectVariantRepresentative(...)`
- `selectBurstRepresentative(...)`
- `buildHierarchyUnits(...)`

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/core/workflow-runtime-grouping.test.cjs`
Expected: PASS for representative-selection coverage while broader runtime tests still fail.

- [ ] **Step 5: Commit**

```bash
git add src/services/workflowRuntime/modules/grouping/groupingHierarchy.ts tests/core/workflow-runtime-grouping.test.cjs
git commit -m "feat: add grouping hierarchy representative selection helpers"
```

## Chunk 2: Bottom-Up Similarity Persistence

### Task 3: Introduce near-duplicate as a first-class persisted level

**Files:**

- Modify: `src/services/workflowRuntime/modules/grouping/groupingQueries.ts`
- Modify: `src/services/workflowRuntime/modules/grouping/groupingPersistence.ts`
- Test: `tests/core/workflow-runtime-grouping.test.cjs`

- [ ] **Step 1: Write the failing test**

Add a runtime test fixture that proves:

- obvious same-content rescans/exports become `near_duplicate`
- they are not mislabeled as `variant_set`
- duplicate children roll up into one near-duplicate parent when appropriate

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/core/workflow-runtime-grouping.test.cjs`
Expected: FAIL because `near_duplicate` is not produced by the runtime workflow.

- [ ] **Step 3: Write minimal implementation**

Refactor grouping query/persistence logic to:

- treat duplicate representatives and lower-level passthrough units as near-duplicate inputs
- persist `near_duplicate` groups
- persist direct child-group links into `asset_group_children`
- keep direct asset members only where no lower-level child group exists

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/core/workflow-runtime-grouping.test.cjs`
Expected: PASS for near-duplicate persistence behavior.

- [ ] **Step 5: Commit**

```bash
git add src/services/workflowRuntime/modules/grouping/groupingQueries.ts src/services/workflowRuntime/modules/grouping/groupingPersistence.ts tests/core/workflow-runtime-grouping.test.cjs
git commit -m "feat: persist near-duplicate hierarchy groups"
```

### Task 4: Refactor variant and burst grouping to consume lower-level units

**Files:**

- Modify: `src/services/workflowRuntime/modules/groupSimilarPhotosModule.ts`
- Modify: `src/services/workflowRuntime/modules/grouping/groupingQueries.ts`
- Modify: `src/services/workflowRuntime/modules/grouping/groupingPersistence.ts`
- Test: `tests/core/workflow-runtime-grouping.test.cjs`

- [ ] **Step 1: Write the failing test**

Add runtime tests proving:

- variant grouping does not merge transitive bridge neighbors into one group
- burst grouping counts lower-level image-content units rather than raw files
- an `f882`-style fixture persists a burst over a small number of child units despite many files underneath

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/core/workflow-runtime-grouping.test.cjs`
Expected: FAIL because variant still uses transitive components and burst still works on raw assets.

- [ ] **Step 3: Write minimal implementation**

Refactor the runtime module and grouping queries to:

- run `duplicate -> near_duplicate -> variant_set -> burst`
- feed each stage representatives plus passthrough lower-level units
- replace unrestricted variant connected components with representative-anchored clustering
- persist higher-level groups using child-group links instead of flattened direct file memberships

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/core/workflow-runtime-grouping.test.cjs`
Expected: PASS for hierarchy-safe variant and burst behavior.

- [ ] **Step 5: Commit**

```bash
git add src/services/workflowRuntime/modules/groupSimilarPhotosModule.ts src/services/workflowRuntime/modules/grouping/groupingQueries.ts src/services/workflowRuntime/modules/grouping/groupingPersistence.ts tests/core/workflow-runtime-grouping.test.cjs
git commit -m "feat: make variant and burst grouping hierarchy aware"
```

## Chunk 3: Hierarchy Diagnostics Backend

### Task 5: Expand diagnostics contracts and backend report building

**Files:**

- Modify: `src/boundary/contracts/groupDiagnostics.ts`
- Modify: `src/shared/utils/groupDiagnosticsModel.ts`
- Modify: `src/services/handlers/groupDiagnosticsCommands.ts`
- Test: `tests/core/group-diagnostics-command.test.cjs`

- [ ] **Step 1: Write the failing test**

Extend `tests/core/group-diagnostics-command.test.cjs` to assert:

- direct asset counts
- descendant asset counts
- direct child group counts
- representative asset ids
- underlying image counts
- hierarchy flags such as `singleton_passthrough` and `time_only_burst_match`

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/core/group-diagnostics-command.test.cjs`
Expected: FAIL because the current report is overlap-based rather than tree-based.

- [ ] **Step 3: Write minimal implementation**

Update the contracts, pure model, and command handler so diagnostics:

- query `asset_group_children`
- build direct and descendant counts from persisted hierarchy
- expose representative ids and hierarchy flags
- distinguish raw-file totals from underlying-image totals in the summary

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/core/group-diagnostics-command.test.cjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/boundary/contracts/groupDiagnostics.ts src/shared/utils/groupDiagnosticsModel.ts src/services/handlers/groupDiagnosticsCommands.ts tests/core/group-diagnostics-command.test.cjs
git commit -m "feat: expose hierarchy-aware grouping diagnostics"
```

## Chunk 4: Diagnostics UI Refresh

### Task 6: Render hierarchy structure in diagnostics UI

**Files:**

- Modify: `src/ui/components/group-diagnostics/groupDiagnosticsViewModel.ts`
- Modify: `src/ui/components/group-diagnostics/GroupingDiagnosticsView.tsx`
- Test: `tests/ui/group-diagnostics-view-model.test.cjs`

- [ ] **Step 1: Write the failing test**

Extend `tests/ui/group-diagnostics-view-model.test.cjs` to assert:

- branch rows can expand through parent/child structure
- summary labels distinguish direct asset count from descendant asset count
- representative asset labels and underlying-image counts render
- suspicious-only filtering still works with nested branches

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ui/group-diagnostics-view-model.test.cjs`
Expected: FAIL because the current view model only understands flat rows.

- [ ] **Step 3: Write minimal implementation**

Update the diagnostics UI to show:

- representative asset
- direct child group count
- direct vs descendant file counts
- underlying image count
- expandable branch rows for nested hierarchy

Keep the UI read-only and do not migrate gallery or filmstrip in this slice.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ui/group-diagnostics-view-model.test.cjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/group-diagnostics/groupDiagnosticsViewModel.ts src/ui/components/group-diagnostics/GroupingDiagnosticsView.tsx tests/ui/group-diagnostics-view-model.test.cjs
git commit -m "feat: render hierarchy-aware grouping diagnostics"
```

## Chunk 5: Verification And Handoff

### Task 7: Run targeted and staged quality checks

**Files:**

- Modify: no new files
- Test: existing changed files and repo scripts

- [ ] **Step 1: Run targeted runtime tests**

Run: `node --test tests/core/workflow-runtime-grouping.test.cjs tests/core/group-diagnostics-command.test.cjs tests/ui/group-diagnostics-view-model.test.cjs`
Expected: PASS.

- [ ] **Step 2: Run changed-file quality checks**

Run: `npm run quality:changed`
Expected: PASS.

- [ ] **Step 3: Run staged complexity checks if grouping logic grew branch-heavy**

Run: `npm run complexity:staged`
Expected: PASS for changed TS/TSX files.

- [ ] **Step 4: Run full repo quality before handoff**

Run: `npm run quality`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add hierarchy-aware grouping first slice"
```

## Notes

- Do not migrate gallery collapse behavior in this slice.
- Do not migrate the single-photo filmstrip in this slice.
- Keep manual actions level-specific to the concrete group node the user is viewing.
- Prefer surfacing ambiguity in diagnostics over storing overlapping similarity memberships.
