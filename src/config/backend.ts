/**
 * backend.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Single source of truth for "how do I talk to the backend?".
 *
 * Resolution priority:
 *   1. Tauri detected  → IPC (stdin/stdout) + convertFileSrc()
 *   2. VITE_BACKEND_URL set at build time → use that origin (cloud / staging)
 *   3. Fallback → derive from window.location.hostname (LAN / dev mode)
 *
 * Nothing outside this module should hardcode 'localhost:5174'.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { convertFileSrc } from '@tauri-apps/api/core';

// ---------------------------------------------------------------------------
// Deployment mode detection
// ---------------------------------------------------------------------------

export type DeploymentMode = 'tauri' | 'lan' | 'cloud';

export function getDeploymentMode(): DeploymentMode {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        return 'tauri';
    }
    // VITE_BACKEND_URL is set at build time for cloud / staging deployments.
    // It will be undefined in dev / LAN mode.
    if (import.meta.env.VITE_BACKEND_URL) {
        return 'cloud';
    }
    return 'lan';
}

// ---------------------------------------------------------------------------
// Backend origin
// ---------------------------------------------------------------------------

const BACKEND_PORT = 5174;

/**
 * Returns the HTTP/WS origin for the backend server.
 * Not valid in Tauri mode (IPC is used instead).
 *
 * Examples:
 *   LAN:   "192.168.0.117:5174"  (or "localhost:5174" if accessed locally)
 *   Cloud: "api.example.com"     (from VITE_BACKEND_URL, no port)
 */
export function getBackendOrigin(): string {
    const envUrl = import.meta.env.VITE_BACKEND_URL as string | undefined;
    if (envUrl) {
        // Strip protocol if someone accidentally included it
        return envUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    }
    // LAN / dev: use the same hostname the frontend was served from,
    // so it auto-works for both localhost and any LAN IP.
    const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    return `${host}:${BACKEND_PORT}`;
}

// ---------------------------------------------------------------------------
// WebSocket URL
// ---------------------------------------------------------------------------

/**
 * Returns the full WebSocket URL for the backend bridge.
 * Uses wss:// in cloud mode (VITE_BACKEND_URL), ws:// otherwise.
 */
export function getBackendWsUrl(): string {
    const mode = getDeploymentMode();
    if (mode === 'tauri') {
        throw new Error('getBackendWsUrl() called in Tauri mode — use IPC instead');
    }
    const protocol = mode === 'cloud' ? 'wss' : 'ws';
    return `${protocol}://${getBackendOrigin()}`;
}

// ---------------------------------------------------------------------------
// Image URL resolver
// ---------------------------------------------------------------------------

/**
 * Resolves the correct URL/src for a given file path depending on the
 * current deployment mode.
 *
 *   Tauri:  convertFileSrc() → native asset:// protocol (fast, no HTTP)
 *   LAN:    http://<host>:5174/image?path=…
 *   Cloud:  https://<host>/image?path=…
 *
 * Returns null if path is undefined/empty.
 */
export function resolveImageUrl(path: string | undefined | null): string | null {
    if (!path) return null;

    const mode = getDeploymentMode();

    if (mode === 'tauri') {
        try {
            return convertFileSrc(path);
        } catch {
            return null;
        }
    }

    const protocol = mode === 'cloud' ? 'https' : 'http';
    return `${protocol}://${getBackendOrigin()}/image?path=${encodeURIComponent(path)}`;
}
