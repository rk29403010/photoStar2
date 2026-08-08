#!/usr/bin/env node
/* EfficientSAM-Ti deployment assets. Upstream: yformer/EfficientSAM (Apache-2.0). */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const appDataDir = process.env.APPDATA || process.env.HOME || '.';
const target = path.join(appDataDir, 'PhotoLibraryDesktop', 'models');
const models = [
    { file: 'efficient_sam_vitt_encoder.onnx', url: 'https://huggingface.co/spaces/yunyangx/EfficientSAM/resolve/main/efficientsam_ti_encoder.onnx', sha256: '84ed466ffcc5c1f8d08409bc34a23bb364ab2c15e402cb12d4335a42be0e0951' },
    { file: 'efficient_sam_vitt_decoder.onnx', url: 'https://huggingface.co/spaces/yunyangx/EfficientSAM/resolve/main/efficientsam_ti_decoder.onnx', sha256: 'a62f8fa5ea080447c0689418d69e58f1e83e0b7adf9c142e2bd9bcc8045c0b11' },
];

function checksum(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); }
function isValid(destination, model) { return fs.existsSync(destination) && checksum(destination) === model.sha256; }

async function install(model, options = {}) {
    const destinationDirectory = options.target ?? target;
    const fetchImpl = options.fetchImpl ?? fetch;
    const destination = path.join(destinationDirectory, model.file);
    const partial = `${destination}.part`;
    fs.mkdirSync(destinationDirectory, { recursive: true });
    if (isValid(destination, model)) { return { destination, installed: false }; }
    fs.rmSync(partial, { force: true });
    try {
        const response = await fetchImpl(model.url);
        if (!response.ok) { throw new Error(`${model.file}: HTTP ${response.status}`); }
        const content = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(partial, content, { flag: 'wx' });
        if (checksum(partial) !== model.sha256) { throw new Error(`${model.file}: checksum mismatch`); }
        fs.rmSync(destination, { force: true });
        fs.renameSync(partial, destination);
        return { destination, installed: true };
    } catch (error) {
        fs.rmSync(partial, { force: true });
        throw error;
    }
}

async function main() { for (const model of models) { await install(model); } }

if (require.main === module) {
    main().catch((error) => { console.error(`[EfficientSAM] ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
}

module.exports = { install, isValid, models, target };
