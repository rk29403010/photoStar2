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

test('date tag generator emits century, decade, period, year, and season tags for precise dates', () => {
    const { generateDateTagLabels } = loadTsModule('src/services/tags/dateTagGenerator.ts');

    const labels = generateDateTagLabels({
        photoCreatedAt: '1932-07-14T00:00:00.000Z',
        rangeStart: '1932-07-14T00:00:00.000Z',
        rangeEnd: '1932-07-14T00:00:00.000Z',
    });

    assert.ok(labels.includes('20th century'));
    assert.ok(labels.includes('1930s'));
    assert.ok(labels.includes('early 1930s'));
    assert.ok(labels.includes('1932'));
    assert.ok(labels.includes('summer'));
});

test('date tag generator omits season tags when the range spans multiple seasons', () => {
    const { generateDateTagLabels } = loadTsModule('src/services/tags/dateTagGenerator.ts');

    const labels = generateDateTagLabels({
        photoCreatedAt: '1932-06-15T00:00:00.000Z',
        rangeStart: '1932-05-15T00:00:00.000Z',
        rangeEnd: '1932-09-15T00:00:00.000Z',
    });

    assert.equal(labels.includes('summer'), false);
});

test('date tag generator returns no tags for unknown dates', () => {
    const { generateDateTagLabels } = loadTsModule('src/services/tags/dateTagGenerator.ts');

    assert.deepEqual(generateDateTagLabels({
        photoCreatedAt: null,
        rangeStart: null,
        rangeEnd: null,
    }), []);
});
