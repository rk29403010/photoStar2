#!/usr/bin/env node
/**
 * download_arcface_model.js
 *
 * Downloads the InsightFace w600k_r50.onnx model file into core/models/.
 * Required for face recognition bindings.
 */

const fs = require('fs');
const path = require('path');

const MODEL_URL = "https://huggingface.co/public-data/insightface/resolve/main/models/buffalo_l/w600k_r50.onnx";
const MODEL_DIR = path.join(__dirname, '..', 'models');
const MODEL_FILE = path.join(MODEL_DIR, 'w600k_r50.onnx');

// Target file size is roughly ~166MB
const EXPECTED_MIN_SIZE = 150 * 1024 * 1024;

async function download() {
    fs.mkdirSync(MODEL_DIR, { recursive: true });

    // Check if it already exists and is mostly complete
    if (fs.existsSync(MODEL_FILE)) {
        const stat = fs.statSync(MODEL_FILE);
        if (stat.size > EXPECTED_MIN_SIZE) {
            console.log(`[ArcFaceModel] Model already exists (${(stat.size / 1024 / 1024).toFixed(2)} MB). Skipping download.`);
            return;
        } else {
            console.log(`[ArcFaceModel] Existing file is incomplete (${stat.size} bytes). Re-downloading...`);
        }
    }

    console.log(`[ArcFaceModel] Downloading w600k_r50.onnx (approx 166MB)...`);
    console.log(`[ArcFaceModel] Source: ${MODEL_URL}`);

    // Using native fetch (Node 18+)
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`HTTP error ${res.status} ${res.statusText}`);

    const totalSize = Number(res.headers.get('content-length')) || 0;
    let downloaded = 0;

    const fileStream = fs.createWriteStream(MODEL_FILE);

    // Web Streams API mapping
    const reader = res.body.getReader();

    let lastLog = Date.now();
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        downloaded += value.length;
        fileStream.write(value);

        const now = Date.now();
        if (now - lastLog > 500) {
            if (totalSize) {
                process.stdout.write(`\r  Progress: ${(downloaded / 1024 / 1024).toFixed(1)} / ${(totalSize / 1024 / 1024).toFixed(1)} MB`);
            } else {
                process.stdout.write(`\r  Progress: ${(downloaded / 1024 / 1024).toFixed(1)} MB`);
            }
            lastLog = now;
        }
    }

    fileStream.end();
    console.log(`\n[ArcFaceModel] ✅ Download complete! Saved to ${MODEL_FILE}`);
}

download().catch(err => {
    console.error(`\n[ArcFaceModel] ❌ Download Failed:`, err);
    // Cleanup partial file to prevent corrupt state
    if (fs.existsSync(MODEL_FILE)) {
        try { fs.unlinkSync(MODEL_FILE); } catch (e) { }
    }
    process.exit(1);
});
