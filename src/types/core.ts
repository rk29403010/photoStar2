export type TileIntent = 'utility' | 'normal' | 'emphasis' | 'hero';

export interface FaceBox {
    box: [number, number, number, number]; // [x1, y1, x2, y2] normalized 0-1
    embedding?: number[]; // Optional presence check
}

export interface Asset {
    id: string;
    original_path: string; // Added this
    preview_path?: string;
    width?: number;
    height?: number;
    created_at?: string;
    faces?: FaceBox[];
    face_embeddings?: boolean[]; // Simplified boolean array if matching face index

    // Scoring & Analysis (Future proofing A5)
    aesthetic_score?: number;
    sharpness_score?: number;

    // Layout Derived Properties
    intent?: TileIntent;

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
    cover_image?: string;
}

export interface LibraryStats {
    count: number;
    [key: string]: unknown;
}
