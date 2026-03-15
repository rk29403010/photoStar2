# Dashboard Workflow Oversight Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy dashboard with a workflow-native oversight dashboard that combines run health, remediation, coverage, and collection composition.

**Architecture:** Add a new workflow-dashboard projection contract in the boundary layer, back it with runtime- and library-derived snapshot handlers, then replace the current tabbed dashboard UI with a single overview page wired to explicit remediation actions. Keep the workflow visualiser as the deep-inspection screen and remove legacy module and queue assumptions from the dashboard path.

**Tech Stack:** TypeScript, React, existing boundary contracts, runtime handlers, SQLite-backed projection queries, repo quality scripts

---

## File map

### Create

- `src/boundary/contracts/workflowDashboard.ts`
- `src/services/handlers/systemWorkflowDashboardSnapshot.ts`
- `src/ui/components/dashboard/WorkflowStatusSection.tsx`
- `src/ui/components/dashboard/AttentionNeededSection.tsx`
- `src/ui/components/dashboard/CoverageCompletenessSection.tsx`
- `src/ui/components/dashboard/CollectionCompositionSection.tsx`
- `tests/core/system-workflow-dashboard-snapshot.test.cjs`
- `tests/ui/dashboard-workflow-oversight.test.tsx`

### Modify

- `src/boundary/runtime/usePhotoLibrary.commands.ts`
- `src/boundary/runtime/usePhotoLibrary.connection.messages.ts`
- `src/boundary/runtime/usePhotoLibrary.connection.ts`
- `src/services/handlers.ts`
- `src/services/handlers/types.ts`
- `src/services/handlers/systemCommands.ts`
- `src/services/handlers/systemWorkflowRunSnapshot.ts`
- `src/ui/components/DashboardView.tsx`
- `src/ui/components/app/AppMainContent.tsx`

### Remove or simplify later in the slice

- `src/ui/components/dashboard/DataStatsPanel.tsx`
- `src/ui/components/dashboard/SystemErrorsPanel.tsx`
- `src/ui/components/dashboard/WorkflowRunsPanel.tsx`
- legacy dashboard-only mappings in `src/services/handlers/systemDashboardModules.ts`

## Chunk 1: Define workflow-dashboard contracts

### Task 1: Add the shared dashboard snapshot contract

**Files:**

- Create: `src/boundary/contracts/workflowDashboard.ts`

- [ ] **Step 1: Write the failing contract-consumer test**

```ts
import type { WorkflowDashboardSnapshot } from '../../src/boundary/contracts/workflowDashboard';

const snapshot: WorkflowDashboardSnapshot = {
  generatedAt: '2026-03-15T12:00:00.000Z',
  workflowStatus: [],
  attentionItems: [],
  coverageMetrics: [],
  collectionComposition: [],
};

expect(snapshot.workflowStatus).toEqual([]);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/core/system-workflow-dashboard-snapshot.test.cjs`
Expected: FAIL because the contract file does not exist yet.

- [ ] **Step 3: Add minimal contract types**

```ts
export interface WorkflowDashboardSnapshot {
  generatedAt: string;
  workflowStatus: WorkflowStatusCard[];
  attentionItems: DashboardAttentionItem[];
  coverageMetrics: DashboardMetricCard[];
  collectionComposition: DashboardCompositionCard[];
}
```

- [ ] **Step 4: Add remediation action and navigation types**

```ts
export type DashboardAction =
  | { kind: 'retry_item'; workflowId: string; runId: string; itemId: string }
  | { kind: 'retry_step'; workflowId: string; runId: string; nodeId: string }
  | { kind: 'open_visualiser'; workflowId: string; runId?: string; nodeId?: string }
  | { kind: 'open_library'; filter: Record<string, unknown> }
  | { kind: 'pause_workflow'; workflowId: string }
  | { kind: 'resume_workflow'; workflowId: string };
```

- [ ] **Step 5: Run the targeted test**

Run: `npm test -- tests/core/system-workflow-dashboard-snapshot.test.cjs`
Expected: PASS for the contract import shape.

- [ ] **Step 6: Run staged quality**

Run: `npm run quality:staged`
Expected: PASS for the new contract file.

- [ ] **Step 7: Commit**

```powershell
git add src/boundary/contracts/workflowDashboard.ts tests/core/system-workflow-dashboard-snapshot.test.cjs
git commit -m "feat: add workflow dashboard contracts"
```

