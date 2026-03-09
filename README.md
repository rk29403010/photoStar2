# Photo Library Desktop (PhotoStar2)

A desktop application for managing, scanning, and processing your photo library. Built with a modern, high-performance architecture.

## Architecture

This project strictly adheres to the **Antigravity IDE** standard "Sidecar Architecture":

1. **Rust (The Shell):** Tauri window manager. It provides the OS bridge and bootstraps the environment.
2. **Node.js Sidecar (The Core):** Handles ALL filesystem I/O, database interactions (SQLite), and heavy background jobs (e.g., face detection, image hashing).
3. **React/Vite (The UI):** A pure presentation layer. It communicates with the core sidecar via events and commands. No direct disk or DB access.

## Features

- **Smart Directory Scanning:** Recursively scans folders for assets.
- **Media Previews:** Automatically generates thumbnails.
- **AI Processing (ONNX):** Implements Face Detection, Recognition, and Clustering locally.
- **Event-Driven UI:** UI updates in real-time as jobs process in the background.

## Storage & Data Structure

- **Database:** SQLite database (`photos.db`) located in the application's state directory.
- **Previews:** Generated thumbnails are stored in the `previews/` directory alongside the database. Sizes generated:
  - `thumbnail`: 256px (for gallery views)
  - `large`: 1024px (for full-screen viewing)

## Background Jobs & Processing

The `core` sidecar handles heavy lifting via a backend job `Coordinator` that orchestrates event-driven pipelines:

1. **Fast Phase (Ingest & Previews):**
   - **`scan`:** Discovers media and triggers ingestion.
   - **`previews`:** Batches resize requests to generate `thumbnail` and `large` JPEGs.
2. **Slow Phase (AI & Analysis):**
   - **`detect_faces`:** Runs models to find faces in the media.
   - **`recognise_faces`:** Generates embeddings for the detected faces.
   - **`cluster_faces`:** Groups similar facial embeddings to identify distinct individuals.

## Development Setup

### Prerequisites

- Node.js (v18+)
- Rust & Cargo
- Visual Studio C++ Build Tools (for Windows native modules)

### Install Dependencies

```bash
npm install
cd core
npm install
cd ..
```

### Running the App (Standard)

```bash
npm run tauri dev
```

*Note: This runs `smart_build.js` which compiles and packages the Node sidecar before launching Tauri.*

### Running the App (Desktop Dev Mode)

```bash
npm run dev:desktop
```

This launches the Tauri shell, the Vite frontend in `desktop-dev` mode, and the
watched Node sidecar together. The UI still runs inside the Tauri window, but
the frontend talks to the sidecar over `ws://localhost:5174` so backend changes
do not require rebuilding the packaged sidecar binary on every edit.

### Speeding up the Development Loop Further

Packaging the Sidecar binary (`pkg`) on every change is slow. For rapid backend development:

1. Start the browser/LAN dev loop:

   ```bash
   npm run dev
   ```

2. Use `npm run dev:desktop` when you want the same watched sidecar, but hosted in the Tauri shell instead of a browser tab.

## Scripts Overview

- `npm run dev`: Starts Vite frontend and watched core sidecar for browser/LAN development.
- `npm run dev:desktop`: Starts the Tauri shell with Vite `desktop-dev` mode and the watched core sidecar.
- `npm run build:core`: Uses `smart_build.js` to compile and package the Node sidecar to an executable.
- `npm run tauri`: Tauri CLI wrapper.
- `npm run lint`: ESLint check.
- `npm run lint:fix`: ESLint autofix across the repo.
- `npm run quality`: Main local quality gate (`lint` + app `typecheck` + core `typecheck` + `lint:md` + complexity report).
- `npm run quality:staged`: Autofix and lint staged JS/TS files before commit.
- `npm run complexity:report`: Local complexity report to catch AI-generated sprawl early.
- `npm run complexity:staged`: Reject staged TS functions that exceed the local complexity/size thresholds.
- `npm run typecheck`: Full TypeScript check when you want to pay down existing typing debt.
- `npm run lint:md` / `fix:md`: Markdownlint check and fix.

## Code Quality Guardrails

This repo uses local, non-AI guardrails rather than paid scanning:

- ESLint is the hard gate for TypeScript and React code.
- `npm run quality` is the baseline check before shipping changes.
- `npm run build` now uses the same baseline gate before producing the frontend build.
- A git `pre-commit` hook resolves staged files with `git`, then passes that explicit file list into the staged lint and complexity checks.
- `npm run complexity:report -- --top 20 --min-cyclomatic 10` gives a cheap Sonar-style smell report for sprawling functions.
- `npm run typecheck`, `npm run typecheck:core`, and `npm run lint:md` are all part of the default gate.

The repo-level AI instructions live in [AGENTS.md](/c:/Users/robin/Projects/photoStar2/AGENTS.md).
