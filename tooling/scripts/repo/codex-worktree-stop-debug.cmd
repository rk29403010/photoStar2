@echo off
setlocal

if "%CODEX_WORKTREE_PATH%"=="" (
    echo Missing CODEX_WORKTREE_PATH. Stop Debug must be launched from a Codex worktree context.
    exit /b 1
)

set "TARGET_PATH=%CODEX_WORKTREE_PATH%"

cd /d "%TARGET_PATH%" || exit /b 1
call npm.cmd run thread:stop-dev
