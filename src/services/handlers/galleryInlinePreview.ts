import { readFile } from 'node:fs/promises';

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

async function toInlinePreviewDataUrl(previewPath: string | undefined) {
    if (!previewPath) {return undefined;}

    try {
        const bytes = await readFile(previewPath);
        return `data:${getPreviewMimeType(previewPath)};base64,${bytes.toString('base64')}`;
    } catch {
        return undefined;
    }
}

export async function attachInlinePreviewDataUrls<T extends GalleryAssetPreview>(assets: T[]) {
    const decoratedAssets = await Promise.all(assets.map(async (asset) => ({
        ...asset,
        preview_data_url: await toInlinePreviewDataUrl(asset.preview_path),
    })));

    return decoratedAssets as Array<T & { preview_data_url?: string }>;
}
