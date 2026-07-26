import type { ModuleDefinition, RuntimeModuleContext } from '../../../contracts';

export type PreviewAdapterModuleOptions = {
    runPreview?: (mediaIds: string[], context: RuntimeModuleContext) => Promise<void>;
}

async function defaultRunPreview(): Promise<void> {
    throw new Error('preview adapter requires a runPreview implementation');
}

export function createPreviewAdapterModule(
    options: PreviewAdapterModuleOptions = {},
): ModuleDefinition {
    const runPreview = options.runPreview ?? defaultRunPreview;

    return {
        id: 'legacy.preview.generate',
        version: 1,
        capability: 'derive',
        accepts: ['asset'],
        produces: [
            {
                kind: 'artifact',
                artifactType: 'preview',
                subjectType: 'asset',
            },
        ],
        run: async (context) => {
            await runPreview([context.subject.subjectId], context);
            return {
                outputs: [
                    {
                        kind: 'artifact',
                        artifactType: 'preview',
                        subjectType: context.subject.subjectType,
                    },
                ],
            };
        },
    };
}
