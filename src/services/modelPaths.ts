import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

type ResolveOnnxModelPathOptions = {
    modelFileName: string;
    moduleDir: string;
    execPath?: string;
    appDataDir?: string;
};

export function resolveUserModelDirectory(appDataDir = process.env.APPDATA ?? process.env.HOME ?? '.'): string {
    return join(appDataDir, 'PhotoLibraryDesktop', 'models');
}

export function listOnnxModelPathCandidates({ modelFileName, moduleDir, execPath = process.execPath, appDataDir }: ResolveOnnxModelPathOptions): string[] {
    return [
        join(dirname(execPath), 'models', modelFileName),
        join(resolveUserModelDirectory(appDataDir), modelFileName),
        join(moduleDir, '../../../../../deployments/common/models', modelFileName),
        join(moduleDir, '../../../../models', modelFileName),
    ];
}

export function resolveOnnxModelPath(options: ResolveOnnxModelPathOptions): string {
    const candidatePaths = listOnnxModelPathCandidates(options);
    const matchingPath = candidatePaths.find((candidatePath) => existsSync(candidatePath));
    return matchingPath ?? candidatePaths[0];
}
