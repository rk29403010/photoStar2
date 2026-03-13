# Workflow Runtime Platform Foundation Implementation Plan

> **For agentic workers:** REQUIRED: Use
> superpowers:subagent-driven-development (if subagents available) or
> superpowers:executing-plans to implement this plan. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Build the first greenfield workflow-runtime slice with typed subjects,
typed module ports, first-class workflow runs, and one pilot asset workflow.

**Architecture:** Add a new `src/services/workflowRuntime/` runtime beside the
current coordinator. Persist `workflow_runs`, `step_runs`, and
`subject_executions` in SQLite, expose run-inspection commands, and prove the
runtime with a preview-based asset workflow plus fake-module orchestration
tests.

**Tech Stack:** TypeScript, Node.js, better-sqlite3, existing core build,
Node's built-in test runner, markdownlint

---

This plan intentionally covers only the first runtime slice. Follow-on plans
should handle plugin packaging, generic entity browsing in the UI, workflow
visual editing, and migration of the current production ingest pipeline.

## File structure

### New runtime files

- Create: `src/services/workflowRuntime/contracts.ts`
  Responsibility: shared runtime types for subject types, modules, workflow
  definitions, run records, and lifecycle telemetry.
- Create: `src/services/workflowRuntime/subjectRegistry.ts`
  Responsibility: register and validate subject-type schemas.
- Create: `src/services/workflowRuntime/moduleRegistry.ts`
  Responsibility: register and validate modules, capabilities, budgets, and
  port contracts.
- Create: `src/services/workflowRuntime/workflowRegistry.ts`
  Responsibility: register and validate DAG workflow definitions.
- Create: `src/services/workflowRuntime/controlNodes.ts`
  Responsibility: built-in `for_each`, `batch`, `collect`, and `approval_gate`
  node behavior.
- Create: `src/services/workflowRuntime/executionStore.ts`
  Responsibility: persist and query runtime tables.
- Create: `src/services/workflowRuntime/orchestrator.ts`
  Responsibility: run workflow graphs, schedule ready nodes, and record
  progress.
- Create: `src/services/workflowRuntime/telemetry.ts`
  Responsibility: generic runtime lifecycle event helpers.
- Create: `src/services/workflowRuntime/index.ts`
  Responsibility: export the public runtime surface.
- Create: `src/services/workflowRuntime/modules/previewAdapterModule.ts`
  Responsibility: wrap existing preview generation as a runtime module.
- Create: `src/services/workflowRuntime/workflows/assetPreviewWorkflow.ts`
  Responsibility: register the first pilot workflow.

### Existing files to modify

- Modify: `src/data/db.ts`
  Responsibility: add SQLite tables and migrations for workflow runtime data.
- Modify: `src/services/handlers/types.ts`
  Responsibility: add the runtime to command context.
- Modify: `src/services/handlers.ts`
  Responsibility: register workflow-runtime command handlers.
- Create: `src/services/handlers/systemWorkflowRuntimeCommands.ts`
  Responsibility: start workflows and query runs, steps, events, and errors.
- Modify: `src/entrypoints/core/main.ts`
  Responsibility: construct the runtime, inject it into command handling, and
  publish runtime telemetry to the frontend event stream.
- Modify: `docs/architecture.md`
  Responsibility: document the coexistence of the legacy coordinator and the
  new runtime once the slice lands.

### New tests

- Create: `tests/core/workflow-runtime-contracts.test.cjs`
- Create: `tests/core/workflow-runtime-store.test.cjs`
- Create: `tests/core/workflow-runtime-orchestrator.test.cjs`
- Create: `tests/core/workflow-runtime-commands.test.cjs`
- Create: `tests/core/workflow-runtime-preview-adapter.test.cjs`

## Chunk 1: Contracts and persistence

### Task 1: Define runtime contracts and validators

**Files:**

- Create: `src/services/workflowRuntime/contracts.ts`
- Create: `src/services/workflowRuntime/index.ts`
- Test: `tests/core/workflow-runtime-contracts.test.cjs`

- [ ] **Step 1: Write the failing contract test**

