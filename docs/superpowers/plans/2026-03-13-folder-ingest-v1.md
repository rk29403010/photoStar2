# Folder Ingest V1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first real runtime-native folder ingest workflow with scan, previews, faces, people resolution, similar grouping, sensitivity analysis, and AI metadata modes.

**Architecture:** Extend the `workflowRuntime` so a `folder` input subject fans out into `asset` work and flows through native ingest modules that write directly to current canonical tables. Use workflow presentation metadata and run projections to present `Library ready` and `Enrichment complete` in user language while supporting `mock`, `live`, and `off` AI modes.

**Tech Stack:** TypeScript, Node.js, better-sqlite3, existing canonical media tables, Node's built-in test runner, markdownlint

---

This plan replaces the preview-only pilot with a real `folder_ingest_v1`
vertical slice. It does not cover plugin packaging, general workflow editing,
or new entity types beyond `folder` and `asset`.

## File structure

### Runtime contract and store files

- Modify: `src/services/workflowRuntime/contracts.ts`
- Modify: `src/services/workflowRuntime/index.ts`
- Modify: `src/services/workflowRuntime/executionStore.ts`
- Modify: `src/services/workflowRuntime/orchestrator.ts`
- Modify: `src/services/workflowRuntime/controlNodes.ts`
- Modify: `src/data/db.ts`

### New ingest runtime files

- Create: `src/services/workflowRuntime/presentation/folderIngestPresentation.ts`
- Create: `src/services/workflowRuntime/modules/scanFolderModule.ts`
- Create: `src/services/workflowRuntime/modules/generatePreviewsModule.ts`
- Create: `src/services/workflowRuntime/modules/detectFacesModule.ts`
- Create: `src/services/workflowRuntime/modules/generateFaceVectorsModule.ts`
- Create: `src/services/workflowRuntime/modules/resolvePeopleModule.ts`
- Create: `src/services/workflowRuntime/modules/groupSimilarPhotosModule.ts`
- Create: `src/services/workflowRuntime/modules/detectSensitiveContentModule.ts`
- Create: `src/services/workflowRuntime/modules/generateAiMetadataModule.ts`
- Create: `src/services/workflowRuntime/workflows/folderIngestWorkflow.ts`

### Integration and UI files

- Modify: `src/entrypoints/core/main.ts`
- Modify: `src/services/handlers/systemWorkflowRuntimeCommands.ts`
- Modify: `src/services/handlers/types.ts`
- Modify: `src/boundary/contracts/jobs.ts`
- Create: `src/ui/components/dashboard/WorkflowRunsPanel.tsx`
- Modify: `src/ui/components/DashboardView.tsx`

### Tests

- Create: `tests/core/workflow-runtime-folder-contracts.test.cjs`
- Create: `tests/core/workflow-runtime-scan-folder.test.cjs`
- Create: `tests/core/workflow-runtime-folder-ingest-orchestrator.test.cjs`
- Create: `tests/core/workflow-runtime-ai-modes.test.cjs`
- Create: `tests/core/workflow-runtime-folder-ingest-commands.test.cjs`

## Chunk 1: Contracts, parameters, and milestone persistence

### Task 1: Add folder-ingest runtime contract support

**Files:**

- Modify: `src/services/workflowRuntime/contracts.ts`
- Modify: `src/services/workflowRuntime/index.ts`
- Test: `tests/core/workflow-runtime-folder-contracts.test.cjs`

- [ ] **Step 1: Write the failing contract test**

