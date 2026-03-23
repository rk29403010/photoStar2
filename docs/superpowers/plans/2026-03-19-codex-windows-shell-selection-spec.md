# Codex Windows Shell Selection And Context Cache Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce Windows command startup latency and shell-related execution failures in Codex by preferring direct process execution, using Git Bash only when shell semantics are needed, and caching repo context more aggressively for small workspaces.

**Architecture:** Add a Windows command execution policy layer ahead of the current shell launcher. That policy should classify each command into direct exec, Git Bash, or PowerShell, record telemetry for each decision, and avoid interactive/login shell startup. In parallel, add a lightweight workspace context cache so repeated file reads and repo discovery work are served from an in-memory index instead of repeated ad hoc shell calls.

**Tech Stack:** Electron/native desktop app, Node.js process spawning, Windows 11, Git for Windows, PowerShell, telemetry pipeline, in-memory workspace indexing.

---

## File Structure

Target Codex repository is not available in this workspace, so exact paths must be mapped in the Codex app during implementation. Keep the final change decomposed into the following responsibilities:

- Windows command policy module:
  Responsible for classifying a requested command as direct exec, Bash, or PowerShell.
- Windows process launcher module:
  Responsible for constructing argv safely and launching the selected executable.
- Shell capability detector:
  Responsible for locating `npm.cmd`, `node.exe`, `git.exe`, Git Bash, and PowerShell on Windows.
- Telemetry schema and emitters:
  Responsible for timing, routing, failure, and retry metrics.
- Workspace context cache:
  Responsible for file inventory, hot-file caching, stale detection, and repeated-read suppression.
- Feature flag/config surface:
  Responsible for guarded rollout and escape hatches.
- Integration tests:
  Responsible for shell selection, quoting correctness, and fallback behavior on Windows.

## Decision Table

The Windows execution policy should follow this precedence:

1. Direct exec:
   Use when the request maps cleanly to an executable plus argv with no shell syntax required.
   Examples: `npm.cmd run quality`, `node script.js`, `git status --short`, `python -m pytest`.
2. Git Bash:
   Use only when shell semantics are required and the command is general developer tooling rather than Windows-native automation.
   Launch as `bash.exe --noprofile --norc -lc <command>`.
3. PowerShell:
   Use only for explicitly Windows-native operations such as services, registry, Defender, scheduled tasks, event logs, and COM-driven admin tasks.
4. Fallback:
   If direct exec classification fails because the requested text truly requires shell composition, retry through Git Bash.
   If Bash is unavailable and the task is Windows-native, use a constrained PowerShell template.
5. Never:
   Never wrap Bash inside PowerShell.
   Never default to WSL for repositories under `C:\...`.
   Never use login-shell startup for Codex-generated non-interactive commands on Windows.

## Metrics

Primary metrics:

- Command startup latency by route:
  `direct_exec`, `git_bash_noninteractive`, `powershell_template`.
- End-to-end command latency:
  Time from route selection to process exit.
- Command failure rate by route:
  Includes syntax failures, quoting failures, executable resolution failures, and non-zero exits caused by malformed launch shape.
- Retry rate:
  Count retries triggered by route misclassification or shell syntax failure.
- Shell mix on Windows:
  Percentage of Windows commands executed via direct exec, Bash, and PowerShell.
- Repo context cache hit rate:
  Percentage of file reads served from cache.
- Repeat-read suppression:
  Count of unchanged file reads avoided per task/session.

Suggested success targets:

- Reduce Windows shell-backed startup p50 to under `120 ms`.
- Move at least `70%` of Windows developer-tool invocations to direct exec.
- Reduce quoting and shell-syntax-related failures by at least `50%`.
- Reduce repeated unchanged file reads by at least `70%` in small repos.

## Chunk 1: Execution Routing

### Task 1: Map The Current Windows Execution Pipeline

**Files:**

- Modify: Codex app execution design notes or architecture document once the target repo is available.
- Test: Windows smoke test harness for command routing once the target repo is available.

- [ ] **Step 1: Locate the current Windows command entrypoint**

Record the module that currently turns an agent tool request into a spawned Windows process.

- [ ] **Step 2: Document current behavior**

Capture:

- whether the app currently launches PowerShell, Bash, `cmd.exe`, or direct executables
- whether wrappers are chained
- how PATH lookup happens
- how quoting is performed

- [ ] **Step 3: Add a baseline timing harness**

Measure at least:

- `npm.cmd --version`
- `git.exe --version`
- direct Git Bash `--noprofile --norc -lc true`
- PowerShell `-NoProfile`

- [ ] **Step 4: Store baseline metrics**

Persist p50/p95 timings and failure counts as the before-state for rollout comparison.

### Task 2: Add A Windows Command Classifier

**Files:**

- Create: Windows command policy module in the Codex app repo.
- Test: Unit tests for command classification.

- [ ] **Step 1: Define classifier inputs**

Classifier input should include:

- raw command text
- structured argv if available
- task/tool metadata
- user shell preference if configured
- working directory

- [ ] **Step 2: Implement direct-exec detection**

Recognize common tool launches that should bypass the shell:

- `npm`
- `node`
- `git`
- `python`
- `py`
- `rg`
- `pnpm`
- `yarn`
- `cargo`
- `uv`

- [ ] **Step 3: Implement shell-syntax detection**

Route to Bash only when the command text requires shell semantics such as:

- pipes
- redirection
- `&&` or `||`
- command substitution
- globs
- POSIX environment assignment prefixes

- [ ] **Step 4: Implement Windows-native task detection**

Only route to PowerShell when the tool/task is explicitly Windows-native.

- [ ] **Step 5: Add unit tests**

Cover:

