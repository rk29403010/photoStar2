import { PhotoColourPopOptions } from '../../../../../ui/components/photo-editor/PhotoColourPopOptions.tsx';
import { PhotoColourPopOverlay } from '../../../../../ui/components/photo-editor/PhotoColourPopOverlay.tsx';
import type { PhotoEditToolControlProps, PhotoEditToolOverlayProps, PhotoEditToolUiPlugin } from '../../../../../ui/components/photo-editor/photoEditToolUiRegistry.ts';

export function ColourPopControls(props: PhotoEditToolControlProps) {
    return <PhotoColourPopOptions operation={props.operation} sourceUrl={props.sourceUrl} onCommit={props.onCommit} onPreviewChange={props.onPreviewChange} />;
}

export function ColourPopOverlay(props: PhotoEditToolOverlayProps) {
    return <PhotoColourPopOverlay operation={props.operation} previewUrl={props.previewUrl} showWithoutChange={props.showWithoutChange} sourceUrl={props.sourceUrl} onChange={props.onCommit} />;
}

const colourPopUiPlugin: PhotoEditToolUiPlugin = { id: 'colour_pop', Controls: ColourPopControls, Overlay: ColourPopOverlay };
export default colourPopUiPlugin;
