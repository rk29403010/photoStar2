export type TagDefinitionStatus = 'active' | 'retired';

export type TagAssignmentSourceKind = 'manual' | 'system' | 'ai' | 'legacy_ai';

export type ReviewItemStatus = 'pending' | 'approved' | 'rejected' | 'dismissed' | 'superseded';

export type ReviewItemType = 'tag_proposal' | 'group_merge' | 'sensitivity_override_candidate';

export interface TagDefinition {
    id: string;
    canonicalLabel: string;
    description?: string | null;
    status: TagDefinitionStatus;
    category?: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface TagAlias {
    id: string;
    tagDefinitionId: string;
    aliasLabel: string;
    createdAt: string;
}

export interface AssetTagAssignment {
    assetId: string;
    tagDefinitionId: string;
    sourceKind: TagAssignmentSourceKind;
    sourceRecordId?: string | null;
    confidence?: number | null;
    createdAt: string;
    updatedAt: string;
}

export interface ReviewItem {
    id: string;
    reviewItemType: ReviewItemType;
    subjectType: string;
    subjectId: string;
    payloadJson: string;
    status: ReviewItemStatus;
    reviewerId?: string | null;
    reviewNote?: string | null;
    reviewedAt?: string | null;
    createdAt: string;
    updatedAt: string;
}
