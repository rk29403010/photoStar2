import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const name = process.argv[2]; const controls = process.argv.includes('--controls'); const overlay = process.argv.includes('--overlay');
if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) { throw new Error('usage: pnpm.cmd run photo-tool:new -- <kebab-case-name> [--controls] [--overlay]'); }
const directory = join(process.cwd(), 'src/services/photoEditing/tools/plugins', name);
if (existsSync(directory)) { throw new Error(`photo edit tool plug-in already exists: ${directory}`); }
mkdirSync(join(directory, 'fixtures'), { recursive: true });
const symbol = name.replaceAll('-', '');
writeFileSync(join(directory, 'defaults.ts'), 'export const DEFAULTS: Record<string, number | boolean> = {};\n');
writeFileSync(join(directory, 'implementation.ts'), 'export function validateValues(values: Record<string, number | boolean>): void { void values; }\n');
writeFileSync(join(directory, 'plugin.ts'), `import type { PhotoEditToolPlugin } from '../../../photoEditToolPlugin';\nimport { DEFAULTS } from './defaults';\n\nexport const ${symbol}Plugin: PhotoEditToolPlugin = { id: '${name.replaceAll('-', '_')}', recipeVersion: 1, label: '${name}', icon: 'Sparkles', group: 'custom', defaults: DEFAULTS };\n`);
writeFileSync(join(directory, 'manifest.ts'), `export { ${symbol}Plugin as default } from './plugin';\n`);
writeFileSync(join(directory, 'plugin.test.ts'), '// Add contract and behavioural tests for this plug-in.\n');
writeFileSync(join(directory, 'fixtures', 'README.md'), '# Fixtures\n');
if (controls) { writeFileSync(join(directory, 'Controls.tsx'), 'export function Controls() { return null; }\n'); }
if (overlay) { writeFileSync(join(directory, 'Overlay.tsx'), 'export function Overlay() { return null; }\n'); }
console.log(`Created ${directory}. Run pnpm.cmd run photo-tool:generate-registry.`);
