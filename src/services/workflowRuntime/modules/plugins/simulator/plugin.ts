import { createSimulatorModule } from '../../simulatorModule';
import type { WorkflowModulePlugin } from '../../../contracts';

export const simulatorPlugin: WorkflowModulePlugin = {
    manifest: { id: 'runtime.simulator', contractVersion: 1, displayName: 'Simulator', description: 'Produces deterministic workflow simulation results.', inputs: ['folder', 'asset', 'batch'], outputs: [{ kind: 'artifact', artifactType: 'simulation_result', subjectType: 'asset' }], capabilities: ['derive'] },
    create: () => createSimulatorModule({}),
};
