#!/usr/bin/env node
/**
 * fix_tfjs_binding.js
 * 
 * @tensorflow/tfjs-node@4.22.0 only ships pre-built NAPI binaries up to napi-v8.
 * Node 22 uses NAPI v10. The binding itself is NAPI-ABI-stable and runs fine on
 * Node 22, but the tensorflow.dll is installed into lib/napi-v10/ and is not
 * co-located with the napi-v8 binding — causing a DLL-not-found load error.
 *
 * This script copies tensorflow.dll from lib/napi-v10/ into lib/napi-v8/ so the
 * binding can locate it at runtime. Runs as a postinstall step.
 */

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', '..', '..');
const tfjsNodeDir = path.join(repoRoot, 'node_modules', '@tensorflow', 'tfjs-node');
const napiVersion = process.versions.napi;

// The binding is always placed in napi-v8 (highest pre-built version available)
const bindingDir = path.join(tfjsNodeDir, 'lib', 'napi-v8');
const bindingPath = path.join(bindingDir, 'tfjs_binding.node');

// tensorflow.dll may be in napi-v{napiVersion}/ or deps/lib/
const dllCandidates = [
    path.join(tfjsNodeDir, 'lib', `napi-v${napiVersion}`, 'tensorflow.dll'),
    path.join(tfjsNodeDir, 'deps', 'lib', 'tensorflow.dll'),
];

const targetDll = path.join(bindingDir, 'tensorflow.dll');

if (!fs.existsSync(bindingPath)) {
    console.log('[fix_tfjs_binding] tfjs_binding.node not found, skipping (may need build-from-source).');
    process.exit(0);
}

if (fs.existsSync(targetDll)) {
    console.log('[fix_tfjs_binding] tensorflow.dll already present in napi-v8/, nothing to do.');
    process.exit(0);
}

let copied = false;
for (const src of dllCandidates) {
    if (fs.existsSync(src)) {
        fs.mkdirSync(bindingDir, { recursive: true });
        fs.copyFileSync(src, targetDll);
        console.log(`[fix_tfjs_binding] Copied tensorflow.dll from ${src} -> ${targetDll}`);
        copied = true;
        break;
    }
}

if (!copied) {
    console.warn('[fix_tfjs_binding] WARNING: tensorflow.dll not found in any candidate location.');
    console.warn('  Checked:', dllCandidates);
    console.warn('  The sensitive content scanner (nsfwjs) may fail to load.');
}

// Quick smoke-test
try {
    require('@tensorflow/tfjs-node');
    console.log('[fix_tfjs_binding] @tensorflow/tfjs-node loads OK.');
} catch (e) {
    console.error('[fix_tfjs_binding] @tensorflow/tfjs-node still fails to load:', e.message);
}
