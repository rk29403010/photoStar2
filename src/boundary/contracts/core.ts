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

export interface StoredPhotoBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface FaceBox {
    box: StoredPhotoBox;
    embedding?: number[]; // Optional presence check
    person_id?: string;
    person_name?: string;
}

export interface AssetGroupMembership {
    group_id: string;
    group_role: string | null;
    stack_count: number | null;
    role: string | null;
    rank: number | null;
    match_evidence: Record<string, unknown> | string | null;
    group_type: string | null;
}

export interface SimilarityOrbitItem {
    kind: 'group' | 'asset';
    group_id: string;
    group_type: string | null;
    stack_count: number | null;
    asset: Asset;
}

export interface SimilarityOrbit {
    group_id: string;
    group_type: string | null;
    parent_group_id: string | null;
    items: SimilarityOrbitItem[];
}

export interface PhotoMetadataSourceSummary {
    sourceKind: string | null;
    sourceId: string | null;
}

export interface PhotoMetadataEstimatedDateProvenance extends PhotoMetadataSourceSummary {
    display_label?: PhotoMetadataSourceSummary;
    most_likely_date?: PhotoMetadataSourceSummary;
    min_date?: PhotoMetadataSourceSummary;
    max_date?: PhotoMetadataSourceSummary;
    rationale?: PhotoMetadataSourceSummary;
}

export interface PhotoMetadataQualityProvenance extends PhotoMetadataSourceSummary {
    technical?: PhotoMetadataSourceSummary;
    lighting?: PhotoMetadataSourceSummary;
    composition?: PhotoMetadataSourceSummary;
    emotional?: PhotoMetadataSourceSummary;
    discard?: PhotoMetadataSourceSummary;
}

export interface PhotoMetadataAuthenticityProvenance extends PhotoMetadataSourceSummary {
    score?: PhotoMetadataSourceSummary;
    reasons?: PhotoMetadataSourceSummary;
}

export interface PhotoMetadataProjectionDate {
    most_likely_date: string | null;
    min_date: string | null;
    max_date: string | null;
    display_label: string | null;
    rationale: string | null;
}

export interface PhotoMetadataProjectionQuality {
    technical: number | null;
    lighting: number | null;
    composition: number | null;
    emotional: number | null;
    discard: boolean | null;
}

export interface PhotoMetadataProjectionAuthenticity {
    score: number | null;
    reasons: string[];
}

export interface PhotoMetadataProjection {
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

export interface PhotoMetadataEvidencePayload {
    machineBlocks: unknown[];
    manualAssertions: unknown[];
}

export interface PhotoMetadataBundle {
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

export interface PhotoDateEstimateSignal {
    source: string;
    origin: 'embedded' | 'filename' | 'ai' | 'file';
    label: string;
    precision: 'exact' | 'year' | 'decade' | 'range';
    start: string;
    end: string;
    representativeAt: string;
    weight: number;
}

export interface PhotoDateEstimateArtifact {
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

export interface Asset {
    id: string;
    original_path: string; // Added this
    preview_path?: string;
    width?: number;
    height?: number;
    created_at?: string;
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

export interface Person {
    id: string;
    name: string;
    face_count: number;
    rejected_count?: number;
    cover_image?: string;
}

export interface LibraryTimelineBucket {
    label: string;
    startYear: number;
    endYear: number;
    startDate: string;
    endDate: string;
    count: number;
}

export interface LibraryTimelineSummary {
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

export interface LibraryStats {
    count: number;
    timeline?: LibraryTimelineSummary;
    [key: string]: unknown;
}

export interface Album {
    id: string;
    title: string;
    description: string | null;
    cover_asset_id: string | null;
    rules_json: string | null;
    created_at: string;
    item_count: number;
    cover_preview_path: string | null;
}
