import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourceRoot = path.join(repoRoot, 'src');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);

function walkSourceFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            return walkSourceFiles(entryPath);
        }
        return SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [entryPath] : [];
    });
}

function collectLegacyFaceIndexOccurrences() {
    const occurrences = [];
    for (const filePath of walkSourceFiles(sourceRoot)) {
        const relativePath = path.relative(repoRoot, filePath).replaceAll('\\', '/');
        const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
        for (let index = 0; index < lines.length; index += 1) {
            if (!lines[index].includes('face_index')) {
                continue;
            }
            occurrences.push({
                path: relativePath,
                line: index + 1,
                text: lines[index].trim(),
            });
        }
    }
    return occurrences;
}

test('WP10 inventory records every current source occurrence of legacy face_index', () => {
    const occurrences = collectLegacyFaceIndexOccurrences();
    assert.ok(occurrences.length > 0, 'Expected existing face_index dependencies before WP10 cutover');
    console.log(`WP10_FACE_INDEX_INVENTORY=${JSON.stringify(occurrences)}`);
});
