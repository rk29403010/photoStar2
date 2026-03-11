
const Database = require('better-sqlite3');
const { join } = require('node:path');

const APP_DATA_DIR = process.env.APPDATA || process.env.HOME || '.';
const LIB_DIR = join(APP_DATA_DIR, 'PhotoLibraryDesktop');
const dbPath = join(LIB_DIR, 'library.db');

const db = new Database(dbPath);
const asset = db.prepare('SELECT * FROM assets LIMIT 1').get();
console.log('Asset:', asset);

if (asset) {
    const previews = db.prepare('SELECT * FROM previews WHERE asset_id = ?').all(asset.id);
    console.log('Previews for this asset:', previews);
}

const allAssetsCount = db.prepare('SELECT COUNT(*) as count FROM assets').get().count;
const assetsWithThumb = db.prepare("SELECT COUNT(DISTINCT asset_id) as count FROM previews WHERE size = 'thumbnail'").get().count;
console.log(`Summary: ${assetsWithThumb} / ${allAssetsCount} assets have thumbnails.`);
