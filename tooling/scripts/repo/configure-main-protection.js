#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

import { runCommandSync } from './process-invocation.js';

const ghExecutable = process.platform === 'win32' ? 'gh.exe' : 'gh';

export function buildMainProtectionPolicy(requiredCheck = 'quality-gate') {
    return {
        required_status_checks: {
            strict: true,
            contexts: [requiredCheck],
        },
        enforce_admins: true,
        required_pull_request_reviews: {
            dismiss_stale_reviews: true,
            require_code_owner_reviews: false,
            required_approving_review_count: 0,
            require_last_push_approval: false,
        },
        restrictions: null,
        required_linear_history: false,
        allow_force_pushes: false,
        allow_deletions: false,
        block_creations: false,
        required_conversation_resolution: true,
        lock_branch: false,
        allow_fork_syncing: true,
    };
}

function resolveRepository() {
    const result = runCommandSync({
        command: ghExecutable,
        args: ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'],
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.error || (result.status ?? 1) !== 0 || !result.stdout.trim()) {
        throw new Error(result.stderr?.trim() || 'Unable to resolve the GitHub repository.');
    }
    return result.stdout.trim();
}

function applyProtection(repository) {
    const endpoint = `repos/${repository}/branches/main/protection`;
    const result = runCommandSync({
        command: ghExecutable,
        args: ['api', '--method', 'PUT', endpoint, '--input', '-'],
        encoding: 'utf8',
        input: JSON.stringify(buildMainProtectionPolicy()),
        stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (result.error || (result.status ?? 1) !== 0) {
        throw new Error(result.stderr?.trim() || result.error?.message || 'Unable to protect main.');
    }
}

function main() {
    const repository = resolveRepository();
    applyProtection(repository);
    console.log(`Protected ${repository}:main with PRs and required quality-gate checks.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        main();
    } catch (error) {
        console.error(`[github-protection] ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
}
