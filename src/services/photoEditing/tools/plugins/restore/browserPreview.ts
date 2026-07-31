import type { PhotoEditToolBrowserPreviewPlugin } from '../../../photoEditToolPlugin.ts';
import { restoreBrowserPreview } from '../../browserPreview.ts';

const browserPreviewPlugin: PhotoEditToolBrowserPreviewPlugin = {
    id: 'restore',
    browserPreview: restoreBrowserPreview,
};

export default browserPreviewPlugin;
