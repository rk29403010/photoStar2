@echo off
setlocal

if "%CODEX_WORKTREE_PATH%"=="" (
    echo Missing CODEX_WORKTREE_PATH. Ship must be launched from a Codex worktree context.
    exit /b 1
)

cd /d "%CODEX_WORKTREE_PATH%" || exit /b 1
call node.exe tooling\scripts\repo\thread-ship.js
