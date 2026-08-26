import { useEffect, useMemo, useState } from 'react';
import type { Asset, PhotoEditOperation } from '@contracts/core';
import type { PhotoEditAssetLayer } from '../../../../../boundary/contracts/photoEditor.ts';
import { globalRequest } from '@ui/hooks/usePhotoLibrary';
import type { PhotoEditToolControlProps, PhotoEditToolUiPlugin } from '../../../../../ui/components/photo-editor/photoEditToolUiRegistry.ts';

const PAGE_SIZE = 48;
type CandidatePage = { assets: Asset[]; hasMore: boolean };
type LayerSelection = { operation: PhotoEditOperation; selectedLayerId: string | null };

function filename(path: string): string {
    return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function errorText(reason: unknown): string {
    return reason instanceof Error ? reason.message : String(reason);
}

async function fetchCandidates(offset: number): Promise<CandidatePage> {
    if (!globalRequest) {throw new Error('Photo library is not connected');}
    return globalRequest<CandidatePage>({
        idPrefix: `photo_overlay_candidates_${offset}_${Date.now()}`,
        command: 'get_assets',
        payload: { offset, limit: PAGE_SIZE, withGroupCounts: false, detailLevel: 'gallery' },
        timeoutMs: 15000,
        select: (data) => ({ assets: (data?.assets as Asset[] | undefined) ?? [], hasMore: Boolean(data?.hasMore) }),
    });
}

function RangeControl(props: {
    readonly id: string;
    readonly label: string;
    readonly value: number;
    readonly display: string;
    readonly min: number;
    readonly max: number;
    readonly step: number;
    readonly onChange: (value: number) => void;
    readonly onCommit: () => void;
}) {
    return (
        <label className="block space-y-1 text-xs text-content-secondary" htmlFor={props.id}>
            <span className="flex items-center justify-between gap-2"><span>{props.label}</span><span className="tabular-nums text-content">{props.display}</span></span>
            <input id={props.id} className="w-full accent-brand-accent" type="range" min={props.min} max={props.max} step={props.step} value={props.value}
                onInput={(event) => props.onChange(Number(event.currentTarget.value))} onPointerUp={props.onCommit} onKeyUp={props.onCommit} />
        </label>
    );
}

function patchLayer(operation: PhotoEditOperation, index: number, patch: Partial<PhotoEditAssetLayer>): PhotoEditOperation {
    const layers = operation.assetLayers ?? [];
    if (index < 0 || index >= layers.length) {return operation;}
    const nextLayers = [...layers];
    nextLayers[index] = { ...nextLayers[index], ...patch };
    return { ...operation, assetLayers: nextLayers };
}

function addAssetLayer(operation: PhotoEditOperation, assetId: string, currentAssetId: string | undefined, selectedLayerId: string | null): LayerSelection {
    const layers = operation.assetLayers ?? [];
    if (assetId === currentAssetId) {return { operation, selectedLayerId };}
    const existing = layers.find((layer) => layer.assetId === assetId);
    if (existing) {return { operation, selectedLayerId: existing.id };}
    const layer: PhotoEditAssetLayer = { id: crypto.randomUUID(), assetId, enabled: true, opacity: 0.5, offsetX: 0, offsetY: 0, scale: 1 };
    return { operation: { ...operation, assetLayers: [...layers, layer] }, selectedLayerId: layer.id };
}

function removeLayer(operation: PhotoEditOperation, selectedLayerId: string | null): LayerSelection {
    const layers = operation.assetLayers ?? [];
    const nextLayers = layers.filter((layer) => layer.id !== selectedLayerId);
    return { operation: { ...operation, assetLayers: nextLayers }, selectedLayerId: nextLayers[0]?.id ?? null };
}

function moveLayer(operation: PhotoEditOperation, index: number, delta: -1 | 1): PhotoEditOperation {
    const layers = operation.assetLayers ?? [];
    const target = index + delta;
    if (index < 0 || target < 0 || target >= layers.length) {return operation;}
    const nextLayers = [...layers];
    [nextLayers[index], nextLayers[target]] = [nextLayers[target], nextLayers[index]];
    return { ...operation, assetLayers: nextLayers };
}

function selectedLayer(layers: PhotoEditAssetLayer[], selectedLayerId: string | null): { layer?: PhotoEditAssetLayer; index: number } {
    const index = layers.findIndex((layer) => layer.id === selectedLayerId);
    return { layer: index >= 0 ? layers[index] : undefined, index };
}

function useSyncedOverlayDraft(operation: PhotoEditOperation) {
    const [draft, setDraft] = useState<PhotoEditOperation>(operation);
    const [selectedLayerId, setSelectedLayerId] = useState<string | null>(operation.assetLayers?.[0]?.id ?? null);
    useEffect(() => {
        setDraft(operation);
        const incoming = operation.assetLayers ?? [];
        setSelectedLayerId((current) => incoming.some((layer) => layer.id === current) ? current : (incoming[0]?.id ?? null));
    }, [operation]);
    return { draft, setDraft, selectedLayerId, setSelectedLayerId };
}

function useOverlayLayerEditor(props: PhotoEditToolControlProps) {
    const state = useSyncedOverlayDraft(props.operation);
    const layers = useMemo(() => state.draft.assetLayers ?? [], [state.draft.assetLayers]);
    const usedAssetIds = useMemo(() => new Set(layers.map((layer) => layer.assetId)), [layers]);
    const selection = selectedLayer(layers, state.selectedLayerId);
    const preview = (next: PhotoEditOperation) => { state.setDraft(next); props.onPreviewChange(next); };
    const commit = (next: PhotoEditOperation) => { state.setDraft(next); props.onPreviewChange(next); props.onCommit(next); };
    const updateLayer = (patch: Partial<PhotoEditAssetLayer>) => preview(patchLayer(state.draft, selection.index, patch));
    const commitLayer = (patch: Partial<PhotoEditAssetLayer>) => commit(patchLayer(state.draft, selection.index, patch));
    const addLayer = (asset: Asset) => {
        const next = addAssetLayer(state.draft, asset.id, props.asset?.id, state.selectedLayerId);
        state.setSelectedLayerId(next.selectedLayerId);
        commit(next.operation);
    };
    const removeSelected = () => {
        const next = removeLayer(state.draft, state.selectedLayerId);
        state.setSelectedLayerId(next.selectedLayerId);
        commit(next.operation);
    };
    const moveSelected = (delta: -1 | 1) => commit(moveLayer(state.draft, selection.index, delta));
    const resetSelected = () => commitLayer({ opacity: 0.5, scale: 1, offsetX: 0, offsetY: 0 });
    const commitDraft = () => props.onCommit(state.draft);
    return { draft: state.draft, layers, usedAssetIds, selected: selection.layer, selectedIndex: selection.index, selectedLayerId: state.selectedLayerId, setSelectedLayerId: state.setSelectedLayerId, addLayer, updateLayer, commitLayer, commitDraft, removeSelected, moveSelected, resetSelected };
}

function mergeCandidatePages(current: Asset[], incoming: Asset[]): Asset[] {
    const known = new Set(current.map((asset) => asset.id));
    return [...current, ...incoming.filter((asset) => !known.has(asset.id))];
}

function useCandidatePage(currentAssetId: string | undefined) {
    const [candidates, setCandidates] = useState<Asset[]>([]);
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        void fetchCandidates(0).then((page) => {
            if (!cancelled) {setCandidates(page.assets); setHasMore(page.hasMore);}
        }).catch((reason: unknown) => {
            if (!cancelled) {setError(errorText(reason));}
        }).finally(() => {
            if (!cancelled) {setLoading(false);}
        });
        return () => {cancelled = true;};
    }, [currentAssetId]);
    return { candidates, setCandidates, hasMore, setHasMore, loading, setLoading, error, setError };
}

