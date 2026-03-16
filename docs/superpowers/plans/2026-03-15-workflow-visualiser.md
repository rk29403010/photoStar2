# Workflow Visualiser Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated workflow visualiser workspace for runtime-native workflows, opening from the `Actions` menu and initially focused on `folder_ingest_v1`.

**Architecture:** Add a single workflow-visualisation projection boundary that converts workflow runtime definitions and run detail into a shared presentation model. Drive the new workflow workspace tabs (`Overview`, `Progression`, `Runtime graph`, `Text`) from that one model, with optional graph-library usage isolated to the graph tab only.

**Tech Stack:** React 19, TypeScript, existing PhotoStar boundary contracts/handlers, workflow runtime definitions in `src/services/workflowRuntime/`, Node test harness, optional DAG library evaluation for graph rendering.

---

## File Map

### Existing files likely to modify

- `src/ui/App.tsx`
  Purpose: add workflow workspace to top-level app view state and wire Actions entry into navigation.
- `src/ui/components/app/AppMainContent.tsx`
  Purpose: render the new workflow workspace when selected.
- `src/ui/components/ActionPanel.tsx`
  Purpose: add the workflow visualiser entry beside settings.
- `src/ui/hooks/usePhotoLibrary.ts`
  Purpose: expose workflow-definition/detail fetch actions.
- `src/ui/hooks/usePhotoLibrary.state.ts`
  Purpose: store workflow visualiser data if it should be cached in app state.
- `src/boundary/contracts/jobs.ts`
  Purpose: keep existing run list snapshots aligned if richer workflow detail shares types or references.
- `src/services/handlers/systemWorkflowRuntimeCommands.ts`
  Purpose: add commands for workflow definitions and visualiser-friendly run detail.
- `src/services/handlers/systemWorkflowRunSnapshot.ts`
  Purpose: reuse or extend workflow run snapshot mapping where possible.
- `src/services/handlers.ts`
  Purpose: ensure any new workflow commands remain registered through the existing handler route.
- `src/services/workflowRuntime/workflowRegistry.ts`
  Purpose: surface workflow definitions and presentation metadata for handler queries.
- `src/services/workflowRuntime/contracts.ts`
  Purpose: confirm available runtime metadata for nodes, milestones, parameters, and run detail.
- `src/services/workflowRuntime/workflows/folderIngestWorkflow.ts`
  Purpose: supply or refine presentation hints needed by the projection layer.

### New files likely to create

- `src/boundary/contracts/workflowVisualiser.ts`
  Purpose: shared UI-facing contracts for workflow definitions, progression groups, graph nodes/edges, text sections, and drill-down detail.
- `src/services/handlers/systemWorkflowVisualiser.ts`
  Purpose: build the backend-facing workflow visualiser projection from runtime definitions and run detail.
- `src/ui/components/workflows/WorkflowWorkspace.tsx`
  Purpose: top-level workflow visualiser screen with header, tabs, and run selection context.
- `src/ui/components/workflows/WorkflowWorkspaceHeader.tsx`
  Purpose: stable workflow/run header and tab switching.
- `src/ui/components/workflows/WorkflowOverviewTab.tsx`
  Purpose: render summary, milestones, and run context.
- `src/ui/components/workflows/WorkflowProgressionTab.tsx`
  Purpose: render the traditional stage progression view.
- `src/ui/components/workflows/WorkflowRuntimeGraphTab.tsx`
  Purpose: render the DAG-faithful graph, with any library isolated here.
- `src/ui/components/workflows/WorkflowTextTab.tsx`
  Purpose: render structured workflow outline text.
- `src/ui/components/workflows/WorkflowDetailPanel.tsx`
  Purpose: reusable drill-down panel for clicked stages/nodes.
- `src/shared/workflowVisualiser/`
  Purpose: pure mapping helpers kept outside React components if projection logic needs a shared home.

### Tests likely to modify or create

- `tests/core/workflow-runtime-commands.test.cjs`
  Purpose: cover new visualiser commands at the handler boundary.
- `tests/core/workflow-runtime-folder-ingest-commands.test.cjs`
  Purpose: verify `folder_ingest_v1` data can power the visualiser.
