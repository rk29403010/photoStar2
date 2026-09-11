import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourceRoot = path.join(repoRoot, 'src');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);

// WP10a freezes the reviewed pre-cutover face_index statements. Later WP10
// work may remove these statements. A new statement, or an increase in the
// multiplicity of an existing statement, requires an explicit inventory review.
const LEGACY_FACE_INDEX_BASELINE = [
    ['src/data/db.ts', 'manualFaceNames: this.loadRows<{ original_path: string; face_index: number; name: string; created_at: string }>(', 1],
    ['src/data/db.ts', "'SELECT original_path, face_index, name, created_at FROM manual_face_names ORDER BY original_path ASC, face_index ASC'", 1],
    ['src/data/db.ts', 'manualFaceIsolations: this.loadRows<{ original_path: string; face_index: number; from_person_id: string | null; created_at: string }>(', 1],
    ['src/data/db.ts', "'SELECT original_path, face_index, from_person_id, created_at FROM manual_face_isolations ORDER BY original_path ASC, face_index ASC'", 1],
    ['src/data/db.ts', 'INSERT INTO manual_face_names (original_path, face_index, name, created_at)', 1],
    ['src/data/db.ts', 'insertManualFaceName.run(row.original_path, row.face_index, row.name, row.created_at);', 1],
    ['src/data/db.ts', 'INSERT INTO manual_face_isolations (original_path, face_index, from_person_id, created_at)', 1],
    ['src/data/db.ts', 'insertManualFaceIsolation.run(row.original_path, row.face_index, row.from_person_id, row.created_at);', 1],

    ['src/data/dbSchema.ts', 'face_index INTEGER NOT NULL,', 3],
    ['src/data/dbSchema.ts', 'PRIMARY KEY (asset_id, face_index),', 1],
    ['src/data/dbSchema.ts', 'PRIMARY KEY (original_path, face_index)', 2],

    ['src/services/faces/peopleResolution.ts', "'SELECT asset_id, face_index, person_id FROM face_assignments'", 1],
    ['src/services/faces/peopleResolution.ts', ').all() as Array<{ asset_id: string; face_index: number; person_id: string }>;', 1],
    ['src/services/faces/peopleResolution.ts', 'const previousAssignments = new Map(existingAssignments.map((row) => [`${row.asset_id}_${row.face_index}`, row.person_id]));', 1],
    ['src/services/faces/peopleResolution.ts', 'INSERT INTO face_assignments (asset_id, face_index, person_id, confidence, is_suggested)', 1],
    ['src/services/faces/peopleResolution.ts', 'SELECT a.id AS asset_id, m.face_index', 1],
    ['src/services/faces/peopleResolution.ts', '` ).all() as Array<{ asset_id: string; face_index: number }>;', 0],
    ['src/services/faces/peopleResolution.ts', '`).all() as Array<{ asset_id: string; face_index: number }>;', 1],
    ['src/services/faces/peopleResolution.ts', "db.prepare('UPDATE face_assignments SET person_id = ? WHERE asset_id = ? AND face_index = ?')", 1],
    ['src/services/faces/peopleResolution.ts', '.run(newPersonId, isolation.asset_id, isolation.face_index);', 1],
    ['src/services/faces/peopleResolution.ts', 'SELECT a.id AS asset_id, m.face_index, m.name', 1],
    ['src/services/faces/peopleResolution.ts', '`).all() as Array<{ asset_id: string; face_index: number; name: string }>;', 1],
    ['src/services/faces/peopleResolution.ts', "'SELECT person_id FROM face_assignments WHERE asset_id = ? AND face_index = ?'", 1],
    ['src/services/faces/peopleResolution.ts', ').get(row.asset_id, row.face_index) as { person_id: string } | undefined;', 1],
    ['src/services/faces/peopleResolution.ts', 'SELECT asset_id, face_index', 1],
    ['src/services/faces/peopleResolution.ts', '`).get(personId) as { asset_id: string; face_index: number } | undefined;', 1],
    ['src/services/faces/peopleResolution.ts', 'const face = (JSON.parse(detection.data) as { faces?: Array<{ box: StoredPhotoBox | number[] }> }).faces?.[bestFace.face_index];', 1],

    ['src/services/handlers/peopleCommands.ts', 'INSERT OR REPLACE INTO manual_face_names (original_path, face_index, name)', 2],
    ['src/services/handlers/peopleCommands.ts', 'SELECT a.original_path, fa.face_index, ?', 2],
    ['src/services/handlers/peopleCommands.ts', 'INSERT OR REPLACE INTO manual_face_isolations (original_path, face_index)', 1],
    ['src/services/handlers/peopleCommands.ts', 'WHERE original_path = (SELECT original_path FROM assets WHERE id = ?) AND face_index = ?', 2],
    ['src/services/handlers/peopleCommands.ts', "db.prepare('UPDATE face_assignments SET person_id = ? WHERE asset_id = ? AND face_index = ?').run(newPersonId, assetId, faceIndex);", 1],
    ['src/services/handlers/peopleCommands.ts', "const faces = db.prepare('SELECT face_index FROM face_assignments WHERE asset_id = ? AND person_id = ?').all(assetId, personId) as { face_index: number }[];", 1],
    ['src/services/handlers/peopleCommands.ts', 'INSERT OR REPLACE INTO manual_face_isolations (original_path, face_index, from_person_id)', 2],
    ['src/services/handlers/peopleCommands.ts', '`).run(face.face_index, personId, assetId);', 1],
    ['src/services/handlers/peopleCommands.ts', '`).run(assetId, face.face_index);', 1],
    ['src/services/handlers/peopleCommands.ts', "db.prepare('UPDATE face_assignments SET person_id = ? WHERE asset_id = ? AND face_index = ?').run(newPersonId, assetId, face.face_index);", 1],
    ['src/services/handlers/peopleCommands.ts', 'SELECT fa.asset_id, fa.face_index, fa.confidence, fa.is_suggested,', 1],
    ['src/services/handlers/peopleCommands.ts', 'WHERE asset_id = ? AND face_index = ?', 2],

    ['src/entrypoints/core/main.ts', "SELECT json_group_array(json_object('face_index', fa.face_index, 'person_id', fa.person_id, 'name', per.name))", 1],
    ['src/entrypoints/core/main.ts', 'const assignment = peopleData.find((person: { face_index: number; person_id: string; name: string }) => person.face_index === index);', 1],

    ['src/services/handlers/assetCommands.ts', "SELECT json_group_array(json_object('face_index', fa.face_index, 'person_id', per.id, 'name', per.name, 'is_suggested', fa.is_suggested))", 2],
    ['src/services/handlers/assetCommands.ts', "json_group_array(json_object('face_index', fa.face_index, 'person_id', ppl.id, 'name', ppl.name)) as people_data,", 1],

    ['src/services/handlers/assetPayloadModel.ts', 'return JSON.parse(row.people_data).filter((person: { person_id: string | null }) => person.person_id !== null) as Array<{ face_index: number; person_id: string; name: string }>;', 1],
    ['src/services/handlers/assetPayloadModel.ts', 'function applyPeopleAssignments(faces: Array<{ person_id?: string; person_name?: string }>, peopleData: Array<{ face_index: number; person_id: string; name: string }>) {', 1],
    ['src/services/handlers/assetPayloadModel.ts', 'const assignment = peopleData.find((person) => person.face_index === index);', 1],
    ['src/services/handlers/assetPayloadModel.ts', "function applyPersonMaskLabel(mask: PhotoMaskMetadata['masks'][number], people: Array<{ face_index: number; name: string }>) {", 1],
    ['src/services/handlers/assetPayloadModel.ts', 'const person = faceIndex === undefined ? undefined : people.find((item) => item.face_index === Number(faceIndex));', 1],
    ['src/services/handlers/assetPayloadModel.ts', 'function parseMaskMetadata(row: AssetPayloadRow, people: Array<{ face_index: number; name: string }>): PhotoMaskMetadata | undefined {', 1],

    ['src/services/handlers/relationshipGalleryAssetLoader.ts', "'face_index', fa.face_index,", 1],

    ['src/ui/components/PeopleView.tsx', 'face_index: number;', 1],
    ['src/ui/components/PeopleView.tsx', '<div key={`${assignment.asset_id}-${assignment.face_index}`} className="relative group rounded-lg overflow-hidden border border-content/10 bg-surface-secondary aspect-square">', 1],
    ['src/ui/components/PeopleView.tsx', '<><button onClick={() => props.actions.confirm(assignment.asset_id, assignment.face_index)}>Approve</button>', 1],
    ['src/ui/components/PeopleView.tsx', '<button onClick={() => props.actions.reject(assignment.asset_id, assignment.face_index)}>Reject</button></>', 1],
    ['src/ui/components/PeopleView.tsx', '<button onClick={() => props.actions.unmatch(assignment.asset_id, assignment.face_index)} title="Unmatch / Isolate Face"><Trash2 className="w-4 h-4" /></button>', 1],
];

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

