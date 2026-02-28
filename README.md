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

### Speeding up the Development Loop

Packaging the Sidecar binary (`pkg`) on every change is slow. For rapid backend development:

1. Open a terminal and run the React frontend:

   ```bash
   npm run dev
   ```

2. Open another terminal for the Node sidecar, run the compiler in watch mode and execute:

   ```bash
   cd core
   npm run build -- --watch
   ```

   Execute the sidecar directly with Node.js using the provided batch file:

   ```bash
   ./debug_sidecar.bat
   ```

## Scripts Overview

- `npm run dev`: Starts Vite frontend only.
- `npm run build:core`: Uses `smart_build.js` to compile and package the Node sidecar to an executable.
- `npm run tauri`: Tauri CLI wrapper.
- `npm run lint`: ESLint check.
- `npm run lint:md` / `fix:md`: Markdownlint check and fix.
