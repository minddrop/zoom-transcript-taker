# Zoom Workplace (v7.1.5 Windows 11) Auto-Transcript Suite Launcher
Set-Location -Path $PSScriptRoot
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host "  Zoom Workplace (v7.1.5 Windows 11) Auto-Transcript Suite" -ForegroundColor Cyan
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
try {
    $nodeVersion = node -v
    Write-Host "✅ Found Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ [ERROR] Node.js is not installed or not in PATH!" -ForegroundColor Red
    Write-Host "Please install Node.js (LTS version) from https://nodejs.org/" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Check node_modules
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
    npm install
}

# Ensure transcripts directory
if (-not (Test-Path "transcripts")) {
    New-Item -ItemType Directory -Path "transcripts" | Out-Null
}

$transcriptPath = (Get-Item "transcripts").FullName
Write-Host "📁 Local Transcripts Directory: $transcriptPath" -ForegroundColor Magenta
Write-Host "🚀 Starting Companion Server on http://127.0.0.1:3000 ..." -ForegroundColor Green
Write-Host ""

# Open Dashboard in default browser
Start-Process "http://127.0.0.1:3000/dashboard"

# Launch Server
node server.js
