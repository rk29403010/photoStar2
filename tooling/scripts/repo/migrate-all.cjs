/**
 * migrate-all.cjs
 *
 * Orchestrates all dev-time one-off database migrations in order.
 * Run this script against the dev DB when adding a new photo library instance.
 *
 * Usage:
 *   node tooling/scripts/repo/migrate-all.cjs
 */

const { execSync } = require('node:child_process');
const path = require('node:path');

const MIGRATIONS = [
  {
    name: 'migrate-exif-xp-tags',
    description: 'Decode Microsoft EXIF XP tags (XPTitle, XPComment, etc.) from UTF-16LE byte arrays to strings',
    script: path.join(__dirname, 'migrate-exif-xp-tags.cjs'),
  },
  {
    name: 'migrate-stored-photo-coordinates',
    description: 'Normalise stored photo coordinate boxes in face_detection results, photo_metadata_blocks, and photo_metadata_projection',
    script: path.join(__dirname, 'migrate-stored-photo-coordinates.cjs'),
  },
];

let failed = 0;

for (const migration of MIGRATIONS) {
  console.log(`\n--- Running: ${migration.name} ---`);
  console.log(`    ${migration.description}`);
  try {
    execSync(`node.exe "${migration.script}"`, { stdio: 'inherit' });
  } catch (e) {
    console.error(`    FAILED: ${migration.name}`);
    failed++;
  }
}

console.log(`\n=== migrate-all complete. ${MIGRATIONS.length - failed}/${MIGRATIONS.length} succeeded. ===`);
if (failed > 0) {
  process.exit(1);
}
