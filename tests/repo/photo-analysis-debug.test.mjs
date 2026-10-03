import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
    parseArguments, resolveDebugOptions, describeRequest, exportRequestArtifacts, readOnlyDbManager,
} from '../../tooling/scripts/repo/photo-analysis-debug-support.mjs';

test('debug accepts arbitrary model/prompt variants and preserves argument equals characters', async () => {
    const options = await resolveDebugOptions(parseArguments([
        '--asset=asset-id', '--model=arbitrary-next-model', '--promptVariant=date=independent',
        '--dryRun=true', '--thinkingLevel=low', '--mediaResolution=MEDIA_RESOLUTION_HIGH', '--repeats=3',
    ]), { APPDATA: os.tmpdir() });
    assert.equal(options.modelOverride, 'arbitrary-next-model');
    assert.equal(options.promptVariant, 'date=independent');
    assert.equal(options.dryRun, true);
    assert.equal(options.repeats, 3);
    assert.deepEqual(options.thinking, { thinkingLevel: 'LOW' });
    assert.equal(options.mediaResolution, 'MEDIA_RESOLUTION_HIGH');
});

test('debug refuses untargeted Refine and conflicting or invalid controls before any API call', async () => {
    await assert.rejects(resolveDebugOptions({ metadataPass: 'refine' }, {}), /explicit/);
    await assert.rejects(resolveDebugOptions({ targets: '{}'}, {}), /JSON array/);
    await assert.rejects(resolveDebugOptions({ repeats: '101' }, {}), /repeats/);
    await assert.rejects(resolveDebugOptions({ thinkingLevel: 'LOW', thinkingBudget: '256' }, {}), /Choose/);
    await assert.rejects(resolveDebugOptions({ thinkingBudget: '-2' }, {}), /thinkingBudget/);
    const target = { field: 'date', subjectId: null, concern: 'date', question: 'Can clothing narrow the date?' };
    const options = await resolveDebugOptions({ metadataPass: 'refine', targets: JSON.stringify([target]) }, {});
    assert.deepEqual(options.targets, [target]);
});

test('read-only debug manager exposes query access without persistence methods', () => {
    const db = { prepare: sql => ({ get: key => { assert.match(sql, /^SELECT/); return { value: key }; } }) };
    const manager = readOnlyDbManager(db);
    assert.equal(manager.getDb(), db);
    assert.equal(manager.getSetting('job_ai_model_scout'), 'job_ai_model_scout');
    assert.equal(Object.hasOwn(manager, 'setSetting'), false);
});

test('request artifacts retain manifests, provenance, independent observations, targets and exact image bytes', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'photostar-analysis-debug-'));
    const prepared = {
        request: { model: 'test-model', prompt: 'Independent visual evidence.', responseJsonSchema: { type: 'object' },
            images: [{ id: 'image:overview', mimeType: 'image/jpeg', imageBase64: Buffer.from([1, 2, 3]).toString('base64') }] },
        images: [{ id: 'image:overview', kind: 'overview', fullPhotoBox: { x: 0, y: 0, width: 1, height: 1 } }],
        sources: [{ id: 'source:image', imageId: 'image:overview', kind: 'image' }], faces: [],
        visualObservations: [{ field: 'archive_clue', value: 'Visible inscription', sourceIds: ['source:image'] }],
        targets: [{ field: 'text', subjectId: 'inscription:1', question: 'What does the inscription say?' }],
    };
    try {
        await exportRequestArtifacts(prepared, directory);
        for (const [file, expected] of [
            ['image-manifest.json', prepared.images], ['source-references.json', prepared.sources],
            ['independent-observations.json', prepared.visualObservations], ['targets.json', prepared.targets],
        ]) {
            assert.deepEqual(JSON.parse(await fs.readFile(path.join(directory, file), 'utf8')), expected);
        }
        assert.deepEqual(await fs.readFile(path.join(directory, 'input-1.jpg')), Buffer.from([1, 2, 3]));
        const summary = describeRequest(prepared);
        assert.equal(summary.images[0].id, 'image:overview');
        assert.equal(Object.hasOwn(summary.images[0], 'imageBase64'), false);
        assert.equal(summary.promptHash, describeRequest(prepared).promptHash);
    } finally {
        await fs.rm(directory, { recursive: true, force: true });
    }
});
