import { createHash } from 'node:crypto';
import type { DatabaseManager } from '../../data/db';
import {
    countRelationshipPresentationItems,
    getRelationshipPresentationPage,
    type LibraryPresentationItem,
    type LibraryPresentationOrder,
} from './libraryPresentationProjection';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

type VisualRelationshipKind = LibraryPresentationItem['relationshipKind'] | 'near_duplicate' | 'variant';

export type VisualSimilarityPresentationItem = Omit<LibraryPresentationItem, 'relationshipKind'> & {
    relationshipKind: VisualRelationshipKind;
};

type ObservationRow = {
    current_asset_id_a: string | null;
    current_asset_id_b: string | null;
    phash_distance: number;
    dhash_distance: number;
    evidence_json: string | null;
};

type AssetMetadata = {
    id: string;
    original_path: string;
    file_size: number;
    width: number;
    height: number;
    exif_datetime: string | null;
    created_at: string;
};

type ClusterEdge = {
    leftKey: string;
    rightKey: string;
};

type VisualPolicy = 'near_duplicate' | 'variant';

type CollapseStage = {
    policy: VisualPolicy;
    threshold: number;
    representative: 'quality' | 'recency';
};

const VISUAL_SOURCE_IDENTITY = 'runtime.group_similar_photos:visual_hash';

function loadBaseItems(db: DbHandle, order: LibraryPresentationOrder): LibraryPresentationItem[] {
    return getRelationshipPresentationPage(db, {
        limit: countRelationshipPresentationItems(db),
        offset: 0,
        order,
    });
}

function loadObservations(db: DbHandle): ObservationRow[] {
    return db.prepare(`
        SELECT
            (
                SELECT asset.id
                FROM assets asset
                JOIN asset_identities identity_a ON identity_a.original_path = asset.original_path
                WHERE identity_a.guid = observation.asset_identity_guid_a
                ORDER BY asset.created_at DESC, asset.id DESC
                LIMIT 1
            ) AS current_asset_id_a,
            (
                SELECT asset.id
                FROM assets asset
                JOIN asset_identities identity_b ON identity_b.original_path = asset.original_path
                WHERE identity_b.guid = observation.asset_identity_guid_b
                ORDER BY asset.created_at DESC, asset.id DESC
                LIMIT 1
            ) AS current_asset_id_b,
            observation.phash_distance,
            observation.dhash_distance,
            observation.evidence_json
        FROM visual_similarity_observations observation
        WHERE observation.source_identity = ?
        ORDER BY observation.asset_identity_guid_a, observation.asset_identity_guid_b
    `).all(VISUAL_SOURCE_IDENTITY) as ObservationRow[];
}

function loadAssetMetadata(db: DbHandle, assetIds: readonly string[]): Map<string, AssetMetadata> {
    const byId = new Map<string, AssetMetadata>();
    if (assetIds.length === 0) {
        return byId;
    }
    const placeholders = assetIds.map(() => '?').join(', ');
    const rows = db.prepare(`
        SELECT id, original_path, COALESCE(file_size, 0) AS file_size,
               COALESCE(width, 0) AS width, COALESCE(height, 0) AS height,
               exif_datetime, created_at
        FROM assets
        WHERE id IN (${placeholders})
    `).all(...assetIds) as AssetMetadata[];
    for (const row of rows) {
        byId.set(row.id, row);
    }
    return byId;
}

function evidenceHasPolicy(evidenceJson: string | null, policy: VisualPolicy): boolean {
    if (!evidenceJson) {
        return false;
    }
    try {
        const evidence = JSON.parse(evidenceJson) as { routes?: Array<{ policy?: string }> };
        return evidence.routes?.some((route) => route.policy === policy) ?? false;
    } catch {
        return false;
    }
}

function indexItems(items: readonly VisualSimilarityPresentationItem[]): Map<string, VisualSimilarityPresentationItem> {
    const byAssetId = new Map<string, VisualSimilarityPresentationItem>();
    for (const item of items) {
        for (const assetId of item.assetIds) {
            byAssetId.set(assetId, item);
        }
    }
    return byAssetId;
}

