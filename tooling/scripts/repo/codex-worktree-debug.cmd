@echo off
setlocal

set "TARGET_PATH="
set "TARGET_OUTPUT_FILE=%TEMP%\codex-debug-target-%RANDOM%-%RANDOM%.txt"
node.exe tooling\scripts\repo\codex-worktree-target.js > "%TARGET_OUTPUT_FILE%" 2>&1
set "TARGET_EXIT=%ERRORLEVEL%"

if not "%TARGET_EXIT%"=="0" (
    type "%TARGET_OUTPUT_FILE%"
    del "%TARGET_OUTPUT_FILE%" >nul 2>&1
    echo [codex-debug] Failed to resolve a task worktree. Run Environment ^> Doctor for details.
    exit /b %TARGET_EXIT%
)

set /p "TARGET_PATH=" < "%TARGET_OUTPUT_FILE%"
del "%TARGET_OUTPUT_FILE%" >nul 2>&1
if "%TARGET_PATH%"=="" (
    echo [codex-debug] Failed to resolve a task worktree: the resolver returned no path.
    exit /b 1
)

echo [codex-debug] Target worktree: %TARGET_PATH%
cd /d "%TARGET_PATH%"
if errorlevel 1 (
    echo [codex-debug] Unable to open the target worktree.
    exit /b 1
)

echo [codex-debug] Starting managed desktop runtime...
call node.exe tooling\scripts\repo\thread-dev-session.js --script dev:desktop-runtime:debug
if errorlevel 1 (
    echo [codex-debug] Debug runtime failed to start. Run Environment ^> Doctor for details.
    exit /b 1
)

for /f "usebackq delims=" %%I in (`node.exe tooling\scripts\repo\thread-runtime-url.js`) do (
    if not defined RUNTIME_URL (
        set "RUNTIME_URL=%%I"
    ) else if not defined RUNTIME_BACKEND (
        set "RUNTIME_BACKEND=%%I"
    )
)
if not defined RUNTIME_URL (
    echo [codex-debug] The runtime started but did not report a runtime URL. Run Environment ^> Doctor for details.
    exit /b 1
)

echo Debug URL: %RUNTIME_URL%
if defined RUNTIME_BACKEND echo %RUNTIME_BACKEND%
