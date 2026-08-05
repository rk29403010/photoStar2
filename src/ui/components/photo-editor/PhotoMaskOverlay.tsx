import { Check, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { Asset, NormalizedBox, NormalizedPoint, PhotoEditMask } from '@contracts/core';
import { Button, IconButton } from '../Primitives';
import { buildPhotoMaskCandidates, instantiateMaskCandidate, type PhotoMaskCandidate } from './maskCandidates';

export type DrawMaskKind = 'ellipse' | 'polygon' | 'rectangle';

type Size = { height: number; width: number };
type BoxDrag = { start: NormalizedPoint };

type PhotoMaskOverlayProps = {
    readonly asset: Asset;
    readonly drawKind: DrawMaskKind | null;
    readonly masks: PhotoEditMask[];
    readonly previewUrl: string | null;
    readonly selectedMaskId: string | null;
    readonly onCancelDraw: () => void;
    readonly onCreate: (mask: PhotoEditMask) => void;
    readonly onSelect: (id: string) => void;
};

function useStageSize(rootRef: React.RefObject<HTMLDivElement | null>): Size {
    const [size, setSize] = useState<Size>({ height: 1, width: 1 });
    useEffect(() => {
        const root = rootRef.current;
        if (!root) {return undefined;}
        const update = () => setSize({ height: root.clientHeight, width: root.clientWidth });
        update();
        const observer = new ResizeObserver(update);
        observer.observe(root);
        return () => observer.disconnect();
    }, [rootRef]);
    return size;
}

function fittedSize(container: Size, image: Size | null): Size {
    if (!image) {return { height: 0, width: 0 };}
    const scale = Math.min(Math.max(0, container.width - 64) / image.width, Math.max(0, container.height - 64) / image.height, 1);
    return { height: image.height * scale, width: image.width * scale };
}

function localPoint(event: ReactPointerEvent<HTMLElement>): NormalizedPoint {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
        x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
        y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
}

function boxBetween(start: NormalizedPoint, end: NormalizedPoint): NormalizedBox {
    return {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
    };
}

function shapeClass(selected: boolean, highlighted: boolean, inverted: boolean | undefined): string {
    if (selected) {return inverted ? 'fill-brand-accent/10 stroke-brand-accent' : 'fill-brand-accent/30 stroke-brand-accent';}
    return highlighted ? 'fill-none stroke-brand-accent' : 'fill-none stroke-white/70';
}

function svgSafeId(id: string): string { return id.replaceAll(/[^a-zA-Z0-9_-]/g, '-'); }

function RasterMaskShape(props: { readonly mask: PhotoEditMask; readonly selected: boolean; readonly highlighted: boolean }) {
    const source = `data:image/png;base64,${props.mask.raster!.pngBase64}`;
    const filterId = `mask-outline-${svgSafeId(props.mask.id)}`;
    const color = props.selected || props.highlighted ? 'var(--color-brand-accent)' : 'white';
    return <>
        <filter id={filterId} x="-5%" y="-5%" width="110%" height="110%">
            <feMorphology in="SourceAlpha" operator="dilate" radius="1" result="expanded" />
            <feComposite in="expanded" in2="SourceAlpha" operator="out" result="outline" />
            <feFlood floodColor={color} result="outline-color" />
            <feComposite in="outline-color" in2="outline" operator="in" />
        </filter>
        <image href={source} x="0" y="0" width="100" height="100" preserveAspectRatio="none" filter={`url(#${filterId})`} />
        {props.selected && <image href={source} x="0" y="0" width="100" height="100" preserveAspectRatio="none" className="opacity-35" />}
    </>;
}

function VectorMaskShape({ mask, selected, highlighted }: { readonly mask: PhotoEditMask; readonly selected: boolean; readonly highlighted: boolean }) {
    const className = shapeClass(selected, highlighted, mask.inverted);
    const dash = mask.inverted ? '8 5' : undefined;
    if (mask.points && mask.points.length >= 3) {
        return <polygon points={mask.points.map((point) => `${point.x * 100},${point.y * 100}`).join(' ')} className={className} strokeDasharray={dash} strokeWidth={selected ? 0.7 : 0.4} vectorEffect="non-scaling-stroke" />;
    }
    const box = mask.box;
    if (!box) {return null;}
    if (mask.kind === 'ellipse' || mask.kind === 'subject') {
        return <ellipse cx={(box.x + box.width / 2) * 100} cy={(box.y + box.height / 2) * 100} rx={box.width * 50} ry={box.height * 50} className={className} strokeDasharray={dash} strokeWidth={selected ? 0.7 : 0.4} vectorEffect="non-scaling-stroke" />;
    }
    return <rect x={box.x * 100} y={box.y * 100} width={box.width * 100} height={box.height * 100} className={className} strokeDasharray={dash} strokeWidth={selected ? 0.7 : 0.4} vectorEffect="non-scaling-stroke" />;
}

function MaskShape({ mask, selected, highlighted = false }: { readonly mask: PhotoEditMask; readonly selected: boolean; readonly highlighted?: boolean }) {
    return mask.raster ? <RasterMaskShape mask={mask} selected={selected} highlighted={highlighted} /> : <VectorMaskShape mask={mask} selected={selected} highlighted={highlighted} />;
}

function pointInPolygon(point: NormalizedPoint, points: NormalizedPoint[]): boolean { let inside = false; for (let current = 0, previous = points.length - 1; current < points.length; previous = current, current += 1) { const a = points[current]; const b = points[previous]; const intersects = (a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x; if (intersects) {inside = !inside;} } return inside; }

type MaskHitTarget = { id: string; mask: Omit<PhotoEditMask, 'id'> | PhotoEditMask };
type RasterAlpha = { alpha: Uint8ClampedArray; height: number; width: number };

function loadRasterAlpha(target: MaskHitTarget, onLoad: (targetId: string, raster: RasterAlpha) => void, isCancelled: () => boolean) {
    const raster = target.mask.raster;
    if (!raster) {return;}
    const image = new Image();
    image.onload = () => {
        if (isCancelled()) {return;}
        const canvas = document.createElement('canvas');
        canvas.width = raster.width;
        canvas.height = raster.height;
        const context = canvas.getContext('2d');
        if (!context) {return;}
        context.drawImage(image, 0, 0);
        onLoad(target.id, { alpha: context.getImageData(0, 0, canvas.width, canvas.height).data, height: canvas.height, width: canvas.width });
    };
    image.src = `data:image/png;base64,${raster.pngBase64}`;
}

function isRasterHit(point: NormalizedPoint, raster: RasterAlpha): boolean {
    const x = Math.min(raster.width - 1, Math.floor(point.x * raster.width));
    const y = Math.min(raster.height - 1, Math.floor(point.y * raster.height));
    return raster.alpha[(y * raster.width + x) * 4 + 3] > 16;
}

function isVectorHit(point: NormalizedPoint, mask: MaskHitTarget['mask']): boolean {
    if (mask.points && mask.points.length >= 3) {return pointInPolygon(point, mask.points);}
    const box = mask.box;
    return Boolean(box && point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height);
}

function findHitTarget(targets: MaskHitTarget[], point: NormalizedPoint, rasterAlpha: Map<string, RasterAlpha>): string | null {
    for (const target of targets) {
        const raster = rasterAlpha.get(target.id);
        if (raster ? isRasterHit(point, raster) : isVectorHit(point, target.mask)) {return target.id;}
    }
    return null;
}

function useMaskHitTest(targets: MaskHitTarget[]) {
    const rasterAlpha = useRef(new Map<string, RasterAlpha>());
    useEffect(() => {
        let cancelled = false;
        rasterAlpha.current.clear();
        for (const target of targets) {loadRasterAlpha(target, (targetId, raster) => rasterAlpha.current.set(targetId, raster), () => cancelled);}
        return () => {cancelled = true;};
    }, [targets]);
    return (point: NormalizedPoint): string | null => findHitTarget(targets, point, rasterAlpha.current);
}

function CanvasMaskSelection(props: Pick<PhotoMaskOverlayProps, 'masks' | 'onCreate' | 'onSelect'> & { readonly candidates: PhotoMaskCandidate[]; readonly onHoverTargetChange: (targetId: string | null) => void }) {
    const targets = useMemo(() => [
        ...props.masks.map((mask) => ({ id: `saved-${mask.id}`, mask })),
        ...props.candidates.map((candidate) => ({ id: `candidate-${candidate.id}`, mask: candidate.mask })),
    ], [props.candidates, props.masks]);
    const hitTest = useMaskHitTest(targets);
    const targetAtEvent = (event: ReactPointerEvent<HTMLButtonElement>) => hitTest(localPoint(event));
    return <button type="button" aria-label="Select a detected or saved mask on the photo" className="absolute inset-0 cursor-pointer rounded-none border-0 bg-transparent p-0 focus-visible:ring-2 focus-visible:ring-white" onPointerMove={(event) => props.onHoverTargetChange(targetAtEvent(event))} onPointerLeave={() => props.onHoverTargetChange(null)} onPointerUp={(event) => {
        const hit = targetAtEvent(event);
        if (!hit) {return;}
        if (hit.startsWith('saved-')) {props.onSelect(hit.slice('saved-'.length)); return;}
        const candidate = props.candidates.find((item) => `candidate-${item.id}` === hit);
        if (candidate) {props.onCreate(instantiateMaskCandidate(candidate));}
    }} />;
}

function makeBoxMask(kind: Exclude<DrawMaskKind, 'polygon'>, box: NormalizedBox): PhotoEditMask {
    return {
        id: crypto.randomUUID(),
        name: kind === 'ellipse' ? 'Ellipse mask' : 'Rectangle mask',
        kind,
        box,
        feather: 0.02,
        inverted: false,
        source: 'user',
    };
}

function makePolygonMask(points: NormalizedPoint[]): PhotoEditMask {
    return { id: crypto.randomUUID(), name: 'Polygon mask', kind: 'polygon', points, feather: 0.02, inverted: false, source: 'user' };
}

function createKeyboardMask(kind: DrawMaskKind, points: NormalizedPoint[]): PhotoEditMask {
    if (kind !== 'polygon') {return makeBoxMask(kind, { x: 0.2, y: 0.2, width: 0.6, height: 0.6 });}
    const polygon = points.length >= 3 ? points : [{ x: 0.25, y: 0.2 }, { x: 0.8, y: 0.3 }, { x: 0.7, y: 0.8 }, { x: 0.2, y: 0.7 }];
    return makePolygonMask(polygon);
}

type DrawingOverlayProps = Pick<PhotoMaskOverlayProps, 'drawKind' | 'onCancelDraw' | 'onCreate'>;

function useBoxDrawing(props: Pick<DrawingOverlayProps, 'drawKind' | 'onCreate'>) {
    const dragRef = useRef<BoxDrag | null>(null);
    const [draftBox, setDraftBox] = useState<NormalizedBox | null>(null);
    useEffect(() => {setDraftBox(null);}, [props.drawKind]);
    const startBox = (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (!props.drawKind || props.drawKind === 'polygon') {return;}
        const start = localPoint(event);
        dragRef.current = { start };
        setDraftBox({ ...start, width: 0, height: 0 });
        event.currentTarget.setPointerCapture(event.pointerId);
    };
    const moveBox = (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (dragRef.current) {setDraftBox(boxBetween(dragRef.current.start, localPoint(event)));}
    };
    const finishBox = (event: ReactPointerEvent<HTMLButtonElement>) => {
        const drag = dragRef.current;
        if (!drag || !props.drawKind || props.drawKind === 'polygon') {return;}
        const box = boxBetween(drag.start, localPoint(event));
        dragRef.current = null;
        if (box.width >= 0.01 && box.height >= 0.01) {props.onCreate(makeBoxMask(props.drawKind, box));}
        else {setDraftBox(null);}
    };
    const cancelBox = () => {dragRef.current = null; setDraftBox(null);};
    return { cancelBox, draftBox, finishBox, moveBox, startBox };
}

function usePolygonDrawing(drawKind: DrawMaskKind | null) {
    const [points, setPoints] = useState<NormalizedPoint[]>([]);
    useEffect(() => {setPoints([]);}, [drawKind]);
    const addPoint = (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (drawKind !== 'polygon') {return;}
        const point = localPoint(event);
        setPoints((current) => [...current, point]);
    };
    return { addPoint, points };
}

function handleDrawKey(event: ReactKeyboardEvent<HTMLButtonElement>, props: DrawingOverlayProps, points: NormalizedPoint[]) {
    if (event.key === 'Escape') {props.onCancelDraw();}
    if (event.key === 'Enter' && props.drawKind) {props.onCreate(createKeyboardMask(props.drawKind, points));}
}

function DrawingOverlay(props: DrawingOverlayProps) {
    const boxDrawing = useBoxDrawing(props);
    const polygonDrawing = usePolygonDrawing(props.drawKind);
    return <div className="absolute inset-0 z-20">
        <button
            type="button"
            aria-label={`Draw ${props.drawKind} mask on photo`}
            className="absolute inset-0 cursor-crosshair touch-none bg-transparent focus-visible:ring-2 focus-visible:ring-brand-accent"
            onPointerDown={props.drawKind === 'polygon' ? polygonDrawing.addPoint : boxDrawing.startBox}
            onPointerMove={boxDrawing.moveBox}
            onPointerUp={boxDrawing.finishBox}
            onPointerCancel={boxDrawing.cancelBox}
            onKeyDown={(event) => handleDrawKey(event, props, polygonDrawing.points)}
        >
            <span className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
                <span className="rounded bg-surface/90 px-2 py-1 text-xs text-content shadow-sm">
                    {props.drawKind === 'polygon' ? 'Click to place points, then finish the polygon' : `Drag to draw ${props.drawKind === 'ellipse' ? 'an' : 'a'} ${props.drawKind} mask`}
                </span>
            </span>
            <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
                {boxDrawing.draftBox && <MaskShape selected mask={makeBoxMask(props.drawKind === 'ellipse' ? 'ellipse' : 'rectangle', boxDrawing.draftBox)} />}
                {polygonDrawing.points.length > 0 && <><polyline points={polygonDrawing.points.map((point) => `${point.x * 100},${point.y * 100}`).join(' ')} className="fill-none stroke-brand-accent" strokeWidth="0.7" vectorEffect="non-scaling-stroke" />{polygonDrawing.points.map((point) => <circle key={`${point.x}-${point.y}`} cx={point.x * 100} cy={point.y * 100} r="0.9" className="fill-brand-accent stroke-white" strokeWidth="0.3" />)}</>}
            </svg>
        </button>
        {props.drawKind === 'polygon' && <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2" onPointerDown={(event) => event.stopPropagation()}>
            <Button type="button" disabled={polygonDrawing.points.length < 3} onClick={() => props.onCreate(makePolygonMask(polygonDrawing.points))}><Check aria-hidden="true" size={16} />Finish polygon</Button>
            <IconButton aria-label="Cancel mask drawing" onClick={props.onCancelDraw}><X aria-hidden="true" size={16} /></IconButton>
        </div>}
    </div>;
}

export function PhotoMaskOverlay(props: PhotoMaskOverlayProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const [imageSize, setImageSize] = useState<Size | null>(null);
    const container = useStageSize(rootRef);
    const stage = useMemo(() => fittedSize(container, imageSize), [container, imageSize]);
    const candidates = useMemo(() => buildPhotoMaskCandidates(props.asset), [props.asset]);
    const [hoveredTargetId, setHoveredTargetId] = useState<string | null>(null);
    return <div ref={rootRef} className="relative flex h-full w-full items-center justify-center overflow-hidden p-8">
        {props.previewUrl && <img role="presentation" className="hidden" src={props.previewUrl} alt="" onLoad={(event) => setImageSize({ height: event.currentTarget.naturalHeight, width: event.currentTarget.naturalWidth })} />}
        {props.previewUrl && imageSize
            ? <div data-mask-canvas="true" className="relative overflow-hidden shadow-xl" style={{ height: stage.height, width: stage.width }}>
                <img draggable={false} width={imageSize.width} height={imageSize.height} className="h-full w-full select-none object-fill" src={props.previewUrl} alt="Mask editing preview" />
                <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
                    {candidates.map((candidate) => <MaskShape key={`candidate-${candidate.id}`} mask={{ ...candidate.mask, id: candidate.id }} selected={false} highlighted={hoveredTargetId === `candidate-${candidate.id}`} />)}
                    {props.masks.map((mask) => <MaskShape key={mask.id} mask={mask} selected={mask.id === props.selectedMaskId} highlighted={hoveredTargetId === `saved-${mask.id}`} />)}
                </svg>
                {!props.drawKind && <CanvasMaskSelection candidates={candidates} masks={props.masks} onCreate={props.onCreate} onSelect={props.onSelect} onHoverTargetChange={setHoveredTargetId} />}
                {props.drawKind && <DrawingOverlay drawKind={props.drawKind} onCancelDraw={props.onCancelDraw} onCreate={props.onCreate} />}
            </div>
            : <span className="text-content-secondary">Preparing mask canvas…</span>}
    </div>;
}