## Chunk 2: Build backend projection snapshot

### Task 2: Add a projection test fixture for workflow status and coverage

**Files:**

- Create: `tests/core/system-workflow-dashboard-snapshot.test.cjs`
- Modify: `src/services/handlers/systemWorkflowRunSnapshot.ts`

- [ ] **Step 1: Write the failing projection test**

```js
it('builds workflow status, attention, coverage, and composition cards', () => {
  const snapshot = getWorkflowDashboardSnapshot(db);
  expect(snapshot.workflowStatus[0].workflowId).toBe('folder_ingest_v1');
  expect(snapshot.coverageMetrics.some((metric) => metric.id === 'extended_metadata')).toBe(true);
});
```

- [ ] **Step 2: Run the targeted test**

Run: `npm test -- tests/core/system-workflow-dashboard-snapshot.test.cjs`
Expected: FAIL because the handler does not exist.

- [ ] **Step 3: Create `systemWorkflowDashboardSnapshot.ts` with focused helpers**

```ts
export function getWorkflowDashboardSnapshot(db: unknown): WorkflowDashboardSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    workflowStatus: buildWorkflowStatus(db),
    attentionItems: buildAttentionItems(db),
    coverageMetrics: buildCoverageMetrics(db),
    collectionComposition: buildCollectionComposition(db),
  };
}
```

- [ ] **Step 4: Reuse and adapt existing useful queries**

```ts
const extendedMetadataCount = getCount(
  db,
  "SELECT COUNT(DISTINCT asset_id) as count FROM derived_results WHERE task = 'ai_metadata'"
);
```

- [ ] **Step 5: Add a gravestone composition query from stored metadata**

```ts
const gravestoneCount = getCount(
  db,
  `SELECT COUNT(DISTINCT asset_id) AS count
   FROM derived_results
   WHERE task = 'ai_metadata'
     AND json_extract(data, '$.type') = 'Gravestone'`
);
```

- [ ] **Step 6: Generate attention items from failed step runs or item failures**

```ts
{
  id: `run:${runId}:node:${nodeId}`,
  severity: 'error',
  summary: 'Items failed during metadata generation',
  actions: [{ kind: 'retry_step', workflowId, runId, nodeId }],
}
```

- [ ] **Step 7: Run the targeted test**

Run: `npm test -- tests/core/system-workflow-dashboard-snapshot.test.cjs`
Expected: PASS

- [ ] **Step 8: Run complexity and staged quality**

Run: `npm run complexity:staged`
Expected: PASS

Run: `npm run quality:staged`
Expected: PASS

- [ ] **Step 9: Commit**

```powershell
git add src/services/handlers/systemWorkflowDashboardSnapshot.ts src/services/handlers/systemWorkflowRunSnapshot.ts tests/core/system-workflow-dashboard-snapshot.test.cjs
git commit -m "feat: add workflow dashboard snapshot projection"
```

## Chunk 3: Expose the snapshot through the boundary/runtime layer

### Task 3: Wire the dashboard snapshot into existing transport flows

**Files:**

- Modify: `src/services/handlers.ts`
- Modify: `src/services/handlers/types.ts`
- Modify: `src/services/handlers/systemCommands.ts`
- Modify: `src/boundary/runtime/usePhotoLibrary.connection.messages.ts`
- Modify: `src/boundary/runtime/usePhotoLibrary.connection.ts`
- Modify: `src/boundary/runtime/usePhotoLibrary.commands.ts`

- [ ] **Step 1: Write the failing message-handling test**

```ts
expect(data.workflowDashboard).toBeDefined();
```

- [ ] **Step 2: Run the targeted transport test**

Run: `npm test -- tests/core/system-workflow-dashboard-snapshot.test.cjs`
Expected: FAIL because the response payload does not include `workflowDashboard`.

- [ ] **Step 3: Add the handler response shape**

```ts
respond('system_state', 'ok', {
  workflowDashboard: getWorkflowDashboardSnapshot(db),
});
```

- [ ] **Step 4: Add state plumbing on the frontend connection layer**

```ts
if (data.workflowDashboard) {
  params.setWorkflowDashboard(data.workflowDashboard as WorkflowDashboardSnapshot);
}
```

- [ ] **Step 5: Add typed React state for the snapshot**

