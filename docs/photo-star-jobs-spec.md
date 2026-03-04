# PhotoStar Job Management Specification

## 1. Vocabulary (Approved Standard)

* **Job**: The overarching logical unit of work requested by the system or user (e.g., "Scan folder X", "Generate missing thumbnails"). A Job is assigned a unique `jobId`.
* **Task**: A smaller, atomic unit of measurable work executed within a Job (e.g., "Extract EXIF for image A", "Detect faces in image B").
* **Pipeline Stage**: The specific classification or category of processing the Job is currently running (e.g., `onboarding`, `previews`, `face_analysis`, `bulk_ingest`). Previously referred to as "Job Kind", "Job Type", or "Job Class".
* **Queue**: The persistent or in-memory holding area for pending work. Currently, the `Coordinator` holds a simple in-memory queue.
* **Batch**: A specific collection of items (like `mediaIds`) pulled from the Queue and handed to a Worker/Job to process simultaneously or sequentially as a group to minimize overhead.
* **Event**: A domain signal (e.g., `JobStarted`, `JobProgress`, `JobCompleted`) emitted upon the completion of a Task or Job. Event payloads MUST use `jobId` and `pipelineStage`.

## 2. Defined Jobs

```mermaid
flowchart TD
    UI[User Interface] -->|scan_folder| Scan[Folder Scan Job]
    Scan -->|MediaDiscovered| Coord(Coordinator)
    Coord -->|Batch Query| Prev[Preview Generation Job]
    Prev -->|PreviewGenerated| Coord
    Coord -->|Batch Query| Detect[Face Detection Job]
    Detect -->|FacesDetected| Coord
    Coord -->|Batch Query| Recog[Face Recognition Job]
    Recog -->|FaceEmbeddingGenerated| Coord
    Coord -->|All Recog Done| Cluster[Face Clustering Job]
    
    subquote Ingest Phase
        Scan
    end
    
    subquote Processing Phase
        Prev
    end
    
    subquote AI Analysis Pipeline
        Detect --> Recog --> Cluster
    end
    
    classDef ui fill:#333,stroke:#666,stroke-width:2px,color:#fff
    classDef job fill:#1c3d5a,stroke:#2b6cb0,stroke-width:2px,color:#fff
    classDef coord fill:#4a5568,stroke:#718096,stroke-width:2px,color:#fff
    class UI ui
    class Scan,Prev,Detect,Recog,Cluster job
    class Coord coord
```

### 2.1. Folder Scan (`scan.ts`)

* **Description**: Discovers new media files in directories, extracts EXIF data, and registers assets in the database. Operates as a Job consisting of many file-level Tasks.
* **Stage**: `Ingest`
* **Trigger**: User request via UI (`scan_folder` command).
* **Input**: `rootPath` (string directory path).
* **Output**: New records in the `assets` table. Emits `MediaDiscovered` events for the Coordinator.
* **DB Fields Accessed**:
  * *Reads*: `assets` (checks for existing `original_path`), `processing_issues` (skips fatal errors), `derived_results` / `previews` (checks if post-processing is incomplete to re-trigger pipeline).
  * *Writes*: `assets` (inserts metadata like `file_hash`, `width`, `height`, `exif_datetime`).
* **Performance**: Fast (disk I/O bound). Uses a two-pass approach: a quick initial recursive step to count files for accurate 0-100% progress reporting, followed by a deeper pass for metadata extraction.

### 2.2. Preview Generation (`previews.ts`)

* **Description**: Generates normalized WebP thumbnail and large preview images for assets.
* **Stage**: `Preview`
* **Trigger**: `PreviewRequested` event, emitted by the `Coordinator` (buffering `MediaDiscovered` events into a Batch), or a manual full rebuild Job.
* **Input**: Batch array of `mediaIds`.
* **Output**: WebP images saved to the `previews/` directory (`thumbnail` at 450px and `large` at 1080px width). Emits `PreviewGenerated`.
* **DB Fields Accessed**:
  * *Reads*: `assets` (`original_path`).
  * *Writes*: `previews` table (`asset_id`, `size`, `path`, `version`).
* **Performance**: Moderate (CPU bound). Powered by `sharp`. Employs a versioning system (`CURRENT_PREVIEW_VERSION = 3`) to intelligently skip or overwrite existing thumbnails when the generation algorithm is updated.

### 2.3. Face Detection (`detect_faces.ts`)

* **Description**: Analyzes images to locate the bounding boxes and landmarks of human faces.
* **Stage**: `Analysis`
* **Trigger**: `FaceDetectionRequested` event, usually initiated by the `Coordinator` during the "slow" ingest phase, or run as a background Job against the Queue of unprocessed assets.
* **Input**: Batch array of `mediaIds` or an 'auto' sweep string.
* **Output**: Defines locations of faces in the image. Emits `FacesDetected`.
* **DB Fields Accessed**:
  * *Reads*: `assets` (`original_path`).
  * *Writes*: `derived_results` with `task = 'face_detection'`. JSON payload contains `faces` array (unique `id`, `box`, `score`, `landmarks`).
* **Performance**: Slow (CPU/GPU bound). Utilizes ONNX Runtime with a RetinaFace/Buffalo_L model (`det_10g.onnx`). Images are resized to 640x640 before inference.

