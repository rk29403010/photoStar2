import Database from 'better-sqlite3';
import { join } from 'node:path';
import process from 'node:process';

const dbPath = join(process.env.APPDATA, 'PhotoLibraryDesktop', 'library.db');
const db = new Database(dbPath);

const rows = db.prepare(`
    SELECT a.id, a.original_path, a.width, a.height, p.subjects_json, p.regions_of_interest_json
    FROM assets a
    JOIN photo_metadata_projection p ON p.asset_id = a.id
    LIMIT 10
`).all();

for (const row of rows) {
    console.log('--------------------------------------------------');
    console.log('File:', row.original_path.split(/[/\\]/).pop());
    console.log('Size:', row.width, 'x', row.height);
    console.log('Subjects:', JSON.parse(row.subjects_json).map(s => ({ label: s.label, box: s.bounding_box })));
    console.log('ROIs:', JSON.parse(row.regions_of_interest_json).map(r => ({ label: r.label, box: r.bounding_box })));
}

db.close();