```js
test('workflow runtime validates subject types, modules, and DAG definitions', async () => {
    const runtime = await import('../../dist/core/src/services/workflowRuntime/index.js');

    assert.throws(
        () => runtime.validateSubjectType({
            id: 'pet',
            version: 1,
            summary: { titleField: 'name' },
            relations: [],
        }),
        /progressSemantics/
    );

    assert.throws(
        () => runtime.validateWorkflowDefinition({
            id: 'cycle-demo',
            version: 1,
            inputs: ['asset'],
            nodes: [
                { id: 'a', kind: 'module', moduleId: 'demo', outputsTo: ['b'] },
                { id: 'b', kind: 'module', moduleId: 'demo', outputsTo: ['a'] },
            ],
        }),
        /cycle/i
    );
});
```

- [ ] **Step 2: Run the contract test and confirm failure**

Run:
`npm run build:core:ts && node --test tests/core/workflow-runtime-contracts.test.cjs`

Expected:
FAIL because `workflowRuntime/index.js` does not exist yet.

- [ ] **Step 3: Implement the runtime contracts and validators**

```ts
export type CapabilityClass =
    | 'analyze'
    | 'derive'
    | 'group'
    | 'annotate'
    | 'mutate_library'
    | 'external_api';

export interface SubjectTypeDefinition {
    id: string;
    version: number;
    durable: boolean;
    summary: {
        titleField: string;
        subtitleField?: string;
        thumbnailStrategy?: 'asset' | 'none';
    };
    progressSemantics: 'per_subject' | 'per_related_asset' | 'aggregate';
    relations: Array<{ type: string; target: string }>;
    ui: {
        badges?: string[];
        detailSections: string[];
    };
}

export function validateWorkflowDefinition(definition: WorkflowDefinition): void {
    assertUniqueNodeIds(definition.nodes);
    assertDag(definition.nodes);
    assertTypedPorts(definition.nodes);
}
```

- [ ] **Step 4: Re-run the contract test**

Run:
`npm run build:core:ts && node --test tests/core/workflow-runtime-contracts.test.cjs`

Expected:
PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/workflowRuntime/contracts.ts \
  src/services/workflowRuntime/index.ts \
  tests/core/workflow-runtime-contracts.test.cjs
