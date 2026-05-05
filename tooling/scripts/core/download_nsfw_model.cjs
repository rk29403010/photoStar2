#!/usr/bin/env node
/**
 * download_nsfw_model.js
 *
 * Downloads the nsfwjs MobileNet v2 model files into deployments/common/models/nsfwjs/.
 * Runs automatically if that directory is missing, or manually via:
 *   npm run download:models
 *
 * Discovers shard files dynamically from model.json so it stays correct
 * even if the upstream repo adds more shards in future.
 */

const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'https://raw.githubusercontent.com/infinitered/nsfwjs/master/models/mobilenet_v2';
const MODEL_DIR = path.join(__dirname, '..', '..', '..', 'deployments', 'common', 'models', 'nsfwjs');

function download(url, dest) {
    return new Promise((resolve, reject) => {
        const out = fs.createWriteStream(dest);
        const req = https.get(url, { timeout: 120_000 }, res => {
            if (res.statusCode !== 200) {
                out.destroy();
                try { fs.unlinkSync(dest); } catch { /* ignore */ }
                reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                return;
            }
            let received = 0;
            res.on('data', chunk => {
                received += chunk.length;
                if (received % (256 * 1024) < chunk.length) {
                    process.stdout.write(`\r  ${path.basename(dest)}: ${(received / 1024).toFixed(0)} KB   `);
                }
            });
            res.pipe(out);
            out.on('finish', () => out.close(() => {
                const size = fs.statSync(dest).size;
                console.log(`\r  ${path.basename(dest)}: ${(size / 1024).toFixed(0)} KB [done]    `);
                resolve();
            }));
        });
        req.on('error', e => { out.destroy(); try { fs.unlinkSync(dest); } catch { /* ignore */ } reject(e); });
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

async function main() {
    fs.mkdirSync(MODEL_DIR, { recursive: true });

    // Remove any zero-byte (corrupt) files from a previous failed attempt
    for (const f of fs.readdirSync(MODEL_DIR)) {
        const full = path.join(MODEL_DIR, f);
        if (fs.statSync(full).size === 0) {
            fs.unlinkSync(full);
            console.log(`[NSFWModel] Removed corrupt file: ${f}`);
        }
    }

    // Step 1: Download model.json
    const modelJsonDest = path.join(MODEL_DIR, 'model.json');
    if (fs.existsSync(modelJsonDest)) {
        console.log('[NSFWModel] model.json already present, checking shards…');
    } else {
        console.log('[NSFWModel] Downloading model.json…');
        await download(`${BASE}/model.json`, modelJsonDest);
    }

    // Step 2: Discover shards from manifest
    const manifest = JSON.parse(fs.readFileSync(modelJsonDest, 'utf8'));
    const shards = [...new Set(manifest.weightsManifest.flatMap(g => g.paths))];
    console.log(`[NSFWModel] Shards from manifest (${shards.length}):`, shards);

    // Step 3: Download each missing shard
    for (const shard of shards) {
        const dest = path.join(MODEL_DIR, shard);
        if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
            console.log(`  [skip] ${shard} (${(fs.statSync(dest).size / 1024).toFixed(0)} KB)`);
            continue;
        }
        console.log(`[NSFWModel] Downloading ${shard}…`);
        await download(`${BASE}/${shard}`, dest);
    }

    // Summary
    const files = fs.readdirSync(MODEL_DIR);
    const totalMB = files.reduce((s, f) => s + fs.statSync(path.join(MODEL_DIR, f)).size, 0) / 1024 / 1024;
    console.log(`[NSFWModel] ✓ Done — ${files.length} file(s), ${totalMB.toFixed(2)} MB in ${MODEL_DIR}`);
}

main().catch(e => {
    console.error('[NSFWModel] FAILED:', e.message);
    process.exit(1);
});