- `tests/core/workflow-runtime-progress-and-library-order.test.cjs`
  Purpose: extend snapshot/projection expectations if existing run snapshots are reused.
- `tests/ui/workflow-visualiser-projection.test.ts`
  Purpose: test pure mapping from runtime definition/run detail to UI-facing model.
- `tests/ui/workflow-workspace.test.tsx`
  Purpose: test tab rendering, default run selection, and drill-down interactions.

## Chunk 1: Backend Contracts And Projection

### Task 1: Add failing contract/projection tests

**Files:**

- Create: `tests/ui/workflow-visualiser-projection.test.ts`
- Modify: `tests/core/workflow-runtime-commands.test.cjs`
- Modify: `tests/core/workflow-runtime-folder-ingest-commands.test.cjs`
- Reference: `src/services/workflowRuntime/workflows/folderIngestWorkflow.ts`

- [ ] **Step 1: Write a failing projection test for definition-to-visualiser mapping**

```ts
it('maps folder_ingest_v1 into overview, progression, graph, and text sections', () => {
  const visualiser = buildWorkflowVisualiserModel({
    workflowDefinition: folderIngestWorkflowDefinition,
    runDetail: null,
  });

  expect(visualiser.workflowId).toBe('folder_ingest_v1');
  expect(visualiser.tabs.progression.stages.map((stage) => stage.id)).toContain('discovery');
  expect(visualiser.tabs.graph.nodes.some((node) => node.id === 'scan-folder')).toBe(true);
  expect(visualiser.tabs.text.sections.some((section) => section.id === 'milestones')).toBe(true);
});
```

- [ ] **Step 2: Run the projection test to verify it fails**

Run: `npm test -- tests/ui/workflow-visualiser-projection.test.ts`
Expected: FAIL because the projection builder and contracts do not exist yet.

- [ ] **Step 3: Write failing handler tests for visualiser commands**

```js
test('get_workflow_visualiser_definition returns runtime-native workflow metadata', async () => {
  const response = await runCommand({
    command: 'get_workflow_visualiser_definition',
    payload: { workflowId: 'folder_ingest_v1' },
  });

  assert.equal(response.status, 'ok');
  assert.equal(response.data.workflowId, 'folder_ingest_v1');
  assert.ok(Array.isArray(response.data.tabs.graph.nodes));
});
```

- [ ] **Step 4: Run the handler tests to verify they fail**

Run: `npm test -- tests/core/workflow-runtime-commands.test.cjs tests/core/workflow-runtime-folder-ingest-commands.test.cjs`
Expected: FAIL with unknown command or missing visualiser payload shape.

- [ ] **Step 5: Commit the red tests**

```bash
git add tests/ui/workflow-visualiser-projection.test.ts tests/core/workflow-runtime-commands.test.cjs tests/core/workflow-runtime-folder-ingest-commands.test.cjs
git commit -m "test: cover workflow visualiser contracts"
```

### Task 2: Add shared workflow visualiser contracts and backend projection

**Files:**

- Create: `src/boundary/contracts/workflowVisualiser.ts`
- Create: `src/services/handlers/systemWorkflowVisualiser.ts`
- Modify: `src/services/handlers/systemWorkflowRuntimeCommands.ts`
- Modify: `src/services/handlers.ts`
- Modify: `src/services/workflowRuntime/workflowRegistry.ts`
- Modify: `src/services/workflowRuntime/contracts.ts`
- Modify: `src/services/workflowRuntime/workflows/folderIngestWorkflow.ts`

- [ ] **Step 1: Add the minimal shared contracts needed to satisfy the tests**

```ts
export interface WorkflowVisualiserModel {
  workflowId: string;
  displayName: string;
  selectedRun: WorkflowVisualiserRunSummary | null;
  tabs: {
    overview: WorkflowOverviewModel;
    progression: WorkflowProgressionModel;
    graph: WorkflowGraphModel;
    text: WorkflowTextModel;
  };
}
```

- [ ] **Step 2: Implement the smallest backend projection builder**

