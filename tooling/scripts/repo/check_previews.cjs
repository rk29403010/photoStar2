
const Database = require('better-sqlite3');
const { join } = require('node:path');
const APP_DATA_DIR = process.env.APPDATA || process.env.HOME || '.';
const LIB_DIR = join(APP_DATA_DIR, 'PhotoLibraryDesktop');
const dbPath = join(LIB_DIR, 'library.db');

const db = new Database(dbPath);
const assetCount = db.prepare('SELECT COUNT(*) as count FROM assets').get().count;
const previewCount = db.prepare('SELECT COUNT(*) as count FROM previews').get().count;
const thumbnailCount = db.prepare("SELECT COUNT(*) as count FROM previews WHERE size = 'thumbnail'").get().count;

console.log('Asset Count:', assetCount);
console.log('Preview Count:', previewCount);
console.log('Thumbnail Count:', thumbnailCount);

const samples = db.prepare("SELECT * FROM previews LIMIT 5").all();
console.log('Samples:', samples);

const nullPreviews = db.prepare(`
    SELECT COUNT(*) as count FROM assets a
    LEFT JOIN previews p ON a.id = p.asset_id AND p.size = 'thumbnail'
    WHERE p.path IS NULL
`).get().count;
console.log('Assets without thumbnails:', nullPreviews);
