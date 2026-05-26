const test = require('node:test');
const assert = require('node:assert/strict');

test('workflow runtime validates subject types and DAG workflow definitions', async () => {
    const runtime = await import('../../dist/core/src/services/workflowRuntime/index.js');

    assert.throws(
        () => runtime.validateSubjectType({
            id: 'pet',
            version: 1,
            durable: true,
            summary: { titleField: 'name' },
            relations: [],
            ui: { detailSections: ['overview'] },
        }),
        /progressSemantics/
    );

    assert.throws(
        () => runtime.validateWorkflowDefinition({
            id: 'cycle-demo',
            version: 1,
            inputs: ['asset'],
            nodes: [
                { id: 'a', kind: 'module', moduleId: 'demo', step: 'test', outputsTo: ['b'] },
                { id: 'b', kind: 'module', moduleId: 'demo', step: 'test', outputsTo: ['a'] },
            ],
        }),
        /cycle/i
    );
});

test('workflow runtime registries reject duplicates and invalid workflow references', async () => {
    const runtime = await import('../../dist/core/src/services/workflowRuntime/index.js');
    const subjects = new runtime.SubjectRegistry();
    const modules = new runtime.ModuleRegistry();
    const workflows = new runtime.WorkflowRegistry({ subjects, modules });

    const assetSubjectType = {
        id: 'asset',
        version: 1,
        durable: true,
        summary: { titleField: 'id', thumbnailStrategy: 'asset' },
        progressSemantics: 'per_subject',
        relations: [],
        ui: { detailSections: ['overview'] },
    };

    const previewModule = {
        id: 'legacy.preview.generate',
        version: 1,
        capability: 'derive',
        accepts: ['asset'],
        produces: [{ kind: 'artifact', artifactType: 'preview', subjectType: 'asset' }],
        run: async () => ({ outputs: [] }),
    };

    subjects.register(assetSubjectType);
    modules.register(previewModule);

    assert.throws(() => subjects.register(assetSubjectType), /duplicate/i);
    assert.throws(() => modules.register(previewModule), /duplicate/i);

    assert.throws(
        () => workflows.register({
            id: 'invalid-workflow',
            version: 1,
            inputs: ['asset'],
            nodes: [
                {
                    id: 'generate-preview',
                    kind: 'module',
                    moduleId: 'missing.module',
                    step: 'test',
                },
            ],
        }),
        /unknown module/i
    );
});
