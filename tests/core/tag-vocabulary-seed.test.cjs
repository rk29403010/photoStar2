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

test('seed vocabulary includes date and curated starter tags without low-value labels', () => {
    const { getSeedTagDefinitions } = loadTsModule('src/services/tags/seedVocabulary.ts');

    const labels = getSeedTagDefinitions().map((tag) => tag.canonicalLabel);

    assert.ok(labels.includes('20th century'));
    assert.ok(labels.includes('1930s'));
    assert.ok(labels.includes('early 1930s'));
    assert.ok(labels.includes('summer'));
    assert.ok(labels.includes('portrait'));
    assert.ok(labels.includes('group photo'));
    assert.ok(labels.includes('family'));
    assert.ok(labels.includes('affection'));
    assert.ok(labels.includes('travel'));
    assert.ok(labels.includes('document'));
    assert.equal(labels.includes('adult'), false);
});
