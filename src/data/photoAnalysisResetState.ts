import type Database from 'better-sqlite3';

// FK-safe restore order. Only rebuildable lookup features and face candidates are omitted.
const DURABLE_TABLES = ['analysis_runs', 'analysis_images', 'analysis_sources', 'analysis_claims',
    'analysis_claim_sources', 'analysis_regions', 'photo_events', 'photo_event_members', 'photo_event_decisions',
    'analysis_source_roots', 'analysis_claim_roots', 'analysis_source_memberships', 'analysis_claim_memberships',
    'analysis_claim_decisions', 'archive_impacts', 'related_photo_state', 'related_photo_queue',
    'related_refinement_opportunities'] as const;
type Table = typeof DURABLE_TABLES[number];
type Row = Record<string, string | number | null>;
export type DurablePhotoAnalysisState = { tables: Record<Table, Row[]>; assetIds: string[] };

function retainedAssetIds(db: Database.Database): string[] {
    return (db.prepare(`WITH RECURSIVE retained(asset_id) AS (
        SELECT asset_id FROM analysis_claims WHERE kind = 'user_confirmed'
        UNION SELECT claim.asset_id FROM analysis_claim_decisions decision JOIN analysis_claims claim ON claim.id = decision.claim_id
        UNION SELECT asset_id FROM photo_event_decisions
        UNION SELECT asset_id FROM archive_impacts
        UNION SELECT claim.asset_id FROM archive_impacts impact, json_each(impact.root_claim_ids_json) root
            JOIN analysis_claims claim ON claim.id = root.value
        UNION SELECT root.asset_id FROM retained
            JOIN analysis_claims claim ON claim.asset_id = retained.asset_id
            JOIN analysis_claim_roots dependency ON dependency.claim_id = claim.id
            JOIN analysis_claims root ON root.id = dependency.root_claim_id
        UNION SELECT root.asset_id FROM retained
            JOIN analysis_sources source ON source.asset_id = retained.asset_id
            JOIN analysis_source_roots dependency ON dependency.source_id = source.id
            JOIN analysis_claims root ON root.id = dependency.root_claim_id
        UNION SELECT membership.asset_id FROM retained
            JOIN analysis_claims claim ON claim.asset_id = retained.asset_id
            JOIN analysis_claim_memberships membership ON membership.claim_id = claim.id
        UNION SELECT membership.asset_id FROM retained
            JOIN analysis_sources source ON source.asset_id = retained.asset_id
            JOIN analysis_source_memberships membership ON membership.source_id = source.id
        UNION SELECT event.seed_asset_id FROM retained
            JOIN photo_event_members member ON member.asset_id = retained.asset_id
            JOIN photo_events event ON event.id = member.event_id
        UNION SELECT member.asset_id FROM retained
            JOIN photo_events event ON event.seed_asset_id = retained.asset_id
            JOIN photo_event_members member ON member.event_id = event.id
    ) SELECT asset_id FROM retained JOIN assets ON assets.id = retained.asset_id ORDER BY asset_id`)
        .all() as Array<{ asset_id: string }>).map(row => row.asset_id);
}

const RETAINED_ASSETS = '(SELECT value FROM json_each(?))';
const RETAINED_CLAIMS = `(SELECT id FROM analysis_claims WHERE asset_id IN ${RETAINED_ASSETS})`;
const RETAINED_SOURCES = `(SELECT id FROM analysis_sources WHERE asset_id IN ${RETAINED_ASSETS})`;
const TABLE_SCOPE: Partial<Record<Table, string>> = {
    photo_events: `seed_asset_id IN ${RETAINED_ASSETS}`,
    analysis_source_roots: `source_id IN ${RETAINED_SOURCES}`,
    analysis_claim_roots: `claim_id IN ${RETAINED_CLAIMS}`,
    analysis_source_memberships: `source_id IN ${RETAINED_SOURCES}`,
    analysis_claim_memberships: `claim_id IN ${RETAINED_CLAIMS}`,
    analysis_claim_decisions: `claim_id IN ${RETAINED_CLAIMS}`,
};

/** Keep authority, human rejection history and genuine impact evidence, including foreign roots.
 * This is reset durability, not a migration or an invented historical progress ledger.
 */
export function snapshotDurablePhotoAnalysisState(db: Database.Database): DurablePhotoAnalysisState {
    const assetIds = retainedAssetIds(db);
    const selected = JSON.stringify(assetIds);
    const tables = Object.fromEntries(DURABLE_TABLES.map(table => [table, db.prepare(`
        SELECT * FROM ${table} WHERE ${TABLE_SCOPE[table] ?? `asset_id IN ${RETAINED_ASSETS}`}
        ORDER BY rowid`).all(selected)])) as Record<Table, Row[]>;
    return { tables, assetIds };
}

function restoreTable(db: Database.Database, table: Table, rows: Row[]): void {
    const first = rows[0];
    if (!first) { return; }
    // Column names come from SQLite's own fixed schema, never user input.
    const columns = Object.keys(first);
    const insert = db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`);
    for (const row of rows) { insert.run(...columns.map(column => row[column] ?? null)); }
}

export function restoreDurablePhotoAnalysisState(db: Database.Database, state: DurablePhotoAnalysisState): void {
    for (const table of DURABLE_TABLES) { restoreTable(db, table, state.tables[table]); }
    // Reindex retained evidence and reconsider it after reset; never replay or manufacture impacts.
    db.prepare(`INSERT INTO related_photo_queue(asset_id, cause, revision, status, attempts, error, updated_at)
        SELECT value, 'soft-reset', 1, 'pending', 0, NULL, CURRENT_TIMESTAMP FROM json_each(?) WHERE 1
        ON CONFLICT(asset_id) DO UPDATE SET cause = excluded.cause, revision = revision + 1,
            status = 'pending', attempts = 0, error = NULL, updated_at = excluded.updated_at`)
        .run(JSON.stringify(state.assetIds));
}
