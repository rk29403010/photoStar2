import type { UiFeedEntry } from '@contracts/usePhotoLibrary.types';
import {
    formatAssetDiagnosticLabel,
} from './diagnosticFormatting';

type AssetWithPreview = {
    preview_path?: string | null;
};

type WorkflowStepLike = {
    nodeId: string;
    status: string;
    totalItems: number;
    completedItems: number;
    errorMessage?: string;
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

export { shortenDiagnosticId } from './diagnosticFormatting';

function formatNodeLabel(nodeId: string): string {
    if (!nodeId) {
        return 'Workflow';
    }

    const label = nodeId.replace(/[-_]+/g, ' ');
    return label.charAt(0).toUpperCase() + label.slice(1);
}

export function appendUiFeedEntry(entries: UiFeedEntry[], entry: UiFeedEntry, maxEntries = MAX_UI_FEED_ENTRIES): UiFeedEntry[] {
    const nextEntries = [...entries, entry];
    return nextEntries.length > maxEntries ? nextEntries.slice(nextEntries.length - maxEntries) : nextEntries;
}

export function countPreviewAssets<TAsset extends AssetWithPreview>(assets: TAsset[]): number {
    return assets.reduce((count, asset) => count + (asset.preview_path ? 1 : 0), 0);
}

function buildFailedIngestStatusMessage(detail: WorkflowRunDetailLike, failedStep: WorkflowStepLike | undefined): string | null {
    if (detail.summary?.status !== 'failed') {
        return null;
    }
    if (!failedStep) {
        return null;
    }

    return failedStep.errorMessage
        ? `${formatNodeLabel(failedStep.nodeId)} failed: ${failedStep.errorMessage}`
        : `${formatNodeLabel(failedStep.nodeId)} failed.`;
}

function buildPreviewProgressMessage(detail: WorkflowRunDetailLike, previewStep: WorkflowStepLike | undefined): string | null {
    if (!previewStep) {
        return detail.summary?.status === 'running' ? 'Scanning folder...' : null;
    }

    const completedItems = formatCount(previewStep.completedItems);
    const totalItems = formatCount(previewStep.totalItems);
    if (detail.summary?.status === 'running') {
        return `Generating thumbnails ${completedItems}/${totalItems}`;
    }
    if (detail.summary?.status === 'failed') {
        return `Thumbnail generation failed at ${completedItems}/${totalItems}`;
    }
    return null;
}

export function buildIngestStatusMessage(detail: WorkflowRunDetailLike | null | undefined): string | null {
    if (!detail?.summary?.status) {
        return null;
    }

    const failedStep = detail.steps?.find((step) => step.status === 'failed');
    const failedMessage = buildFailedIngestStatusMessage(detail, failedStep);
    if (failedMessage) {
        return failedMessage;
    }

    const previewStep = detail.steps?.find((step) => step.nodeId === PREVIEW_STEP_NODE_ID);
    return buildPreviewProgressMessage(detail, previewStep);
}

export function buildWorkflowPollDetail(detail: WorkflowRunDetailLike | null | undefined): string {
    if (!detail?.summary?.status) {
        return 'No workflow detail returned.';
    }

    const failedStep = detail.steps?.find((step) => step.status === 'failed');
    if (failedStep) {
        return failedStep.errorMessage
            ? `run=${detail.summary.status}; failedStep=${failedStep.nodeId}; error=${failedStep.errorMessage}`
            : `run=${detail.summary.status}; failedStep=${failedStep.nodeId}`;
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
    return `refreshed asset=${formatAssetDiagnosticLabel(event.asset as {
        id?: unknown;
        original_path?: unknown;
        filePath?: unknown;
        path?: unknown;
    } | undefined)}`;
}

function formatAiMetadataConfigurationErrorDetail(event: Record<string, unknown>): string {
    return String(event.message ?? 'Live AI metadata is not configured.');
}

const EVENT_FEED_DETAIL_BUILDERS: Record<string, (event: Record<string, unknown>) => string> = {
    PreviewGenerated: formatPreviewEventDetail,
    WorkflowPreviewGenerated: formatPreviewEventDetail,
    MediaDiscovered: formatMediaDiscoveredEventDetail,
    AssetUpdated: formatAssetUpdatedEventDetail,
    AiMetadataConfigurationError: formatAiMetadataConfigurationErrorDetail,
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