```js
test('folder ingest contracts support folder subjects, parameters, labels, and milestones', async () => {
    const runtime = await import('../../dist/core/src/services/workflowRuntime/index.js');

    assert.doesNotThrow(() => runtime.validateSubjectType({
        id: 'folder',
        version: 1,
        durable: false,
        summary: { titleField: 'path', thumbnailStrategy: 'none' },
        progressSemantics: 'aggregate',
        relations: [],
        ui: { detailSections: ['overview'] },
        labels: { singular: 'folder', plural: 'folders' },
    }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`npm run build:core:ts && node --test tests/core/workflow-runtime-folder-contracts.test.cjs`

Expected:
FAIL because folder labels, parameters, or milestone metadata are missing.

- [ ] **Step 3: Implement the minimal contract extensions**

```ts
export interface WorkflowParameterDefinition { ... }
export interface WorkflowPresentationDefinition { ... }
export interface SubjectLabelDefinition { singular: string; plural: string; }
```

- [ ] **Step 4: Run test to verify it passes**

Run:
`npm run build:core:ts && node --test tests/core/workflow-runtime-folder-contracts.test.cjs`

Expected:
PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/workflowRuntime/contracts.ts src/services/workflowRuntime/index.ts tests/core/workflow-runtime-folder-contracts.test.cjs
git commit -m "feat: extend runtime contracts for folder ingest"
```

### Task 2: Persist run parameters and milestone state

**Files:**

- Modify: `src/data/db.ts`
- Modify: `src/services/workflowRuntime/executionStore.ts`
- Test: `tests/core/workflow-runtime-folder-contracts.test.cjs`

- [ ] **Step 1: Extend the failing test for persistence**