```ts
export function buildWorkflowVisualiserModel(params: BuildWorkflowVisualiserParams): WorkflowVisualiserModel {
  return {
    workflowId: params.workflowDefinition.id,
    displayName: params.workflowDefinition.presentation?.defaultRunLabel ?? params.workflowDefinition.id,
    selectedRun: mapSelectedRun(params.runDetail),
    tabs: {
      overview: buildOverview(params),
      progression: buildProgression(params),
      graph: buildGraph(params),
      text: buildText(params),
    },
  };
}
```

- [ ] **Step 3: Expose new workflow visualiser commands**

```ts
get_workflow_visualiser_definition: (ctx) => {
  const workflow = workflowRuntime.registry.getDefinition(payload.workflowId);
  ctx.respond(ctx.id, 'ok', buildWorkflowVisualiserModel({ workflowDefinition: workflow, runDetail }), null, ctx.originWs);
}
```

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run: `npm test -- tests/ui/workflow-visualiser-projection.test.ts tests/core/workflow-runtime-commands.test.cjs tests/core/workflow-runtime-folder-ingest-commands.test.cjs`
Expected: PASS for the new projection and command cases.

- [ ] **Step 5: Run changed-file quality checks**

Run: `npm run quality:staged`
Expected: PASS with no staged lint or complexity failures.

- [ ] **Step 6: Commit the backend projection work**

```bash
git add src/boundary/contracts/workflowVisualiser.ts src/services/handlers/systemWorkflowVisualiser.ts src/services/handlers/systemWorkflowRuntimeCommands.ts src/services/handlers.ts src/services/workflowRuntime/contracts.ts src/services/workflowRuntime/workflowRegistry.ts src/services/workflowRuntime/workflows/folderIngestWorkflow.ts
git commit -m "feat: add workflow visualiser projection"
```

## Chunk 2: Navigation And Workspace Shell

### Task 3: Add a failing UI navigation test for the new workflow workspace

**Files:**

- Create: `tests/ui/workflow-workspace.test.tsx`
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/components/ActionPanel.tsx`
- Modify: `src/ui/components/app/AppMainContent.tsx`

- [ ] **Step 1: Write a failing test for opening the workflow visualiser from Actions**

```tsx
it('opens the workflow workspace from the Actions menu', async () => {
  render(<App />);

  await user.click(screen.getByRole('button', { name: /actions/i }));
  await user.click(screen.getByRole('button', { name: /workflow visualiser/i }));

  expect(screen.getByRole('heading', { name: /folder ingest/i })).toBeVisible();
  expect(screen.getByRole('tab', { name: /overview/i })).toBeVisible();
});
```

- [ ] **Step 2: Run the UI test to verify it fails**

Run: `npm test -- tests/ui/workflow-workspace.test.tsx`
Expected: FAIL because the workflow workspace view does not exist.

- [ ] **Step 3: Commit the red UI navigation test**

```bash
git add tests/ui/workflow-workspace.test.tsx
git commit -m "test: cover workflow workspace navigation"
```

### Task 4: Implement view state, Actions entry, and workspace shell

**Files:**

- Create: `src/ui/components/workflows/WorkflowWorkspace.tsx`
- Create: `src/ui/components/workflows/WorkflowWorkspaceHeader.tsx`
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/components/ActionPanel.tsx`
- Modify: `src/ui/components/app/AppMainContent.tsx`
- Modify: `src/ui/hooks/usePhotoLibrary.ts`
- Modify: `src/ui/hooks/usePhotoLibrary.state.ts`

- [ ] **Step 1: Add the minimal app view and action wiring**

```ts
type AppView = 'library' | 'people' | 'dashboard' | 'albums' | 'workflows';
```

- [ ] **Step 2: Add the workflow visualiser action beside settings**

```tsx
<button onClick={() => { onOpenWorkflowVisualiser(); onClose(); }}>
  <span className="font-medium">Workflow Visualiser</span>
</button>
```

- [ ] **Step 3: Implement the workspace shell with tabs and loading state**

```tsx
export function WorkflowWorkspace({ model, onSelectTab }: WorkflowWorkspaceProps) {
  return (
    <section>
      <WorkflowWorkspaceHeader model={model} />
      <nav>{/* Overview / Progression / Runtime graph / Text */}</nav>
      <div>{/* selected tab body */}</div>
    </section>
  );
}
```

- [ ] **Step 4: Run the UI test to verify it passes**

