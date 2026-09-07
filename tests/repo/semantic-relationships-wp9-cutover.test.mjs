import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const RUNTIME_ROOTS = [
    'src/services',
    'src/ui',
    'src/shared',
    'src/boundary',
];

function gitGrep(pattern) {
    const result = spawnSync(
        'git',
        ['grep', '-n', '-E', pattern, '--', ...RUNTIME_ROOTS],
        { encoding: 'utf8' },
    );
    if (result.status === 1) {
        return '';
    }
    if (result.status !== 0) {
        throw new Error(result.stderr || `git grep failed with status ${result.status}`);
    }
    return result.stdout.trim();
}

test('WP9 runtime source has no legacy group-table readers or writers', () => {
    const matches = gitGrep('asset_groups|asset_group_members|asset_group_children');
    assert.equal(matches, '', `Legacy group-table runtime references remain:\n${matches}`);
});

test('WP9 runtime source has no legacy group commands', () => {
    const matches = gitGrep('get_group_orbit|set_canonical|explode_group');
    assert.equal(matches, '', `Legacy group command runtime references remain:\n${matches}`);
});
