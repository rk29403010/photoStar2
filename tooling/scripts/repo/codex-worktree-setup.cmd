@echo off
setlocal

set "SOURCE_TREE_PATH=%CODEX_SOURCE_TREE_PATH%"
set "WORKTREE_PATH=%CODEX_WORKTREE_PATH%"

if "%SOURCE_TREE_PATH%"=="" exit /b 0
if "%WORKTREE_PATH%"=="" set "WORKTREE_PATH=%SOURCE_TREE_PATH%"
if /I "%WORKTREE_PATH%"=="%SOURCE_TREE_PATH%" exit /b 0

if not exist "%SOURCE_TREE_PATH%\node_modules" exit /b 0
if exist "%WORKTREE_PATH%\node_modules" exit /b 0

cmd.exe /d /c mklink /J "%WORKTREE_PATH%\node_modules" "%SOURCE_TREE_PATH%\node_modules" >nul
exit /b 0
