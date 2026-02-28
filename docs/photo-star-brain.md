# PhotoStar2 Semantic Brain

This document serves as the "Semantic Brain" for the PhotoStar2 project. It provides AI coding assistants with high-level architectural context, data flows, and project guidelines.

**Rule:** This document MUST be kept up-to-date whenever there are significant structural changes to the project (e.g., new job types, shifting data storage folders, changing core patterns).

## Project Architecture (Sidecar Pattern)

The project strictly adheres to a segmented 3-tier structure:

1. **UI (React/Vite)**
   - Pure presentation layer.
   - **Constraint:** NEVER access `fs`, `path`, or database directly. Dispatches commands and reads data via the backend over WebSocket/Tauri IPC.
2. **Core (Node.js)**
   - The "Brain" and "Muscle".
   - Handles all filesystem I/O, SQLite database interaction, and heavy background jobs.
3. **Shell (Rust/Tauri)**
   - Thin OS wrapper providing native windows and OS-level integrations.

## Data Storage

- **SQLite Database:** Stores asset metadata, extracted features (faces), and clustering info. Located in the app state directory as `photos.db`.
- **Thumbnails/Previews:** Stored in the `previews/` directory alongside the DB.
  - Sizes: `thumbnail` (450px width, original aspect), `large` (1080px width, original aspect).
  - Version: **v3** (switched from fixed-ratio cropping to original aspect in 0.1.31).

## Background Jobs & Coordinator

Jobs are managed by the `Coordinator` (`core/src/coordinator/index.ts`) which watches domain events and batches subsequent tasks to prevent blocking. The **Dashboard** aggregates these jobs into functional classes:

1. **Photo Onboarding (Ingest/Discovery):**
   - `scan.ts`: Discovers new media files in directories.
   - **New:** Performs a pre-scan file count for accurate 0-100% progress reporting.
   - `previews.ts`: Generates thumbnail and large preview images.
2. **AI Analysis Pipeline (Slow Phase):**
   - Runs only after ingest is stable.
   - `detect_faces.ts`: Locates bounding boxes of faces within images.
   - `recognise_faces.ts`: Generates facial embeddings via ONNX models.
   - `cluster_faces.ts`: Groups embeddings to identify unique individuals across the library.

## Event-Driven Flow

- The UI dispatches commands to the Core (Node.js).
- The Core executes local tasks or kicks off jobs asynchronously and emits domain events (e.g., `PreviewGenerated`, `FacesDetected`).
- The `Coordinator` listens to these events to map triggers to subsequent jobs (e.g., `FacesDetected` -> triggers `FaceEmbeddingGenerated`).
- The UI listens to these events (WebSocket/IPC bridge) to display real-time progress and keep state synchronized without heavy polling.

## Project Rules: Nomenclature & Background Jobs

**STRICT RULE:** All background processing systems, workers, database tables, and UI components MUST adhere to the following terminology map:

1. **Job:** The high-level intent or overarching process holding business value (e.g., "Scanning `C:\Photos`"). A `Job` represents the *entire* batch of work to be done. 
2. **Task:** The smallest, atomic unit of measurable work within a Job (e.g., "Scanning a single file `image01.jpg`", "Detecting faces in `IMG_2030.HEIC`").
3. **Pipeline Stage:** The specific classification or category of processing the Job is currently running (e.g., `onboarding`, `previews`, `face_analysis`, `bulk_ingest`). Previously referred to as "Job Kind", "Job Type", or "Job Class".
4. **Queue/Batch:** Internal orchestration structures pointing to pending `Tasks` to be processed as part of a `Job`.
5. **Event:** System-wide domain notification tracking the progression of a `Job` (e.g., `JobStarted`, `JobProgress`, `JobCompleted`, `JobFailed`). Event payloads MUST use `jobId` and `pipelineStage` rather than legacy terms.
