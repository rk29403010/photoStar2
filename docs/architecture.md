# Photo Star 2 Architecture Protocol

## System Layers and Strict Boundaries

Photo Star 2 employs a strict "dumb UI, smart sidecar" architecture. Bypassing these boundaries is strictly forbidden.

### 1. The Presentation Layer (Pure UI)

* **Location:** `src/` (Vite, React, Tailwind)
* **Rule:** The UI is purely for requesting data, rendering data, and dispatching user intents.
* **Constraint:** The UI must NEVER import `fs`, `path`, or `sqlite3`. It must never directly write to disk or query the database, even if OS-level APIs exist in Tauri. All interactions must go through the Node Sidecar.
* **Component Structure:** Components should be highly modular. Avoid monolithic components (like the legacy 1000-line `SinglePhotoView`). Break complex views down into smaller, composable parts and custom hooks.

### 2. The Transport Layer (WebSocket/Tauri IPC)

* **Boundary:** This layer serves as the strict boundary between the UI and Sidecar.
* **Validation:** All incoming requests from the UI DO NOT enter the Domain Layer until they pass strict `Zod` schema validation (`shared/types/schemas.ts`).

### 3. The Transport Handlers

* **Location:** `core/src/handlers/`
* **Rule:** Handlers (e.g., `SystemHandler`, `AssetHandler`) consume validated payloads and orchestrate the Domain operations. They do not write SQL directly. They rely on Data Access Repositories.

### 4. The Domain / Service Layer

* **Location:** `core/src/jobs/` and `core/src/coordinator.ts`
* **Rule:** Any operation that takes longer than 100ms MUST be implemented as a background Job.
* **Rule:** Jobs must never block the main thread blindly. They must periodically yield, check cancellation/pause state (`waitIfPaused()`), and emit progress metrics to the `EventBus`.

### 5. The Data Access Layer (Repositories)

* **Location:** `core/src/db/repositories/`
* **Rule:** Direct interaction with `better-sqlite3` must be abstracted inside a Repository class (e.g., `AssetRepository`, `JobRepository`). Handlers should call class methods, not `.prepare().run()`.

## Anti-Pattern Guidelines for AI

* **No Catch-All Functions:** Do not use massive switch statements to route commands (like the legacy `main.ts`). Create specialized Handler classes.
* **No Invisible State:** Use the centralized `SystemState` manager and `EventBus`.
* **Prompts are Code:** AI model prompts (Gemini, etc.) should be maintained as variables or configuration, not hard-coded deeply inside operational logic. Treat them like SQL query strings.
* **Maintain Dev Parity:** The application runs in both a Tauri Native context AND a Chrome Browser context via local port 5174. Fallbacks must exist if a Tauri-only API is missing during browser development.
