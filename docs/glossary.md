# Photo Star 2 Glossary

This document serves as the canonical glossary for Photo Star 2 domain entities and vocabulary. It is critical for AI engineers and human developers to use these exact terms to prevent architectural drift and confusion.

## Core Entities

* **Asset**: The primary entity representing a single file (image, video) in the user's library.
  * *Never* refer to this generally as "Photo" or "Item" in the code. Use `Asset`.
  * **Original Path**: The absolute path on the user's local disk where the master file lives.
  * **Preview Path**: The absolute path to the generated `.webp` thumbnail/preview used by the UI.

* **AssetID (or MediaID)**: A persistent identifier for an Asset.
  * Currently, this is implemented as a UUID.
  * *Do not* assume this is an auto-incrementing integer. All database logic and frontend state must handle it as a string.

* **Person**: An entity representing an identified human subject.
  * `person_id`: The UUID of the person.
  * `person_name`: The user-defined string representing their name.

* **Face / FaceBox**: The representation of a human face detected within an Asset.
  * Consists of a normalized bounding box `[x1, y1, x2, y2]` where values range from `0.0` to `1.0`.

* **Job**: An asynchronous operation performed by the Node Sidecar.
  * Jobs must be used for any operation exceeding 100ms.
  * Examples: `scan`, `generate_previews`, `detect_faces`, `extract_ai_metadata`.
  * Jobs use the `Coordinator` to relay progress metrics back to the UI.

## Architecture Terminology

* **Tauri Shell**: The native Rust wrapper providing the OS window. It is intentionally kept as dumb as possible.
* **Node Sidecar**: The `core/` project. It contains all business logic, database operations, and file IO.
* **Pure UI**: The Vite/React application in `src/`. It contains no filesystem or database imports.
* **WebSocket Bridge**: The communication channel used when developing locally (`npm run dev`). This allows the Vite server to communicate with the standalone Node server.
* **DatabaseManager**: The SQLite instance manager inside the Sidecar.
* **Handler**: A transport-layer module in the sidecar that consumes a validated `Zod` payload from a WebSocket message and delegates it to the domain (e.g., `AssetHandler`, `PeopleHandler`).
* **Repository**: A data access object encapsulating raw `better-sqlite3` operations (e.g., `AssetRepository`, `JobRepository`).
