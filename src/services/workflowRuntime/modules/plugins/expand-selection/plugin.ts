import { createExpandSelectionModule } from '../../expandSelectionModule';
import type { WorkflowModulePlugin } from '../../../contracts';

export const expandSelectionPlugin: WorkflowModulePlugin = {
    manifest: { id: 'runtime.expand_selection', contractVersion: 1, displayName: 'Expand selection', description: 'Expands a selection into workflow subjects.', inputs: ['selection'], outputs: [], capabilities: ['derive'] },
    create: () => createExpandSelectionModule(),
};
