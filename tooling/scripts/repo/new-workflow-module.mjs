import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const name = process.argv[2];
if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error('usage: pnpm.cmd run module:new -- <kebab-case-name>');
}
const directory = join(process.cwd(), 'src/services/workflowRuntime/modules/plugins', name);
if (existsSync(directory)) {
    throw new Error(`workflow module plug-in already exists: ${directory}`);
}
mkdirSync(join(directory, 'fixtures'), { recursive: true });
const id = `runtime.${name.replaceAll('-', '_')}`;
writeFileSync(join(directory, 'plugin.ts'), `import type { WorkflowModulePlugin } from '../../../contracts';\n\nexport const ${name.replaceAll('-', '')}Plugin: WorkflowModulePlugin = {\n    manifest: {\n        id: '${id}', contractVersion: 1, displayName: '${name}', description: 'Describe this module.',\n        inputs: ['asset'], outputs: [], capabilities: ['derive'], fixtures: ['fixtures/example'],\n    },\n    validateConfiguration(configuration) {\n        void configuration;\n    },\n    create() {\n        return {\n            id: '${id}', version: 1, capability: 'derive', accepts: ['asset'], produces: [],\n            run: async () => ({ outputs: [] }),\n        };\n    },\n};\n`);
writeFileSync(join(directory, 'manifest.ts'), `export { ${name.replaceAll('-', '')}Plugin as default } from './plugin';\n`);
writeFileSync(join(directory, 'plugin.test.ts'), '// Add module-specific tests here. Shared plug-in contract tests validate the manifest.\n');
writeFileSync(join(directory, 'fixtures', 'example.md'), '# Fixture\n\nDescribe the deterministic fixture here.\n');
console.log(`Created ${directory}. Run pnpm.cmd run module:generate-registry.`);
