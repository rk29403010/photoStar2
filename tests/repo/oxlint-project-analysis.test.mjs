import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(testDirectory, '..', '..');
const oxlintScript = path.join(workspaceRoot, 'node_modules', 'oxlint', 'bin', 'oxlint');
const oxlintConfig = path.join(workspaceRoot, '.oxlintrc.json');

function runOxlint(args) {
    return spawnSync(process.execPath, [oxlintScript, '-c', oxlintConfig, ...args], {
        cwd: workspaceRoot,
        encoding: 'utf8',
        windowsHide: true,
    });
}

async function withFixture(run) {
    const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'photo-star-oxlint-'));
    try {
        await writeFile(path.join(fixtureRoot, 'tsconfig.json'), JSON.stringify({
            compilerOptions: {
                module: 'ESNext',
                moduleResolution: 'Bundler',
                strict: true,
            },
            include: ['./*.ts'],
        }), 'utf8');
        await run(fixtureRoot);
    } finally {
        await rm(fixtureRoot, { recursive: true, force: true });
    }
}

test('Oxlint comprehensive config performs multi-file cycle analysis', async () => {
    await withFixture(async (fixtureRoot) => {
        const firstFile = path.join(fixtureRoot, 'first.ts');
        const secondFile = path.join(fixtureRoot, 'second.ts');
        await Promise.all([
            writeFile(firstFile, "import { second } from './second';\nexport const first = second;\n", 'utf8'),
            writeFile(secondFile, "import { first } from './first';\nexport const second = first;\n", 'utf8'),
        ]);

        const result = runOxlint([fixtureRoot]);

        assert.notEqual(result.status, 0);
        assert.match(`${result.stdout}\n${result.stderr}`, /import\(no-cycle\)/u);
    });
});

test('installed tsgolint engine executes type-aware rules', async () => {
    await withFixture(async (fixtureRoot) => {
        const fixtureFile = path.join(fixtureRoot, 'type-aware.ts');
        await writeFile(fixtureFile, [
            'declare function acceptsVoidCallback(callback: () => void): void;',
            'async function returnsPromise(): Promise<void> {}',
            'acceptsVoidCallback(returnsPromise);',
        ].join('\n'), 'utf8');

        const result = runOxlint(['--type-aware', fixtureFile]);

        assert.notEqual(result.status, 0);
        assert.match(`${result.stdout}\n${result.stderr}`, /typescript\(no-misused-promises\)/u);
    });
});
