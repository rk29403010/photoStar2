import type { DatabaseManager } from '../../../../../data/db';
import type { DomainEvent } from '../../../../events/types';
import type { WorkflowModulePlugin } from '../../../contracts';
import { createDetectPrintTextureModule } from './implementation.ts';

export const detectPrintTexturePlugin: WorkflowModulePlugin = {
    manifest: {
        id: 'runtime.detect_print_texture',
        contractVersion: 1,
        displayName: 'Detect print texture',
        description: 'Detects regular print-screen or photographic-paper texture deterministically.',
        inputs: ['asset'],
        outputs: [{ kind: 'artifact', artifactType: 'print_texture_detection', subjectType: 'asset' }],
        capabilities: ['analyze'],
    },
    create: (context) => createDetectPrintTextureModule({
        dbManager: context.dbManager as DatabaseManager,
        eventBus: context.eventBus as { emit: (event: DomainEvent) => void } | undefined,
    }),
};
