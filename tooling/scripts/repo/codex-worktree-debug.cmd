@echo off
setlocal

set "TARGET_PATH=%CODEX_WORKTREE_PATH%"
if "%TARGET_PATH%"=="" set "TARGET_PATH=%CODEX_SOURCE_TREE_PATH%"
if "%TARGET_PATH%"=="" set "TARGET_PATH=%CD%"

cd /d "%TARGET_PATH%" || exit /b 1
call npm.cmd run thread:start-dev -- --script dev:desktop-runtime
for /f "usebackq delims=" %%I in (`node.exe tooling\scripts\repo\thread-runtime-url.js`) do (
    if not defined RUNTIME_URL (
        set "RUNTIME_URL=%%I"
    ) else if not defined RUNTIME_BACKEND (
        set "RUNTIME_BACKEND=%%I"
    )
)
if defined RUNTIME_URL echo Debug URL: %RUNTIME_URL%
if defined RUNTIME_BACKEND echo %RUNTIME_BACKEND%
