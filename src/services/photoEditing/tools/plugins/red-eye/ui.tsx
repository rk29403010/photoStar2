import { PhotoRedEyeOptions } from '../../../../../ui/components/photo-editor/PhotoRedEyeOptions.tsx';
import { PhotoRedEyeOverlay } from '../../../../../ui/components/photo-editor/PhotoRedEyeOverlay.tsx';
import type { PhotoEditToolControlProps, PhotoEditToolOverlayProps, PhotoEditToolUiPlugin } from '../../../../../ui/components/photo-editor/photoEditToolUiRegistry.ts';

export function RedEyeControls(props: PhotoEditToolControlProps) {
    if (!props.asset) {
        return null;
    }
    return <PhotoRedEyeOptions asset={props.asset} operation={props.operation} sourceUrl={props.sourceUrl} onCommit={props.onCommit} onPreviewChange={props.onPreviewChange} />;
}

export function RedEyeOverlay(props: PhotoEditToolOverlayProps) {
    return <PhotoRedEyeOverlay operation={props.operation} previewUrl={props.previewUrl} showWithoutChange={props.showWithoutChange} onChange={props.onCommit} />;
}

const redEyeUiPlugin: PhotoEditToolUiPlugin = { id: 'red_eye', Controls: RedEyeControls, Overlay: RedEyeOverlay };
export default redEyeUiPlugin;
