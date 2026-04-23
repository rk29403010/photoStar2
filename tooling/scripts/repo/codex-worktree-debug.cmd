@echo off
setlocal

if "%CODEX_WORKTREE_PATH%"=="" (
    echo Missing CODEX_WORKTREE_PATH. Debug must be launched from a Codex worktree context.
    exit /b 1
)

set "TARGET_PATH=%CODEX_WORKTREE_PATH%"

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
