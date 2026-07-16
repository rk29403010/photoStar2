export type {
    TimelineGroupId,
    TimelineGroupSummary,
    TimelineGroupRow,
    TimelineGroupAssetItem,
    TimelineGroupItem,
    TimelineGalleryPage,
    TimelineJumpTarget,
} from './timelineGallery';
export type {
    NormalizedBox,
    NormalizedPoint,
    PhotoEditDocument,
    PhotoEditMask,
    PhotoEditOperation,
    PhotoEditStyle,
    PhotoEditTool,
    PhotoEditWorkspace,
    PhotoRotationFillMode,
    RenderPhotoEditInput,
    SavePhotoEditInput,
} from './photoEditor';
export { PHOTO_ROTATION_FILL } from './photoEditor';

export type TileIntent = 'utility' | 'normal' | 'emphasis' | 'hero';

export const PERSON_COLORS = [
    '#fbbf24', // yellow
    '#22c55e', // green
    '#ef4444', // red
    '#38bdf8', // cyan
    '#c084fc', // purple
    '#f472b6', // pink
    '#a3e635'  // lime
];

export type StoredPhotoBox = {
    x: number;
    y: number;
    width: number;
    height: number;
}

export type FaceBox = {
    box: StoredPhotoBox;
    embedding?: number[]; // Optional presence check
    person_id?: string;
    person_name?: string;
}

export type AssetGroupMembership = {
    group_id: string;
    group_role: string | null;
    stack_count: number | null;
    role: string | null;
    rank: number | null;
    match_evidence: Record<string, unknown> | string | null;
    group_type: string | null;
}

export type SimilarityOrbitItem = {
    kind: 'group' | 'asset';
    group_id: string;
    group_type: string | null;
    stack_count: number | null;
    asset: Asset;
}

export type SimilarityOrbit = {
    group_id: string;
    group_type: string | null;
    parent_group_id: string | null;
    items: SimilarityOrbitItem[];
}

export type PhotoMetadataSourceSummary = {
    sourceKind: string | null;
    sourceId: string | null;
}

export type PhotoMetadataEstimatedDateProvenance = {
    display_label?: PhotoMetadataSourceSummary;
    most_likely_date?: PhotoMetadataSourceSummary;
    min_date?: PhotoMetadataSourceSummary;
    max_date?: PhotoMetadataSourceSummary;
    rationale?: PhotoMetadataSourceSummary;
} & PhotoMetadataSourceSummary

export type PhotoMetadataQualityProvenance = {
    technical?: PhotoMetadataSourceSummary;
    lighting?: PhotoMetadataSourceSummary;
    composition?: PhotoMetadataSourceSummary;
    emotional?: PhotoMetadataSourceSummary;
    discard?: PhotoMetadataSourceSummary;
} & PhotoMetadataSourceSummary

export type PhotoMetadataAuthenticityProvenance = {
    score?: PhotoMetadataSourceSummary;
    reasons?: PhotoMetadataSourceSummary;
} & PhotoMetadataSourceSummary

export type PhotoMetadataProjectionDate = {
    most_likely_date: string | null;
    min_date: string | null;
    max_date: string | null;
    display_label: string | null;
    rationale: string | null;
}

export type PhotoMetadataProjectionQuality = {
    technical: number | null;
    lighting: number | null;
    composition: number | null;
    emotional: number | null;
    discard: boolean | null;
}

export type PhotoMetadataProjectionAuthenticity = {
    score: number | null;
    reasons: string[];
}

export type PhotoMetadataProjection = {
    assetId: string;
    type: string | null;
    caption: string | null;
    description: string | null;
    location: string | null;
    estimatedDate: PhotoMetadataProjectionDate;
    keywords: string[];
    emotionalImpact: string | null;
    quality: PhotoMetadataProjectionQuality;
    recommendedEnhancements: string[];
    authenticity: PhotoMetadataProjectionAuthenticity;
    subjects: unknown[];
    regionsOfInterest: unknown[];
}

export type PhotoMetadataEvidencePayload = {
    machineBlocks: unknown[];
    manualAssertions: unknown[];
}

export type AssetTag = {
    tagDefinitionId: string;
    canonicalLabel: string;
    description: string | null;
    status: 'active' | 'retired';
    category: string | null;
    sourceKind: 'manual' | 'system' | 'ai' | 'legacy_ai';
    sourceRecordId: string | null;
    confidence: number | null;
    createdAt: string;
    updatedAt: string;
}

export type TagDefinitionSummary = {
    id: string;
    canonicalLabel: string;
    description: string | null;
    status: 'active' | 'retired';
    category: string | null;
    createdAt: string;
    updatedAt: string;
    assignmentCount?: number;
}

export type TagAliasSummary = {
    id: string;
    tagDefinitionId: string;
    aliasLabel: string;
    createdAt: string;
}

