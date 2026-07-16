import { Check, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { NormalizedBox, NormalizedPoint, PhotoEditMask } from '@contracts/core';
import { Button, IconButton } from '../Primitives';

export type DrawMaskKind = 'ellipse' | 'polygon' | 'rectangle';

type Size = { height: number; width: number };
type BoxDrag = { start: NormalizedPoint };

type PhotoMaskOverlayProps = {
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

function pointsBox(points: NormalizedPoint[]): NormalizedBox | null {
    if (points.length === 0) {return null;}
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function maskBox(mask: PhotoEditMask): NormalizedBox | null {
    return mask.points && mask.points.length >= 3 ? pointsBox(mask.points) : mask.box ?? null;
}

function shapeClass(selected: boolean, inverted: boolean | undefined): string {
    if (selected) {return inverted ? 'fill-brand-accent/10 stroke-brand-accent' : 'fill-brand-accent/30 stroke-brand-accent';}
    return 'fill-brand-accent/10 stroke-white/70';
}

function MaskShape({ mask, selected }: { readonly mask: PhotoEditMask; readonly selected: boolean }) {
    const className = shapeClass(selected, mask.inverted);
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

function MaskSelectionButtons(props: Pick<PhotoMaskOverlayProps, 'masks' | 'onSelect' | 'selectedMaskId'>) {
    return <>{props.masks.map((mask) => {
        const box = maskBox(mask);
        if (!box) {return null;}
        const style: CSSProperties = { height: `${box.height * 100}%`, left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%` };
        return <button key={mask.id} type="button" aria-label={`Select ${mask.name} mask`} aria-pressed={props.selectedMaskId === mask.id} className="absolute rounded-none border-0 bg-transparent p-0 focus-visible:ring-2 focus-visible:ring-white" style={style} onClick={() => props.onSelect(mask.id)} />;
    })}</>;
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
    return <div ref={rootRef} className="relative flex h-full w-full items-center justify-center overflow-hidden p-8">
        {props.previewUrl && <img role="presentation" className="hidden" src={props.previewUrl} alt="" onLoad={(event) => setImageSize({ height: event.currentTarget.naturalHeight, width: event.currentTarget.naturalWidth })} />}
        {props.previewUrl && imageSize
            ? <div data-mask-canvas="true" className="relative overflow-hidden shadow-xl" style={{ height: stage.height, width: stage.width }}>
                <img draggable={false} width={imageSize.width} height={imageSize.height} className="h-full w-full select-none object-fill" src={props.previewUrl} alt="Mask editing preview" />
                <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
                    {props.masks.map((mask) => <MaskShape key={mask.id} mask={mask} selected={mask.id === props.selectedMaskId} />)}
                </svg>
                {!props.drawKind && <MaskSelectionButtons masks={props.masks} selectedMaskId={props.selectedMaskId} onSelect={props.onSelect} />}
                {props.drawKind && <DrawingOverlay drawKind={props.drawKind} onCancelDraw={props.onCancelDraw} onCreate={props.onCreate} />}
            </div>
            : <span className="text-content-secondary">Preparing mask canvas…</span>}
    </div>;
}
