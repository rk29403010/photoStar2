import type { PhotoEditToolBrowserPreviewPlugin } from '../../../photoEditToolPlugin.ts';
import { dehazeBrowserPreview } from '../../browserPreview.ts';

const browserPreviewPlugin: PhotoEditToolBrowserPreviewPlugin = {
    id: 'dehaze',
    browserPreview: dehazeBrowserPreview,
};

export default browserPreviewPlugin;
