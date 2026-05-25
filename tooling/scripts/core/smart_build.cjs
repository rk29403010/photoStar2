const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SOURCE_DIRS = [
    path.join(REPO_ROOT, 'src', 'boundary', 'contracts'),
    path.join(REPO_ROOT, 'src', 'boundary', 'transport'),
    path.join(REPO_ROOT, 'src', 'data'),
    path.join(REPO_ROOT, 'src', 'entrypoints', 'core'),
    path.join(REPO_ROOT, 'src', 'services'),
    path.join(REPO_ROOT, 'src', 'shared'),
    path.join(REPO_ROOT, 'tooling', 'config'),
    path.join(REPO_ROOT, 'tooling', 'scripts', 'core'),
];
const HASH_DIR = path.join(REPO_ROOT, '.local', 'cache', 'core');
const HASH_FILE = path.join(HASH_DIR, 'build.hash');
const COMPILE_HASH_FILE = path.join(HASH_DIR, 'compile.hash');

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
        const p = path.join(REPO_ROOT, f);
        if (fs.existsSync(p)) {
            hash.update(fs.readFileSync(p));
        }
    });

    // Hash all core-relevant source files
    const files = SOURCE_DIRS.flatMap((dirPath) => fs.existsSync(dirPath) ? getAllFiles(dirPath) : []);
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
        const binaryPath = path.join(REPO_ROOT, 'deployments', 'desktop', 'tauri', 'binaries', 'core-x86_64-pc-windows-msvc.exe');
        if (!fs.existsSync(binaryPath)) {
            console.log('[SmartBuild] Binary missing. Forcing rebuild.');
            runBuild(targetHashFile, calculateHash());
            return;
        }
    } else {
        const distMain = path.join(REPO_ROOT, 'dist', 'core', 'src', 'entrypoints', 'core', 'main.js');
        if (!fs.existsSync(distMain)) {
            console.log('[SmartBuild] dist/core/src/entrypoints/core/main.js missing. Forcing compilation.');
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
        fs.mkdirSync(HASH_DIR, { recursive: true });

        console.log('[SmartBuild] Running core compile...');
        execSync('npx pnpm run build:core:ts', { stdio: 'inherit', cwd: REPO_ROOT });

        if (!isCompileOnly) {
            console.log('[SmartBuild] Packaging binary...');
            execSync('npx pnpm run package:core', { stdio: 'inherit', cwd: REPO_ROOT });
        }

        fs.writeFileSync(hashFile, currentHash);
        console.log('[SmartBuild] Success. Hash updated.');
    } catch (error) {
        console.error('[SmartBuild] Build failed.', error);
        process.exit(1);
    }
}

main();

