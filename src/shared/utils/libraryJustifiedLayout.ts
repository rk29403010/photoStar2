export interface JustifiedLayoutSourceItem {
    id: string;
    width?: number;
    height?: number;
}

export interface JustifiedLayoutItem {
    id: string;
    index: number;
    width: number;
    height: number;
    aspectRatio: number;
}

export interface JustifiedLayoutRow {
    items: JustifiedLayoutItem[];
    height: number;
    width: number;
}

export interface BuildJustifiedLayoutRowsOptions {
    containerWidth: number;
    gap?: number;
    targetRowHeight?: number;
    maxRowHeight?: number;
}

const DEFAULT_GAP = 2;
const DEFAULT_TARGET_ROW_HEIGHT = 170;
const DEFAULT_MAX_ROW_HEIGHT = 220;
const MIN_ASPECT_RATIO = 0.5;
const MAX_ASPECT_RATIO = 3;

function clampAspectRatio(value: number) {
    return Math.min(MAX_ASPECT_RATIO, Math.max(MIN_ASPECT_RATIO, value));
}

function getAspectRatio(item: Pick<JustifiedLayoutSourceItem, 'width' | 'height'>) {
    if (!item.width || !item.height || item.width <= 0 || item.height <= 0) {
        return 1;
    }

    return clampAspectRatio(item.width / item.height);
}

function buildRoundedWidths(aspectRatios: number[], rowHeight: number, contentWidth: number) {
    const widths = aspectRatios.map((ratio) => Math.max(1, Math.round(ratio * rowHeight)));
    const roundedTotal = widths.reduce((sum, width) => sum + width, 0);
    const delta = contentWidth - roundedTotal;

    if (delta !== 0) {
        widths[widths.length - 1] = Math.max(1, widths[widths.length - 1] + delta);
    }

    return widths;
}

function buildRow(
    items: Array<{ id: string; index: number; aspectRatio: number }>,
    options: Required<BuildJustifiedLayoutRowsOptions>,
    isLastRow: boolean,
): JustifiedLayoutRow {
    const gapWidth = options.gap * Math.max(0, items.length - 1);
    const ratioSum = items.reduce((sum, item) => sum + item.aspectRatio, 0);
    const targetContentWidth = Math.max(1, options.containerWidth - gapWidth);
    const stretchedHeight = Math.floor(targetContentWidth / ratioSum);
    const rowHeight = isLastRow
        ? options.targetRowHeight
        : Math.min(options.maxRowHeight, Math.max(1, stretchedHeight));
    const contentWidth = isLastRow
        ? Math.max(1, Math.round(ratioSum * rowHeight))
        : targetContentWidth;
    const widths = buildRoundedWidths(items.map((item) => item.aspectRatio), rowHeight, contentWidth);

    return {
        height: rowHeight,
        width: widths.reduce((sum, width) => sum + width, 0) + gapWidth,
        items: items.map((item, index) => ({
            id: item.id,
            index: item.index,
            width: widths[index],
            height: rowHeight,
            aspectRatio: item.aspectRatio,
        })),
    };
}

export function buildJustifiedLayoutRows(
    items: JustifiedLayoutSourceItem[],
    options: BuildJustifiedLayoutRowsOptions,
): JustifiedLayoutRow[] {
    const resolvedOptions: Required<BuildJustifiedLayoutRowsOptions> = {
        containerWidth: Math.max(1, Math.floor(options.containerWidth)),
        gap: options.gap ?? DEFAULT_GAP,
        targetRowHeight: options.targetRowHeight ?? DEFAULT_TARGET_ROW_HEIGHT,
        maxRowHeight: options.maxRowHeight ?? DEFAULT_MAX_ROW_HEIGHT,
    };
    const rows: JustifiedLayoutRow[] = [];
    let pendingRow: Array<{ id: string; index: number; aspectRatio: number }> = [];

    items.forEach((item, index) => {
        pendingRow.push({ id: item.id, index, aspectRatio: getAspectRatio(item) });
        const pendingWidth = pendingRow.reduce((sum, rowItem) => sum + (rowItem.aspectRatio * resolvedOptions.targetRowHeight), 0)
            + (resolvedOptions.gap * Math.max(0, pendingRow.length - 1));

        if (pendingRow.length > 1 && pendingWidth >= resolvedOptions.containerWidth) {
            rows.push(buildRow(pendingRow, resolvedOptions, false));
            pendingRow = [];
        }
    });

    if (pendingRow.length > 0) {
        rows.push(buildRow(pendingRow, resolvedOptions, true));
    }

    return rows;
}
