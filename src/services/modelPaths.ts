import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

type ResolveOnnxModelPathOptions = {
    modelFileName: string;
    moduleDir: string;
    execPath?: string;
};

export function listOnnxModelPathCandidates({ modelFileName, moduleDir, execPath = process.execPath }: ResolveOnnxModelPathOptions): string[] {
    return [
        join(dirname(execPath), 'models', modelFileName),
        join(moduleDir, '../../../../../deployments/common/models', modelFileName),
        join(moduleDir, '../../../../models', modelFileName),
    ];
}

export function resolveOnnxModelPath(options: ResolveOnnxModelPathOptions): string {
    const candidatePaths = listOnnxModelPathCandidates(options);
    const matchingPath = candidatePaths.find((candidatePath) => existsSync(candidatePath));
    return matchingPath ?? candidatePaths[0];
}
