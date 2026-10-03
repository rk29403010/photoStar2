import type { DatabaseManager } from '../../data/db';
import { analysisFieldSchema, type AnalysisField } from '../../shared/photoAnalysis/contracts';
import { recordUserTruth } from './userTruth';

/** Display edits use the same field contract as analysis, never a separate manual blob. */
export function recordAnalysisDisplayEdit(dbManager: DatabaseManager, params: {
    assetId: string; fieldPath: string; value: unknown; userId: string; note?: string | null;
}) {
    const field = params.fieldPath === 'keywords' ? 'tags' : params.fieldPath;
    analysisFieldSchema.parse(field);
    const value = field === 'location' && typeof params.value === 'string'
        ? { label: params.value, country: null, locality: null } : params.value;
    return recordUserTruth(dbManager, { ...params, field: field as AnalysisField, value });
}
