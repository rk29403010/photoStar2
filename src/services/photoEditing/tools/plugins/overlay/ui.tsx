import { useEffect, useMemo, useState } from 'react';
import type { Asset, PhotoEditOperation } from '@contracts/core';
import type { PhotoEditAssetLayer } from '../../../../../boundary/contracts/photoEditor.ts';
import { globalRequest } from '@ui/hooks/usePhotoLibrary';
import type { PhotoEditToolControlProps, PhotoEditToolUiPlugin } from '../../../../../ui/components/photo-editor/photoEditToolUiRegistry.ts';

const PAGE_SIZE = 48;
type CandidatePage = { assets: Asset[]; hasMore: boolean };

function filename(path: string): string {
    return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

async function fetchCandidates(offset: number): Promise<CandidatePage> {
    if (!globalRequest) {throw new Error('Photo library is not connected');}
    return globalRequest<CandidatePage>({
        idPrefix: `photo_overlay_candidates_${offset}_${Date.now()}`,
        command: 'get_assets',
        payload: { offset, limit: PAGE_SIZE, withGroupCounts: false, detailLevel: 'gallery' },
        timeoutMs: 15000,
        select: (data) => ({
            assets: (data?.assets as Asset[] | undefined) ?? [],
            hasMore: Boolean(data?.hasMore),
        }),
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
            <span className="flex items-center justify-between gap-2">
                <span>{props.label}</span>
                <span className="tabular-nums text-content">{props.display}</span>
            </span>
            <input
                id={props.id}
                className="w-full accent-brand-accent"
                type="range"
                min={props.min}
                max={props.max}
                step={props.step}
                value={props.value}
                onInput={(event) => props.onChange(Number(event.currentTarget.value))}
                onPointerUp={props.onCommit}
                onKeyUp={props.onCommit}
            />
        </label>
    );
}

function LayerThumbnail({ asset }: { readonly asset?: Asset }) {
    return asset?.preview_data_url
        ? <img className="size-10 shrink-0 rounded-md object-cover" src={asset.preview_data_url} alt="" />
        : <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-secondary text-xs text-content-secondary">IMG</div>;
}

export function OverlayControls(props: PhotoEditToolControlProps) {
    const [draft, setDraft] = useState<PhotoEditOperation>(props.operation);
    const [selectedLayerId, setSelectedLayerId] = useState<string | null>(props.operation.assetLayers?.[0]?.id ?? null);
    const [candidates, setCandidates] = useState<Asset[]>([]);
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState('');

    useEffect(() => {
        setDraft(props.operation);
        const layers = props.operation.assetLayers ?? [];
        setSelectedLayerId((current) => layers.some((layer) => layer.id === current) ? current : (layers[0]?.id ?? null));
    }, [props.operation]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        void fetchCandidates(0).then((page) => {
            if (cancelled) {return;}
            setCandidates(page.assets);
            setHasMore(page.hasMore);
        }).catch((reason: unknown) => {
            if (!cancelled) {setError(reason instanceof Error ? reason.message : String(reason));}
        }).finally(() => {
            if (!cancelled) {setLoading(false);}
        });
        return () => {cancelled = true;};
    }, [props.asset?.id]);

    const layers = draft.assetLayers ?? [];
    const assetById = useMemo(() => new Map(candidates.map((asset) => [asset.id, asset])), [candidates]);
    const usedAssetIds = useMemo(() => new Set(layers.map((layer) => layer.assetId)), [layers]);
    const selectedIndex = layers.findIndex((layer) => layer.id === selectedLayerId);
    const selected = selectedIndex >= 0 ? layers[selectedIndex] : undefined;
    const filteredCandidates = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase();
        return candidates.filter((asset) => asset.id !== props.asset?.id && (!needle || filename(asset.original_path).toLocaleLowerCase().includes(needle)));
    }, [candidates, props.asset?.id, query]);

    const preview = (next: PhotoEditOperation) => {
        setDraft(next);
        props.onPreviewChange(next);
    };
    const commit = (next: PhotoEditOperation) => {
        setDraft(next);
        props.onPreviewChange(next);
        props.onCommit(next);
    };
    const updateLayer = (index: number, patch: Partial<PhotoEditAssetLayer>) => {
        if (index < 0) {return;}
        const nextLayers = [...layers];
        nextLayers[index] = { ...nextLayers[index], ...patch };
        preview({ ...draft, assetLayers: nextLayers });
    };
    const addLayer = (asset: Asset) => {
        if (asset.id === props.asset?.id || usedAssetIds.has(asset.id)) {return;}
        const layer: PhotoEditAssetLayer = {
            id: crypto.randomUUID(),
            assetId: asset.id,
            enabled: true,
            opacity: 0.5,
            offsetX: 0,
            offsetY: 0,
            scale: 1,
        };
        setSelectedLayerId(layer.id);
        commit({ ...draft, assetLayers: [...layers, layer] });
    };
    const removeLayer = (id: string) => {
        const nextLayers = layers.filter((layer) => layer.id !== id);
        setSelectedLayerId(nextLayers[0]?.id ?? null);
        commit({ ...draft, assetLayers: nextLayers });
    };
    const moveSelected = (delta: -1 | 1) => {
        const target = selectedIndex + delta;
        if (selectedIndex < 0 || target < 0 || target >= layers.length) {return;}
        const nextLayers = [...layers];
        [nextLayers[selectedIndex], nextLayers[target]] = [nextLayers[target], nextLayers[selectedIndex]];
        commit({ ...draft, assetLayers: nextLayers });
    };
    const loadMore = async () => {
        if (loading || !hasMore) {return;}
        setLoading(true);
        setError(null);
        try {
            const page = await fetchCandidates(candidates.length);
            setCandidates((current) => {
                const known = new Set(current.map((asset) => asset.id));
                return [...current, ...page.assets.filter((asset) => !known.has(asset.id))];
            });
            setHasMore(page.hasMore);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="rounded-lg border border-content/10 bg-surface-secondary/60 p-3 text-xs leading-5 text-content-secondary">
                The current photo is the 100% base. Added photos start centred at 50% opacity. Edits later in the Changes stack affect the combined result; move Overlay photos earlier when you want later crop, black &amp; white or other edits applied to the whole composition.
            </div>

            {layers.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-content-secondary"><span>Layers</span><span>back → front</span></div>
                    <div className="space-y-1">
                        {layers.map((layer) => {
                            const asset = assetById.get(layer.assetId);
                            const name = asset ? filename(asset.original_path) : layer.assetId;
                            return (
                                <button
                                    key={layer.id}
                                    type="button"
                                    className={`flex w-full items-center gap-2 rounded-lg border p-2 text-left ${selectedLayerId === layer.id ? 'border-brand-accent bg-brand-accent/10' : 'border-content/10 hover:bg-surface-secondary'}`}
                                    onClick={() => setSelectedLayerId(layer.id)}
                                >
                                    <LayerThumbnail asset={asset} />
                                    <span className="min-w-0 flex-1 truncate text-xs text-content">{name}</span>
                                    <span className="text-xs tabular-nums text-content-secondary">{Math.round(layer.opacity * 100)}%</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {selected && (
                <div className="space-y-3 rounded-lg border border-content/10 p-3">
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className="rounded-md border border-content/15 px-2 py-1 text-xs hover:bg-surface-secondary disabled:opacity-40" disabled={selectedIndex === 0} onClick={() => moveSelected(-1)}>Send backward</button>
                        <button type="button" className="rounded-md border border-content/15 px-2 py-1 text-xs hover:bg-surface-secondary disabled:opacity-40" disabled={selectedIndex === layers.length - 1} onClick={() => moveSelected(1)}>Bring forward</button>
                        <button type="button" className="ml-auto rounded-md border border-content/15 px-2 py-1 text-xs hover:bg-surface-secondary" onClick={() => removeLayer(selected.id)}>Remove</button>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-content">
                        <input type="checkbox" checked={selected.enabled} onChange={(event) => {
                            const nextLayers = [...layers];
                            nextLayers[selectedIndex] = { ...selected, enabled: event.currentTarget.checked };
                            commit({ ...draft, assetLayers: nextLayers });
                        }} />
                        Show this photo
                    </label>
                    <RangeControl id={`${selected.id}-opacity`} label="Opacity" value={selected.opacity} display={`${Math.round(selected.opacity * 100)}%`} min={0} max={1} step={0.01} onChange={(value) => updateLayer(selectedIndex, { opacity: value })} onCommit={() => props.onCommit(draft)} />
                    <RangeControl id={`${selected.id}-scale`} label="Scale" value={selected.scale} display={`${Math.round(selected.scale * 100)}%`} min={0.1} max={4} step={0.01} onChange={(value) => updateLayer(selectedIndex, { scale: value })} onCommit={() => props.onCommit(draft)} />
                    <RangeControl id={`${selected.id}-x`} label="Horizontal" value={selected.offsetX} display={`${Math.round(selected.offsetX * 100)}%`} min={-1} max={1} step={0.01} onChange={(value) => updateLayer(selectedIndex, { offsetX: value })} onCommit={() => props.onCommit(draft)} />
                    <RangeControl id={`${selected.id}-y`} label="Vertical" value={selected.offsetY} display={`${Math.round(selected.offsetY * 100)}%`} min={-1} max={1} step={0.01} onChange={(value) => updateLayer(selectedIndex, { offsetY: value })} onCommit={() => props.onCommit(draft)} />
                    <button type="button" className="w-full rounded-md border border-content/15 px-2 py-1.5 text-xs hover:bg-surface-secondary" onClick={() => {
                        const nextLayers = [...layers];
                        nextLayers[selectedIndex] = { ...selected, opacity: 0.5, scale: 1, offsetX: 0, offsetY: 0 };
                        commit({ ...draft, assetLayers: nextLayers });
                    }}>Reset layer</button>
                </div>
            )}

            <div className="space-y-2 border-t border-content/10 pt-3">
                <label className="block text-xs text-content-secondary" htmlFor={`${draft.id}-photo-search`}>Add another photo</label>
                <input id={`${draft.id}-photo-search`} type="search" className="w-full rounded-lg border border-content/15 bg-surface px-3 py-2 text-sm text-content" value={query} placeholder="Filter loaded photos by filename" onChange={(event) => setQuery(event.currentTarget.value)} />
                {error && <p className="text-xs text-red-500">{error}</p>}
                <div className="grid grid-cols-3 gap-2">
                    {filteredCandidates.map((asset) => {
                        const used = usedAssetIds.has(asset.id);
                        return (
                            <button key={asset.id} type="button" disabled={used} title={filename(asset.original_path)} className="overflow-hidden rounded-lg border border-content/10 text-left hover:border-brand-accent disabled:opacity-35" onClick={() => addLayer(asset)}>
                                {asset.preview_data_url
                                    ? <img className="aspect-square w-full object-cover" src={asset.preview_data_url} alt="" />
                                    : <div className="flex aspect-square w-full items-center justify-center bg-surface-secondary text-xs text-content-secondary">IMG</div>}
                                <span className="block truncate px-1.5 py-1 text-[11px] text-content">{used ? 'Added' : filename(asset.original_path)}</span>
                            </button>
                        );
                    })}
                </div>
                {filteredCandidates.length === 0 && !loading && <p className="text-xs text-content-secondary">No matching photos in the loaded library page.</p>}
                {hasMore && <button type="button" className="w-full rounded-md border border-content/15 px-3 py-2 text-xs hover:bg-surface-secondary disabled:opacity-50" disabled={loading} onClick={() => void loadMore()}>{loading ? 'Loading…' : 'Load more photos'}</button>}
            </div>
        </div>
    );
}

const overlayUiPlugin: PhotoEditToolUiPlugin = { id: 'overlay', Controls: OverlayControls };
export default overlayUiPlugin;
