const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');

function loadTsModule(relativePath) {
    const sourcePath = path.resolve(relativePath);
    const source = fs.readFileSync(sourcePath, 'utf8');
    const transpiled = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
            esModuleInterop: true,
        },
        fileName: sourcePath,
    }).outputText;
    const tempFile = path.join(os.tmpdir(), `photo-star-test-${path.basename(relativePath, '.ts')}-${Date.now()}-${Math.random().toString(16).slice(2)}.cjs`);
    fs.writeFileSync(tempFile, transpiled);
    try {
        return require(tempFile);
    } finally {
        fs.rmSync(tempFile, { force: true });
    }
}

test('legacy tag migration inventories, normalizes, and backfills only high-confidence matches', () => {
    const {
        inventoryLegacyTags,
        normalizeLegacyLabel,
        buildMigrationDecisions,
        migrateLegacyAssignments,
    } = loadTsModule('src/services/tags/legacyTagMigration.ts');

    const legacyAssets = [
        { assetId: 'asset-1', tags: [' Family Time ', 'mystery?'] },
        { assetId: 'asset-2', tags: ['family-time'] },
        { assetId: 'asset-3', tags: ['FAMILY   TIME'] },
    ];

    const inventory = inventoryLegacyTags(legacyAssets);
    assert.equal(normalizeLegacyLabel(' Family-Time '), 'family time');
    assert.equal(inventory.find((entry) => entry.normalizedLabel === 'family time')?.count, 3);

    const decisions = buildMigrationDecisions({
        inventory,
        approvedLabels: ['family time'],
    });

    assert.equal(decisions.mappings.length, 1);
    assert.equal(decisions.mappings[0].canonicalLabel, 'family time');
    assert.equal(decisions.reviewItems.length, 1);
    assert.equal(decisions.reviewItems[0].normalizedLabel, 'mystery');

    const migrated = migrateLegacyAssignments({
        legacyAssets,
        mappings: decisions.mappings,
        canonicalLabelToId: { 'family time': 'tag-family' },
    });

    assert.equal(migrated.assignments.length, 3);
    assert.equal(migrated.assignments.every((assignment) => assignment.sourceKind === 'legacy_ai'), true);
    assert.equal(migrated.reviewItems.length, 1);
    assert.equal(migrated.reviewItems[0].reviewItemType, 'tag_proposal');
});
