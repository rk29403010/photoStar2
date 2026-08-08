@echo off
setlocal

set "TARGET_PATH="
for /f "usebackq delims=" %%I in (`node.exe tooling\scripts\repo\codex-worktree-target.js`) do set "TARGET_PATH=%%I"
if errorlevel 1 exit /b 1
if "%TARGET_PATH%"=="" exit /b 1

cd /d "%TARGET_PATH%" || exit /b 1
echo [codex-debug] Starting managed desktop runtime...
call node.exe tooling\scripts\repo\thread-dev-session.js --script dev:desktop-runtime:debug
for /f "usebackq delims=" %%I in (`node.exe tooling\scripts\repo\thread-runtime-url.js`) do (
    if not defined RUNTIME_URL (
        set "RUNTIME_URL=%%I"
    ) else if not defined RUNTIME_BACKEND (
        set "RUNTIME_BACKEND=%%I"
    )
)
if defined RUNTIME_URL echo Debug URL: %RUNTIME_URL%
if defined RUNTIME_BACKEND echo %RUNTIME_BACKEND%
