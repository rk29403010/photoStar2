import type { PhotoEditToolBrowserPreviewPlugin } from '../../../photoEditToolPlugin.ts';
import { sharpenBrowserPreview } from '../../browserPreview.ts';

const browserPreviewPlugin: PhotoEditToolBrowserPreviewPlugin = {
    id: 'sharpen',
    browserPreview: sharpenBrowserPreview,
};

export default browserPreviewPlugin;
