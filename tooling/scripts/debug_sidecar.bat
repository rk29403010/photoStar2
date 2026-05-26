@echo off
echo ==========================================
echo PhotoStar Backend Service Debugger
echo ==========================================
echo.
echo This script runs the backend service directly using your system Node.js,
echo faster than packaging it with 'pkg'.
echo.
echo Ensure you have run 'pnpm install' in the repo root first.
echo If you see 'NODE_MODULE_VERSION' errors, run 'pnpm rebuild' in the repo root.
echo.

if not exist node_modules (
    echo node_modules not found. Installing...
    call pnpm install
)

echo Starting backend service in watch mode (if available) or direct...
call node tooling\scripts\core\smart_build.cjs --compile-only
if %errorlevel% neq 0 (
    echo Build failed. Exiting.
    pause
    exit /b %errorlevel%
)

node dist\core\src\entrypoints\core\main.js

echo.
echo Backend service exited.
pause