function buildPolicyEdges(
    items: readonly VisualSimilarityPresentationItem[],
    observations: readonly ObservationRow[],
    stage: CollapseStage,
): ClusterEdge[] {
    const byAssetId = indexItems(items);
    const uniqueEdges = new Map<string, ClusterEdge>();
    for (const observation of observations) {
        if (!observation.current_asset_id_a || !observation.current_asset_id_b) {
            continue;
        }
        if (observation.phash_distance > stage.threshold || observation.dhash_distance > stage.threshold) {
            continue;
        }
        if (!evidenceHasPolicy(observation.evidence_json, stage.policy)) {
            continue;
        }
        const left = byAssetId.get(observation.current_asset_id_a);
        const right = byAssetId.get(observation.current_asset_id_b);
        if (!left || !right || left.presentationKey === right.presentationKey) {
            continue;
        }
        const [leftKey, rightKey] = left.presentationKey < right.presentationKey
            ? [left.presentationKey, right.presentationKey]
            : [right.presentationKey, left.presentationKey];
        uniqueEdges.set(`${leftKey}\n${rightKey}`, { leftKey, rightKey });
    }
    return [...uniqueEdges.values()];
}

function buildConnectedComponents(edges: readonly ClusterEdge[]): string[][] {
    const adjacency = new Map<string, Set<string>>();
    for (const edge of edges) {
        const leftNeighbours = adjacency.get(edge.leftKey) ?? new Set<string>();
        const rightNeighbours = adjacency.get(edge.rightKey) ?? new Set<string>();
        leftNeighbours.add(edge.rightKey);
        rightNeighbours.add(edge.leftKey);
        adjacency.set(edge.leftKey, leftNeighbours);
        adjacency.set(edge.rightKey, rightNeighbours);
    }

    const visited = new Set<string>();
    const components: string[][] = [];
    for (const start of [...adjacency.keys()].sort((left, right) => left.localeCompare(right))) {
        if (visited.has(start)) {
            continue;
        }
        const stack = [start];
        const component: string[] = [];
        visited.add(start);
        while (stack.length > 0) {
            const current = stack.pop();
            if (!current) {
                continue;
            }
            component.push(current);
            for (const neighbour of adjacency.get(current) ?? []) {
                if (!visited.has(neighbour)) {
                    visited.add(neighbour);
                    stack.push(neighbour);
                }
            }
        }
        if (component.length > 1) {
            components.push(component.sort((left, right) => left.localeCompare(right)));
        }
    }
    return components;
}

function extensionRank(originalPath: string): number {
    const path = originalPath.toLowerCase();
    if (path.endsWith('.avif')) return 5;
    if (path.endsWith('.heic') || path.endsWith('.heif')) return 4;
    if (path.endsWith('.png') || path.endsWith('.tif') || path.endsWith('.tiff')) return 3;
    if (path.endsWith('.webp')) return 2;
    if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 1;
    return 0;
}

function compareQuality(left: AssetMetadata, right: AssetMetadata): number {
    const leftArea = Math.max(left.width, 0) * Math.max(left.height, 0);
    const rightArea = Math.max(right.width, 0) * Math.max(right.height, 0);
    if (leftArea !== rightArea) return rightArea - leftArea;
    const extensionDelta = extensionRank(right.original_path) - extensionRank(left.original_path);
    if (extensionDelta !== 0) return extensionDelta;
    const leftBpp = leftArea > 0 ? left.file_size / leftArea : 0;
    const rightBpp = rightArea > 0 ? right.file_size / rightArea : 0;
    if (leftBpp !== rightBpp) return rightBpp - leftBpp;
    if (left.file_size !== right.file_size) return right.file_size - left.file_size;
    return left.id.localeCompare(right.id);
}

