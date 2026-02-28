const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(PROJECT_ROOT, 'src');
const HASH_FILE = path.join(PROJECT_ROOT, '.build-hash');
const COMPILE_HASH_FILE = path.join(PROJECT_ROOT, '.compile-hash');

// Parse args
const args = process.argv.slice(2);
const isCompileOnly = args.includes('--compile-only');

function getAllFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];

    files.forEach(function (file) {
        if (fs.statSync(dirPath + "/" + file).isDirectory()) {
            arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
        } else {
            arrayOfFiles.push(path.join(dirPath, file));
        }
    });

    return arrayOfFiles;
}

function calculateHash() {
    const hash = crypto.createHash('md5');

    // Hash critical config files
    ['package.json', 'package-lock.json', 'tsconfig.json'].forEach(f => {
        const p = path.join(PROJECT_ROOT, f);
        if (fs.existsSync(p)) {
            hash.update(fs.readFileSync(p));
        }
    });

    // Hash all src files
    const files = getAllFiles(SRC_DIR);
    files.sort();

    files.forEach(file => {
        hash.update(fs.readFileSync(file));
    });

    return hash.digest('hex');
}

function main() {
    const mode = isCompileOnly ? 'Compile-Only' : 'Full-Build';
    const targetHashFile = isCompileOnly ? COMPILE_HASH_FILE : HASH_FILE;

    console.log(`[SmartBuild] Mode: ${mode} | Checking for changes...`);

    // For full build, check binary existence
    if (!isCompileOnly) {
        // Path from package.json: ../src-tauri/binaries/core-x86_64-pc-windows-msvc.exe
        const binaryPath = path.resolve(PROJECT_ROOT, '../src-tauri/binaries/core-x86_64-pc-windows-msvc.exe');
        if (!fs.existsSync(binaryPath)) {
            console.log('[SmartBuild] Binary missing. Forcing rebuild.');
            runBuild(targetHashFile, calculateHash());
            return;
        }
    } else {
        // For compile-only, check dist/main.js
        const distMain = path.join(PROJECT_ROOT, 'dist', 'main.js');
        if (!fs.existsSync(distMain)) {
            console.log('[SmartBuild] dist/main.js missing. Forcing compilation.');
            runBuild(targetHashFile, calculateHash());
            return;
        }
    }

    const currentHash = calculateHash();
    let oldHash = '';

    if (fs.existsSync(targetHashFile)) {
        oldHash = fs.readFileSync(targetHashFile, 'utf8').trim();
    }

    if (currentHash === oldHash) {
        console.log('[SmartBuild] No changes detected. Skipping.');
        process.exit(0);
    }

    console.log(`[SmartBuild] Changes detected (${oldHash.substring(0, 6)} -> ${currentHash.substring(0, 6)}). Rebuilding...`);
    runBuild(targetHashFile, currentHash);
}

function runBuild(hashFile, currentHash) {
    try {
        // Always run tsc
        console.log('[SmartBuild] Running tsc...');
        execSync('npm run build', { stdio: 'inherit', cwd: PROJECT_ROOT });

        if (!isCompileOnly) {
            console.log('[SmartBuild] Packaging binary...');
            execSync('npm run package', { stdio: 'inherit', cwd: PROJECT_ROOT });
        }

        // Update hash
        fs.writeFileSync(hashFile, currentHash);
        console.log('[SmartBuild] Success. Hash updated.');
    } catch (e) {
        console.error('[SmartBuild] Build failed.');
        process.exit(1);
    }
}

main();
