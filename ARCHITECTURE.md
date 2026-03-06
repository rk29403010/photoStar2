# PhotoStar Architecture

## Overview

PhotoStar is designed to run across a spectrum of deployment modes — from a
self-contained laptop app to a headless server with a remotely hosted frontend.
The same React SPA and the same Node.js backend serve all modes; only the
**transport layer** and **image resolution strategy** adapt at runtime.

---

## Deployment Modes

### Mode 1 — Tauri (packaged desktop app)

```text
┌──────────── Tauri shell (Rust) ──────────────┐
│  ┌────────────────┐   stdin/stdout IPC        │
│  │  React SPA     │◄─────────────────────────►│ Node.js sidecar
│  │  (WebView)     │   convertFileSrc()        │ (core/)
│  └────────────────┘   native asset://         │
└──────────────────────────────────────────────┘
         local filesystem (direct read)
```

- **Comms:** stdin/stdout between React host and Node sidecar — zero network overhead.
- **Images:** Tauri's `convertFileSrc()` maps local paths to a native `asset://` protocol; no HTTP involved.
- **Constraints:** Must compile for target OS. Heavy native bindings
  (TensorFlow) must be available as pre-built NAPI binaries for the platform.
- **Best for:** Single-user, offline-capable, maximum performance.

---

### Mode 2 — Local Network / headless server (current dev target)

```text
 Wife's browser ──── Wi-Fi ────►  Laptop / NAS / Pi
  React SPA                        Node.js (core/)
    │                                   │
    │  ws://192.168.x.x:5174            │ listens 0.0.0.0:5174
    │  http://192.168.x.x:5174/image    │ serves /image endpoint
    └───────────────────────────────────┘
```

- **Comms:** WebSocket over the local network. The backend URL is derived from
  `window.location.hostname` so the same build works whether accessed from
  `localhost` or a LAN IP.
- **Images:** HTTP `/image?path=` endpoint served by the backend.
- **Constraints:** The backend must have filesystem access to the photos. No
  Tauri/Rust required. TensorFlow native bindings still work as the backend
  runs on the server OS.
- **Best for:** Multi-user family access, always-on NAS deployment, dev sharing.

---

### Mode 3 — Cloud (future)

```text
  User's browser ──── Internet ────►  Cloud VM / container
   React SPA                            Node.js (core/)
    │  (hosted on CDN / static host)        │
    │  wss://api.example.com/ws             │ listens 0.0.0.0:443 (TLS)
    │  https://api.example.com/image        │ photos in cloud storage
    └───────────────────────────────────────┘
```

- **Comms:** Secure WebSocket (`wss://`). Backend URL supplied via
  `VITE_BACKEND_URL` build-time env var or runtime config endpoint.
- **Images:** HTTPS image endpoint, or presigned URLs for cloud storage (S3/GCS).
- **Auth:** Required — bearer token or session cookie on every WebSocket
  connection and image request.
- **Constraints:** Local filesystem scanning and native TF bindings are not
  available in serverless contexts. Face detection / sensitive-content jobs
  must run on the cloud VM, not the user's browser.
- **Best for:** SaaS product, remote access, multi-user with accounts.

---

## The Transport Abstraction Layer

All "which backend, how to connect" logic lives in one place:

```text
src/config/backend.ts
```

The module exposes:

| Export                  | Purpose                                                |
| ----------------------- | ------------------------------------------------------ |
| `getBackendWsUrl()`     | WebSocket URL (`ws://` / `wss://`) for the current env |
| `resolveImageUrl(path)` | Correct image URL strategy for the current env         |
| `getDeploymentMode()`   | `'tauri'` \| `'lan'` \| `'cloud'`                      |

Resolution priority:

1. **Tauri detected** (`window.__TAURI_INTERNALS__`) → use IPC / `convertFileSrc`
2. **`VITE_BACKEND_URL` set** at build time → use that origin (cloud mode)
3. **Fallback** → derive from `window.location.hostname:5174` (LAN / dev mode)

---

## Feature Availability by Mode

| Feature                    | Tauri | LAN            | Cloud            |
| -------------------------- | ----- | -------------- | ---------------- |
| Gallery browse             | ✅     | ✅              | ✅                |
| Folder scan                | ✅     | ✅              | ⚠️ server FS only |
| Preview generation         | ✅     | ✅              | ✅                |
| Face detection (TF native) | ✅     | ✅              | ✅ on server      |
| Sensitive content scan     | ✅     | ✅              | ✅ on server      |
| AI metadata (Gemini)       | ✅     | ✅              | ✅                |
| Native file picker         | ✅     | ❌ (text input) | ❌ (text input)   |
| Offline use                | ✅     | ⚠️ LAN only     | ❌                |
| Multi-user                 | ❌     | ✅ (no auth)    | ✅ (with auth)    |

---

## Port Reference

| Port   | Service                         | Notes                                    |
| ------ | ------------------------------- | ---------------------------------------- |
| `5173` | Vite dev server (frontend)      | Dev only; production uses static hosting |
| `5174` | Node.js HTTP + WebSocket bridge | All non-Tauri modes                      |

---

## Adding a New Deployment Mode

1. Add a detection strategy in `src/config/backend.ts`.
2. Implement `getBackendWsUrl()` and `resolveImageUrl()` for the new case.
3. Update this document and the feature availability table.
4. Add a firewall / network note to `README.md`.
