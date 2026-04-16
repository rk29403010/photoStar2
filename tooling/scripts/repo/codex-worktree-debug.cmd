@echo off
setlocal

set "TARGET_PATH=%CODEX_WORKTREE_PATH%"
if "%TARGET_PATH%"=="" set "TARGET_PATH=%CODEX_SOURCE_TREE_PATH%"
if "%TARGET_PATH%"=="" set "TARGET_PATH=%CD%"

cd /d "%TARGET_PATH%" || exit /b 1
call npm.cmd run dev:desktop-runtime
