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

export interface FaceBox {
    box: [number, number, number, number]; // [x1, y1, x2, y2] normalized 0-1
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

export interface Asset {
    id: string;
    original_path: string; // Added this
    preview_path?: string;
    width?: number;
    height?: number;
    created_at?: string;
    caption?: string;
    faces?: FaceBox[];
    face_embeddings?: boolean[]; // Simplified boolean array if matching face index
    ai_metadata?: Record<string, unknown>;

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

export interface LibraryStats {
    count: number;
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
