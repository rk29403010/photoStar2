import { PhotoCropOptions } from '../../../../../ui/components/photo-editor/PhotoCropOptions.tsx';
import { PhotoCropOverlay } from '../../../../../ui/components/photo-editor/PhotoCropOverlay.tsx';
import type { PhotoEditToolControlProps, PhotoEditToolOverlayProps, PhotoEditToolUiPlugin } from '../../../../../ui/components/photo-editor/photoEditToolUiRegistry.ts';

export function CropControls(props: PhotoEditToolControlProps) {
    const change = (operation: typeof props.operation) => { props.onPreviewChange(operation); props.onCommit(operation); };
    return <PhotoCropOptions operation={props.operation} onChange={change} />;
}

export function CropOverlay(props: PhotoEditToolOverlayProps) {
    return <PhotoCropOverlay operation={props.operation} previewRevision={props.previewRevision} previewUrl={props.previewUrl} showWithoutChange={props.showWithoutChange} sourceUrl={props.sourceUrl} onCommit={props.onCommit} onDraftChange={props.onDraft} />;
}

const cropUiPlugin: PhotoEditToolUiPlugin = { id: 'crop', Controls: CropControls, Overlay: CropOverlay };
export default cropUiPlugin;
