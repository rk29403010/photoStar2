/**
 * backend.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Single source of truth for runtime backend capabilities and transport.
 *
 * Resolution priority:
 *   1. Tauri host detected
 *   2. Optional transport override via VITE_DESKTOP_BACKEND
 *   3. Cloud backend via VITE_BACKEND_URL
 *   4. LAN/dev fallback via window.location.hostname
 *
 * Nothing outside this module should hardcode localhost, __TAURI_INTERNALS__,
 * or assume that a Tauri host must always use IPC.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { convertFileSrc } from '@tauri-apps/api/core';

export type DeploymentMode = 'tauri' | 'lan' | 'cloud';
export type FrontendHost = 'tauri' | 'browser';
export type BackendTransportKind = 'ipc' | 'ws';
export type ImageSourceStrategy = 'asset' | 'http';

const DEFAULT_BACKEND_PORT = 5174;

function getBackendPort(): number {
    const rawValue = import.meta.env.VITE_BACKEND_PORT as string | undefined;
    if (!rawValue || !/^\d+$/.test(rawValue.trim())) {
        return DEFAULT_BACKEND_PORT;
    }

    const parsedPort = Number.parseInt(rawValue, 10);
    return parsedPort >= 1 && parsedPort <= 65_535 ? parsedPort : DEFAULT_BACKEND_PORT;
}

function hasTauriHost(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function getBackendTransportOverride(): BackendTransportKind | null {
    const value = (import.meta.env.VITE_DESKTOP_BACKEND as string | undefined)?.trim().toLowerCase();
    if (value === 'ipc' || value === 'ws') {
        return value;
    }
    return null;
}

export function getFrontendHost(): FrontendHost {
    return hasTauriHost() ? 'tauri' : 'browser';
}

export function isTauriHost(): boolean {
    return getFrontendHost() === 'tauri';
}

export function canUseNativeDirectoryPicker(): boolean {
    return isTauriHost();
}

export function getDeploymentMode(): DeploymentMode {
    if (isTauriHost() && getBackendTransportKind() === 'ipc') {
        return 'tauri';
    }

    if (import.meta.env.VITE_BACKEND_URL) {
        return 'cloud';
    }

    return 'lan';
}

export function getBackendTransportKind(): BackendTransportKind {
    const override = getBackendTransportOverride();
    if (override === 'ws') {
        return 'ws';
    }

    if (override === 'ipc' && isTauriHost()) {
        return 'ipc';
    }

    return isTauriHost() ? 'ipc' : 'ws';
}

export function getImageSourceStrategy(): ImageSourceStrategy {
    return isTauriHost() && getBackendTransportKind() === 'ipc' ? 'asset' : 'http';
}

function getDefaultBackendHost(): string {
    if (typeof window === 'undefined') {
        return 'localhost';
    }

    const host = window.location.hostname.trim();
    if (!host || host === '0.0.0.0') {
        return '127.0.0.1';
    }

    // Tauri webviews use virtual localhost hostnames that do not resolve to the sidecar bridge.
    if (isTauriHost() || host.endsWith('.localhost')) {
        return '127.0.0.1';
    }

    return host;
}

/**
 * Returns the HTTP/WS origin for the backend server.
 * Only relevant when the runtime transport is WebSocket/HTTP.
 */
export function getBackendOrigin(): string {
    const envUrl = import.meta.env.VITE_BACKEND_URL as string | undefined;
    if (envUrl) {
        return envUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    }

    return `${getDefaultBackendHost()}:${getBackendPort()}`;
}

export function getBackendWsUrl(): string {
    if (getBackendTransportKind() !== 'ws') {
        throw new Error('getBackendWsUrl() called while backend transport is IPC');
    }

    const protocol = getDeploymentMode() === 'cloud' ? 'wss' : 'ws';
    return `${protocol}://${getBackendOrigin()}`;
}

export function resolveImageUrl(path: string | undefined | null): string | null {
    if (!path) {return null;}

    if (getImageSourceStrategy() === 'asset') {
        try {
            return convertFileSrc(path);
        } catch {
            return null;
        }
    }

    const protocol = getDeploymentMode() === 'cloud' ? 'https' : 'http';
    return `${protocol}://${getBackendOrigin()}/image?path=${encodeURIComponent(path)}`;
}