export type ReviewItemSummary = {
    id: string;
    reviewItemType: 'tag_proposal' | 'group_merge' | 'sensitivity_override_candidate';
    subjectType: string;
    subjectId: string;
    payloadJson: string;
    status: 'pending' | 'approved' | 'rejected' | 'dismissed' | 'superseded';
    reviewerId?: string | null;
    reviewNote?: string | null;
    reviewedAt?: string | null;
    createdAt: string;
    updatedAt: string;
}

export type PhotoMetadataBundle = {
    projection: PhotoMetadataProjection;
    provenance?: Partial<Record<keyof Omit<PhotoMetadataProjection, 'assetId' | 'estimatedDate' | 'quality' | 'authenticity' | 'subjects' | 'regionsOfInterest'>, PhotoMetadataSourceSummary>> & {
        estimatedDate?: PhotoMetadataEstimatedDateProvenance;
        quality?: PhotoMetadataQualityProvenance;
        authenticity?: PhotoMetadataAuthenticityProvenance;
        subjects?: PhotoMetadataSourceSummary;
        regionsOfInterest?: PhotoMetadataSourceSummary;
    };
    evidence?: PhotoMetadataEvidencePayload;
}

export type PhotoDateEstimateSignal = {
    source: string;
    origin: 'embedded' | 'filename' | 'ai' | 'file';
    label: string;
    precision: 'exact' | 'year' | 'decade' | 'range';
    start: string;
    end: string;
    representativeAt: string;
    weight: number;
}

export type PhotoDateEstimateArtifact = {
    schema_version: number;
    photoCreatedAt: string;
    range: {
        start: string;
        end: string;
    };
    confidence: {
        score: number;
        reasons: string[];
    };
    signals: PhotoDateEstimateSignal[];
}

export type FrameDetectionData = {
    type: 'rectangle' | 'polygon';
    box?: { x: number; y: number; width: number; height: number };
    points?: Array<{ x: number; y: number }>;
}

export type Asset = {
    id: string;
    original_path: string; // Added this
    preview_path?: string;
    preview_data_url?: string;
    file_size?: number | null;
    width?: number;
    height?: number;
    created_at?: string;
    binned_at?: string | null;
    photo_created_at?: string | null;
    photo_created_at_confidence?: number | null;
    exif_datetime?: string | null;
    metadata_timestamp_source?: string | null;
    caption?: string;
    faces?: FaceBox[];
    face_embeddings?: boolean[]; // Simplified boolean array if matching face index
    ai_metadata?: Record<string, unknown>;
    photo_metadata?: PhotoMetadataBundle | null;
    embedded_metadata?: Record<string, unknown>;
    photo_date_estimate?: PhotoDateEstimateArtifact;
    tags?: AssetTag[];
    pending_review_items?: ReviewItemSummary[];
    frame_detection?: FrameDetectionData | null;

    // Scoring & Analysis (Future proofing A5)
    aesthetic_score?: number;
    sharpness_score?: number;
    sensitivity_score?: number;        // 0-100, AI generated
    sensitivity_status?: string | null; // manual override: 'safe' | 'review' | 'unsafe' | null

    // Layout Derived Properties
    intent?: TileIntent;

    // Grouping Properties
    group_id?: string | null;
    group_role?: string | null;
    stack_count?: number | null;
    role?: string | null;
    rank?: number | null;
    match_evidence?: Record<string, unknown> | string | null;
    group_memberships?: AssetGroupMembership[];

    // Progressive Enhancement State (Masonry Gallery)
    processingPhase?: 0 | 1 | 2;
    layoutCapabilities?: {
        canCropSafely?: boolean;
        canSpanColumns?: boolean;
        prefersMount?: boolean; // For "Document Calming"
        heroEligible?: boolean;
    };

    // Debug/Manual Overrides
    manualState?: {
        forceDocument?: boolean;
        forceHero?: boolean;
    };
}

export type Person = {
    id: string;
    name: string;
    face_count: number;
    rejected_count?: number;
    cover_image?: string;
    birth_date?: string;
    death_date?: string;
    gedcom_links?: Array<{ treeId: string; personId: string }>;
}

export type LibraryTimelineBucket = {
    label: string;
    startYear: number;
    endYear: number;
    startDate: string;
    endDate: string;
    count: number;
}

export type LibraryTimelineSummary = {
    firstPhotoDate: string | null;
    lastPhotoDate: string | null;
    datedPhotoCount: number;
    unknownDateCount: number;
    buckets: LibraryTimelineBucket[];
}

export type GalleryTimelineSeek =
    | {
        kind: 'dated';
        targetDate: string;
    }
    | {
        kind: 'unknown';
    };

export type LibraryStats = {
    count: number;
    timeline?: LibraryTimelineSummary;
    groupedTimeline?: LibraryTimelineSummary;
    ungroupedTimeline?: LibraryTimelineSummary;
    [key: string]: unknown;
}

export type Album = {
    id: string;
    title: string;
    description: string | null;
    cover_asset_id: string | null;
    rules_json: string | null;
    is_system?: boolean;
    system_kind?: 'bin' | null;
    created_at: string;
    item_count: number;
    cover_preview_path: string | null;
}