- direct exec classification
- Bash classification
- PowerShell classification
- fallback behavior
- explicit user preference overrides

### Task 3: Add Direct Exec Launching

**Files:**

- Create: Windows direct-exec launcher module.
- Modify: Existing process-launch abstraction in Codex app repo.
- Test: Integration tests for direct exec.

- [ ] **Step 1: Launch executables with argv arrays**

Do not build command strings for direct exec.

- [ ] **Step 2: Resolve Windows executables explicitly**

Prefer:

- `npm.cmd`
- `node.exe`
- `git.exe`
- `python.exe` or `py.exe`

- [ ] **Step 3: Preserve cwd and environment correctly**

Pass through cwd and env without forcing shell-specific rewriting.

- [ ] **Step 4: Add integration tests**

Verify that direct exec works for common package-manager and VCS commands.

### Task 4: Add Git Bash Non-Interactive Launching

**Files:**

- Modify: Shell launcher module in Codex app repo.
- Test: Windows shell integration tests.

- [ ] **Step 1: Resolve Git Bash path once per session**

Prefer a discovered Git for Windows install path and cache the result.

- [ ] **Step 2: Launch Bash directly**

Use:

```text
bash.exe --noprofile --norc -lc "<command>"
```

- [ ] **Step 3: Remove wrapper chains**

Do not launch Bash through PowerShell or `cmd.exe`.

- [ ] **Step 4: Add failure fallback**

If Bash resolution fails, surface a clear error or use a constrained fallback only when the task is Windows-native.

- [ ] **Step 5: Add tests**

Verify:

- non-interactive flags are present
- cwd is correct
- environment is inherited correctly
- shell-only commands still work

## Chunk 2: PowerShell Constraints

### Task 5: Restrict PowerShell To Template-Based Windows Tasks

**Files:**

- Create: PowerShell template library in the Codex app repo.
- Test: Template rendering and parser validation tests.

- [ ] **Step 1: Enumerate allowed PowerShell scenarios**

Examples:

- service inspection
- registry read/write
- Defender operations
- scheduled tasks
- event log queries

- [ ] **Step 2: Define templates**

Prefer templates or script files over ad hoc inline one-liners.

- [ ] **Step 3: Add parser validation**

Validate generated PowerShell before execution using the PowerShell parser.

- [ ] **Step 4: Add tests**

Ensure malformed quoting and line continuation errors are caught before run.

## Chunk 3: Workspace Context Cache

### Task 6: Add A Small-Repo Context Cache

**Files:**

- Create: Workspace index/cache module in the Codex app repo.
- Test: Cache unit tests and integration tests.

- [ ] **Step 1: Build a workspace index on open**

Index:

- file list
- key config files
- package scripts
- entrypoints
- file hashes or mtimes

- [ ] **Step 2: Define hot files**

Preload only a small hot set, such as:

- `package.json`
- top-level config files
- README or architecture doc
- likely entrypoints

- [ ] **Step 3: Add cache lookup**

Return cached file contents when hashes/mtimes are unchanged.

- [ ] **Step 4: Add invalidation**

Invalidate on:

- file save
- git checkout or branch switch signal if available
- explicit refresh

- [ ] **Step 5: Add metrics**

Track cache hits, misses, bytes avoided, and repeated reads avoided.

## Chunk 4: Telemetry And Rollout

### Task 7: Add Telemetry

**Files:**

- Modify: Telemetry/event schema in Codex app repo.
- Test: Event emission tests.

- [ ] **Step 1: Emit route selection events**

Each command should record:

- selected route
- reason
- working directory kind (`Windows path` or `WSL path`)
- executable resolved

- [ ] **Step 2: Emit timing events**

Record:

- spawn start
- first output time if available
- exit time

- [ ] **Step 3: Emit outcome events**

Record:

- success
- syntax failure
- quoting failure
- executable resolution failure
- retry performed

### Task 8: Roll Out Behind A Feature Flag

**Files:**

- Modify: App configuration/feature flag surface in Codex app repo.
- Test: Configuration tests.

- [ ] **Step 1: Add a Windows execution policy flag**

Allow toggling between:

- legacy mode
- new routing mode

- [ ] **Step 2: Add a PowerShell opt-in override**

Respect explicit user preference while keeping safe defaults.

- [ ] **Step 3: Stage rollout**

Suggested stages:

- internal dogfood
- beta users on Windows
- default-on for new Windows installs
- default-on for all Windows users

- [ ] **Step 4: Define rollback trigger**

Rollback if:

- failure rate rises materially
- direct exec misclassification is common
- Windows-native tasks regress

## Acceptance Criteria

- Windows developer-tool commands like `npm`, `node`, `git`, and `python` launch via direct exec by default.
- Git Bash, when selected, launches directly with `--noprofile --norc`.
- PowerShell is used only for Windows-native tasks or explicit user preference.
- No Bash-through-PowerShell wrapper chain remains.
- Windows command startup latency improves materially versus baseline.
- Repo-context caching measurably reduces repeated file reads in small workspaces.
- Telemetry can explain which route was chosen and why for every Windows command.

## Open Questions

- Where in the Codex app repo is the current Windows process-launch abstraction defined?
- Does the app already have a structured command representation that can bypass shell text generation?
- How should explicit user shell preference interact with route classification for reliability-sensitive tasks?
- Is a persistent shell worker still needed after direct exec and non-interactive Bash are shipped?

## Recommended Rollout Order

1. Direct exec routing for `npm`, `node`, `git`, and `python`
2. Direct Git Bash with `--noprofile --norc`
3. Telemetry and feature flagging
4. PowerShell restriction and parser validation
5. Workspace context cache
6. Optional experiments such as MinGit benchmarking or persistent shell workers
