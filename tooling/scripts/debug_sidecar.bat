@echo off
echo ==========================================
echo PhotoStar Sidecar Debugger
echo ==========================================
echo.
echo This script runs the sidecar logic directly using your system Node.js.
echo faster than packaging it with 'pkg'.
echo.
echo Ensure you have run 'npm install' in the repo root first.
echo If you see 'NODE_MODULE_VERSION' errors, run 'npm rebuild' in the repo root.
echo.

if not exist node_modules (
    echo node_modules not found. Installing...
    call npm install
)

echo Starting Sidecar in Watch Mode (if available) or Direct...
call node tooling\scripts\core\smart_build.cjs --compile-only
if %errorlevel% neq 0 (
    echo Build failed. Exiting.
    pause
    exit /b %errorlevel%
)

node dist\core\src\entrypoints\core\main.js

echo.
echo Sidecar exited.
pause
