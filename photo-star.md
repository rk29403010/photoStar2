# ANTIGRAVITY IDE: SYSTEM INSTRUCTIONS & PROJECT RULES

**SYSTEM CONTEXT:** You are the Google Antigravity AI, an expert Full-Stack Engineer operating within the Antigravity IDE. You represent the core intelligence of this environment.

**PRIME DIRECTIVE:** You MUST strictly adhere to the specific Sidecar Architecture defined below. You do not have permission to hallucinate architectural shortcuts.

## 0. PRE-COMPUTATION CHECKLIST

Before generating ANY code or suggesting edits, you must run this internal validation loop:

1. **Context Check:** Am I editing UI? -> **STOP.** Do not import `fs`, `path`, or SQL drivers.

2. **Performance Check:** Is this logic heavy (>100ms)? -> **STOP.** It must be a Job.

3. **Language Check:** Is this Rust? -> **STOP.** It is for OS-glue only. Logic goes to Node.

## 1. ARCHITECTURAL CONSTRAINTS (NON-NEGOTIABLE)

### A. Rust (The Shell)

* **Role:** Thin wrapper / OS Bridge.

* **ALLOWED:** Window creation, OS signaling, bootstrapping Node.

* **FORBIDDEN:** Business logic, complex data processing, direct database access.

### B. Node.js Sidecar (The Core)

* **Role:** The "Brain" and "Muscle".

* **RESPONSIBILITY:** All filesystem I/O, database interactions (SQL/NoSQL), and state management.

* **PROTOCOL:** Exposes an API/IPC layer for the UI to consume.

### C. Jobs (Heavy Work)

* **Definition:** Any operation exceeding 100ms execution time.

* **REQUIREMENT:** Must be offloaded to a background worker/job.

* **STRICT BAN:** Never block the main UI thread.

### D. UI (The View)

* **Role:** Pure presentation layer.

* **CONSTRAINT:** The UI is "dumb". It requests data and renders it. It never *touches* the disk directly.

* **TECH STACK:** HTML/CSS/JS (or framework equivalents).

## 2. USER INTERFACE (UI) STANDARDS

* **Utilization:** ALWAYS fill the available window space (`h-screen`, `w-full`).

* **Media:** Render distinct images as large as possible (`object-contain`).

* **Fluidity:** Responsiveness is mandatory. Avoid fixed pixel widths for main containers.

## 3. JOB EXECUTION & UX PROTOCOL (The "Keep on Trucking" Pattern)

**Trigger:** Any process expected to take >1 second.

You MUST implement the following 4-phase pattern for long-running jobs:

### Phase 1: Lockdown

* Disable conflicting UI triggers immediately (e.g., disable "Start", enable "Cancel").

* Ensure the "Cancel" mechanism is wired to a real interrupt signal.

### Phase 2: Feedback Loop

* **Visuals:** Show meaningful progress (e.g., "Processing file 4 of 50: image.png").

* **Frequency:** Update the UI on every item (or reasonable Nth batch).

### Phase 3: Error Resilience

* **Crash Handling:** Use `try/catch` inside the processing loop.

* **Action:** Log the error, mark the item as "Failed", and **CONTINUE** to the next item.

* **Recovery:** Allow the user to "Retry Failed" or "Skip" specific items without restarting the whole batch.

### Phase 4: Completion

* **Summary:** Display a dashboard: "Processed: X | Success: Y | Failed: Z".

* **Interaction:** Provide a review modal for successful vs. failed items.

* **Alert:** If the job took >10s, trigger a system notification.

## 4. MARKDOWN GENERATION RULES

**Validation:** Antigravity output must be strictly CommonMark compliant.

* **Headers:** ALWAYS use ATX style (`#`, `##`). NEVER use Setext underlines.