### 2.4. Face Recognition (`recognise_faces.ts`)

* **Description**: Computes 512-dimensional embedding vectors for previously detected faces to enable facial matching.
* **Stage**: `Analysis`
* **Trigger**: Coordinator debounces `FacesDetected` events and triggers a sweep Job.
* **Input**: Queue of assets that possess `face_detection` results but lack `face_recognition` results.
* **Output**: Array of embeddings. Emits `FaceEmbeddingGenerated`.
* **DB Fields Accessed**:
  * *Reads*: `derived_results` (to parse bounding boxes and landmarks from detection phase), `assets` (`original_path`).
  * *Writes*: `derived_results` with `task = 'face_recognition'`. JSON payload contains `embeddings`.
* **Performance**: Very Slow (CPU/GPU bound). Utilizes an ArcFace ONNX model (`w600k_r50.onnx`). Requires dynamically cropping and aligning each detected face to 112x112 pixels before running single-face inference.

### 2.5. Face Clustering (`cluster_faces.ts`)

* **Description**: Groups individual face embeddings to identify unique people across the entire library.
* **Stage**: `Analysis`
* **Trigger**: Coordinator debounces `FaceEmbeddingGenerated` events.
* **Input**: All embeddings stored in the database.
* **Output**: Grouped identities mapped to individual faces, and a 1.5x padded cropped thumbnail for each identified person.
* **DB Fields Accessed**:
  * *Reads*: `derived_results` (recognition embeddings), `assets` (for thumbnail generation).
  * *Writes*: Wipes and inserts fresh records into `people` and `face_assignments` tables.
* **Performance**: Variable depending on library size. Pulls all embeddings into memory and runs a naive Agglomerative Clustering algorithm (O(N²) complexity) using Cosine Similarity (threshold 0.65). Sequential thumbnail generation via `sharp` further adds to overall execution time.

## 3. Dashboard Presentation

The Job Dashboard serves as the primary visual interface for monitoring background processing.

* **One Card Per Job**: The dashboard must display one distinct status card for each defined **Job** (e.g., "Folder Scan", "Face Detection"), *not* one card per Pipeline Stage. Users relate more intuitively to specific operations rather than grouped abstract stages.
* **Stage Grouping & Visuals**: While each Job has its own card, cards belonging to the same **Pipeline Stage** should be grouped logically together in the layout.
* **Highlight Colors**: Each Pipeline Stage should be assigned a distinct highlight color (e.g., a colored top border or icon tint) to visually connect related Job cards at a glance.
  * *Example*: `Ingest` jobs (Folder Scan) might share a blue accent, `Preview` jobs a green accent, and `Analysis` jobs (Detection, Recognition, Clustering) a purple accent.
* **Metrics per Card**: Each Job card should display its own specific metrics independently:
  * Current State (Idle, Running, Paused, Completed).
  * Progress (0-100% completion based on tracked items).
  * Active/Incoming Count.
  * Average Processing Duration / Throughput (items/sec).
  * Specific recent errors related to that exact Job.

## 4. Review: Unimplemented Features & Deviations

Based on the initial design intentions and recent discussions, the following deviations and unimplemented features exist in the job management system:

1.[x] **Job Queue Persistence & Retries**: The `Coordinator` notes state that it utilizes a "Simple in-memory task queue for now". The queue is primarily used for immediate batching (e.g., waiting 500ms to group previews). It lacks persistence across restarts, nor does it have robust retry logic for failed items beyond skipping fatal errors on rescan.
2. **Dashboard Data Mapping Gap**: In `main.ts` (`get_system_jobs`), the backend currently aggregates multiple distinct Jobs (`detect-` and `recog-`) under broad "class" summaries (like `class-detection` and `class-mapping`), which blurs the lines. Also, the `cluster_faces` job metrics are currently omitted from detailed tracking entirely. The backend payload needs adjusting to supply precise per-Job stats to fulfill the 1-card-per-job UI requirement.
3. **Destructive Clustering Method**: `cluster_faces.ts` completely wipes the `face_assignments` and `people` tables on every run, recalculating identities from scratch. This deviates from an efficient incremental approach and becomes a scaling bottleneck as the library grows.
4. **Premature "Slow" Phase Transition**: The `Coordinator` shifts from 'fast' ingest phase to 'slow' AI phase upon the very first Task completion event. In a complex, multi-folder scenario, this might trigger the heavy AI pipeline before the entire ingest backlog is fully stable.

1. Rename Face recognition to Face detection in the dashboard
2. [x] Face clustering needs to run automatically. Clustering should be triggered from events raised by the face recognition job.
3. [x] Face clustering must not wipe data tables when it starts, it should be incremental. However, make sure that edge cases are handled, such as when a photo is rescanned and one or more faces are no longer found, the face assignments should be updated accordingly.
4. [x] We need to make face thumbnails cutout from the original image. Not sure which job is best placed for that? Or it could be a new job that's triggered by the face recognition/detection job.
5. [x] Dashboard - still has a card for ingest session??
6. Vistual representation of the jobs, and how they link together to form a workflow.
7. [x] don't show face rectangle in gallery view
8. Do show face rectangles in single view mode - on a toggle option, default to off.
9. Hovering over the face rectangle in single view mode should show the name of the person, if known.
