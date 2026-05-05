#!/usr/bin/env node
/**
 * Downloads the InsightFace ArcFace model used by the local face-recognition runtime.
 */

const fs = require('node:fs');
const path = require('node:path');

const MODEL_URL = 'https://huggingface.co/public-data/insightface/resolve/main/models/buffalo_l/w600k_r50.onnx';
const MODEL_DIR = path.join(__dirname, '..', '..', '..', 'deployments', 'common', 'models');
const MODEL_FILE = path.join(MODEL_DIR, 'w600k_r50.onnx');
const EXPECTED_MIN_SIZE = 150 * 1024 * 1024;

async function download() {
    fs.mkdirSync(MODEL_DIR, { recursive: true });

    if (fs.existsSync(MODEL_FILE)) {
        const stat = fs.statSync(MODEL_FILE);
        if (stat.size > EXPECTED_MIN_SIZE) {
            console.log(`[ArcFaceModel] Model already exists (${(stat.size / 1024 / 1024).toFixed(2)} MB). Skipping download.`);
            return;
        }
        console.log(`[ArcFaceModel] Existing file is incomplete (${stat.size} bytes). Re-downloading...`);
    }

    console.log('[ArcFaceModel] Downloading w600k_r50.onnx (approx 166MB)...');
    console.log(`[ArcFaceModel] Source: ${MODEL_URL}`);

    const response = await fetch(MODEL_URL);
    if (!response.ok) {
        throw new Error(`HTTP error ${response.status} ${response.statusText}`);
    }

    const totalSize = Number(response.headers.get('content-length')) || 0;
    const fileStream = fs.createWriteStream(MODEL_FILE);
    const reader = response.body.getReader();
    let downloaded = 0;
    let lastLog = Date.now();

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }

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
    console.log(`\n[ArcFaceModel] Download complete. Saved to ${MODEL_FILE}`);
}

download().catch((error) => {
    console.error('\n[ArcFaceModel] Download failed:', error);
    if (fs.existsSync(MODEL_FILE)) {
        try {
            fs.unlinkSync(MODEL_FILE);
        } catch {
            // Ignore cleanup failures for partial downloads.
        }
    }
    process.exit(1);
});
