import type { UiFeedEntry } from '@contracts/usePhotoLibrary.types';

type AssetWithPreview = {
    preview_path?: string | null;
};

type WorkflowStepLike = {
    nodeId: string;
    status: string;
    totalItems: number;
    completedItems: number;
};

type WorkflowRunDetailLike = {
    summary?: {
        status?: string;
    };
    steps?: WorkflowStepLike[];
};

const MAX_UI_FEED_ENTRIES = 120;
const PREVIEW_STEP_NODE_ID = 'generate-previews';

function formatCount(value: number): string {
    return new Intl.NumberFormat().format(value);
}

export function appendUiFeedEntry(entries: UiFeedEntry[], entry: UiFeedEntry, maxEntries = MAX_UI_FEED_ENTRIES): UiFeedEntry[] {
    const nextEntries = [...entries, entry];
    return nextEntries.length > maxEntries ? nextEntries.slice(nextEntries.length - maxEntries) : nextEntries;
}

export function countPreviewAssets<TAsset extends AssetWithPreview>(assets: TAsset[]): number {
    return assets.reduce((count, asset) => count + (asset.preview_path ? 1 : 0), 0);
}

export function buildIngestStatusMessage(detail: WorkflowRunDetailLike | null | undefined): string | null {
    if (!detail?.summary?.status) {
        return null;
    }

    const previewStep = detail.steps?.find((step) => step.nodeId === PREVIEW_STEP_NODE_ID);
    if (!previewStep) {
        return detail.summary.status === 'running' ? 'Scanning folder...' : null;
    }

    const completedItems = formatCount(previewStep.completedItems);
    const totalItems = formatCount(previewStep.totalItems);
    if (detail.summary.status === 'running') {
        return `Generating thumbnails ${completedItems}/${totalItems}`;
    }
    if (detail.summary.status === 'failed') {
        return `Thumbnail generation failed at ${completedItems}/${totalItems}`;
    }
    return null;
}

export function buildWorkflowPollDetail(detail: WorkflowRunDetailLike | null | undefined): string {
    if (!detail?.summary?.status) {
        return 'No workflow detail returned.';
    }

    const previewStep = detail.steps?.find((step) => step.nodeId === PREVIEW_STEP_NODE_ID);
    if (!previewStep) {
        return `run=${detail.summary.status}`;
    }

    return `run=${detail.summary.status}; previews=${previewStep.completedItems}/${previewStep.totalItems}; step=${previewStep.status}`;
}

function formatPreviewEventDetail(event: Record<string, unknown>): string {
    return `media=${String(event.mediaId ?? 'unknown')}; path=${String(event.path ?? 'missing')}`;
}

function formatMediaDiscoveredEventDetail(event: Record<string, unknown>): string {
    return `media=${String(event.mediaId ?? 'unknown')}; path=${String(event.filePath ?? 'missing')}`;
}

function formatAssetUpdatedEventDetail(event: Record<string, unknown>): string {
    return `asset=${String((event.asset as { id?: string } | undefined)?.id ?? 'unknown')}`;
}

const EVENT_FEED_DETAIL_BUILDERS: Record<string, (event: Record<string, unknown>) => string> = {
    PreviewGenerated: formatPreviewEventDetail,
    WorkflowPreviewGenerated: formatPreviewEventDetail,
    MediaDiscovered: formatMediaDiscoveredEventDetail,
    AssetUpdated: formatAssetUpdatedEventDetail,
};

export function buildEventFeedDetail(event: Record<string, unknown>): string {
    const type = String(event.type ?? 'UnknownEvent');
    return EVENT_FEED_DETAIL_BUILDERS[type]?.(event) ?? type;
}

function formatNumericField(value: number | undefined): string {
    return value === undefined ? '' : String(value);
}

export function formatUiFeedEntryForClipboard(entry: UiFeedEntry): string {
    return [
        entry.timestamp,
        entry.source,
        entry.label,
        entry.requestId ?? '',
        formatNumericField(entry.assetCount),
        formatNumericField(entry.previewCount),
        formatNumericField(entry.previousAssetCount),
        formatNumericField(entry.nextAssetCount),
        entry.applied === undefined ? '' : (entry.applied ? 'yes' : 'no'),
        entry.detail.replaceAll('\t', ' ').replaceAll('\n', ' '),
    ].join('\t');
}

export function formatUiFeedEntriesForClipboard(entries: UiFeedEntry[]): string {
    const header = [
        'timestamp',
        'source',
        'label',
        'requestId',
        'assetCount',
        'previewCount',
        'previousAssetCount',
        'nextAssetCount',
        'applied',
        'detail',
    ].join('\t');
    const rows = entries.map(formatUiFeedEntryForClipboard);
    return [header, ...rows].join('\n');
}
