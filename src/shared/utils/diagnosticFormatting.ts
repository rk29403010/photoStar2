function normalizePathSeparators(value: string): string {
    return value.replace(/\\/g, '/');
}

export function shortenDiagnosticId(value: unknown): string {
    if (typeof value !== 'string') {
        return 'unknown';
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return 'unknown';
    }

    if (trimmed.length <= 12) {
        return trimmed;
    }

    return `${trimmed.slice(0, 4)}--${trimmed.slice(-4)}`;
}

export function getDiagnosticFilename(value: unknown): string {
    if (typeof value !== 'string') {
        return 'unknown';
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return 'unknown';
    }

    const normalized = normalizePathSeparators(trimmed);
    return normalized.split('/').pop() ?? trimmed;
}

export function isDiagnosticIdKey(key: string): boolean {
    return key === 'id' || key.endsWith('Id') || key.endsWith('_id');
}

export function isDiagnosticPathKey(key: string): boolean {
    return key === 'path'
        || key === 'filePath'
        || key === 'original_path'
        || key === 'preview_path'
        || key.endsWith('Path')
        || key.endsWith('_path');
}

export function formatAssetDiagnosticLabel(asset: {
    id?: unknown;
    original_path?: unknown;
    filePath?: unknown;
    path?: unknown;
} | null | undefined): string {
    const assetId = shortenDiagnosticId(asset?.id);
    const filename = getDiagnosticFilename(asset?.original_path ?? asset?.filePath ?? asset?.path);

    return filename === 'unknown'
        ? assetId
        : `${assetId} (${filename})`;
}
