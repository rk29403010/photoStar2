import type Database from 'better-sqlite3';

const ANALYSIS_TABLES = ['analysis_runs', 'analysis_images', 'analysis_sources', 'analysis_claims',
    'analysis_claim_sources', 'analysis_regions'] as const;
type Table = typeof ANALYSIS_TABLES[number];
type Row = Record<string, string | number | null>;
export type DurablePhotoAnalysisState = { tables: Record<Table, Row[]>; assetIds: string[] };

/** Preserve the immutable evidence and supersession history backing human truth. */
export function snapshotDurablePhotoAnalysisState(db: Database.Database): DurablePhotoAnalysisState {
    const assetIds = (db.prepare("SELECT DISTINCT asset_id FROM analysis_claims WHERE kind = 'user_confirmed'")
        .all() as { asset_id: string }[]).map(row => row.asset_id);
    const tables = Object.fromEntries(ANALYSIS_TABLES.map(table => [table, db.prepare(`
        SELECT * FROM ${table} WHERE asset_id IN
            (SELECT DISTINCT asset_id FROM analysis_claims WHERE kind = 'user_confirmed')
        ORDER BY rowid`).all()])) as Record<Table, Row[]>;
    return { tables, assetIds };
}

export function restoreDurablePhotoAnalysisState(db: Database.Database, state: DurablePhotoAnalysisState): void {
    for (const table of ANALYSIS_TABLES) {
        const rows = state.tables[table];
        const first = rows[0];
        if (!first) { continue; }
        // Column names come from SQLite's own fixed schema, never user input.
        const columns = Object.keys(first);
        const insert = db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`);
        for (const row of rows) { insert.run(...columns.map(column => row[column] ?? null)); }
    }
}
