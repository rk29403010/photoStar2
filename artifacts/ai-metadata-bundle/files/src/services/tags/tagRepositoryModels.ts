import type {
    ReviewItemStatus,
    ReviewItemType,
    TagAssignmentSourceKind,
    TagDefinitionStatus,
} from './tagTypes';

export interface CreateTagDefinitionParams {
    id?: string;
    canonicalLabel: string;
    description?: string | null;
    status?: TagDefinitionStatus;
    category?: string | null;
}

export interface CreateTagAliasParams {
    id?: string;
    tagDefinitionId: string;
    aliasLabel: string;
}

export interface RenameTagDefinitionParams {
    tagDefinitionId: string;
    canonicalLabel: string;
    description?: string | null;
    category?: string | null;
}

export interface MergeTagDefinitionsParams {
    sourceTagDefinitionId: string;
    targetTagDefinitionId: string;
}

export interface AssignTagToAssetParams {
    assetId: string;
    tagDefinitionId: string;
    sourceKind: TagAssignmentSourceKind;
    sourceRecordId?: string | null;
    confidence?: number | null;
}

export interface RemoveTagAssignmentParams {
    assetId: string;
    tagDefinitionId: string;
    sourceKind?: TagAssignmentSourceKind;
}

export interface CreateReviewItemParams {
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

export interface TagAssignmentRecord {
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

export interface TagDefinitionRecord {
    id: string;
    canonicalLabel: string;
    description: string | null;
    status: TagDefinitionStatus;
    category: string | null;
    createdAt: string;
    updatedAt: string;
    assignmentCount?: number;
}

export interface TaggedAssetRecord {
    assetId: string;
    sourceKind: TagAssignmentSourceKind;
    sourceRecordId: string | null;
    confidence: number | null;
    createdAt: string;
    updatedAt: string;
}

export interface ReviewItemRecord {
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

export interface TagAliasRecord {
    id: string;
    tagDefinitionId: string;
    aliasLabel: string;
    createdAt: string;
}

export interface ReviewItemFilterParams {
    status?: ReviewItemStatus;
    reviewItemType?: ReviewItemType;
    subjectType?: string;
    subjectId?: string;
}