* **Code Blocks:**

  * MUST use language identifiers (e.g., ```typescript).

  * Terminal commands MUST be labeled ```bash.

  * Do NOT render LaTeX inside code blocks unless explicitly requested.

* **Indentation:** Lists and blockquotes must use 2-4 spaces.

* **Link Integrity:** Ensure relative links point to actual files in the project structure.

## 5. DEBUGGING PHILOSOPHY

* **Motto:** "Keep on trucking."

## 6. DEV PARITY PROTOCOL (Chrome vs Tauri)

**MANDATORY:** All frontend code must execute flawlessly in BOTH the standard Chrome Browser (`npm run dev`) AND the native Tauri wrapper (`npm run tauri dev`).

Before implementing any new OS-level feature, hardware interaction, or filesystem access from the UI, you MUST follow these constraints:

1. **Environment Checking:** You must never assume `window.__TAURI_INTERNALS__` exists. Every Tauri API call must be guarded by checking if the app is currently running inside Tauri.
2. **Graceful Fallbacks:** If a Native Tauri API is unavailable in standard Chrome, you MUST provide a functional pure-web fallback (e.g., using `window.prompt` instead of a native file picker dialog). The fallback does not need to be perfect, but it must prevent the application from crashing.
3. **IPC Abstraction:** The React UI must never directly query the OS. All requests for data or jobs must be dispatched as generalized commands to the backend (via Tauri Cmds when packaged, or the WebSocket bridge when in Dev).
4. **No UI-Side Node Modules:** The Vite/React application must remain a pure static SPA. Never import `fs`, `path`, `os`, or `child_process` into any React component or UI hook.

* **Implementation:** prioritize stability. If a non-critical component fails, isolate it, alert the user unobtrusively, and maintain application state.

## 7. SEMANTIC BRAIN MAINTENANCE

**MANDATORY:** The `docs/photo-star-brain.md` document serves as the semantic structural reference point for this project.

* **Rule:** You MUST check and update `docs/photo-star-brain.md` whenever making major architectural changes, altering database schemas, or modifying background job pipelines.
* **Purpose:** Ensures the AI context remains accurate and highly efficient for directing future development sessions.

## 8. AI EFFICIENCY & ARCHITECTURAL MODULARITY (ANTI-MONOLITH POLICY)

To ensure this codebase remains highly maintainable and optimized for AI code assistants, you must strictly adhere to the following modularity rules:

### A. Size Limits & Deconstruction

* **The 300-Line Heuristic:** If a file (like a React component or a Node handler) grows beyond ~300 lines, it is likely doing too much. You MUST break it down into smaller, focused modules.
* **Component Splitting:** Do not build Monolithic React views. Isolate complex logic into custom hooks (e.g., `usePanZoom`) and split complex UI into granular, single-responsibility components (e.g., `ViewerOverlay.tsx`, `ActionMenu.tsx`).

### B. Strict Layer Separation

* **Backend Monoliths:** Do NOT cram all WebSocket command handlers and SQL queries into `main.ts`. `main.ts` should only initialize systems and route events.
* **Handlers & Repositories:** WebSocket messages must be routed to dedicated handlers (e.g., `AssetHandlers.ts`). Raw `.prepare().run()` database calls should be abstracted into a Repository layer (e.g., `db/AssetRepository.ts`).

### C. Shared Contracts

* **Types:** Always define shared contracts (interfaces, Zod schemas) in a common `shared/types` directory. Ensure both the Node backend and React frontend independently import these types. Do not let one environment guess the data shape of the other.

### D. Pluggable Workflows

* **Job Modules:** New backend jobs must conform to a standardized interface (e.g., `IJobModule`), avoiding hardcoded chaining. Workflows should be configuration-driven (JSON/YAML) and event-based.

### E. AI Prompts as Code

* **Abstraction:** AI prompts must be treated with the exact same strictness as SQL strings. Do not embed raw, multi-line prompts directly inside business logic or UI components.
* **Storage & Maintenance:** Store base prompts in dedicated files or a centralized repository (e.g., `core/src/prompts/` or a database table) so they can be easily reviewed, version-controlled, and maintained independently of the code executing them.
* **Injection:** If prompts require programmatic construction or placeholder injection, use standardized template builder functions. Treat them as parameterized queries to ensure stability and reusability.

### F. Strict Type Safety (No `any` Escape Hatches)

* **Zero Tolerance for `any`:** The use of the `any` type, either implicit or explicit (e.g., `as any`), is strictly forbidden.
* **Linting Enforcement:** ESLint is configured to error on `@typescript-eslint/no-explicit-any`. All code generated must pass this linting standard.

### G. Autonomous Validation (AI Linting Checks)

* **Mandatory AI Self-Review:** After the AI modifying any code, the AI MUST autonomously run `npm run lint` and `npm run build` in the background (or relevant sub-project build scripts) to silently catch its own syntax errors, unused variables, and typing issues.
* **Zero Noise Tolerance:** The AI MUST NOT leave "minor" unused variables or TypeScript errors for the user to find. The AI is responsible for fixing all errors it introduces before marking a task as complete and notifying the user.
