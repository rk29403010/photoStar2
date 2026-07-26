import { PhotoRotateOptions } from '../../../../../ui/components/photo-editor/PhotoRotateOptions.tsx';
import { PhotoRotateOverlay } from '../../../../../ui/components/photo-editor/PhotoRotateOverlay.tsx';
import type { PhotoEditToolControlProps, PhotoEditToolOverlayProps, PhotoEditToolUiPlugin } from '../../../../../ui/components/photo-editor/photoEditToolUiRegistry.ts';

export function RotateControls(props: PhotoEditToolControlProps) {
    return <PhotoRotateOptions operation={props.operation} onCommit={props.onCommit} onPreviewChange={props.onPreviewChange} />;
}

export function RotateOverlay(props: PhotoEditToolOverlayProps) {
    return <PhotoRotateOverlay operation={props.operation} showWithoutChange={props.showWithoutChange} sourceUrl={props.sourceUrl} onCommit={props.onCommit} onDraftChange={props.onDraft} />;
}

const rotateUiPlugin: PhotoEditToolUiPlugin = { id: 'rotate', Controls: RotateControls, Overlay: RotateOverlay };
export default rotateUiPlugin;
