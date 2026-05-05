import type {
    ReviewItemStatus,
    ReviewItemType,
    TagAssignmentSourceKind,
    TagDefinitionStatus,
} from './tagTypes';

export type CreateTagDefinitionParams = {
    id?: string;
    canonicalLabel: string;
    description?: string | null;
    status?: TagDefinitionStatus;
    category?: string | null;
}

export type CreateTagAliasParams = {
    id?: string;
    tagDefinitionId: string;
    aliasLabel: string;
}

export type RenameTagDefinitionParams = {
    tagDefinitionId: string;
    canonicalLabel: string;
    description?: string | null;
    category?: string | null;
}

export type MergeTagDefinitionsParams = {
    sourceTagDefinitionId: string;
    targetTagDefinitionId: string;
}

export type AssignTagToAssetParams = {
    assetId: string;
    tagDefinitionId: string;
    sourceKind: TagAssignmentSourceKind;
    sourceRecordId?: string | null;
    confidence?: number | null;
}

export type RemoveTagAssignmentParams = {
    assetId: string;
    tagDefinitionId: string;
    sourceKind?: TagAssignmentSourceKind;
}

export type CreateReviewItemParams = {
    id?: string;
    reviewItemType: ReviewItemType;
    subjectType: string;
    subjectId: string;
    payloadJson: string;
    status?: ReviewItemStatus;
    reviewerId?: string | null;
    reviewNote?: string | null;
    reviewedAt?: string | null;
}

export type TagAssignmentRecord = {
    tagDefinitionId: string;
    canonicalLabel: string;
    description: string | null;
    status: TagDefinitionStatus;
    category: string | null;
    sourceKind: TagAssignmentSourceKind;
    sourceRecordId: string | null;
    confidence: number | null;
    createdAt: string;
    updatedAt: string;
}

export type TagDefinitionRecord = {
    id: string;
    canonicalLabel: string;
    description: string | null;
    status: TagDefinitionStatus;
    category: string | null;
    createdAt: string;
    updatedAt: string;
    assignmentCount?: number;
}

export type TaggedAssetRecord = {
    assetId: string;
    sourceKind: TagAssignmentSourceKind;
    sourceRecordId: string | null;
    confidence: number | null;
    createdAt: string;
    updatedAt: string;
}

export type ReviewItemRecord = {
    id: string;
    reviewItemType: ReviewItemType;
    subjectType: string;
    subjectId: string;
    payloadJson: string;
    status: ReviewItemStatus;
    reviewerId: string | null;
    reviewNote: string | null;
    reviewedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export type TagAliasRecord = {
    id: string;
    tagDefinitionId: string;
    aliasLabel: string;
    createdAt: string;
}

export type ReviewItemFilterParams = {
    status?: ReviewItemStatus;
    reviewItemType?: ReviewItemType;
    subjectType?: string;
    subjectId?: string;
}
