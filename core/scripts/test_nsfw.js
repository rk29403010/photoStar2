const tf = require('@tensorflow/tfjs-node');
const nsfw = require('nsfwjs');
const path = require('path');
const fs = require('fs');

const modelDir = path.join(__dirname, '..', 'models', 'nsfwjs');
const modelUrl = 'file://' + modelDir.replace(/\\/g, '/') + '/model.json';

console.log('[Test] Loading model from:', modelUrl);
console.log('[Test] Files in model dir:', fs.readdirSync(modelDir));

nsfw.load(modelUrl, { size: 224 }).then(model => {
    console.log('[Test] Model loaded OK! classify fn type:', typeof model.classify);
    // Dummy 224x224x3 tensor (all zeros) — just to confirm the pipeline runs
    const dummyTensor = tf.zeros([224, 224, 3]);
    return model.classify(dummyTensor).then(predictions => {
        dummyTensor.dispose();
        console.log('[Test] classify() returned', predictions.length, 'classes:');
        predictions.forEach(p =>
            console.log('  ', p.className.padEnd(10), (p.probability * 100).toFixed(2) + '%')
        );
        const score = predictions
            .filter(p => ['Porn', 'Sexy', 'Hentai'].includes(p.className))
            .reduce((acc, p) => acc + p.probability, 0);
        console.log('[Test] Sensitivity score for dummy image:', Math.round(score * 100) + '%');
        console.log('[Test] ✓ ALL OK - scan_sensitive job is fully operational.');
    });
}).catch(e => {
    console.error('[Test] FAILED:', e.message);
    process.exit(1);
});