Run: `npm test -- tests/ui/workflow-workspace.test.tsx`
Expected: PASS for opening the new workspace and rendering default tabs.

- [ ] **Step 5: Run changed-file quality checks**

Run: `npm run quality:staged`
Expected: PASS with no lint, type, or complexity regressions in changed files.

- [ ] **Step 6: Commit the workspace shell**

```bash
git add src/ui/App.tsx src/ui/components/ActionPanel.tsx src/ui/components/app/AppMainContent.tsx src/ui/components/workflows/WorkflowWorkspace.tsx src/ui/components/workflows/WorkflowWorkspaceHeader.tsx src/ui/hooks/usePhotoLibrary.ts src/ui/hooks/usePhotoLibrary.state.ts
git commit -m "feat: add workflow workspace shell"
```

## Chunk 3: Overview, Text, And Progression Tabs

### Task 5: Add failing tab-content tests

**Files:**

- Modify: `tests/ui/workflow-workspace.test.tsx`
- Reference: `src/boundary/contracts/workflowVisualiser.ts`

- [ ] **Step 1: Add failing tests for overview, text, and progression content**

```tsx
it('renders progression stages and structured text from the same model', async () => {
  render(<WorkflowWorkspace model={fixture} />);

  await user.click(screen.getByRole('tab', { name: /progression/i }));
  expect(screen.getByText(/library ready/i)).toBeVisible();

  await user.click(screen.getByRole('tab', { name: /text/i }));
  expect(screen.getByText(/inputs/i)).toBeVisible();
  expect(screen.getByText(/milestones/i)).toBeVisible();
});
```

- [ ] **Step 2: Run the tab-content test to verify it fails**

Run: `npm test -- tests/ui/workflow-workspace.test.tsx`
Expected: FAIL because the tab bodies are not implemented.

- [ ] **Step 3: Commit the red tab-content tests**

```bash
git add tests/ui/workflow-workspace.test.tsx
git commit -m "test: cover workflow workspace tabs"
```

### Task 6: Implement `Overview`, `Text`, and `Progression`

**Files:**

- Create: `src/ui/components/workflows/WorkflowOverviewTab.tsx`
- Create: `src/ui/components/workflows/WorkflowProgressionTab.tsx`
- Create: `src/ui/components/workflows/WorkflowTextTab.tsx`
- Modify: `src/ui/components/workflows/WorkflowWorkspace.tsx`
- Modify: `src/services/handlers/systemWorkflowVisualiser.ts`

- [ ] **Step 1: Implement the overview tab using existing milestone/run summary data**

```tsx
export function WorkflowOverviewTab({ overview }: { overview: WorkflowOverviewModel }) {
  return (
    <>
      <h2>{overview.summary.title}</h2>
      <MilestoneList milestones={overview.milestones} />
      <RunSummaryCard run={overview.selectedRun} />
    </>
  );
}
```

- [ ] **Step 2: Implement the structured text tab**

```tsx
export function WorkflowTextTab({ text }: { text: WorkflowTextModel }) {
  return text.sections.map((section) => (
    <section key={section.id}>
      <h3>{section.label}</h3>
      <ul>{section.items.map((item) => <li key={item.id}>{item.label}</li>)}</ul>
    </section>
  ));
}
```

- [ ] **Step 3: Implement the ingest-specific progression grouping**

```tsx
export function WorkflowProgressionTab({ progression }: { progression: WorkflowProgressionModel }) {
  return progression.stages.map((stage) => (
    <ProgressionStageCard key={stage.id} stage={stage} />
  ));
}
```

- [ ] **Step 4: Run the workspace tests to verify they pass**

Run: `npm test -- tests/ui/workflow-workspace.test.tsx tests/ui/workflow-visualiser-projection.test.ts`
Expected: PASS for shared-model rendering across tabs.

- [ ] **Step 5: Run changed-file quality checks**

Run: `npm run quality:staged`
Expected: PASS.

- [ ] **Step 6: Commit the tab implementation**

```bash
git add src/ui/components/workflows/WorkflowOverviewTab.tsx src/ui/components/workflows/WorkflowProgressionTab.tsx src/ui/components/workflows/WorkflowTextTab.tsx src/ui/components/workflows/WorkflowWorkspace.tsx src/services/handlers/systemWorkflowVisualiser.ts
git commit -m "feat: add workflow overview and progression tabs"
```