function useCandidateLoadMore(page: ReturnType<typeof useCandidatePage>) {
    return async () => {
        if (page.loading || !page.hasMore) {return;}
        page.setLoading(true);
        page.setError(null);
        try {
            const next = await fetchCandidates(page.candidates.length);
            page.setCandidates((current) => mergeCandidatePages(current, next.assets));
            page.setHasMore(next.hasMore);
        } catch (reason) {
            page.setError(errorText(reason));
        } finally {
            page.setLoading(false);
        }
    };
}

function useCandidateAssets(currentAssetId: string | undefined, query: string) {
    const page = useCandidatePage(currentAssetId);
    const assetById = useMemo(() => new Map(page.candidates.map((asset) => [asset.id, asset])), [page.candidates]);
    const filtered = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase();
        return page.candidates.filter((asset) => asset.id !== currentAssetId && (!needle || filename(asset.original_path).toLocaleLowerCase().includes(needle)));
    }, [page.candidates, currentAssetId, query]);
    return { assetById, filtered, hasMore: page.hasMore, loading: page.loading, error: page.error, loadMore: useCandidateLoadMore(page) };
}

function LayerThumbnail({ asset, name }: { readonly asset?: Asset; readonly name: string }) {
    return asset?.preview_data_url
        ? <img className="size-10 shrink-0 rounded-md object-cover" src={asset.preview_data_url} alt={name} />
        : <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-secondary text-xs text-content-secondary">IMG</div>;
}

