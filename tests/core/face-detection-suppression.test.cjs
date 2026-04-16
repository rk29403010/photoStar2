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

test('suppresses nested duplicate face boxes that slip under the legacy IoU threshold', () => {
    const { suppressDuplicateFaceCandidates } = loadTsModule('src/services/faces/faceDetectionSuppression.ts');

    const deduped = suppressDuplicateFaceCandidates([
        {
            score: 0.98,
            box: [0.403369, 0.542425, 0.554092, 0.704666],
            landmarks: [
                { x: 0.435, y: 0.592 },
                { x: 0.509, y: 0.594 },
                { x: 0.473, y: 0.627 },
                { x: 0.445, y: 0.659 },
                { x: 0.503, y: 0.661 },
            ],
        },
        {
            score: 0.95,
            box: [0.450646, 0.591892, 0.574078, 0.72486],
            landmarks: [
                { x: 0.467, y: 0.617 },
                { x: 0.527, y: 0.618 },
                { x: 0.498, y: 0.644 },
                { x: 0.473, y: 0.674 },
                { x: 0.521, y: 0.675 },
            ],
        },
    ]);

    assert.equal(deduped.length, 1);
    assert.equal(deduped[0].score, 0.98);
});

test('keeps distinct nearby faces when they do not significantly contain each other', () => {
    const { suppressDuplicateFaceCandidates } = loadTsModule('src/services/faces/faceDetectionSuppression.ts');

    const deduped = suppressDuplicateFaceCandidates([
        {
            score: 0.93,
            box: [0.12, 0.24, 0.2, 0.36],
            landmarks: [
                { x: 0.14, y: 0.27 },
                { x: 0.18, y: 0.27 },
                { x: 0.16, y: 0.3 },
                { x: 0.145, y: 0.33 },
                { x: 0.175, y: 0.33 },
            ],
        },
        {
            score: 0.91,
            box: [0.205, 0.245, 0.285, 0.365],
            landmarks: [
                { x: 0.225, y: 0.275 },
                { x: 0.265, y: 0.275 },
                { x: 0.245, y: 0.305 },
                { x: 0.23, y: 0.335 },
                { x: 0.26, y: 0.335 },
            ],
        },
    ]);

    assert.equal(deduped.length, 2);
});
