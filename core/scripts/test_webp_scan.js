/**
 * test_webp_scan.js
 * Verifies the full WebP → PNG → TF → nsfwjs pipeline works.
 */
const tf = require('@tensorflow/tfjs-node');
const nsfw = require('nsfwjs');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const os = require('os');

const MODEL_DIR = path.join(__dirname, '..', 'models', 'nsfwjs');
const modelUrl = 'file://' + MODEL_DIR.replace(/\\/g, '/') + '/model.json';

async function main() {
    // Create a synthetic 224x224 WebP test image using sharp
    const tmpWebp = path.join(os.tmpdir(), '_nsfw_test.webp');
    await sharp({
        create: { width: 224, height: 224, channels: 3, background: { r: 128, g: 64, b: 32 } }
    }).webp().toFile(tmpWebp);
    console.log('[Test] Created synthetic WebP test image:', tmpWebp, fs.statSync(tmpWebp).size, 'bytes');

    // Load model
    console.log('[Test] Loading model…');
    const model = await nsfw.load(modelUrl, { size: 224 });
    console.log('[Test] Model loaded OK.');

    // Replicate the exact scan_sensitive.ts pipeline
    const rawBuffer = await fs.promises.readFile(tmpWebp);
    const pngBuffer = await sharp(rawBuffer).png().toBuffer();
    console.log('[Test] Converted WebP → PNG buffer:', pngBuffer.length, 'bytes');

    const tensor = tf.node.decodeImage(pngBuffer, 3);
    const predictions = await model.classify(tensor);
    tensor.dispose();

    console.log('[Test] classify() returned', predictions.length, 'classes:');
    predictions.forEach(p => console.log('  ', p.className.padEnd(10), (p.probability * 100).toFixed(2) + '%'));

    fs.unlinkSync(tmpWebp);
    console.log('[Test] ✓ WebP → PNG → TF pipeline works correctly.');
}

main().catch(e => {
    console.error('[Test] FAILED:', e.message);
    process.exit(1);
});
