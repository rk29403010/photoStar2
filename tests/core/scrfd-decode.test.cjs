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
    const tempFile = path.join(
        os.tmpdir(),
        `photo-star-test-${path.basename(relativePath, '.ts')}-${Date.now()}-${Math.random().toString(16).slice(2)}.cjs`
    );
    fs.writeFileSync(tempFile, transpiled);
    try {
        return require(tempFile);
    } finally {
        fs.rmSync(tempFile, { force: true });
    }
}

test('createScrfdAnchorCenters matches InsightFace SCRFD grid ordering with repeated anchors', () => {
    const { createScrfdAnchorCenters } = loadTsModule('src/services/faces/scrfdDecode.ts');

    assert.deepEqual(
        createScrfdAnchorCenters({
            featureWidth: 2,
            featureHeight: 1,
            stride: 8,
            anchorCount: 2,
        }),
        [
            [0, 0],
            [0, 0],
            [8, 0],
            [8, 0],
        ]
    );
});

test('decodeScrfdCandidates maps portrait detections with top-left scaling instead of centered padding', () => {
    const { decodeScrfdCandidates } = loadTsModule('src/services/faces/scrfdDecode.ts');

    const candidates = decodeScrfdCandidates({
        scores: Float32Array.from([0.91]),
        boxPredictions: Float32Array.from([4, 8, 8, 12]),
        landmarkPredictions: Float32Array.from([0, 0, 1, 0, 0, 1, 1, 1, 2, 1]),
        anchorCenters: [[240, 160]],
        stride: 8,
        imageWidth: 100,
        imageHeight: 200,
        detScale: 3.2,
        scoreThreshold: 0.5,
    });

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].score, 0.91);
    assert.deepEqual(candidates[0].box, [0.65, 0.15, 0.95, 0.4]);
    assert.deepEqual(candidates[0].landmarks, [
        { x: 0.75, y: 0.25 },
        { x: 0.775, y: 0.25 },
        { x: 0.75, y: 0.2625 },
        { x: 0.775, y: 0.2625 },
        { x: 0.8, y: 0.2625 },
    ]);
});