function LayerList(props: {
    readonly layers: PhotoEditAssetLayer[];
    readonly assetById: Map<string, Asset>;
    readonly selectedLayerId: string | null;
    readonly onSelect: (id: string) => void;
}) {
    if (props.layers.length === 0) {return null;}
    return <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-content-secondary"><span>Layers</span><span>back → front</span></div>
        <div className="space-y-1">{props.layers.map((layer) => {
            const asset = props.assetById.get(layer.assetId);
            const name = asset ? filename(asset.original_path) : layer.assetId;
            const selected = props.selectedLayerId === layer.id;
            return <button key={layer.id} type="button" className={`flex w-full items-center gap-2 rounded-lg border p-2 text-left ${selected ? 'border-brand-accent bg-brand-accent/10' : 'border-content/10 hover:bg-surface-secondary'}`} onClick={() => props.onSelect(layer.id)}>
                <LayerThumbnail asset={asset} name={name} />
                <span className="min-w-0 flex-1 truncate text-xs text-content">{name}</span>
                <span className="text-xs tabular-nums text-content-secondary">{Math.round(layer.opacity * 100)}%</span>
            </button>;
        })}</div>
    </div>;
}

function LayerSettings(props: {
    readonly layer: PhotoEditAssetLayer;
    readonly index: number;
    readonly layerCount: number;
    readonly onPatch: (patch: Partial<PhotoEditAssetLayer>) => void;
    readonly onCommit: () => void;
    readonly onToggle: (enabled: boolean) => void;
    readonly onMove: (delta: -1 | 1) => void;
    readonly onRemove: () => void;
    readonly onReset: () => void;
}) {
    const layer = props.layer;
    return <div className="space-y-3 rounded-lg border border-content/10 p-3">
        <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded-md border border-content/15 px-2 py-1 text-xs hover:bg-surface-secondary disabled:opacity-40" disabled={props.index === 0} onClick={() => props.onMove(-1)}>Send backward</button>
            <button type="button" className="rounded-md border border-content/15 px-2 py-1 text-xs hover:bg-surface-secondary disabled:opacity-40" disabled={props.index === props.layerCount - 1} onClick={() => props.onMove(1)}>Bring forward</button>
            <button type="button" className="ml-auto rounded-md border border-content/15 px-2 py-1 text-xs hover:bg-surface-secondary" onClick={props.onRemove}>Remove</button>
        </div>
        <label className="flex items-center gap-2 text-xs text-content"><input type="checkbox" checked={layer.enabled} onChange={(event) => props.onToggle(event.currentTarget.checked)} />Show this photo</label>
        <RangeControl id={`${layer.id}-opacity`} label="Opacity" value={layer.opacity} display={`${Math.round(layer.opacity * 100)}%`} min={0} max={1} step={0.01} onChange={(value) => props.onPatch({ opacity: value })} onCommit={props.onCommit} />
        <RangeControl id={`${layer.id}-scale`} label="Scale" value={layer.scale} display={`${Math.round(layer.scale * 100)}%`} min={0.1} max={4} step={0.01} onChange={(value) => props.onPatch({ scale: value })} onCommit={props.onCommit} />
        <RangeControl id={`${layer.id}-x`} label="Horizontal" value={layer.offsetX} display={`${Math.round(layer.offsetX * 100)}%`} min={-1} max={1} step={0.01} onChange={(value) => props.onPatch({ offsetX: value })} onCommit={props.onCommit} />
        <RangeControl id={`${layer.id}-y`} label="Vertical" value={layer.offsetY} display={`${Math.round(layer.offsetY * 100)}%`} min={-1} max={1} step={0.01} onChange={(value) => props.onPatch({ offsetY: value })} onCommit={props.onCommit} />
        <button type="button" className="w-full rounded-md border border-content/15 px-2 py-1.5 text-xs hover:bg-surface-secondary" onClick={props.onReset}>Reset layer</button>
    </div>;
}

