@echo off
setlocal EnableDelayedExpansion

set "TARGET_PATH=%CODEX_WORKTREE_PATH%"

if "%CODEX_WORKTREE_PATH%"=="" (
    for /f "usebackq delims=" %%I in (`git.exe rev-parse --show-toplevel 2^>nul`) do (
        if not defined REPO_ROOT set "REPO_ROOT=%%I"
    )
    if not defined REPO_ROOT (
        echo [codex-debug] Missing CODEX_WORKTREE_PATH and could not resolve repository root.
        exit /b 1
    )

    set "WORKTREE_ROOT=!REPO_ROOT!\.worktrees"
    if not exist "!WORKTREE_ROOT!" (
        echo [codex-debug] Missing CODEX_WORKTREE_PATH and no .worktrees directory was found at:
        echo [codex-debug]   !WORKTREE_ROOT!
        exit /b 1
    )

    for /f "usebackq delims=" %%I in (`dir /b /ad /o-d "!WORKTREE_ROOT!" 2^>nul`) do (
        if not defined TARGET_PATH set "TARGET_PATH=!WORKTREE_ROOT!\%%I"
    )

    if not defined TARGET_PATH (
        echo [codex-debug] Missing CODEX_WORKTREE_PATH and no linked worktrees were found.
        exit /b 1
    )

    echo [codex-debug] Missing CODEX_WORKTREE_PATH.
    echo [codex-debug] Auto-selected most recently modified worktree:
    echo [codex-debug]   !TARGET_PATH!
)

cd /d "%TARGET_PATH%" || exit /b 1
echo [codex-debug] Starting managed desktop runtime...
call node.exe tooling\scripts\repo\thread-dev-session.js --foreground --force-foreground --script dev:desktop-runtime
for /f "usebackq delims=" %%I in (`node.exe tooling\scripts\repo\thread-runtime-url.js`) do (
    if not defined RUNTIME_URL (
        set "RUNTIME_URL=%%I"
    ) else if not defined RUNTIME_BACKEND (
        set "RUNTIME_BACKEND=%%I"
    )
)
if defined RUNTIME_URL echo Debug URL: %RUNTIME_URL%
if defined RUNTIME_BACKEND echo %RUNTIME_BACKEND%
