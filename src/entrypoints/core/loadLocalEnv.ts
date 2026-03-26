import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function stripWrappingQuotes(value: string): string {
    if (
        (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))
    ) {
        return value.slice(1, -1);
    }

    return value;
}

function parseEnvLine(line: string): { key: string; value: string } | null {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
        return null;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
        return null;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key) {
        return null;
    }

    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    return {
        key,
        value: stripWrappingQuotes(rawValue),
    };
}

export function loadLocalEnvFile(cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env): string | null {
    const envPath = resolve(cwd, '.env.local');
    if (!existsSync(envPath)) {
        return null;
    }

    const fileContents = readFileSync(envPath, 'utf8');
    for (const line of fileContents.split(/\r?\n/)) {
        const parsed = parseEnvLine(line);
        if (!parsed) {
            continue;
        }
        if (env[parsed.key]?.trim()) {
            continue;
        }
        env[parsed.key] = parsed.value;
    }

    return envPath;
}
