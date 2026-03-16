import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDevRuntimePorts } from './dev-runtime-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const desktopDevTemplatePath = path.resolve(workspaceRoot, 'deployments/desktop/tauri/tauri.desktop-dev.conf.json');
const generatedConfigPath = path.resolve(workspaceRoot, '.local/tauri.desktop-dev.generated.json');

function replacePortVariants(value, backendPort) {
    return value
        .replaceAll('ws://localhost:5174', `ws://localhost:${backendPort}`)
        .replaceAll('ws://127.0.0.1:5174', `ws://127.0.0.1:${backendPort}`)
        .replaceAll('http://localhost:5174', `http://localhost:${backendPort}`)
        .replaceAll('http://127.0.0.1:5174', `http://127.0.0.1:${backendPort}`);
}

export function buildDesktopDevTauriConfig(params = {}) {
    const templateConfig = params.templateConfig ?? JSON.parse(fs.readFileSync(desktopDevTemplatePath, 'utf8'));
    const cwd = params.cwd ?? process.cwd();
    const env = params.env ?? process.env;
    const { webPort, backendPort } = resolveDevRuntimePorts(env, cwd);

    return {
        ...templateConfig,
        build: {
            ...templateConfig.build,
            devUrl: `http://localhost:${webPort}`,
        },
        app: {
            ...templateConfig.app,
            security: {
                ...templateConfig.app.security,
                csp: replacePortVariants(templateConfig.app.security.csp, backendPort),
            },
        },
    };
}

export function writeDesktopDevTauriConfig(params = {}) {
    const config = buildDesktopDevTauriConfig(params);
    fs.mkdirSync(path.dirname(generatedConfigPath), { recursive: true });
    fs.writeFileSync(generatedConfigPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    return generatedConfigPath;
}

export { desktopDevTemplatePath, generatedConfigPath };
