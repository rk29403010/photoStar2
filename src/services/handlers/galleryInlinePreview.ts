import { readFileSync } from 'node:fs';

type GalleryAssetPreview = {
    id: string;
    original_path: string;
    preview_path?: string;
    preview_data_url?: string;
};

function getPreviewMimeType(previewPath: string) {
    const ext = previewPath.split('.').pop()?.toLowerCase() || '';
    if (ext === 'png') {return 'image/png';}
    if (ext === 'jpg' || ext === 'jpeg') {return 'image/jpeg';}
    if (ext === 'gif') {return 'image/gif';}
    return 'image/webp';
}

function toInlinePreviewDataUrl(previewPath: string | undefined) {
    if (!previewPath) {return undefined;}

    try {
        const bytes = readFileSync(previewPath);
        return `data:${getPreviewMimeType(previewPath)};base64,${bytes.toString('base64')}`;
    } catch {
        return undefined;
    }
}

export function attachInlinePreviewDataUrls<T extends GalleryAssetPreview>(assets: T[]) {
    const decoratedAssets = assets.map((asset) => ({
        ...asset,
        preview_data_url: toInlinePreviewDataUrl(asset.preview_path),
    }));

    return decoratedAssets as Array<T & { preview_data_url?: string }>;
}
