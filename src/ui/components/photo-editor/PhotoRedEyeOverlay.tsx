import type { PhotoEditOperation } from "@contracts/core";
import { readRedEyePoints, writeRedEyePoints } from "@shared/photoEditing/redEye";

type Props = { readonly operation: PhotoEditOperation; readonly previewUrl: string | null; readonly showWithoutChange: boolean; readonly onChange: (operation: PhotoEditOperation) => void; };

export function PhotoRedEyeOverlay(props: Props) {
  const points = readRedEyePoints(props.operation.values);
  const addPoint = (event: React.PointerEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)), radius: 0.025 };
    props.onChange({ ...props.operation, values: writeRedEyePoints(props.operation.values, [...points, point]) });
  };
  if (!props.previewUrl) { return <span className="text-content-secondary">Preparing preview…</span>; }
  return <div className="relative max-h-full max-w-full"><button type="button" className="relative block max-h-full max-w-full cursor-crosshair bg-transparent p-0" aria-label="Add red-eye correction point" onPointerDown={addPoint}><img className="max-h-full max-w-full object-contain" src={props.previewUrl} alt={props.showWithoutChange ? "Before red-eye correction" : "Red-eye correction preview"}/><svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none">{!props.showWithoutChange && points.map((point) => <circle key={`${point.x}-${point.y}`} cx={point.x * 100} cy={point.y * 100} r={point.radius * 100} className="fill-transparent stroke-brand-accent" strokeWidth="0.6"/>)}</svg></button><p className="pointer-events-none absolute bottom-4 rounded bg-surface/90 px-2 py-1 text-xs text-content shadow-sm">Click to add an eye point</p></div>;
}