```js
test('execution store persists parameters and milestones for folder ingest runs', async () => {
    const store = new ExecutionStore(new DatabaseManager(tempDir));
    const runId = store.createWorkflowRun({
        workflowId: 'folder_ingest_v1',
        triggerType: 'manual',
        inputSubjects: [{ subjectType: 'folder', subjectId: 'folder-1' }],
        parameters: { folderPath: 'C:/photos', traversalMode: 'recursive', aiMode: 'mock' },
    });

    store.updateMilestoneState(runId, 'library_ready', 'completed');
    const detail = store.getRunDetail(runId);
    assert.equal(detail.parameters.aiMode, 'mock');
    assert.equal(detail.milestones[0].status, 'completed');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`npm run build:core:ts && node --test tests/core/workflow-runtime-folder-contracts.test.cjs`

Expected:
FAIL because parameters and milestone storage are not implemented.

- [ ] **Step 3: Implement minimal schema and store support**

```ts
ALTER TABLE workflow_runs ADD COLUMN parameters_json TEXT DEFAULT '{}';
CREATE TABLE workflow_run_milestones (...);
```

- [ ] **Step 4: Run test to verify it passes**

Run:
`npm run build:core:ts && node --test tests/core/workflow-runtime-folder-contracts.test.cjs`

Expected:
PASS

- [ ] **Step 5: Commit**

```bash
git add src/data/db.ts src/services/workflowRuntime/executionStore.ts tests/core/workflow-runtime-folder-contracts.test.cjs
git commit -m "feat: persist folder ingest parameters and milestones"
```

## Chunk 2: Real ingest graph and native modules

### Task 3: Implement scan, preview, and Library ready milestone

**Files:**

- Create: `src/services/workflowRuntime/presentation/folderIngestPresentation.ts`
- Create: `src/services/workflowRuntime/modules/scanFolderModule.ts`
- Create: `src/services/workflowRuntime/modules/generatePreviewsModule.ts`
- Create: `src/services/workflowRuntime/workflows/folderIngestWorkflow.ts`
- Modify: `src/services/workflowRuntime/orchestrator.ts`
- Test: `tests/core/workflow-runtime-scan-folder.test.cjs`

- [ ] **Step 1: Write the failing scan/preview test**

```js
test('folder_ingest_v1 scans a folder, creates asset work, and reaches Library ready after previews', async () => {
    const harness = await createFolderIngestHarness({ aiMode: 'off' });
    await harness.startFolderIngest({ folderPath: fixtureFolder, traversalMode: 'folder_only' });

    const run = harness.getLatestRun();
    assert.equal(run.milestones.find((m) => m.milestoneId === 'library_ready').status, 'completed');
    assert.ok(run.summaryText.includes('files'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`npm run build:core:ts && node --test tests/core/workflow-runtime-scan-folder.test.cjs`

Expected:
FAIL because the folder ingest graph and native modules do not exist.

- [ ] **Step 3: Implement the minimal scan and preview path**

```ts
nodes: [
  { id: 'scan-folder', kind: 'module', moduleId: 'runtime.scan_folder', outputsTo: ['preview-each'] },
  { id: 'preview-each', kind: 'control', controlType: 'for_each', outputsTo: ['generate-previews'] },
  { id: 'generate-previews', kind: 'module', moduleId: 'runtime.generate_previews' },
]
```

- [ ] **Step 4: Run test to verify it passes**

Run:
`npm run build:core:ts && node --test tests/core/workflow-runtime-scan-folder.test.cjs`

Expected:
PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/workflowRuntime/presentation/folderIngestPresentation.ts src/services/workflowRuntime/modules/scanFolderModule.ts src/services/workflowRuntime/modules/generatePreviewsModule.ts src/services/workflowRuntime/workflows/folderIngestWorkflow.ts src/services/workflowRuntime/orchestrator.ts tests/core/workflow-runtime-scan-folder.test.cjs
git commit -m "feat: add folder scan and preview runtime path"
```

### Task 4: Implement native enrichment modules and Enrichment complete

**Files:**

- Create: `src/services/workflowRuntime/modules/detectFacesModule.ts`
- Create: `src/services/workflowRuntime/modules/generateFaceVectorsModule.ts`
- Create: `src/services/workflowRuntime/modules/resolvePeopleModule.ts`
- Create: `src/services/workflowRuntime/modules/groupSimilarPhotosModule.ts`
- Create: `src/services/workflowRuntime/modules/detectSensitiveContentModule.ts`
- Modify: `src/services/workflowRuntime/controlNodes.ts`
- Modify: `src/services/workflowRuntime/workflows/folderIngestWorkflow.ts`
- Modify: `src/services/workflowRuntime/orchestrator.ts`
- Test: `tests/core/workflow-runtime-folder-ingest-orchestrator.test.cjs`

- [ ] **Step 1: Write the failing enrichment test**

```js
test('folder_ingest_v1 completes enrichment branches after Library ready', async () => {
    const harness = await createFolderIngestHarness({ aiMode: 'off' });
    await harness.startFolderIngest({ folderPath: fixtureFolder, traversalMode: 'recursive' });

    const run = harness.getLatestRun();
    assert.equal(run.milestones.find((m) => m.milestoneId === 'enrichment_complete').status, 'completed');
    assert.ok(run.steps.some((step) => step.nodeId === 'group-similar-photos'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`npm run build:core:ts && node --test tests/core/workflow-runtime-folder-ingest-orchestrator.test.cjs`

Expected:
FAIL because collect/fan-in enrichment is incomplete.

- [ ] **Step 3: Implement the minimal enrichment graph**

```ts
nodes: [
  ...,
  { id: 'detect-faces', kind: 'module', moduleId: 'runtime.detect_faces', outputsTo: ['generate-face-vectors', 'detect-sensitive'] },
  { id: 'generate-face-vectors', kind: 'module', moduleId: 'runtime.generate_face_vectors', outputsTo: ['collect-people'] },
  { id: 'collect-people', kind: 'control', controlType: 'collect', outputsTo: ['resolve-people'] },
  { id: 'resolve-people', kind: 'module', moduleId: 'runtime.resolve_people' },
  { id: 'collect-similar-assets', kind: 'control', controlType: 'collect', outputsTo: ['group-similar-photos'] },
  { id: 'group-similar-photos', kind: 'module', moduleId: 'runtime.group_similar_photos' },
]
```

- [ ] **Step 4: Run test to verify it passes**

Run:
`npm run build:core:ts && node --test tests/core/workflow-runtime-folder-ingest-orchestrator.test.cjs`

Expected:
PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/workflowRuntime/modules/detectFacesModule.ts src/services/workflowRuntime/modules/generateFaceVectorsModule.ts src/services/workflowRuntime/modules/resolvePeopleModule.ts src/services/workflowRuntime/modules/groupSimilarPhotosModule.ts src/services/workflowRuntime/modules/detectSensitiveContentModule.ts src/services/workflowRuntime/controlNodes.ts src/services/workflowRuntime/workflows/folderIngestWorkflow.ts src/services/workflowRuntime/orchestrator.ts tests/core/workflow-runtime-folder-ingest-orchestrator.test.cjs
git commit -m "feat: add native folder ingest enrichment stages"
```

## Chunk 3: AI modes and command integration

### Task 5: Implement AI metadata `mock`, `live`, and `off`

**Files:**

- Create: `src/services/workflowRuntime/modules/generateAiMetadataModule.ts`
- Modify: `src/services/workflowRuntime/workflows/folderIngestWorkflow.ts`
- Test: `tests/core/workflow-runtime-ai-modes.test.cjs`

- [ ] **Step 1: Write the failing AI mode test**

```js
test('folder ingest supports mock, live, and off ai modes', async () => {
    const mockHarness = await createFolderIngestHarness({ aiMode: 'mock' });
    await mockHarness.startFolderIngest({ folderPath: fixtureFolder, traversalMode: 'folder_only' });
    assert.equal(mockHarness.getAiWrites().mode, 'mock');

    const offHarness = await createFolderIngestHarness({ aiMode: 'off' });
    await offHarness.startFolderIngest({ folderPath: fixtureFolder, traversalMode: 'folder_only' });
    assert.equal(offHarness.getAiWrites().count, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`npm run build:core:ts && node --test tests/core/workflow-runtime-ai-modes.test.cjs`

Expected:
FAIL because AI modes are not implemented.

- [ ] **Step 3: Implement the minimal AI mode branching**

```ts
if (aiMode === 'off') { return { outputs: [] }; }
if (aiMode === 'mock') { return writeMockMetadata(...); }
return await writeLiveGeminiMetadata(...);
```

- [ ] **Step 4: Run test to verify it passes**

Run:
`npm run build:core:ts && node --test tests/core/workflow-runtime-ai-modes.test.cjs`

Expected:
PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/workflowRuntime/modules/generateAiMetadataModule.ts src/services/workflowRuntime/workflows/folderIngestWorkflow.ts tests/core/workflow-runtime-ai-modes.test.cjs
git commit -m "feat: add folder ingest ai modes"
```

### Task 6: Expose `start_folder_ingest` and richer run detail

**Files:**

- Modify: `src/services/handlers/systemWorkflowRuntimeCommands.ts`
- Modify: `src/services/handlers/types.ts`
- Modify: `src/entrypoints/core/main.ts`
- Test: `tests/core/workflow-runtime-folder-ingest-commands.test.cjs`

- [ ] **Step 1: Write the failing command test**

```js
test('start_folder_ingest starts folder_ingest_v1 with parameters and milestone-aware detail', async () => {
    const response = await invokeCoreCommand('start_folder_ingest', {
        folderPath: fixtureFolder,
        traversalMode: 'recursive',
        aiMode: 'mock',
    });

    const detail = await invokeCoreCommand('get_workflow_run_detail', { runId: response.data.runId });
    assert.equal(detail.data.parameters.aiMode, 'mock');
    assert.ok(detail.data.milestones.some((m) => m.milestoneId === 'library_ready'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`npm run build:core:ts && node --test tests/core/workflow-runtime-folder-ingest-commands.test.cjs`

Expected:
FAIL because the dedicated folder ingest command and rich detail are missing.

- [ ] **Step 3: Implement the minimal command surface**

```ts
start_folder_ingest: async (ctx) => {
  const payload = ctx.payload as FolderIngestPayload;
  const runId = await ctx.workflowRuntime.orchestrator.start({
    workflowId: 'folder_ingest_v1',
    triggerType: 'manual',
    inputSubjects: [{ subjectType: 'folder', subjectId: payload.folderPath }],
    parameters: payload,
  });
  ctx.respond(ctx.id, 'ok', { runId }, null, ctx.originWs);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:
`npm run build:core:ts && node --test tests/core/workflow-runtime-folder-ingest-commands.test.cjs`

Expected:
PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/handlers/systemWorkflowRuntimeCommands.ts src/services/handlers/types.ts src/entrypoints/core/main.ts tests/core/workflow-runtime-folder-ingest-commands.test.cjs
git commit -m "feat: expose folder ingest runtime command"
```

## Chunk 4: Dashboard projection and verification

### Task 7: Add a minimal workflow-runs dashboard panel

**Files:**

- Modify: `src/boundary/contracts/jobs.ts`
- Create: `src/ui/components/dashboard/WorkflowRunsPanel.tsx`
- Modify: `src/ui/components/DashboardView.tsx`

- [ ] **Step 1: Write the failing UI test or snapshot**

```tsx
it('renders folder ingest workflow runs in user-facing language', () => {
    render(<WorkflowRunsPanel runs={[sampleFolderIngestRun]} />);
    expect(screen.getByText('Folder ingest')).toBeInTheDocument();
    expect(screen.getByText('Library ready')).toBeInTheDocument();
    expect(screen.getByText(/files scanned/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the UI test and verify it fails**

Run:
`npm test -- WorkflowRunsPanel`

Expected:
FAIL because the panel does not exist yet.

- [ ] **Step 3: Implement the minimal panel**

```tsx
<section>
  <h3>Workflow Runs</h3>
  {runs.map((run) => <article key={run.runId}>{run.displayName}</article>)}
</section>
```

- [ ] **Step 4: Run the UI test and verify it passes**

Run:
`npm test -- WorkflowRunsPanel`

Expected:
PASS

- [ ] **Step 5: Commit**

```bash
git add src/boundary/contracts/jobs.ts src/ui/components/dashboard/WorkflowRunsPanel.tsx src/ui/components/DashboardView.tsx
git commit -m "feat: add workflow runs dashboard panel"
```

### Task 8: Update docs and run final verification

**Files:**

- Modify: `docs/architecture.md`
- Modify: `docs/workflow-module-authoring-v2.md`
- Test:
  `tests/core/workflow-runtime-folder-contracts.test.cjs`
  `tests/core/workflow-runtime-scan-folder.test.cjs`
  `tests/core/workflow-runtime-folder-ingest-orchestrator.test.cjs`
  `tests/core/workflow-runtime-ai-modes.test.cjs`
  `tests/core/workflow-runtime-folder-ingest-commands.test.cjs`

- [ ] **Step 1: Update docs**

Add:

- `folder_ingest_v1` as the real runtime-native ingest path
- milestone semantics and AI modes
- run parameters and user-facing labels

- [ ] **Step 2: Run focused backend verification**

Run:
`npm run build:core:ts && node --test tests/core/workflow-runtime-folder-contracts.test.cjs tests/core/workflow-runtime-scan-folder.test.cjs tests/core/workflow-runtime-folder-ingest-orchestrator.test.cjs tests/core/workflow-runtime-ai-modes.test.cjs tests/core/workflow-runtime-folder-ingest-commands.test.cjs`

Expected:
PASS

- [ ] **Step 3: Run changed-file quality gate**

Run:
`npm run quality:staged`

Expected:
PASS

- [ ] **Step 4: Run full project quality gate**

Run:
`npm run quality`

Expected:
PASS, unless blocked by unrelated pre-existing repo issues that must be reported explicitly.

- [ ] **Step 5: Commit**

```bash
git add docs/architecture.md docs/workflow-module-authoring-v2.md
git commit -m "docs: describe folder ingest runtime workflow"
```
