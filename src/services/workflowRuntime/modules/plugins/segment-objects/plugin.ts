import { createSegmentObjectsModule } from './implementation';
import type { DatabaseManager } from '../../../../../data/db';
import type { AssetUpdated } from '../../../../events/types';
import type { WorkflowModulePlugin } from '../../../contracts';
const providers = new Set(['fastsam', 'efficientsam', 'auto', 'both']);
export const segmentObjectsPlugin: WorkflowModulePlugin = { manifest: { id: 'runtime.segment_objects', contractVersion: 1, displayName: 'Segment objects', description: 'Creates neutral local image regions.', inputs: ['asset'], outputs: [{ kind: 'artifact', artifactType: 'object_segmentation', subjectType: 'asset' }], capabilities: ['analyze'] }, validateConfiguration(configuration) { if (configuration.provider !== undefined && !providers.has(String(configuration.provider))) {throw new Error('provider is invalid');} }, create: (context) => createSegmentObjectsModule({ dbManager: context.dbManager as DatabaseManager, eventBus: context.eventBus as { emit: (event: AssetUpdated) => void } | undefined }) };
