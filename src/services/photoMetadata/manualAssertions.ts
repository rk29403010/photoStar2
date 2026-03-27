import type { DatabaseManager } from '../../data/db';
import type { PhotoMetadataAssertionRow } from './repository';
import { createPhotoMetadataRepository } from './repository';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

type JsonValue = unknown;

export interface RecordManualAssertionParams {
    assetId: string;
    fieldPath: string;
    value: JsonValue;
    userId: string;
    note?: string | null;
}

export interface ListManualAssertionsParams {
    assetId: string;
    fieldPath?: string;
}

export interface ManualAssertionsService {
    recordManualAssertion(params: RecordManualAssertionParams): PhotoMetadataAssertionRow;
    listManualAssertions(assetId: string, fieldPath?: string): PhotoMetadataAssertionRow[];
    getLatestManualAssertionForField(assetId: string, fieldPath: string): PhotoMetadataAssertionRow | null;
}

function parseJson<T>(value: string): T {
    return JSON.parse(value) as T;
}

function toAssertionRow(row: {
    id: string;
    asset_id: string;
    field_path: string;
    value_json: string;
    user_id: string;
    note: string | null;
    created_at: string;
}): PhotoMetadataAssertionRow {
    return {
        id: row.id,
        asset_id: row.asset_id,
        field_path: row.field_path,
        value: parseJson<JsonValue>(row.value_json),
        user_id: row.user_id,
        note: row.note,
        created_at: row.created_at,
    };
}

function listAssertionRows(db: DbHandle, params: ListManualAssertionsParams): PhotoMetadataAssertionRow[] {
    const rows = params.fieldPath
        ? db.prepare(`
            SELECT id, asset_id, field_path, value_json, user_id, note, created_at
            FROM photo_metadata_assertions
            WHERE asset_id = ? AND field_path = ?
            ORDER BY datetime(created_at) DESC, rowid DESC
        `).all(params.assetId, params.fieldPath)
        : db.prepare(`
            SELECT id, asset_id, field_path, value_json, user_id, note, created_at
            FROM photo_metadata_assertions
            WHERE asset_id = ?
            ORDER BY datetime(created_at) DESC, rowid DESC
        `).all(params.assetId);

    return (rows as Array<{
        id: string;
        asset_id: string;
        field_path: string;
        value_json: string;
        user_id: string;
        note: string | null;
        created_at: string;
    }>).map(toAssertionRow);
}

export class PhotoMetadataManualAssertionsService implements ManualAssertionsService {
    constructor(private readonly dbManager: DatabaseManager) {}

    private get db(): DbHandle {
        return this.dbManager.getDb();
    }

    recordManualAssertion(params: RecordManualAssertionParams): PhotoMetadataAssertionRow {
        const repository = createPhotoMetadataRepository({ dbManager: this.dbManager });
        const assertionId = repository.insertManualAssertion({
            assetId: params.assetId,
            fieldPath: params.fieldPath,
            value: params.value,
            userId: params.userId,
            note: params.note ?? null,
        });

        const row = this.db.prepare(`
            SELECT id, asset_id, field_path, value_json, user_id, note, created_at
            FROM photo_metadata_assertions
            WHERE id = ?
        `).get(assertionId) as {
            id: string;
            asset_id: string;
            field_path: string;
            value_json: string;
            user_id: string;
            note: string | null;
            created_at: string;
        } | undefined;

        if (!row) {
            throw new Error('Failed to load stored manual assertion');
        }

        return toAssertionRow(row);
    }

    listManualAssertions(assetId: string, fieldPath?: string): PhotoMetadataAssertionRow[] {
        return listAssertionRows(this.db, { assetId, fieldPath });
    }

    getLatestManualAssertionForField(assetId: string, fieldPath: string): PhotoMetadataAssertionRow | null {
        return this.listManualAssertions(assetId, fieldPath)[0] ?? null;
    }
}

export function createPhotoMetadataManualAssertionsService(options: { dbManager: DatabaseManager }): ManualAssertionsService {
    return new PhotoMetadataManualAssertionsService(options.dbManager);
}
