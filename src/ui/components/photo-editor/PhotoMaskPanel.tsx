import { Circle, Eye, EyeOff, Pentagon, ScanLine, ScanSearch, Square, X } from 'lucide-react';
import { useMemo } from 'react';
import type { Asset, PhotoEditMask } from '@contracts/core';
import { Button, IconButton, Input } from '../Primitives';
import type { DrawMaskKind } from './PhotoMaskOverlay';
import { buildPhotoMaskCandidates, instantiateMaskCandidate } from './maskCandidates';

type PhotoMaskPanelProps = {
    readonly asset: Asset;
    readonly drawKind: DrawMaskKind | null;
    readonly masks: PhotoEditMask[];
    readonly selectedMaskId: string | null;
    readonly onChange: (masks: PhotoEditMask[]) => void;
    readonly onDrawKindChange: (kind: DrawMaskKind | null) => void;
    readonly onSelect: (id: string | null) => void;
};

const DRAW_TOOLS = [
    { icon: Square, kind: 'rectangle' as const, label: 'Rectangle' },
    { icon: Circle, kind: 'ellipse' as const, label: 'Ellipse' },
    { icon: Pentagon, kind: 'polygon' as const, label: 'Polygon' },
];

function MaskEditor(props: {
    readonly mask: PhotoEditMask;
    readonly selected: boolean;
    readonly onDelete: () => void;
    readonly onSelect: () => void;
    readonly onUpdate: (partial: Partial<PhotoEditMask>) => void;
}) {
    const { mask, onUpdate } = props;
    const updatePolygon = (value: string) => {
        const points = value.split(';').map((pair) => pair.trim().split(',').map(Number)).filter((pair) => pair.length === 2 && pair.every(Number.isFinite)).map(([x, y]) => ({ x, y }));
        if (points.length >= 3) {onUpdate({ points });}
    };
    const geometry = mask.points && mask.points.length >= 3
        ? <label className="flex flex-col gap-1 text-xs text-content-secondary">Normalized polygon points
            <textarea className="w-full rounded-md border border-content/10 bg-surface-secondary p-2 text-content" rows={2} defaultValue={mask.points.map((point) => `${point.x},${point.y}`).join('; ')} onBlur={(event) => updatePolygon(event.target.value)} />
        </label>
        : <div className="grid grid-cols-2 gap-2">{(['x', 'y', 'width', 'height'] as const).map((key) => <label key={key} className="flex flex-col gap-1 text-xs text-content-secondary">{key}
            <input className="w-full accent-brand-accent" type="range" min="0" max="1" step="0.01" value={mask.box?.[key] ?? 0} onChange={(event) => onUpdate({ box: { ...(mask.box ?? { x: 0, y: 0, width: 1, height: 1 }), [key]: Number(event.target.value) } })} />
        </label>)}</div>;
    return <div className="space-y-2 py-3 first:pt-0 last:pb-0">
        <div className="flex items-center gap-2">
            <IconButton aria-label={`Show ${mask.name} on canvas`} active={props.selected} onClick={props.onSelect}><ScanLine aria-hidden="true" size={15} /></IconButton>
            <Input aria-label="Mask name" autoComplete="off" name={`mask-name-${mask.id}`} value={mask.name} onChange={(event) => onUpdate({ name: event.target.value })} />
            <IconButton aria-label={`Invert ${mask.name}`} active={mask.inverted} onClick={() => onUpdate({ inverted: !mask.inverted })}>{mask.inverted ? <EyeOff aria-hidden="true" size={15} /> : <Eye aria-hidden="true" size={15} />}</IconButton>
            <IconButton aria-label={`Delete ${mask.name}`} onClick={props.onDelete}><X aria-hidden="true" size={15} /></IconButton>
        </div>
        <label className="flex flex-col gap-1 text-xs text-content-secondary">Feather
            <input className="w-full accent-brand-accent" type="range" min="0" max="0.25" step="0.005" value={mask.feather} onChange={(event) => onUpdate({ feather: Number(event.target.value) })} />
        </label>
        {geometry}
    </div>;
}

function DrawMaskTools(props: Pick<PhotoMaskPanelProps, 'drawKind' | 'onDrawKindChange'>) {
    return <div className="grid grid-cols-3 gap-2">{DRAW_TOOLS.map((tool) => {
        const Icon = tool.icon;
        const active = props.drawKind === tool.kind;
        return <Button key={tool.kind} type="button" variant="secondary" aria-pressed={active} className="h-20 flex-col px-2" onClick={() => props.onDrawKindChange(active ? null : tool.kind)}>
            <Icon aria-hidden="true" size={22} className="text-brand-accent" />
            <span className="text-xs">{active ? `Drawing ${tool.label.toLowerCase()}` : tool.label}</span>
        </Button>;
    })}</div>;
}

function DetectedMaskCandidates(props: Pick<PhotoMaskPanelProps, 'asset' | 'masks' | 'onChange' | 'onDrawKindChange' | 'onSelect'>) {
    const candidates = useMemo(() => buildPhotoMaskCandidates(props.asset), [props.asset]);
    if (candidates.length === 0) {
        return <p className="text-xs text-content-secondary">No analysed regions are available yet. Run frame, face, or AI metadata analysis first.</p>;
    }
    return <div className="space-y-1">
        <p className="text-xs font-medium text-content-secondary">Detected regions</p>
        {candidates.map((candidate) => <Button key={candidate.id} type="button" variant="secondary" className="w-full justify-start" title={candidate.description} onClick={() => {
            const mask = instantiateMaskCandidate(candidate);
            props.onChange([...props.masks, mask]);
            props.onDrawKindChange(null);
            props.onSelect(mask.id);
        }}><ScanSearch aria-hidden="true" size={16} /><span className="min-w-0 flex-1 truncate text-left">{candidate.mask.name}</span></Button>)}
    </div>;
}

export function PhotoMaskPanel(props: PhotoMaskPanelProps) {
    const update = (id: string, partial: Partial<PhotoEditMask>) => props.onChange(props.masks.map((mask) => mask.id === id ? { ...mask, ...partial } : mask));
    return <div className="space-y-3">
        <p className="text-xs text-content-secondary">Draw on the photo, or add a region found by existing analysis.</p>
        <DrawMaskTools drawKind={props.drawKind} onDrawKindChange={props.onDrawKindChange} />
        <DetectedMaskCandidates asset={props.asset} masks={props.masks} onChange={props.onChange} onDrawKindChange={props.onDrawKindChange} onSelect={props.onSelect} />
        {props.masks.length > 0 && <div className="divide-y divide-content/10">{props.masks.map((mask) => <MaskEditor
            key={mask.id}
            mask={mask}
            selected={mask.id === props.selectedMaskId}
            onSelect={() => props.onSelect(mask.id)}
            onUpdate={(partial) => update(mask.id, partial)}
            onDelete={() => {
                props.onChange(props.masks.filter((item) => item.id !== mask.id));
                if (props.selectedMaskId === mask.id) {props.onSelect(null);}
            }}
        />)}</div>}
    </div>;
}
