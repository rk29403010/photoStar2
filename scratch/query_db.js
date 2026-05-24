import Database from 'better-sqlite3';
import { join } from 'node:path';
import process from 'node:process';

const dbPath = join(process.env.APPDATA, 'PhotoLibraryDesktop', 'library.db');
const db = new Database(dbPath);

const asset = db.prepare("SELECT * FROM assets WHERE original_path LIKE '%221421-082918_05%'").get();

if (asset) {
    const facesRow = db.prepare("SELECT * FROM derived_results WHERE asset_id = ? AND task = 'face_detection'").get(asset.id);
    console.log(JSON.stringify(facesRow ? JSON.parse(facesRow.data) : 'None', null, 2));
}
db.close();
