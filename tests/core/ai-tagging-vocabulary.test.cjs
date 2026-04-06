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

test('ai tagging prompt, schema, and runtime helper enforce approved vocabulary with proposals', () => {
    const { buildGeminiFlashPrompt } = loadTsModule('src/services/aiMetadata/geminiPrompts.ts');
    const { splitAiTagsAgainstVocabulary } = loadTsModule('src/services/aiMetadata/tagVocabularyEnforcement.ts');
    const schemaSource = fs.readFileSync('src/services/aiMetadata/geminiResponseSchema.ts', 'utf8');
    const liveRuntimeSource = fs.readFileSync('src/services/aiMetadata/liveRuntime.ts', 'utf8');
    const runtimeHelperSource = fs.readFileSync('src/services/aiMetadata/liveRuntimeTagHelpers.ts', 'utf8');
    const persistenceSource = fs.readFileSync('src/services/aiMetadata/liveEvidencePersistence.ts', 'utf8');

    const prompt = buildGeminiFlashPrompt({
        filename: 'family-photo.jpg',
        exifDataString: '{}',
        imageStrategy: 'overview_only',
        approvedTagVocabulary: ['family', 'travel', 'affection'],
    });
    assert.match(prompt, /Approved canonical tag vocabulary/i);
    assert.match(prompt, /family/);
    assert.match(prompt, /travel/);
    assert.match(prompt, /tag_proposals/);

    assert.match(schemaSource, /tag_proposals/);
    assert.match(schemaSource, /required: \[[^\]]*'tag_proposals'/s);

    const split = splitAiTagsAgainstVocabulary({
        keywords: ['Family', 'TRAVEL', 'new idea'],
        tagProposals: ['affectionate', 'family'],
        approvedTagVocabulary: ['family', 'travel', 'affection'],
    });
    assert.deepEqual(split.approvedKeywords, ['family', 'travel']);
    assert.deepEqual(split.tagProposals, ['new idea', 'affectionate']);

    assert.match(runtimeHelperSource, /splitAiTagsAgainstVocabulary/);
    assert.match(liveRuntimeSource, /sanitizeGeminiResponseTags/);
    assert.match(persistenceSource, /createTagRepository/);
    assert.match(persistenceSource, /review_items|createReviewItem/);
});
