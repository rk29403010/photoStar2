import Database from 'better-sqlite3';
import path from 'node:path';
import { writePhotoDateReviewReport } from './photo-date-review-report-lib.mjs';

function parseArgs(argv) {
    const options = {};
    for (const arg of argv) {
        if (!arg.startsWith('--')) {
            continue;
        }
        const [key, rawValue] = arg.slice(2).split('=');
        options[key] = rawValue ?? 'true';
    }
    return options;
}

function resolveDbPath(args) {
    if (typeof args.db === 'string' && args.db.length > 0) {
        return path.resolve(args.db);
    }

    if (typeof process.env.PHOTO_STAR_DB_PATH === 'string' && process.env.PHOTO_STAR_DB_PATH.length > 0) {
        return path.resolve(process.env.PHOTO_STAR_DB_PATH);
    }

    const appDataDir = process.env.APPDATA || process.env.HOME || '.';
    return path.join(appDataDir, 'PhotoLibraryDesktop', 'library.db');
}

function resolveOutputDir(args) {
    if (typeof args.outDir === 'string' && args.outDir.length > 0) {
        return path.resolve(args.outDir);
    }

    return path.resolve('artifacts', 'reports');
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const dbPath = resolveDbPath(args);
    const outputDir = resolveOutputDir(args);
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });

    try {
        const result = writePhotoDateReviewReport({
            db,
            dbPath,
            outputDir,
        });

        console.log(`Photo date review cases: ${result.cases.length}`);
        console.log(`Markdown report: ${result.markdownPath}`);
        console.log(`JSON report: ${result.jsonPath}`);
    } finally {
        db.close();
    }
}

main();
