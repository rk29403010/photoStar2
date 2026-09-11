import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourceRoot = path.join(repoRoot, 'src');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);

// WP10a freezes the current durable snake_case dependency surface. Removing an
// entry is allowed as later WP10 cutovers land; adding a new source path is not.
const LEGACY_FACE_INDEX_PATHS = new Set([
    'src/data/db.ts',
    'src/data/dbSchema.ts',
    'src/services/faces/peopleResolution.ts',
    'src/services/handlers/peopleCommands.ts',
    'src/ui/components/PeopleView.tsx',
]);

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

test('WP10 legacy face_index dependencies stay inside the frozen cutover inventory', () => {
    const occurrences = collectLegacyFaceIndexOccurrences();
    assert.ok(occurrences.length > 0, 'Expected transitional face_index dependencies before WP10h cutover');

    const unexpectedPaths = [...new Set(
        occurrences
            .map((occurrence) => occurrence.path)
            .filter((occurrencePath) => !LEGACY_FACE_INDEX_PATHS.has(occurrencePath)),
    )].sort();

    assert.deepEqual(
        unexpectedPaths,
        [],
        `New legacy face_index dependency path(s) require explicit WP10 review: ${unexpectedPaths.join(', ')}`,
    );

    const observedPaths = new Set(occurrences.map((occurrence) => occurrence.path));
    const staleInventoryPaths = [...LEGACY_FACE_INDEX_PATHS]
        .filter((inventoryPath) => !observedPaths.has(inventoryPath))
        .sort();
    assert.deepEqual(
        staleInventoryPaths,
        [],
        `Remove retired face_index path(s) from the WP10 inventory: ${staleInventoryPaths.join(', ')}`,
    );
});
