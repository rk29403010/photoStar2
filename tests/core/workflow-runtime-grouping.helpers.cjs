const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-runtime-grouping-'));
}

function createFixtureImage(filePath) {
    const pngBytes = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAMAAAADCAYAAABWKLW/AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADklEQVQImWP4jwQYcHIAu4cj3WS55GoAAAAASUVORK5CYII=',
        'base64',
    );
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, pngBytes);
}

function hashFileContents(filePath) {
    return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function seedAsset(dbManager, asset) {
    dbManager.getDb().prepare(`
        INSERT INTO assets (id, original_path, file_hash, file_size, width, height, exif_datetime, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        asset.id,
        asset.originalPath,
        asset.fileHash ?? null,
        asset.fileSize ?? 0,
        asset.width ?? 0,
        asset.height ?? 0,
        asset.exifDate ?? null,
        new Date().toISOString(),
    );
}

function seedDuplicateGroup(dbManager, params) {
    dbManager.getDb().prepare(`
        INSERT INTO asset_groups (id, type, status, canonical_asset_id, algorithm_version, params_json)
        VALUES (?, 'duplicate', ?, ?, '1.0', '{}')
    `).run(params.groupId, params.status, params.canonicalAssetId);

    const insertMember = dbManager.getDb().prepare(`
        INSERT INTO asset_group_members (group_id, asset_id, role, rank)
        VALUES (?, ?, ?, ?)
    `);

    params.assetIds.forEach((assetId, index) => {
        insertMember.run(params.groupId, assetId, index === 0 ? 'canonical' : 'member', index);
    });
}

function seedSimilarityGroup(dbManager, params) {
    dbManager.getDb().prepare(`
        INSERT INTO asset_groups (id, type, status, canonical_asset_id, algorithm_version, params_json)
        VALUES (?, ?, ?, ?, '1.0', ?)
    `).run(
        params.groupId,
        params.type,
        params.status,
        params.canonicalAssetId,
        JSON.stringify(params.paramsJson ?? {}),
    );

    const insertMember = dbManager.getDb().prepare(`
        INSERT INTO asset_group_members (group_id, asset_id, role, rank)
        VALUES (?, ?, ?, ?)
    `);

    params.assetIds.forEach((assetId, index) => {
        insertMember.run(params.groupId, assetId, index === 0 ? 'canonical' : 'member', index);
    });
}

function seedAssetFeatures(dbManager, params) {
    dbManager.getDb().prepare(`
        INSERT INTO asset_features (asset_id, file_hash, phash64, dhash64)
        VALUES (?, ?, ?, ?)
    `).run(params.assetId, params.fileHash ?? null, params.phash64, params.dhash64);
}

async function runGroupingWorkflow({ dbManager, inputSubjects }) {
    const runtime = await import('../../dist/core/src/services/workflowRuntime/index.js');
    const { groupSimilarPhotosPlugin } = await import(
        '../../dist/core/src/services/workflowRuntime/modules/plugins/group-similar-photos/plugin.js'
    );

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
        labels: { singular: 'photo', plural: 'photos' },
    });

    modules.registerPlugin(groupSimilarPhotosPlugin, { dbManager });
    workflows.register({
        id: 'runtime-grouping-test',
        version: 1,
        inputs: ['asset'],
        nodes: [
            {
                id: 'group-similar-photos',
                kind: 'module',
                moduleId: 'runtime.group_similar_photos',
                runMode: 'once_per_batch',
            },
        ],
    });

    const orchestrator = new runtime.WorkflowRuntimeOrchestrator({
        store,
        workflows,
        modules,
    });

    return orchestrator.start({
        workflowId: 'runtime-grouping-test',
        triggerType: 'manual',
        inputSubjects,
    });
}

module.exports = {
    createFixtureImage,
    createTempDir,
    hashFileContents,
    runGroupingWorkflow,
    seedAsset,
    seedAssetFeatures,
    seedDuplicateGroup,
    seedSimilarityGroup,
};
