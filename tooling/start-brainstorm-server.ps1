param(
    [string]$ProjectDir = (Get-Location).Path,
    [string]$SessionName = "manual-session",
    [string]$HostName = "127.0.0.1",
    [string]$UrlHost = "localhost"
)

$serverRoot = "C:\Users\robin\.codex\superpowers\lib\brainstorm-server"

if (-not (Test-Path $serverRoot)) {
    throw "Brainstorm server not found at $serverRoot"
}

$screenDir = Join-Path $ProjectDir ".superpowers\brainstorm\$SessionName"
New-Item -ItemType Directory -Force $screenDir | Out-Null

$env:BRAINSTORM_DIR = $screenDir
$env:BRAINSTORM_HOST = $HostName
$env:BRAINSTORM_URL_HOST = $UrlHost

Write-Host "Starting brainstorm server..." -ForegroundColor Cyan
Write-Host "Screen dir: $screenDir" -ForegroundColor DarkGray
Write-Host "Open the URL printed below in your browser." -ForegroundColor DarkGray

Push-Location $serverRoot
try {
    node .\index.js
}
finally {
    Pop-Location
}