function timestampValue(value: string | null): number {
    if (!value) return Number.NEGATIVE_INFINITY;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function compareRecency(left: AssetMetadata, right: AssetMetadata): number {
    const delta = timestampValue(right.exif_datetime ?? right.created_at)
        - timestampValue(left.exif_datetime ?? left.created_at);
    return delta !== 0 ? delta : left.id.localeCompare(right.id);
}

function selectRepresentative(
    items: readonly VisualSimilarityPresentationItem[],
    metadata: ReadonlyMap<string, AssetMetadata>,
    strategy: CollapseStage['representative'],
): VisualSimilarityPresentationItem {
    const comparator = strategy === 'quality' ? compareQuality : compareRecency;
    const ordered = [...items].sort((left, right) => {
        const leftMetadata = metadata.get(left.representativeAssetId);
        const rightMetadata = metadata.get(right.representativeAssetId);
        if (!leftMetadata || !rightMetadata) {
            return left.representativeAssetId.localeCompare(right.representativeAssetId);
        }
        return comparator(leftMetadata, rightMetadata);
    });
    const representative = ordered[0];
    if (!representative) {
        throw new Error('Cannot select a representative from an empty visual cluster.');
    }
    return representative;
}

function clusterKey(kind: VisualPolicy, memberKeys: readonly string[]): string {
    const digest = createHash('sha256').update([...memberKeys].sort().join('\n')).digest('hex');
    return `${kind}:${digest}`;
}

function collapseStage(
    db: DbHandle,
    items: readonly VisualSimilarityPresentationItem[],
    observations: readonly ObservationRow[],
    stage: CollapseStage,
): VisualSimilarityPresentationItem[] {
    const edges = buildPolicyEdges(items, observations, stage);
    const components = buildConnectedComponents(edges);
    if (components.length === 0) {
        return [...items];
    }

    const byKey = new Map(items.map((item) => [item.presentationKey, item]));
    const metadata = loadAssetMetadata(db, items.map((item) => item.representativeAssetId));
    const clusterByRepresentativeKey = new Map<string, VisualSimilarityPresentationItem>();
    const consumedKeys = new Set<string>();
    for (const component of components) {
        const members = component
            .map((key) => byKey.get(key))
            .filter((item): item is VisualSimilarityPresentationItem => Boolean(item));
        if (members.length < 2) {
            continue;
        }
        const representative = selectRepresentative(members, metadata, stage.representative);
        const assetIds = [...new Set(members.flatMap((member) => member.assetIds))]
            .sort((left, right) => left.localeCompare(right));
        clusterByRepresentativeKey.set(representative.presentationKey, {
            ...representative,
            presentationKey: clusterKey(stage.policy, members.map((member) => member.presentationKey)),
            relationshipKind: stage.policy,
            stackCount: assetIds.length,
            assetIds,
        });
        for (const member of members) {
            consumedKeys.add(member.presentationKey);
        }
    }

    const result: VisualSimilarityPresentationItem[] = [];
    for (const item of items) {
        const cluster = clusterByRepresentativeKey.get(item.presentationKey);
        if (cluster) {
            result.push(cluster);
        } else if (!consumedKeys.has(item.presentationKey)) {
            result.push(item);
        }
    }
    return result;
}

function buildAllVisualSimilarityPresentationItems(
    db: DbHandle,
    order: LibraryPresentationOrder,
): VisualSimilarityPresentationItem[] {
    const observations = loadObservations(db);
    const baseItems = loadBaseItems(db, order) as VisualSimilarityPresentationItem[];
    const nearItems = collapseStage(db, baseItems, observations, {
        policy: 'near_duplicate',
        threshold: 2,
        representative: 'quality',
    });
    return collapseStage(db, nearItems, observations, {
        policy: 'variant',
        threshold: 6,
        representative: 'recency',
    });
}

export function getVisualSimilarityPresentationPage(
    db: DbHandle,
    options: { limit: number; offset: number; order?: LibraryPresentationOrder },
): VisualSimilarityPresentationItem[] {
    const limit = Math.max(0, Math.trunc(options.limit));
    const offset = Math.max(0, Math.trunc(options.offset));
    const items = buildAllVisualSimilarityPresentationItems(db, options.order ?? 'default');
    return items.slice(offset, offset + limit);
}

export function countVisualSimilarityPresentationItems(db: DbHandle): number {
    return buildAllVisualSimilarityPresentationItems(db, 'default').length;
}
