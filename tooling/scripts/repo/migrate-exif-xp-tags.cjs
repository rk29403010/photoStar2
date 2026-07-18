const Database = require('better-sqlite3');
const path = require('node:path');
const os = require('node:os');

const APP_DATA_DIR = process.env.APPDATA || os.homedir() || '.';
const dbPath = path.join(APP_DATA_DIR, 'PhotoLibraryDesktop', 'library.db');
console.log('Migrating Database at:', dbPath);

function decodeUtf16Le(buf) {
  let str = buf.toString('utf16le');
  const nullIdx = str.indexOf('\0');
  if (nullIdx !== -1) {
    str = str.substring(0, nullIdx);
  }
  return str.trim();
}

function decodeXpTag(value) {
  if (Array.isArray(value) && value.every(x => typeof x === 'number')) {
    return decodeUtf16Le(Buffer.from(value));
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return decodeUtf16Le(Buffer.from(value));
  }
  return value;
}

function decodeExifXpTags(exif) {
  const xpKeys = ['XPTitle', 'XPComment', 'XPAuthor', 'XPKeywords', 'XPSubject'];
  let changed = false;
  for (const key of xpKeys) {
    const val = exif[key];
    if (val === undefined || !Array.isArray(val)) {
      continue;
    }
    if (val.every(x => typeof x === 'number')) {
      exif[key] = decodeXpTag(val);
      changed = true;
    }
  }
  return changed;
}

try {
  const db = new Database(dbPath);
  
  db.transaction(() => {
    const rows = db.prepare(`
      SELECT id, data
      FROM derived_results
      WHERE task = 'embedded_metadata'
    `).all();

    const updateStmt = db.prepare('UPDATE derived_results SET data = ? WHERE id = ?');
    let migratedCount = 0;

    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.data);
        const exif = parsed.embedded?.exif;
        if (!exif) {
          continue;
        }
        if (decodeExifXpTags(exif)) {
          updateStmt.run(JSON.stringify(parsed), row.id);
          migratedCount++;
        }
      } catch (err) {
        console.error(`Failed to migrate row ${row.id}:`, err);
      }
    }
    console.log(`Successfully migrated ${migratedCount} database records.`);
  })();

  db.close();
} catch (e) {
  console.error('Migration failed:', e);
  process.exit(1);
}
