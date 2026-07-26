import { v4 as uuidv4 } from 'uuid';
import type { ModuleDefinition, RuntimeModuleContext, SubjectRef } from '../../../contracts';

export type SimulatorModuleMode = 'enumerator' | 'task';
export type SimulatorModuleSpeed = 'fast' | 'medium' | 'slow';
export type SimulatorModuleErrorType = 'none' | 'fatal' | 'asset';
export type SimulatorModuleResourceLoadMode = 'cpuSpike' | 'memorySpike';

export type SimulatorModuleOptions = Record<string, never>;

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, ms);
        signal?.addEventListener('abort', () => {
            clearTimeout(timeout);
            reject(new Error('Operation cancelled'));
        });
    });
}

function simulateCpuSpike(durationMs: number, signal?: AbortSignal) {
    const start = Date.now();
    while (Date.now() - start < durationMs) {
        if (signal?.aborted) {
            throw new Error('Operation cancelled');
        }
    }
}

function simulateResourceLoad(mode: SimulatorModuleResourceLoadMode, signal?: AbortSignal) {
    if (mode === 'cpuSpike') {
        simulateCpuSpike(1000, signal);
    } else if (mode === 'memorySpike') {
        const dummy = new Float64Array(12.5 * 1024 * 1024);
        console.log(`[Simulator] Allocated memory spike: ${dummy.length} elements`);
    }
}

function maybeThrowError(type: SimulatorModuleErrorType, rate: number, subjectId: string) {
    if (type !== 'none' && Math.random() * 100 < rate) {
        if (type === 'fatal') {
            throw new Error('[Simulator] Fatal workflow error triggered');
        }
        throw new Error(`[Simulator] Asset-specific error triggered for ${subjectId}`);
    }
}

function calculateDuration(speed: SimulatorModuleSpeed): number {
    if (speed === 'fast') {
        return Math.random() * 50;
    }
    if (speed === 'medium') {
        return 50 + Math.random() * 150;
    }
    return 200 + Math.random() * 800;
}

async function handleEnumeratorMode(parameters: Record<string, unknown>, signal?: AbortSignal) {
    const iterations = Number(parameters.iterations) || 10;
    const emittedSubjects: SubjectRef[] = [];
    for (let i = 0; i < iterations; i++) {
        if (signal?.aborted) {
            throw new Error('Operation cancelled');
        }
        emittedSubjects.push({
            subjectType: 'asset',
            subjectId: `sim-asset-${uuidv4()}`,
        });
    }
    return { outputs: [], emittedSubjects };
}

async function handleTaskMode(parameters: Record<string, unknown>, signal?: AbortSignal) {
    const speed = (parameters.speed as SimulatorModuleSpeed) || 'fast';
    const duration = calculateDuration(speed);

    console.log(`[Simulator] Task mode starting, speed: ${speed}, duration: ${Math.round(duration / 1000)}s`);
    await sleep(duration, signal);

    const mockPayloadTemplate = parameters.mockPayloadTemplate as string | undefined;
    const artifactType = (mockPayloadTemplate === 'ai_metadata' ? 'ai_metadata' : 'simulation_result') as 'simulation_result';

    return {
        outputs: [{
            kind: 'artifact' as const,
            artifactType,
            subjectType: 'asset' as const,
        }],
    };
}

export function createSimulatorModule(_options: SimulatorModuleOptions = {}): ModuleDefinition {
    return {
        id: 'runtime.simulator',
        version: 1,
        capability: 'derive',
        accepts: ['folder', 'asset', 'batch'],
        produces: [{ kind: 'artifact', artifactType: 'simulation_result', subjectType: 'asset' }],
        run: async (context: RuntimeModuleContext & { signal?: AbortSignal }) => {
            const { parameters, signal } = context;
            const mode = (parameters.mode as SimulatorModuleMode) || 'task';
            const errorType = (parameters.errorType as SimulatorModuleErrorType) || 'none';
            const errorRate = (parameters.errorRate as number) || 0;
            const resourceLoadMode = parameters.resourceLoadMode as SimulatorModuleResourceLoadMode | undefined;

            if (resourceLoadMode) {
                simulateResourceLoad(resourceLoadMode, signal);
            }

            maybeThrowError(errorType, errorRate, context.subject.subjectId);

            if (mode === 'enumerator') {
                return handleEnumeratorMode(parameters, signal);
            }

            return handleTaskMode(parameters, signal);
        },
    };
}
