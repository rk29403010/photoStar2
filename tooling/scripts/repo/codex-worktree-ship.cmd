@echo off
setlocal

set "TARGET_PATH=%CODEX_WORKTREE_PATH%"
if "%TARGET_PATH%"=="" set "TARGET_PATH=%CD%"

cd /d "%TARGET_PATH%" || exit /b 1

for /f "usebackq delims=" %%I in (`git.exe branch --show-current 2^>nul`) do (
    if not defined CURRENT_BRANCH set "CURRENT_BRANCH=%%I"
)

if /I "%CURRENT_BRANCH%"=="main" (
    echo Ship must be run from a dedicated worktree branch, not from main.
    exit /b 1
)

call node.exe tooling\scripts\repo\thread-ship.js
