import { statSync } from 'node:fs';
import type { DatabaseManager } from '../../../data/db';
import { buildLatestDerivedResultJoin } from '../../../shared/sql/derivedResults';
import { estimatePhotoDate } from '../../photoDateEstimate';
import { createPhotoMetadataRepository } from '../../photoMetadata/repository';
import { resolvePhotoDateEvidence } from '../../photoMetadata/dateResolver';
import { generateDateTagLabels } from '../../tags/dateTagGenerator';
import type { ModuleDefinition } from '../contracts';

type EstimatePhotoDateRow = {
    id: string;
    original_path: string;
    ai_metadata_data: string | null;
    embedded_metadata_data: string | null;
};

export interface EstimatePhotoDateModuleOptions {
    dbManager: DatabaseManager;
    eventBus?: {
        emit: (event: { type: 'AssetUpdated'; assetId: string }) => void;
    };
}

function parseJsonRecord(value: string | null): Record<string, unknown> | null {
    if (!value) {
        return null;
    }

    try {
        const parsed = JSON.parse(value) as unknown;
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : null;
    } catch {
        return null;
    }
}

function loadEstimateRow(
    db: ReturnType<DatabaseManager['getDb']>,
    assetId: string,
): EstimatePhotoDateRow | undefined {
    return db.prepare(`
        SELECT
            a.id,
            a.original_path,
            r_ai.data AS ai_metadata_data,
            r_meta.data AS embedded_metadata_data
        FROM assets a
        ${buildLatestDerivedResultJoin({ assetAlias: 'a', joinAlias: 'r_ai', task: 'ai_metadata' })}
        ${buildLatestDerivedResultJoin({ assetAlias: 'a', joinAlias: 'r_meta', task: 'embedded_metadata' })}
        WHERE a.id = ?
        LIMIT 1
    `).get(assetId) as EstimatePhotoDateRow | undefined;
}

function persistPhotoDateEstimate(params: {
    db: ReturnType<DatabaseManager['getDb']>;
    assetId: string;
    photoCreatedAt: string;
    confidenceScore: number;
    estimateJson: string;
}): boolean {
    const existingAsset = params.db.prepare(`
        SELECT photo_created_at
        FROM assets
        WHERE id = ?
        LIMIT 1
    `).get(params.assetId) as { photo_created_at: string | null } | undefined;
    const didPhotoCreatedAtChange = (existingAsset?.photo_created_at ?? null) !== params.photoCreatedAt;

    params.db.prepare(`
        UPDATE assets
        SET photo_created_at = ?,
            photo_created_at_confidence = ?
        WHERE id = ?
    `).run(params.photoCreatedAt, params.confidenceScore, params.assetId);

    const existing = params.db.prepare(`
        SELECT id
        FROM derived_results
        WHERE asset_id = ? AND task = 'photo_date_estimate'
        ORDER BY datetime(created_at) DESC, created_at DESC, id DESC
        LIMIT 1
    `).get(params.assetId) as { id: string } | undefined;

    if (existing) {
        params.db.prepare(`
            UPDATE derived_results
            SET provider = 'runtime',
                model_version = '1.0',
                data = ?,
                created_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(params.estimateJson, existing.id);
        params.db.prepare(`
            DELETE FROM derived_results
            WHERE asset_id = ? AND task = 'photo_date_estimate' AND id <> ?
        `).run(params.assetId, existing.id);
        return didPhotoCreatedAtChange;
    }

    params.db.prepare(`
        INSERT INTO derived_results (id, asset_id, task, provider, model_version, data)
        VALUES (lower(hex(randomblob(16))), ?, 'photo_date_estimate', 'runtime', '1.0', ?)
    `).run(params.assetId, params.estimateJson);

    return didPhotoCreatedAtChange;
}

function refreshSystemDateTags(params: {
    db: ReturnType<DatabaseManager['getDb']>;
    assetId: string;
    labels: string[];
}): void {
    const selectTag = params.db.prepare(`
        SELECT id
        FROM tag_definitions
        WHERE canonical_label = ?
        LIMIT 1
    `);
    const insertTag = params.db.prepare(`
        INSERT INTO tag_definitions (
            id, canonical_label, description, status, category
        ) VALUES (
            lower(hex(randomblob(16))), ?, 'Deterministic date tag generated from the resolved photo date.', 'active', 'date'
        )
    `);
    const insertAssignment = params.db.prepare(`
        INSERT INTO asset_tag_assignments (
            asset_id, tag_definition_id, source_kind, source_record_id, confidence
        ) VALUES (
            ?, ?, 'system', 'photo_date_estimate', NULL
        )
        ON CONFLICT(asset_id, tag_definition_id, source_kind) DO UPDATE SET
            source_record_id = excluded.source_record_id,
            updated_at = CURRENT_TIMESTAMP
    `);

    params.db.transaction(() => {
        params.db.prepare(`
            DELETE FROM asset_tag_assignments
            WHERE asset_id = ? AND source_kind = 'system'
        `).run(params.assetId);

        for (const label of params.labels) {
            let tagRow = selectTag.get(label) as { id: string } | undefined;
            if (!tagRow) {
                insertTag.run(label);
                tagRow = selectTag.get(label) as { id: string } | undefined;
            }
            if (!tagRow) {continue;}
            insertAssignment.run(params.assetId, tagRow.id);
        }
    })();
}

export function createEstimatePhotoDateModule(options: EstimatePhotoDateModuleOptions): ModuleDefinition {
    const photoMetadataRepository = createPhotoMetadataRepository({ dbManager: options.dbManager });

    return {
        id: 'runtime.estimate_photo_date',
        version: 1,
        capability: 'derive',
        accepts: ['asset'],
        produces: [{ kind: 'artifact', artifactType: 'photo_date_estimate', subjectType: 'asset' }],
        run: async (context) => {
            const db = options.dbManager.getDb();
            const row = loadEstimateRow(db, context.subject.subjectId);
            if (!row) {
                return { outputs: [] };
            }

            const stats = statSync(row.original_path);
            const resolvedEvidence = resolvePhotoDateEvidence({
                originalPath: row.original_path,
                fileBirthtime: stats.birthtime.toISOString(),
                embeddedMetadata: parseJsonRecord(row.embedded_metadata_data),
                aiMetadata: parseJsonRecord(row.ai_metadata_data),
                metadataEvidence: {
                    machineBlocks: photoMetadataRepository.listBlocksForAsset(row.id),
                    manualAssertions: photoMetadataRepository.listAssertionsForAsset(row.id),
                },
            });
            const estimate = estimatePhotoDate(resolvedEvidence);

            const didPhotoCreatedAtChange = persistPhotoDateEstimate({
                db,
                assetId: row.id,
                photoCreatedAt: estimate.photoCreatedAt,
                confidenceScore: estimate.confidence.score,
                estimateJson: JSON.stringify(estimate),
            });
            refreshSystemDateTags({
                db,
                assetId: row.id,
                labels: generateDateTagLabels({
                    photoCreatedAt: estimate.photoCreatedAt,
                    rangeStart: estimate.range.start,
                    rangeEnd: estimate.range.end,
                }),
            });

            if (didPhotoCreatedAtChange) {
                options.eventBus?.emit({
                    type: 'AssetUpdated',
                    assetId: row.id,
                });
            }

            return {
                outputs: [{ kind: 'artifact', artifactType: 'photo_date_estimate', subjectType: 'asset' }],
            };
        },
    };
}
