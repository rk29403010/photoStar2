import type { PhotoEditToolBrowserPreviewPlugin } from '../../../photoEditToolPlugin.ts';
import { adjustBrowserPreview } from '../../browserPreview.ts';

const browserPreviewPlugin: PhotoEditToolBrowserPreviewPlugin = {
    id: 'adjust',
    browserPreview: adjustBrowserPreview,
};

export default browserPreviewPlugin;
