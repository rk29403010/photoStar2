export type LegacyAssetTags = {
    assetId: string;
    tags: string[];
}

export type LegacyTagInventoryEntry = {
    normalizedLabel: string;
    count: number;
    assetIds: string[];
    rawLabels: string[];
}

export type LegacyTagMappingDecision = {
    normalizedLabel: string;
    canonicalLabel: string;
    rawLabels: string[];
}

export type LegacyTagReviewItem = {
    normalizedLabel: string;
    rawLabels: string[];
    assetIds: string[];
    reviewItemType: 'tag_proposal';
}

export type LegacyMigratedAssignment = {
    assetId: string;
    tagDefinitionId: string;
    sourceKind: 'legacy_ai';
    sourceRecordId: null;
    confidence: null;
}

function dedupeSorted(values: Iterable<string>) {
    return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

export function normalizeLegacyLabel(label: string) {
    return label
        .trim()
        .toLowerCase()
        .replaceAll(/['’]/g, '')
        .replaceAll(/[^a-z0-9]+/g, ' ')
        .replaceAll(/\s+/g, ' ')
        .trim();
}

export function inventoryLegacyTags(legacyAssets: LegacyAssetTags[]) {
    const inventory = new Map<string, { count: number; assetIds: Set<string>; rawLabels: Set<string> }>();

    for (const asset of legacyAssets) {
        const seenForAsset = new Set<string>();
        for (const rawTag of asset.tags) {
            const normalizedLabel = normalizeLegacyLabel(rawTag);
            if (!normalizedLabel || seenForAsset.has(normalizedLabel)) {continue;}
            seenForAsset.add(normalizedLabel);

            const entry = inventory.get(normalizedLabel) ?? {
                count: 0,
                assetIds: new Set<string>(),
                rawLabels: new Set<string>(),
            };
            entry.count += 1;
            entry.assetIds.add(asset.assetId);
            entry.rawLabels.add(rawTag.trim());
            inventory.set(normalizedLabel, entry);
        }
    }

    return Array.from(inventory.entries())
        .map(([normalizedLabel, entry]) => ({
            normalizedLabel,
            count: entry.count,
            assetIds: dedupeSorted(entry.assetIds),
            rawLabels: dedupeSorted(entry.rawLabels),
        }))
        .sort((left, right) => left.normalizedLabel.localeCompare(right.normalizedLabel));
}

export function buildMigrationDecisions(params: {
    inventory: LegacyTagInventoryEntry[];
    approvedLabels: string[];
    explicitAliases?: Record<string, string>;
}) {
    const approvedLabelMap = new Map(
        params.approvedLabels.map((label) => [normalizeLegacyLabel(label), label]),
    );
    const explicitAliases = new Map(
        Object.entries(params.explicitAliases ?? {}).map(([legacyLabel, canonicalLabel]) => [
            normalizeLegacyLabel(legacyLabel),
            canonicalLabel,
        ]),
    );

    const mappings: LegacyTagMappingDecision[] = [];
    const reviewItems: LegacyTagReviewItem[] = [];

    for (const entry of params.inventory) {
        const canonicalLabel = explicitAliases.get(entry.normalizedLabel) ?? approvedLabelMap.get(entry.normalizedLabel);
        if (canonicalLabel) {
            mappings.push({
                normalizedLabel: entry.normalizedLabel,
                canonicalLabel,
                rawLabels: entry.rawLabels,
            });
            continue;
        }

        reviewItems.push({
            normalizedLabel: entry.normalizedLabel,
            rawLabels: entry.rawLabels,
            assetIds: entry.assetIds,
            reviewItemType: 'tag_proposal',
        });
    }

    return { mappings, reviewItems };
}

export function migrateLegacyAssignments(params: {
    legacyAssets: LegacyAssetTags[];
    mappings: LegacyTagMappingDecision[];
    canonicalLabelToId: Record<string, string>;
}) {
    const mappingByNormalizedLabel = new Map(
        params.mappings.map((mapping) => [mapping.normalizedLabel, mapping.canonicalLabel]),
    );
    const assignments: LegacyMigratedAssignment[] = [];
    const reviewItems: Array<{
        reviewItemType: 'tag_proposal';
        subjectType: 'asset';
        subjectId: string;
        normalizedLabel: string;
        payloadJson: string;
    }> = [];

    for (const asset of params.legacyAssets) {
        const assignedTagIds = new Set<string>();
        const queuedReviews = new Set<string>();
        for (const rawTag of asset.tags) {
            const normalizedLabel = normalizeLegacyLabel(rawTag);
            if (!normalizedLabel) {continue;}

            const canonicalLabel = mappingByNormalizedLabel.get(normalizedLabel);
            if (!canonicalLabel) {
                if (queuedReviews.has(normalizedLabel)) {continue;}
                queuedReviews.add(normalizedLabel);
                reviewItems.push({
                    reviewItemType: 'tag_proposal',
                    subjectType: 'asset',
                    subjectId: asset.assetId,
                    normalizedLabel,
                    payloadJson: JSON.stringify({
                        proposedLabel: rawTag.trim(),
                        normalizedLabel,
                    }),
                });
                continue;
            }

            const tagDefinitionId = params.canonicalLabelToId[canonicalLabel];
            if (!tagDefinitionId || assignedTagIds.has(tagDefinitionId)) {continue;}
            assignedTagIds.add(tagDefinitionId);
            assignments.push({
                assetId: asset.assetId,
                tagDefinitionId,
                sourceKind: 'legacy_ai',
                sourceRecordId: null,
                confidence: null,
            });
        }
    }

    return { assignments, reviewItems };
}
