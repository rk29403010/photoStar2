# Photo Library Desktop Prototype – Technical Specification

## Purpose

Define a **buildable prototype** that demonstrates the core architecture for a local-first photo library application, using a modern, privacy-resilient tech stack. This document is intended to be handed to **Antigravity** (or equivalent agent IDE) to implement end-to-end.

The prototype is not a throwaway spike: it should form the **spine** of a future commercial product.

---

## Core Goals

1. Simple desktop install (no Python, no manual dependencies)
2. Local-first handling of large photo libraries
3. Cloud AI augmentation, with local fallbacks
4. Explicit support for **reprocessing** as models, prompts, and costs change
5. Modular design so experimental features can be slotted in later

Non-goals for this prototype:

- Mobile app
- Multi-user sync
- Full Google Photos live integration

---

## Target Platforms

- Desktop only (macOS, Windows, Linux)
- Local filesystem access required

---

## Technology Stack (Locked)

### Language

- **TypeScript** (single language across UI, workers, shared models)

### Desktop Shell

- **Tauri**

### UI

- React
- Vite
- Virtualised grid (for large libraries)

### Local Backend / Core

- Tauri command layer
- No embedded web server

### Workers

- Node.js worker processes (spawned by Tauri)
- Long-running, cancellable jobs

### Database

- SQLite (WAL mode)
- Accessed only by core / workers (not UI)

### Local AI Runtime

- ONNX Runtime (CPU)
- Pre-trained face detection + face embedding models

### Cloud AI

- Google Gemini APIs (2.5 + 3)
- Abstracted behind provider interfaces

---

## High-Level Architecture

UI (React)
  → Tauri Commands
    → Core (DB, FS, Job orchestration)
      → Node Workers
        → ONNX Runtime (local inference)
        → Cloud AI APIs (optional)

UI never:

- Reads raw image bytes
- Traverses directories
- Runs ML inference

---

## Prototype Scope

### 1. Library Ingest

#### User Flow

- User selects a **root folder** via native dialog
- Ingest job begins
- Progress is shown (file count + stages)

#### Backend Responsibilities

- Recursive directory scan
- Ignore non-image files
- Compute:
  - File path
  - File size
  - SHA-256 hash
  - Basic EXIF (date, camera)
- Store assets in SQLite

Deliverable:

- Library view populated from local folder

---

### 2. Preview Generation

- Generate thumbnails (e.g. 256px, 1024px)
- Store in local cache directory
- Cache invalidation handled by versioning

Deliverable:

- Smooth scrolling grid UI

---

### 3. Local Face Detection (Required)

#### Capabilities

- Detect faces in photos
- Return bounding boxes

#### Implementation

- ONNX face detection model
- Node worker loads model once
- Results stored as derived artefacts

No face recognition required in v1.

Deliverable:

- Face boxes visible as overlays in UI

---

### 4. Local Face Embeddings (Stretch but recommended)

#### Capabilities

- Generate embedding vectors per detected face
- Store vectors for future matching

No identity assignment in prototype.

Deliverable:

- Embeddings stored and queryable

---

### 5. Cloud Image Description (Optional / Toggleable)

- Use Gemini 2.5 for:
  - Basic image description
  - Scene labels
- Run only on user-selected images

Deliverable:

- Text description shown in asset detail view

---

### 6. Reprocessing Model

All derived data must include:

- task (e.g. face_detection, description)
- provider (local_onnx, gemini_2.5)
- model_version
- input_resolution
- created_at

Original files are immutable.
Derived artefacts are disposable and replaceable.

Deliverable:

- Ability to re-run a task on selected assets

---

## Database – Minimal Schema

### assets

- id (uuid)
- original_path
- file_hash
- file_size
- exif_datetime
- created_at

### previews

- asset_id
- size
- path
- version

### derived_results

- id
- asset_id
- task
- provider
- model_version
- data (json)
- created_at

Indexes required on:

- asset_id
- task

---

## Job System

All heavy work runs as jobs.

Job properties:

- id
- type
- status
- progress
- cancelable

Jobs to implement:

- scan_folder
- generate_previews
- detect_faces
- describe_images (cloud)

---

## Plugin / Experiment Contract

External tools (AI Studio, notebooks, scripts) may emit results if they conform to:

```json
{
  "asset_id": "uuid",
  "task": "custom_experiment",
  "provider": "external",
  "model_version": "...",
  "data": { },
  "created_at": "..."
}
```

Core system must be able to import and display these results.

---

## Out of Scope (Explicit)

- User accounts
- Sync between devices
- Google Photos live API
- Local ML training

---

## Success Criteria for Prototype

- Installer runs on a clean machine
- User can ingest a large local folder
- UI remains responsive during processing
- Face detection runs fully offline
- Reprocessing is possible without data loss

---

## Handover Notes for Antigravity

- Prioritise architecture correctness over polish
- Keep boundaries explicit (UI vs core vs worker)
- Avoid shortcuts that block future local AI expansion
- Document assumptions in code

## Appendix 1

End of specification.