```ts
const [workflowDashboard, setWorkflowDashboard] = useState<WorkflowDashboardSnapshot | null>(null);
```

- [ ] **Step 6: Run the targeted test**

Run: `npm test -- tests/core/system-workflow-dashboard-snapshot.test.cjs`
Expected: PASS

- [ ] **Step 7: Run staged quality**

Run: `npm run quality:staged`
Expected: PASS

- [ ] **Step 8: Commit**

```powershell
git add src/services/handlers.ts src/services/handlers/types.ts src/services/handlers/systemCommands.ts src/boundary/runtime/usePhotoLibrary.connection.messages.ts src/boundary/runtime/usePhotoLibrary.connection.ts src/boundary/runtime/usePhotoLibrary.commands.ts
git commit -m "feat: wire workflow dashboard snapshot through transport"
```

## Chunk 4: Replace the dashboard UI shell

### Task 4: Build the overview sections with simple focused components

**Files:**

- Create: `src/ui/components/dashboard/WorkflowStatusSection.tsx`
- Create: `src/ui/components/dashboard/AttentionNeededSection.tsx`
- Create: `src/ui/components/dashboard/CoverageCompletenessSection.tsx`
- Create: `src/ui/components/dashboard/CollectionCompositionSection.tsx`
- Modify: `src/ui/components/DashboardView.tsx`
- Create: `tests/ui/dashboard-workflow-oversight.test.tsx`

- [ ] **Step 1: Write the failing UI rendering test**

```tsx
render(<DashboardView workflowDashboard={snapshot} />);
expect(screen.getByText('Workflow Status')).toBeInTheDocument();
expect(screen.getByText('Attention Needed')).toBeInTheDocument();
expect(screen.getByText('Coverage & Completeness')).toBeInTheDocument();
expect(screen.getByText('Collection Composition')).toBeInTheDocument();
```

- [ ] **Step 2: Run the targeted UI test**

Run: `npm test -- tests/ui/dashboard-workflow-oversight.test.tsx`
Expected: FAIL because the sections do not exist.

- [ ] **Step 3: Create the four section components**

```tsx
export const WorkflowStatusSection = ({ cards }: Props) => (
  <section>
    <h3>Workflow Status</h3>
    {cards.map(renderStatusCard)}
  </section>
);
```

- [ ] **Step 4: Simplify `DashboardView.tsx` to one overview layout**

```tsx
return (
  <div className="space-y-6">
    <WorkflowStatusSection cards={workflowDashboard.workflowStatus} />
    <AttentionNeededSection items={workflowDashboard.attentionItems} />
    <CoverageCompletenessSection metrics={workflowDashboard.coverageMetrics} />
    <CollectionCompositionSection cards={workflowDashboard.collectionComposition} />
  </div>
);
```

- [ ] **Step 5: Preserve loading and empty states**

```tsx
if (!workflowDashboard && loading) {
  return <DashboardLoadingState />;
}
```

- [ ] **Step 6: Run the targeted UI test**

Run: `npm test -- tests/ui/dashboard-workflow-oversight.test.tsx`
Expected: PASS

- [ ] **Step 7: Run staged quality**

Run: `npm run quality:staged`
Expected: PASS

- [ ] **Step 8: Commit**

```powershell
git add src/ui/components/DashboardView.tsx src/ui/components/dashboard/WorkflowStatusSection.tsx src/ui/components/dashboard/AttentionNeededSection.tsx src/ui/components/dashboard/CoverageCompletenessSection.tsx src/ui/components/dashboard/CollectionCompositionSection.tsx tests/ui/dashboard-workflow-oversight.test.tsx
git commit -m "feat: replace dashboard with workflow oversight overview"
```

## Chunk 5: Add remediation actions

### Task 5: Make attention items actionable

**Files:**

- Modify: `src/ui/components/dashboard/AttentionNeededSection.tsx`
- Modify: `src/boundary/runtime/usePhotoLibrary.commands.ts`
- Modify: `src/services/handlers/systemCommands.ts`
- Modify: `tests/core/system-workflow-dashboard-snapshot.test.cjs`
- Modify: `tests/ui/dashboard-workflow-oversight.test.tsx`

- [ ] **Step 1: Write the failing remediation test**

