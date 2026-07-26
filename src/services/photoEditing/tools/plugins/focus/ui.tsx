import { PhotoFocusOptions } from '../../../../../ui/components/photo-editor/PhotoFocusOptions.tsx';
import { PhotoFocusOverlay } from '../../../../../ui/components/photo-editor/PhotoFocusOverlay.tsx';
import type { PhotoEditToolControlProps, PhotoEditToolOverlayProps, PhotoEditToolUiPlugin } from '../../../../../ui/components/photo-editor/photoEditToolUiRegistry.ts';

export function FocusControls(props: PhotoEditToolControlProps) {
    return <PhotoFocusOptions operation={props.operation} onCommit={props.onCommit} onPreviewChange={props.onPreviewChange} />;
}

export function FocusOverlay(props: PhotoEditToolOverlayProps) {
    return <PhotoFocusOverlay operation={props.operation} previewUrl={props.previewUrl} showWithoutChange={props.showWithoutChange} sourceUrl={props.sourceUrl} onCommit={props.onCommit} onPreviewChange={props.onDraft} />;
}

const focusUiPlugin: PhotoEditToolUiPlugin = { id: 'focus', Controls: FocusControls, Overlay: FocusOverlay };
export default focusUiPlugin;
