import { createPreviewAdapterModule } from '../../previewAdapterModule';
import type { WorkflowModulePlugin } from '../../../contracts';

export const previewAdapterPlugin: WorkflowModulePlugin = {
    manifest: { id: 'legacy.preview.generate', contractVersion: 1, displayName: 'Generate preview', description: 'Adapts preview generation into the workflow runtime.', inputs: ['asset'], outputs: [{ kind: 'artifact', artifactType: 'preview', subjectType: 'asset' }], capabilities: ['derive'] },
    create: (context) => createPreviewAdapterModule({ runPreview: context.runPreview }),
};
