import { PhotoEffectsOptions } from '../../../../../ui/components/photo-editor/PhotoEffectsOptions.tsx';
import { PhotoEffectsOverlay } from '../../../../../ui/components/photo-editor/PhotoEffectsOverlay.tsx';
import type { PhotoEditToolControlProps, PhotoEditToolOverlayProps, PhotoEditToolUiPlugin } from '../../../../../ui/components/photo-editor/photoEditToolUiRegistry.ts';

export function EffectsControls(props: PhotoEditToolControlProps) {
    return <PhotoEffectsOptions operation={props.operation} onCommit={props.onCommit} onPreviewChange={props.onPreviewChange} />;
}

export function EffectsOverlay(props: PhotoEditToolOverlayProps) {
    return <PhotoEffectsOverlay operation={props.operation} previewUrl={props.previewUrl} showWithoutChange={props.showWithoutChange} sourceUrl={props.sourceUrl} onChange={props.onCommit} />;
}

const effectsUiPlugin: PhotoEditToolUiPlugin = { id: 'effects', Controls: EffectsControls, Overlay: EffectsOverlay };
export default effectsUiPlugin;
