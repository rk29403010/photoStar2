import type { PhotoEditToolBrowserPreviewPlugin } from '../../../photoEditToolPlugin.ts';
import { blurBrowserPreview } from '../../browserPreview.ts';

const browserPreviewPlugin: PhotoEditToolBrowserPreviewPlugin = {
    id: 'blur',
    browserPreview: blurBrowserPreview,
};

export default browserPreviewPlugin;
