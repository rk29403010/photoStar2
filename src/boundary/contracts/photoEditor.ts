export type KnownPhotoEditTool =
    | 'adjust'
    | 'blur'
    | 'colour_pop'
    | 'crop'
    | 'dehaze'
    | 'effects'
    | 'focus'
    | 'grayscale'
    | 'overlay'
    | 'red_eye'
    | 'restore'
    | 'rotate'
    | 'sharpen';

/** A recipe may outlive the plug-in that created it. Keep unknown IDs intact. */
export type PhotoEditTool = KnownPhotoEditTool | (string & {});

export type NormalizedPoint = { x: number; y: number };
export type NormalizedBox = NormalizedPoint & { width: number; height: number };

export const PHOTO_ROTATION_FILL = {
    transparent: 0,
    black: 1,
    white: 2,
    ai: 3,
} as const;

export type PhotoRotationFillMode = typeof PHOTO_ROTATION_FILL[keyof typeof PHOTO_ROTATION_FILL];

export type PhotoEditMask = {
    id: string;
    name: string;
    kind: 'rectangle' | 'ellipse' | 'polygon' | 'subject' | 'background' | 'element' | 'raster';
    box?: NormalizedBox;
    points?: NormalizedPoint[];
    /** A normalized PNG alpha map preserves non-geometric analysis masks. */
    raster?: PhotoMaskRaster;
    inverted?: boolean;
    feather: number;
    source?: 'user' | 'automatic';
};

export type PhotoMaskRaster = {
    width: number;
    height: number;
    pngBase64: string;
};

/** Stable, analysis-owned geometry offered to the editor as a reusable mask. */
export type PhotoMaskMetadataItem = {
    id: string;
    label: string;
    description: string;
    kind: PhotoEditMask['kind'];
    box?: NormalizedBox;
    points?: NormalizedPoint[];
    raster?: PhotoMaskRaster;
    inverted?: boolean;
    source: {
        moduleId: string;
        referenceId: string;
    };
};

export type PhotoMaskMetadata = {
    schemaVersion: 1;
    masks: PhotoMaskMetadataItem[];
};

/** Additional library image composited into a multi-source edit operation. */
export type PhotoEditAssetLayer = {
    id: string;
    assetId: string;
    enabled: boolean;
    /** 0 is transparent and 1 is fully opaque. */
    opacity: number;
    /** Offset from centred placement, expressed as a fraction of output width/height. */
    offsetX: number;
    offsetY: number;
    /** 1 means contain the whole source image within the output canvas. */
    scale: number;
};

export type PhotoEditOperation = {
    id: string;
    tool: PhotoEditTool;
    name: string;
    enabled: boolean;
    maskId?: string | null;
    values: Record<string, number | boolean>;
    /** Optional external image inputs for compound tools such as Overlay photos. */
    assetLayers?: PhotoEditAssetLayer[];
    /** Version of the owning plug-in recipe. Absent values are legacy v1 recipes. */
    recipeVersion?: number;
};

export type PhotoEditDocument = {
    id: string;
    sourceAssetId: string;
    renderedAssetId: string | null;
    parentEditId: string | null;
    name: string;
    operations: PhotoEditOperation[];
    masks: PhotoEditMask[];
    status: 'draft' | 'rendered';
    createdAt: string;
    updatedAt: string;
};

export type PhotoEditStyle = {
    id: string;
    name: string;
    operations: PhotoEditOperation[];
    masks: PhotoEditMask[];
    /** Operations retained verbatim because their plug-in is not installed. */
    unavailableOperationIds?: string[];
    createdAt: string;
    updatedAt: string;
};

export type SavePhotoEditInput = Pick<PhotoEditDocument, 'id' | 'sourceAssetId' | 'name' | 'operations' | 'masks'> & {
    parentEditId?: string | null;
};

export type RenderPhotoEditInput = SavePhotoEditInput & {
    mode: 'new_version' | 'replace_rendered';
};

export type PhotoEditWorkspace = {
    document: PhotoEditDocument;
    styles: PhotoEditStyle[];
};
