import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { auditExtensionArchitecture } from '../../tooling/scripts/repo/extension-architecture-policy.mjs';

function writeFixtureFile(root, file, source = '') {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, source);
}

function addPlugin(root, family, name, id, source = '') {
    const directory = family === 'workflow'
        ? `src/services/workflowRuntime/modules/plugins/${name}`
        : `src/services/photoEditing/tools/plugins/${name}`;
    writeFixtureFile(root, `${directory}/manifest.ts`, "export { default } from './plugin';\n");
    writeFixtureFile(root, `${directory}/plugin.ts`, source || `export default { id: '${id}', label: '${name}', icon: 'Icon', group: 'group', defaults: {} };\n`);
}

function addContractTests(root) {
    writeFixtureFile(root, 'tests/core/workflow-module-plugin-contract.test.cjs');
    writeFixtureFile(root, 'tests/core/photo-edit-tool-plugin-contract.test.cjs');
}

function withFixture(callback) {
    const root = mkdtempSync(path.join(os.tmpdir(), 'photo-star-extension-policy-'));
    try { return callback(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

test('extension policy accepts generic hosts and stable IDs in workflow definitions', () => withFixture((root) => {
    addContractTests(root);
    addPlugin(root, 'workflow', 'alpha', 'runtime.alpha');
    addPlugin(root, 'photo', 'beta', 'beta');
    writeFixtureFile(root, 'src/services/workflowRuntime/workflows/example.ts', "export const moduleId = 'runtime.alpha';\n");
    writeFixtureFile(root, 'src/services/workflowRuntime/modulePluginHost.ts', 'export function register(plugins) { return plugins; }\n');
    writeFixtureFile(root, 'src/services/photoEditing/photoEditToolRegistry.ts', 'export function register(plugins) { return plugins; }\n');
    assert.deepEqual(auditExtensionArchitecture({ workspaceRoot: root, checkRegistries: false }), []);
}));

test('extension policy reports AST import, ID, catalogue, metadata, duplicate, and cross-plug-in violations', () => withFixture((root) => {
    addContractTests(root);
    addPlugin(root, 'workflow', 'alpha', 'runtime.alpha', "import beta from '../beta/plugin';\nexport default { id: 'runtime.alpha', label: 'Alpha', icon: 'Icon', group: 'group', defaults: {} };\n");
    addPlugin(root, 'workflow', 'beta', 'runtime.alpha');
    addPlugin(root, 'photo', 'photo-alpha', 'photo_alpha', "export default { id: 'photo_alpha', label: 'Alpha', icon: 'Icon', group: 'group', defaults: {} };\n");
    writeFixtureFile(root, 'src/services/workflowRuntime/host.ts', [
        "import alpha from './modules/plugins/alpha/plugin';",
        "const id = 'runtime.alpha';",
        "const metadata = { label: 'Alpha' };",
        "switch (id) { case 'runtime.alpha': return alpha; }",
        'registry.registerLegacy(alpha);',
    ].join('\n'));
    const diagnostics = auditExtensionArchitecture({ workspaceRoot: root, checkRegistries: false });
    const violations = diagnostics.map((item) => item.violation).join('\n');
    assert.match(violations, /plug-in imports implementation owned by 'beta'/);
    assert.match(violations, /duplicate plug-in ID 'runtime.alpha'/);
    assert.match(violations, /host imports a specific plug-in/);
    assert.match(violations, /host-side dispatch literal 'runtime.alpha'/);
    assert.match(violations, /duplicate extension-owned presentation metadata/);
    assert.match(violations, /central extension dispatch switch/);
    assert.match(violations, /obsolete legacy registration/);
    assert.ok(diagnostics.every((item) => item.file && item.boundary && item.expected));
}));
