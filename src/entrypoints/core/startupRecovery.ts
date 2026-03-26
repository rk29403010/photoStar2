import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export function buildStartupFailureMessage(error: unknown, libDir: string): string {
    const detail = error instanceof Error ? error.message : String(error);
    return `Backend startup failed for storage '${libDir}': ${detail}`;
}

export function isFactoryResetCommand(command: string, payload: unknown): boolean {
    if (command !== 'reset_library') {
        return false;
    }

    const mode = typeof payload === 'object' && payload !== null && 'mode' in payload
        ? (payload as { mode?: unknown }).mode
        : undefined;
    return mode === 'factory';
}

export function resetLibraryStorageFiles(libDir: string): void {
    const previewsDir = join(libDir, 'previews');
    const dbPath = join(libDir, 'library.db');

    for (const target of [previewsDir, dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
        if (!existsSync(target)) {
            continue;
        }

        rmSync(target, { recursive: true, force: true });
    }
}
