export type PhotoEditTool =
    | 'adjust'
    | 'blur'
    | 'colour_pop'
    | 'crop'
    | 'dehaze'
    | 'grayscale'
    | 'restore'
    | 'rotate'
    | 'sharpen';

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
    kind: 'rectangle' | 'ellipse' | 'polygon' | 'subject' | 'background' | 'element';
    box?: NormalizedBox;
    points?: NormalizedPoint[];
    inverted?: boolean;
    feather: number;
    source?: 'user' | 'automatic';
};

export type PhotoEditOperation = {
    id: string;
    tool: PhotoEditTool;
    name: string;
    enabled: boolean;
    maskId?: string | null;
    values: Record<string, number | boolean>;
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