```tsx
await user.click(screen.getByRole('button', { name: /retry failed step/i }));
expect(sendCommand).toHaveBeenCalledWith('retry_workflow_step', expect.any(Object));
```

- [ ] **Step 2: Run the targeted UI or command test**

Run: `npm test -- tests/ui/dashboard-workflow-oversight.test.tsx`
Expected: FAIL because the button is not wired.

- [ ] **Step 3: Add a frontend action dispatcher**

```ts
function runDashboardAction(action: DashboardAction) {
  if (action.kind === 'retry_step') {
    return sendCommand('retry_workflow_step', action);
  }
}
```

- [ ] **Step 4: Add backend command handlers for supported remediation actions**

```ts
case 'retry_workflow_step':
  return retryWorkflowStep(context, payload);
```

- [ ] **Step 5: Wire open-library and open-visualiser actions through existing navigation patterns**

```ts
if (action.kind === 'open_visualiser') {
  navigateToWorkflowVisualiser(action.workflowId, action.runId, action.nodeId);
}
```

- [ ] **Step 6: Run the targeted tests**

Run: `npm test -- tests/ui/dashboard-workflow-oversight.test.tsx`
Expected: PASS

Run: `npm test -- tests/core/system-workflow-dashboard-snapshot.test.cjs`
Expected: PASS

- [ ] **Step 7: Run staged quality**

Run: `npm run quality:staged`
Expected: PASS

- [ ] **Step 8: Commit**

```powershell
git add src/ui/components/dashboard/AttentionNeededSection.tsx src/boundary/runtime/usePhotoLibrary.commands.ts src/services/handlers/systemCommands.ts tests/core/system-workflow-dashboard-snapshot.test.cjs tests/ui/dashboard-workflow-oversight.test.tsx
git commit -m "feat: add workflow dashboard remediation actions"
```

## Chunk 6: Remove legacy dashboard concepts

### Task 6: Delete or demote obsolete dashboard-only code paths

**Files:**

- Modify: `src/ui/components/DashboardView.tsx`
- Modify: `src/ui/components/app/AppMainContent.tsx`
- Modify: `src/services/handlers/systemDashboardModules.ts`
- Remove or stop importing: `src/ui/components/dashboard/DataStatsPanel.tsx`
- Remove or stop importing: `src/ui/components/dashboard/SystemErrorsPanel.tsx`
- Remove or stop importing: `src/ui/components/dashboard/WorkflowRunsPanel.tsx`

- [ ] **Step 1: Write the failing cleanup assertion**

```tsx
expect(screen.queryByText('Modules')).not.toBeInTheDocument();
expect(screen.queryByText('Queues')).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the targeted UI test**

Run: `npm test -- tests/ui/dashboard-workflow-oversight.test.tsx`
Expected: FAIL until the old tab shell is removed.

- [ ] **Step 3: Remove old dashboard navigation and dead props**

```tsx
type DashboardViewProps = {
  workflowDashboard: WorkflowDashboardSnapshot | null;
  loading?: boolean;
};
```

- [ ] **Step 4: Delete or isolate legacy SQL mappings no longer used by the dashboard**

```ts
// remove task-to-module mapping from the dashboard path
```

- [ ] **Step 5: Run the targeted tests**

Run: `npm test -- tests/ui/dashboard-workflow-oversight.test.tsx`
Expected: PASS

- [ ] **Step 6: Run full quality gate**

Run: `npm run quality`
Expected: PASS

- [ ] **Step 7: Commit**

```powershell
git add src/ui/components/DashboardView.tsx src/ui/components/app/AppMainContent.tsx src/services/handlers/systemDashboardModules.ts
git commit -m "refactor: remove legacy dashboard workflow model"
```

## Execution notes

- Keep projection helpers small and focused; split by section before any helper
  grows branch-heavy.
- Prefer reusing existing query logic from `systemJobsDataStats.ts` and
  `systemWorkflowRunSnapshot.ts` where it keeps behavior consistent.
- Do not hard-code the UI to `folder_ingest_v1`; only the projection layer may
  apply workflow-specific naming or grouping rules.
- Treat gravestone counting as a classification-backed metric in v1, not a
  first-class subject guarantee.
- Preserve clear empty states for installations with no workflow runs yet.

Plan complete and saved to `docs/superpowers/plans/2026-03-15-dashboard-workflow-oversight.md`. Ready to execute?