## Chunk 4: Runtime Graph Evaluation And Drill-Down

### Task 7: Add failing graph and drill-down tests

**Files:**

- Modify: `tests/ui/workflow-workspace.test.tsx`
- Modify: `tests/ui/workflow-visualiser-projection.test.ts`

- [ ] **Step 1: Add a failing graph-tab test**

```tsx
it('renders the runtime graph and opens node detail', async () => {
  render(<WorkflowWorkspace model={fixture} />);

  await user.click(screen.getByRole('tab', { name: /runtime graph/i }));
  await user.click(screen.getByRole('button', { name: /scan folder/i }));

  expect(screen.getByText(/upstream/i)).toBeVisible();
  expect(screen.getByText(/downstream/i)).toBeVisible();
});
```

- [ ] **Step 2: Run the graph/drill-down tests to verify they fail**

Run: `npm test -- tests/ui/workflow-workspace.test.tsx tests/ui/workflow-visualiser-projection.test.ts`
Expected: FAIL because graph rendering and detail panel are missing.

- [ ] **Step 3: Commit the red graph tests**

```bash
git add tests/ui/workflow-workspace.test.tsx tests/ui/workflow-visualiser-projection.test.ts
git commit -m "test: cover workflow graph and detail panel"
```

### Task 8: Implement runtime graph tab, optional library integration, and detail panel

**Files:**

- Create: `src/ui/components/workflows/WorkflowRuntimeGraphTab.tsx`
- Create: `src/ui/components/workflows/WorkflowDetailPanel.tsx`
- Modify: `src/ui/components/workflows/WorkflowWorkspace.tsx`
- Modify: `src/services/handlers/systemWorkflowVisualiser.ts`
- Optional add: graph-library package and any isolated adapter file under `src/ui/components/workflows/graph/`

- [ ] **Step 1: Evaluate whether custom SVG is sufficient before adding a dependency**

Run: inspect the current graph tab requirements against a minimal custom renderer.
Expected: only add a library if pan/zoom and layout complexity clearly justify it.

- [ ] **Step 2: Implement the smallest graph tab that can render nodes and edges**

```tsx
export function WorkflowRuntimeGraphTab({ graph, onSelectNode }: WorkflowRuntimeGraphTabProps) {
  return graph.nodes.map((node) => (
    <button key={node.id} onClick={() => onSelectNode(node.id)}>
      {node.label}
    </button>
  ));
}
```

- [ ] **Step 3: Implement reusable node/stage drill-down**

```tsx
export function WorkflowDetailPanel({ detail }: { detail: WorkflowDetailModel | null }) {
  if (!detail) { return null; }
  return (
    <aside>
      <h3>{detail.label}</h3>
      <p>{detail.description}</p>
    </aside>
  );
}
```

- [ ] **Step 4: Run the graph and workspace tests to verify they pass**

Run: `npm test -- tests/ui/workflow-workspace.test.tsx tests/ui/workflow-visualiser-projection.test.ts`
Expected: PASS.

- [ ] **Step 5: Run staged quality checks and full quality gate**

Run: `npm run quality:staged`
Expected: PASS.

Run: `npm run quality`
Expected: PASS for lint, typecheck, Markdown lint, and complexity reporting.

- [ ] **Step 6: Commit the final workflow visualiser feature**

```bash
git add src/ui/components/workflows/WorkflowRuntimeGraphTab.tsx src/ui/components/workflows/WorkflowDetailPanel.tsx src/ui/components/workflows/WorkflowWorkspace.tsx src/services/handlers/systemWorkflowVisualiser.ts package.json package-lock.json
git commit -m "feat: add workflow visualiser"
```

## Execution Notes

- Keep the visualiser runtime-native only. Do not add legacy coordinator adapters.
- Do not let the graph tab become the source of truth. The shared projection model remains canonical.
- Prefer extracting small helpers if any React file starts drifting toward the repo size and complexity guardrails.
- If graph-library evaluation does not clearly beat a custom SVG or flex/SVG hybrid, choose the custom path.
- Reuse existing workflow labels and milestone metadata where they already exist before inventing new naming layers.
