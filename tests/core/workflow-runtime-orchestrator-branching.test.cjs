const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-workflow-branching-'));
}

function sleep(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function removeDirWithRetries(targetDir) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        try {
            fs.rmSync(targetDir, { recursive: true, force: true });
            return;
        } catch (error) {
            if (error?.code !== 'EBUSY') {
                throw error;
            }
            if (attempt === 19) {
                return;
            }
            sleep(100);
        }
    }
}

function createDeferred() {
    let resolve;
    const promise = new Promise((innerResolve) => {
        resolve = innerResolve;
    });
    return { promise, resolve };
}

function registerBranchingModules({ modules, events, faceVectorGate, groupSimilarCompleted }) {
    modules.register({
        id: 'fake.detect_faces',
        version: 1,
        capability: 'derive',
        accepts: ['asset'],
        produces: [],
        run: async ({ subject }) => {
            events.push(`detect:${subject.subjectId}`);
            return { emittedSubjects: [subject] };
        },
    });
    modules.register({
        id: 'fake.generate_face_vectors',
        version: 1,
        capability: 'derive',
        accepts: ['asset'],
        produces: [],
        run: async ({ subject }) => {
            events.push(`face-vectors:start:${subject.subjectId}`);
            await faceVectorGate.promise;
            events.push(`face-vectors:end:${subject.subjectId}`);
            return { emittedSubjects: [subject] };
        },
    });
    modules.register({
        id: 'fake.group_similar',
        version: 1,
        capability: 'derive',
        accepts: ['asset'],
        produces: [],
        run: async ({ batchSubjects }) => {
            events.push(`group-similar:${batchSubjects.map((subject) => subject.subjectId).join(',')}`);
            groupSimilarCompleted.resolve();
            return { emittedSubjects: batchSubjects };
        },
    });
    modules.register({
        id: 'fake.resolve_people',
        version: 1,
        capability: 'derive',
        accepts: ['asset'],
        produces: [],
        run: async ({ batchSubjects }) => {
            events.push(`resolve-people:${batchSubjects.map((subject) => subject.subjectId).join(',')}`);
            return { emittedSubjects: batchSubjects };
        },
    });
}

function registerBranchingWorkflow({ subjects, workflows }) {
    subjects.register({
        id: 'asset',
        version: 1,
        durable: true,
        summary: { titleField: 'id', thumbnailStrategy: 'asset' },
        progressSemantics: 'per_subject',
        relations: [],
        ui: { detailSections: ['overview'] },
    });

    workflows.register({
        id: 'fake-branching',
        version: 1,
        inputs: ['asset'],
        nodes: [
            {
                id: 'enrichment-each',
                kind: 'control',
                controlType: 'for_each',
                step: 'test',
                outputsTo: ['detect-faces', 'collect-similar'],
            },
            {
                id: 'detect-faces',
                kind: 'module',
                moduleId: 'fake.detect_faces',
                step: 'test',
                outputsTo: ['generate-face-vectors'],
            },
            {
                id: 'generate-face-vectors',
                kind: 'module',
                moduleId: 'fake.generate_face_vectors',
                step: 'test',
                outputsTo: ['collect-people'],
            },
            {
                id: 'collect-people',
                kind: 'control',
                controlType: 'collect',
                step: 'test',
                outputsTo: ['resolve-people'],
            },
            {
                id: 'resolve-people',
                kind: 'module',
                moduleId: 'fake.resolve_people',
                step: 'test',
                runMode: 'once_per_batch',
            },
            {
                id: 'collect-similar',
                kind: 'control',
                controlType: 'collect',
                step: 'test',
                outputsTo: ['group-similar-photos'],
            },
            {
                id: 'group-similar-photos',
                kind: 'module',
                moduleId: 'fake.group_similar',
                step: 'test',
                runMode: 'once_per_batch',
            },
        ],
    });
}

async function createBranchingFixture(tempDir) {
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const runtime = await import('../../dist/core/src/services/workflowRuntime/index.js');
    const dbManager = new DatabaseManager(tempDir);
    const subjects = new runtime.SubjectRegistry();
    const modules = new runtime.ModuleRegistry();
    const workflows = new runtime.WorkflowRegistry({ subjects, modules });
    const store = new runtime.ExecutionStore(dbManager);

    return {
        runtime,
        dbManager,
        subjects,
        modules,
        workflows,
        store,
    };
}

function waitForRunCompletion({ store, runId }) {
    return Promise.race([
        new Promise((resolve) => {
            const interval = setInterval(() => {
                if (store.getRunSummary(runId).status === 'completed') {
                    clearInterval(interval);
                    resolve();
                }
            }, 10);
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('workflow run did not complete after releasing face vectors')), 1000)),
    ]);
}

test('orchestrator lets sibling branches advance while a deeper branch is still running', async () => {
    const tempDir = createTempDir();
    const faceVectorGate = createDeferred();
    const groupSimilarCompleted = createDeferred();
    const events = [];
    let dbManager;

    try {
        const fixture = await createBranchingFixture(tempDir);
        dbManager = fixture.dbManager;
        registerBranchingModules({
            modules: fixture.modules,
            events,
            faceVectorGate,
            groupSimilarCompleted,
        });
        registerBranchingWorkflow({ subjects: fixture.subjects, workflows: fixture.workflows });

        const orchestrator = new fixture.runtime.WorkflowRuntimeOrchestrator({
            store: fixture.store,
            workflows: fixture.workflows,
            modules: fixture.modules,
        });

        const runId = orchestrator.startDetached({
            workflowId: 'fake-branching',
            triggerType: 'manual',
            inputSubjects: [{ subjectType: 'asset', subjectId: 'asset-1' }],
        });

        await Promise.race([
            groupSimilarCompleted.promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error(`group similar did not complete while face vectors were blocked: ${events.join(' -> ')}`)), 500)),
        ]);

        assert.ok(events.includes('group-similar:asset-1'));
        assert.equal(events.includes('face-vectors:end:asset-1'), false);

        faceVectorGate.resolve();

        await waitForRunCompletion({ store: fixture.store, runId });

        const summary = fixture.store.getRunSummary(runId);
        assert.equal(summary.status, 'completed');
        assert.ok(events.includes('face-vectors:end:asset-1'));

        const groupSimilarIndex = events.indexOf('group-similar:asset-1');
        const faceVectorsEndIndex = events.indexOf('face-vectors:end:asset-1');
        assert.notEqual(groupSimilarIndex, -1);
        assert.notEqual(faceVectorsEndIndex, -1);
        assert.ok(groupSimilarIndex < faceVectorsEndIndex);
    } finally {
        dbManager?.close();
        removeDirWithRetries(tempDir);
    }
});
