@echo off
setlocal

set "TARGET_PATH=%CODEX_WORKTREE_PATH%"
if "%TARGET_PATH%"=="" set "TARGET_PATH=%CD%"

cd /d "%TARGET_PATH%" || exit /b 1

call node.exe tooling\scripts\repo\thread-ship.js
