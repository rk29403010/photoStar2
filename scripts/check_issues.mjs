
import Database from 'better-sqlite3';
import { join } from 'node:path';

const APP_DATA_DIR = process.env.APPDATA || process.env.HOME || '.';
const LIB_DIR = join(APP_DATA_DIR, 'PhotoLibraryDesktop');
const dbPath = join(LIB_DIR, 'library.db');

const db = new Database(dbPath);
const issueCount = db.prepare('SELECT COUNT(*) as count FROM processing_issues').get().count;
console.log('Issue Count:', issueCount);

if (issueCount > 0) {
    const issues = db.prepare('SELECT * FROM processing_issues LIMIT 10').all();
    console.log('Sample Issues:', issues);
}

const statusPreviews = db.prepare(`
    SELECT size, COUNT(*) as count FROM previews GROUP BY size
`).all();
console.log('Preview Status:', statusPreviews);
