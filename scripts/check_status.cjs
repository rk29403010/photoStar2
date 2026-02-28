
const Database = require('better-sqlite3');
const { join } = require('node:path');

const APP_DATA_DIR = process.env.APPDATA || process.env.HOME || '.';
const LIB_DIR = join(APP_DATA_DIR, 'PhotoLibraryDesktop');
const dbPath = join(LIB_DIR, 'library.db');

const db = new Database(dbPath);
const issueCount = db.prepare('SELECT COUNT(*) as count FROM processing_issues').get().count;
console.log('Issue Count:', issueCount);

const previewStatus = db.prepare(`
    SELECT size, COUNT(*) as count FROM previews GROUP BY size
`).all();
console.log('Preview Status:', previewStatus);

const assetCount = db.prepare('SELECT COUNT(*) as count FROM assets').get().count;
console.log('Asset Count:', assetCount);