git commit -m "feat: add workflow runtime contracts"
```

### Task 2: Add SQLite schema and execution store

**Files:**

- Modify: `src/data/db.ts`
- Create: `src/services/workflowRuntime/executionStore.ts`
- Test: `tests/core/workflow-runtime-store.test.cjs`

- [ ] **Step 1: Write the failing persistence test**

```js
test('execution store persists workflow runs and subject executions', async () => {
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { ExecutionStore } = require('../../dist/core/src/services/workflowRuntime/executionStore.js');

    const dbManager = new DatabaseManager(tempDir);
    const store = new ExecutionStore(dbManager);

    const runId = store.createWorkflowRun({
        workflowId: 'asset-preview',
        triggerType: 'manual',
        inputSubjects: [{ subjectType: 'asset', subjectId: 'asset-1' }],
    });

    store.recordSubjectExecution({
        runId,
        stepRunId: 'step-1',
        subjectType: 'asset',
        subjectId: 'asset-1',
        status: 'completed',
    });

    const summary = store.getRunSummary(runId);
    assert.equal(summary.completedItems, 1);
});
```

- [ ] **Step 2: Run the persistence test and confirm failure**

Run:
`npm run build:core:ts && node --test tests/core/workflow-runtime-store.test.cjs`

Expected:
FAIL because the runtime tables and execution store do not exist.

- [ ] **Step 3: Add tables, migration logic, and the execution store**

```ts
db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_runs (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        status TEXT NOT NULL,
        trigger_type TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS step_runs (
        id TEXT PRIMARY KEY,
        workflow_run_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subject_executions (
        id TEXT PRIMARY KEY,
        workflow_run_id TEXT NOT NULL,
        step_run_id TEXT NOT NULL,
        subject_type TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
`);
```

- [ ] **Step 4: Re-run the persistence test**

Run:
`npm run build:core:ts && node --test tests/core/workflow-runtime-store.test.cjs`

Expected:
PASS

- [ ] **Step 5: Commit**

```bash
git add src/data/db.ts \
  src/services/workflowRuntime/executionStore.ts \
  tests/core/workflow-runtime-store.test.cjs
git commit -m "feat: persist workflow runtime executions"
```

## Chunk 2: Registries and orchestration

### Task 3: Add subject, module, and workflow registries

**Files:**

- Create: `src/services/workflowRuntime/subjectRegistry.ts`
- Create: `src/services/workflowRuntime/moduleRegistry.ts`
- Create: `src/services/workflowRuntime/workflowRegistry.ts`
- Test: `tests/core/workflow-runtime-contracts.test.cjs`

- [ ] **Step 1: Extend the contract test with registry coverage**

```js
test('registries reject duplicate ids and invalid references', async () => {
    const runtime = await import('../../dist/core/src/services/workflowRuntime/index.js');
    const subjects = new runtime.SubjectRegistry();
    const modules = new runtime.ModuleRegistry();
    const workflows = new runtime.WorkflowRegistry({ subjects, modules });

    subjects.register(validAssetSubjectType);
    modules.register(validPreviewModule);

    assert.throws(() => subjects.register(validAssetSubjectType), /duplicate/i);
    assert.throws(() => workflows.register(invalidWorkflowRef), /unknown module/i);
});
```

- [ ] **Step 2: Run the contract test and confirm failure**

Run:
`npm run build:core:ts && node --test tests/core/workflow-runtime-contracts.test.cjs`

Expected:
FAIL because the registries are not implemented.

- [ ] **Step 3: Implement the registries with validation**

```ts
export class WorkflowRegistry {
    constructor(
        private readonly deps: {
            subjects: SubjectRegistry;
            modules: ModuleRegistry;
        }
    ) {}

    register(definition: WorkflowDefinition): void {
        validateWorkflowDefinition(definition);
        for (const node of definition.nodes) {
            if (node.kind === 'module' && !this.deps.modules.has(node.moduleId)) {
                throw new Error(`Unknown module '${node.moduleId}'`);
            }
        }
        this.byId.set(definition.id, definition);
    }
}
```

- [ ] **Step 4: Re-run the contract test**

Run:
`npm run build:core:ts && node --test tests/core/workflow-runtime-contracts.test.cjs`

Expected:
PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/workflowRuntime/subjectRegistry.ts \
  src/services/workflowRuntime/moduleRegistry.ts \
  src/services/workflowRuntime/workflowRegistry.ts \
  tests/core/workflow-runtime-contracts.test.cjs
git commit -m "feat: add workflow runtime registries"
```

### Task 4: Implement the orchestrator and control nodes

**Files:**

- Create: `src/services/workflowRuntime/controlNodes.ts`
- Create: `src/services/workflowRuntime/telemetry.ts`
- Create: `src/services/workflowRuntime/orchestrator.ts`
- Test: `tests/core/workflow-runtime-orchestrator.test.cjs`

- [ ] **Step 1: Write the failing orchestrator test**

```js
test('orchestrator expands for_each and records aggregate progress', async () => {
    const runtime = await import('../../dist/core/src/services/workflowRuntime/index.js');
    const harness = createRuntimeHarnessWithFakeModules(runtime);

    const runId = await harness.orchestrator.start({
        workflowId: 'fake-two-step',
        inputSubjects: [
            { subjectType: 'asset', subjectId: 'asset-1' },
            { subjectType: 'asset', subjectId: 'asset-2' },
        ],
    });

    const summary = harness.store.getRunSummary(runId);
    assert.equal(summary.totalItems, 4);
    assert.equal(summary.completedItems, 4);
});
```

- [ ] **Step 2: Run the orchestrator test and confirm failure**

Run:
`npm run build:core:ts && node --test tests/core/workflow-runtime-orchestrator.test.cjs`

Expected:
FAIL because the orchestrator and control nodes do not exist.

- [ ] **Step 3: Implement the orchestrator and generic lifecycle telemetry**

```ts
export class WorkflowRuntimeOrchestrator {
    async start(input: StartWorkflowRunInput): Promise<string> {
        const runId = this.store.createWorkflowRun(input);
        this.telemetry.runStarted({ runId, workflowId: input.workflowId });

        await this.executeReadyNodes(runId);

        return runId;
    }

    private async executeNode(
        runId: string,
        node: WorkflowNode,
        subjects: SubjectRef[]
    ): Promise<void> {
        if (node.kind === 'control') {
            await executeControlNode(node, subjects, this.store);
            return;
        }

        await this.executeModuleNode(runId, node, subjects);
    }
}
```

- [ ] **Step 4: Re-run the orchestrator test**

Run:
`npm run build:core:ts && node --test tests/core/workflow-runtime-orchestrator.test.cjs`

Expected:
PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/workflowRuntime/controlNodes.ts \
  src/services/workflowRuntime/telemetry.ts \
  src/services/workflowRuntime/orchestrator.ts \
  tests/core/workflow-runtime-orchestrator.test.cjs
git commit -m "feat: add workflow runtime orchestrator"
```

## Chunk 3: Pilot workflow and inspection

### Task 5: Add a preview adapter module and pilot workflow

**Files:**

- Create: `src/services/workflowRuntime/modules/previewAdapterModule.ts`
- Create: `src/services/workflowRuntime/workflows/assetPreviewWorkflow.ts`
- Test: `tests/core/workflow-runtime-preview-adapter.test.cjs`

- [ ] **Step 1: Write the failing pilot workflow test**

```js
test('asset preview workflow wraps the legacy preview worker and completes', async () => {
    const runtime = await import('../../dist/core/src/services/workflowRuntime/index.js');
    const harness = createPreviewWorkflowHarness(runtime);

    const runId = await harness.orchestrator.start({
        workflowId: 'asset-preview',
        inputSubjects: [{ subjectType: 'asset', subjectId: 'asset-1' }],
    });

    const detail = harness.store.getRunDetail(runId);
    assert.equal(detail.status, 'completed');
    assert.equal(detail.steps[0].nodeId, 'generate-preview');
});
```

- [ ] **Step 2: Run the pilot workflow test and confirm failure**

Run:
`npm run build:core:ts && node --test tests/core/workflow-runtime-preview-adapter.test.cjs`

Expected:
FAIL because the preview adapter module and pilot workflow do not exist.

- [ ] **Step 3: Implement the preview adapter and register the workflow**

```ts
export const previewAdapterModule: RuntimeModuleDefinition = {
    id: 'legacy.preview.generate',
    version: 1,
    accepts: ['asset'],
    produces: [{ kind: 'artifact', artifactType: 'preview' }],
    capability: 'derive',
    async run(ctx) {
        await runPreviewWorker([ctx.subject.subjectId], ctx.legacyServices);
        return {
            completed: true,
            outputs: [
                {
                    kind: 'artifact',
                    artifactType: 'preview',
                    subjectType: 'asset',
                    subjectId: ctx.subject.subjectId,
                },
            ],
        };
    },
};
```

- [ ] **Step 4: Re-run the pilot workflow test**

Run:
`npm run build:core:ts && node --test tests/core/workflow-runtime-preview-adapter.test.cjs`

Expected:
PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/workflowRuntime/modules/previewAdapterModule.ts \
  src/services/workflowRuntime/workflows/assetPreviewWorkflow.ts \
  tests/core/workflow-runtime-preview-adapter.test.cjs
git commit -m "feat: add pilot asset preview workflow"
```

### Task 6: Expose start and inspection commands

**Files:**

- Create: `src/services/handlers/systemWorkflowRuntimeCommands.ts`
- Modify: `src/services/handlers/types.ts`
- Modify: `src/services/handlers.ts`
- Modify: `src/entrypoints/core/main.ts`
- Test: `tests/core/workflow-runtime-commands.test.cjs`

- [ ] **Step 1: Write the failing command test**

```js
test('workflow runtime commands start a run and return drill-down summaries', async () => {
    const response = await invokeCoreCommand('start_workflow_run', {
        workflowId: 'asset-preview',
        inputSubjects: [{ subjectType: 'asset', subjectId: 'asset-1' }],
    });

    assert.equal(response.status, 'ok');

    const detail = await invokeCoreCommand('get_workflow_run_detail', {
        runId: response.data.runId,
    });

    assert.equal(detail.data.summary.totalItems, 1);
    assert.equal(detail.data.steps.length, 1);
});
```

- [ ] **Step 2: Run the command test and confirm failure**

Run:
`npm run build:core:ts && node --test tests/core/workflow-runtime-commands.test.cjs`

Expected:
FAIL because the runtime is not wired into the command layer.

- [ ] **Step 3: Add command handlers and wire runtime construction**

```ts
export const systemWorkflowRuntimeCommandHandlers: CommandHandlerMap = {
    start_workflow_run: async (ctx) => {
        const payload = ctx.payload as StartWorkflowRunInput;
        const runId = await ctx.workflowRuntime.orchestrator.start(payload);
        ctx.respond(ctx.id, 'ok', { runId }, null, ctx.originWs);
    },
    get_workflow_run_detail: (ctx) => {
        const { runId } = ctx.payload as { runId: string };
        const detail = ctx.workflowRuntime.store.getRunDetail(runId);
        ctx.respond(ctx.id, 'ok', detail, null, ctx.originWs);
    },
};
```

- [ ] **Step 4: Re-run the command test**

Run:
`npm run build:core:ts && node --test tests/core/workflow-runtime-commands.test.cjs`

Expected:
PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/handlers/systemWorkflowRuntimeCommands.ts \
  src/services/handlers/types.ts \
  src/services/handlers.ts \
  src/entrypoints/core/main.ts \
  tests/core/workflow-runtime-commands.test.cjs
git commit -m "feat: expose workflow runtime commands"
```

## Chunk 4: Documentation and verification

### Task 7: Document coexistence with the legacy coordinator

**Files:**

- Modify: `docs/architecture.md`
- Modify: `docs/workflow-module-authoring-v2.md`

- [ ] **Step 1: Update the architecture docs**

Add a short section that explains:

- the legacy coordinator remains the production path
- the new workflow runtime is a parallel execution platform
- first-class runtime truth now lives in workflow runs, step runs, and
  subject executions
- the pilot workflow is asset preview only

- [ ] **Step 2: Run markdown lint**

Run:
`npx markdownlint "docs/architecture.md" "docs/workflow-module-authoring-v2.md"`

Expected:
PASS

- [ ] **Step 3: Commit**

```bash
git add docs/architecture.md docs/workflow-module-authoring-v2.md
git commit -m "docs: describe workflow runtime foundation"
```

### Task 8: Run the full verification set for the slice

**Files:**

- Modify: none
- Test:
  `tests/core/workflow-runtime-contracts.test.cjs`
  `tests/core/workflow-runtime-store.test.cjs`
  `tests/core/workflow-runtime-orchestrator.test.cjs`
  `tests/core/workflow-runtime-commands.test.cjs`
  `tests/core/workflow-runtime-preview-adapter.test.cjs`

- [ ] **Step 1: Build the core runtime**

Run:
`npm run build:core:ts`

Expected:
PASS

- [ ] **Step 2: Run focused workflow-runtime tests**

Run:
`node --test tests/core/workflow-runtime-contracts.test.cjs tests/core/workflow-runtime-store.test.cjs tests/core/workflow-runtime-orchestrator.test.cjs tests/core/workflow-runtime-commands.test.cjs tests/core/workflow-runtime-preview-adapter.test.cjs`

Expected:
PASS

- [ ] **Step 3: Run changed-file quality gates**

Run:
`npm run quality:staged`

Expected:
PASS

- [ ] **Step 4: Run the full project quality gate before handoff**

Run:
`npm run quality`

Expected:
PASS

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: add workflow runtime foundation slice"
```
