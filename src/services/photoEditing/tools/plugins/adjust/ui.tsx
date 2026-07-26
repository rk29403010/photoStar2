import { PhotoTuneOptions } from '../../../../../ui/components/photo-editor/PhotoTuneOptions.tsx';
import { PhotoTuneOverlay } from '../../../../../ui/components/photo-editor/PhotoTuneOverlay.tsx';
import type { PhotoEditToolControlProps, PhotoEditToolOverlayProps, PhotoEditToolUiPlugin } from '../../../../../ui/components/photo-editor/photoEditToolUiRegistry.ts';

export function AdjustControls(props: PhotoEditToolControlProps) {
    return <PhotoTuneOptions operation={props.operation} onCommit={props.onCommit} onPreviewChange={props.onPreviewChange} />;
}

export function AdjustOverlay(props: PhotoEditToolOverlayProps) {
    return props.operation.maskId ? null : <PhotoTuneOverlay operation={props.operation} previewUrl={props.previewUrl} showWithoutChange={props.showWithoutChange} sourceUrl={props.sourceUrl} />;
}

const adjustUiPlugin: PhotoEditToolUiPlugin = { id: 'adjust', Controls: AdjustControls, Overlay: AdjustOverlay };
export default adjustUiPlugin;