function fingerprint(pathname, text) {
    return `${pathname}\n${text}`;
}

test('WP10 legacy face_index dependencies stay inside the frozen statement inventory', () => {
    const occurrences = collectLegacyFaceIndexOccurrences();
    assert.ok(occurrences.length > 0, 'Expected transitional face_index dependencies before WP10h cutover');

    const baselineCounts = new Map();
    for (const [pathname, text, maxCount] of LEGACY_FACE_INDEX_BASELINE) {
        baselineCounts.set(fingerprint(pathname, text), maxCount);
    }

    const observedCounts = new Map();
    const unexpected = [];
    for (const occurrence of occurrences) {
        const key = fingerprint(occurrence.path, occurrence.text);
        if (!baselineCounts.has(key)) {
            unexpected.push(`${occurrence.path}:${occurrence.line}: ${occurrence.text}`);
            continue;
        }
        observedCounts.set(key, (observedCounts.get(key) ?? 0) + 1);
    }

    assert.deepEqual(
        unexpected,
        [],
        `New or changed legacy face_index statement(s) require explicit WP10 review:\n${unexpected.join('\n')}`,
    );

    const expanded = [];
    for (const [key, count] of observedCounts) {
        const maxCount = baselineCounts.get(key);
        if (count > maxCount) {
            expanded.push(`${key.replace('\n', ': ')} (observed ${count}, baseline ${maxCount})`);
        }
    }
    assert.deepEqual(
        expanded,
        [],
        `Existing legacy face_index statement multiplicity increased:\n${expanded.join('\n')}`,
    );
});
