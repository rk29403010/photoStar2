const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-workflow-telemetry-'));
}

async function createFixture(tempDir) {
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const runtime = await import('../../dist/core/src/services/workflowRuntime/index.js');
    const dbManager = new DatabaseManager(tempDir);
    const subjects = new runtime.SubjectRegistry();
    const modules = new runtime.ModuleRegistry();
    const workflows = new runtime.WorkflowRegistry({ subjects, modules });
    const store = new runtime.ExecutionStore(dbManager);

    subjects.register({
        id: 'asset',
        version: 1,
        durable: true,
        summary: { titleField: 'id', thumbnailStrategy: 'asset' },
        progressSemantics: 'per_subject',
        relations: [],
        ui: { detailSections: ['overview'] },
    });

    return {
        runtime,
        dbManager,
        modules,
        workflows,
        store,
    };
}

function waitForRunStatus({ store, runId, statuses }) {
    return Promise.race([
        new Promise((resolve) => {
            const interval = setInterval(() => {
                const status = store.getRunSummary(runId).status;
                if (statuses.includes(status)) {
                    clearInterval(interval);
                    resolve(status);
                }
            }, 10);
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`workflow run '${runId}' did not reach ${statuses.join(', ')}`)), 1000)),
    ]);
}

function waitForEventCount(events, count) {
    return Promise.race([
        new Promise((resolve) => {
            const interval = setInterval(() => {
                if (events.length >= count) {
                    clearInterval(interval);
                    resolve();
                }
            }, 10);
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`expected ${count} telemetry events but saw ${events.length}`)), 1000)),
    ]);
}

test('workflow telemetry emits started and completed events for detached runs', async () => {
    const tempDir = createTempDir();
    let dbManager;

    try {
        const fixture = await createFixture(tempDir);
        dbManager = fixture.dbManager;
        const events = [];

        fixture.modules.register({
            id: 'fake.success',
            version: 1,
            capability: 'derive',
            accepts: ['asset'],
            produces: [],
            run: async ({ subject }) => ({ emittedSubjects: [subject] }),
        });

        fixture.workflows.register({
            id: 'fake-telemetry-success',
            version: 1,
            inputs: ['asset'],
            nodes: [
                {
                    id: 'success-step',
                    kind: 'module',
                    moduleId: 'fake.success',
                    step: 'test',
                },
            ],
        });

        const orchestrator = new fixture.runtime.WorkflowRuntimeOrchestrator({
            store: fixture.store,
            workflows: fixture.workflows,
            modules: fixture.modules,
            telemetry: new fixture.runtime.WorkflowRuntimeTelemetry({
                emit(event) {
                    events.push(event);
                },
            }),
        });

        const runId = orchestrator.startDetached({
            workflowId: 'fake-telemetry-success',
            triggerType: 'manual',
            inputSubjects: [{ subjectType: 'asset', subjectId: 'asset-1' }],
        });

        await waitForRunStatus({ store: fixture.store, runId, statuses: ['completed'] });
         await waitForEventCount(events, 6);
 
         assert.deepEqual(events, [
             { type: 'RunStarted', runId, workflowId: 'fake-telemetry-success' },
             { type: 'WorkflowStepStarted', runId, nodeId: 'success-step', expectedItems: 1 },
             { type: 'WorkflowSubjectStarted', runId, nodeId: 'success-step', subjectType: 'asset', subjectId: 'asset-1' },
             { type: 'WorkflowSubjectCompleted', runId, nodeId: 'success-step', subjectType: 'asset', subjectId: 'asset-1' },
             { type: 'WorkflowStepCompleted', runId, nodeId: 'success-step' },
             { type: 'RunCompleted', runId, workflowId: 'fake-telemetry-success' },
         ]);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('workflow telemetry emits failed events for detached runs that error', async () => {
    const tempDir = createTempDir();
    let dbManager;

    try {
        const fixture = await createFixture(tempDir);
        dbManager = fixture.dbManager;
        const events = [];

        fixture.modules.register({
            id: 'fake.failure',
            version: 1,
            capability: 'derive',
            accepts: ['asset'],
            produces: [],
            run: async () => {
                throw new Error('kaboom');
            },
        });

        fixture.workflows.register({
            id: 'fake-telemetry-failure',
            version: 1,
            inputs: ['asset'],
            nodes: [
                {
                    id: 'failure-step',
                    kind: 'module',
                    moduleId: 'fake.failure',
                    step: 'test',
                },
            ],
        });

        const orchestrator = new fixture.runtime.WorkflowRuntimeOrchestrator({
            store: fixture.store,
            workflows: fixture.workflows,
            modules: fixture.modules,
            telemetry: new fixture.runtime.WorkflowRuntimeTelemetry({
                emit(event) {
                    events.push(event);
                },
            }),
        });

        const runId = orchestrator.startDetached({
            workflowId: 'fake-telemetry-failure',
            triggerType: 'manual',
            inputSubjects: [{ subjectType: 'asset', subjectId: 'asset-1' }],
        });

        await waitForRunStatus({ store: fixture.store, runId, statuses: ['failed'] });
         await waitForEventCount(events, 6);
 
         assert.deepEqual(events, [
             { type: 'RunStarted', runId, workflowId: 'fake-telemetry-failure' },
             { type: 'WorkflowStepStarted', runId, nodeId: 'failure-step', expectedItems: 1 },
             { type: 'WorkflowSubjectStarted', runId, nodeId: 'failure-step', subjectType: 'asset', subjectId: 'asset-1' },
             { type: 'WorkflowSubjectFailed', runId, nodeId: 'failure-step', subjectType: 'asset', subjectId: 'asset-1', errorMessage: 'kaboom' },
             { type: 'WorkflowStepFailed', runId, nodeId: 'failure-step', errorMessage: 'kaboom' },
             {
                 type: 'RunFailed',
                 runId,
                 workflowId: 'fake-telemetry-failure',
                 errorMessage: "workflow step 'failure-step' failed: kaboom",
             },
         ]);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