function PhotoPicker(props: {
    readonly operationId: string;
    readonly assets: Asset[];
    readonly usedAssetIds: Set<string>;
    readonly query: string;
    readonly onQuery: (value: string) => void;
    readonly onAdd: (asset: Asset) => void;
    readonly hasMore: boolean;
    readonly loading: boolean;
    readonly error: string | null;
    readonly onLoadMore: () => void;
}) {
    return <div className="space-y-2 border-t border-content/10 pt-3">
        <label className="block text-xs text-content-secondary" htmlFor={`${props.operationId}-photo-search`}>Add another photo</label>
        <input id={`${props.operationId}-photo-search`} type="search" className="w-full rounded-lg border border-content/15 bg-surface px-3 py-2 text-sm text-content" value={props.query} placeholder="Filter loaded photos by filename" onChange={(event) => props.onQuery(event.currentTarget.value)} />
        {props.error && <p className="text-xs text-red-500">{props.error}</p>}
        <div className="grid grid-cols-3 gap-2">{props.assets.map((asset) => {
            const used = props.usedAssetIds.has(asset.id);
            const name = filename(asset.original_path);
            return <button key={asset.id} type="button" disabled={used} title={name} className="overflow-hidden rounded-lg border border-content/10 text-left hover:border-brand-accent disabled:opacity-35" onClick={() => props.onAdd(asset)}>
                {asset.preview_data_url ? <img className="aspect-square w-full object-cover" src={asset.preview_data_url} alt={name} /> : <div className="flex aspect-square w-full items-center justify-center bg-surface-secondary text-xs text-content-secondary">IMG</div>}
                <span className="block truncate px-1.5 py-1 text-[11px] text-content">{used ? 'Added' : name}</span>
            </button>;
        })}</div>
        {props.assets.length === 0 && !props.loading && <p className="text-xs text-content-secondary">No matching photos in the loaded library page.</p>}
        {props.hasMore && <button type="button" className="w-full rounded-md border border-content/15 px-3 py-2 text-xs hover:bg-surface-secondary disabled:opacity-50" disabled={props.loading} onClick={props.onLoadMore}>{props.loading ? 'Loading…' : 'Load more photos'}</button>}
    </div>;
}

export function OverlayControls(props: PhotoEditToolControlProps) {
    const [query, setQuery] = useState('');
    const editor = useOverlayLayerEditor(props);
    const candidates = useCandidateAssets(props.asset?.id, query);
    return <div className="space-y-4">
        <div className="rounded-lg border border-content/10 bg-surface-secondary/60 p-3 text-xs leading-5 text-content-secondary">
            The current photo is the 100% base. Added photos start centred at 50% opacity. Edits later in the Changes stack affect the combined result; move Overlay photos earlier when you want later crop, black &amp; white or other edits applied to the whole composition.
        </div>
        <LayerList layers={editor.layers} assetById={candidates.assetById} selectedLayerId={editor.selectedLayerId} onSelect={editor.setSelectedLayerId} />
        {editor.selected && <LayerSettings layer={editor.selected} index={editor.selectedIndex} layerCount={editor.layers.length} onPatch={editor.updateLayer} onCommit={editor.commitDraft} onToggle={(enabled) => editor.commitLayer({ enabled })} onMove={editor.moveSelected} onRemove={editor.removeSelected} onReset={editor.resetSelected} />}
        <PhotoPicker operationId={editor.draft.id} assets={candidates.filtered} usedAssetIds={editor.usedAssetIds} query={query} onQuery={setQuery} onAdd={editor.addLayer} hasMore={candidates.hasMore} loading={candidates.loading} error={candidates.error} onLoadMore={() => void candidates.loadMore()} />
    </div>;
}

const overlayUiPlugin: PhotoEditToolUiPlugin = { id: 'overlay', Controls: OverlayControls };
export default overlayUiPlugin;
