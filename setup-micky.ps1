# setup-micky.ps1 - First-time setup for Micky
# Run once: .\setup-micky.ps1

Write-Host "`n  MICKY - First Time Setup`n" -ForegroundColor Yellow

function Get-Exe ($name) {
    $cmdCmd = Get-Command "$name.cmd" -ErrorAction SilentlyContinue
    if ($cmdCmd) { return $cmdCmd.Source }
    $cmdExe = Get-Command "$name.exe" -ErrorAction SilentlyContinue
    if ($cmdExe) { return $cmdExe.Source }
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

# Node.js check
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "  Node.js not found. Download from https://nodejs.org (LTS)" -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] Node.js $(node --version)" -ForegroundColor Green

# Python check
$py = Get-Exe "python"
if (-not $py) {
    Write-Host "  Python not found. Download from https://python.org (3.10+)" -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] Python $(&$py --version)" -ForegroundColor Green

# ffmpeg check
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    Write-Host "  ffmpeg not found - installing via winget..." -ForegroundColor Yellow
    winget install --id Gyan.FFmpeg -e --silent
    if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
        Write-Host "  Could not auto-install ffmpeg. Download from https://ffmpeg.org/download.html" -ForegroundColor Red
        Write-Host "  Extract and add the /bin folder to your PATH, then re-run setup." -ForegroundColor Red
        exit 1
    }
}
Write-Host "  [OK] ffmpeg found" -ForegroundColor Green

# Ollama check
if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    Write-Host "  ollama not found - download from https://ollama.com/download" -ForegroundColor Red
    Write-Host "  Install it, then re-run setup." -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] Ollama found" -ForegroundColor Green

# npm install
Write-Host "`n  Installing Node.js packages..." -ForegroundColor Cyan
npm install
Write-Host "  [OK] npm packages installed" -ForegroundColor Green

# Install the Python modules used by this project.
& $py -m pip install -r (Join-Path $PSScriptRoot "requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "Python module installation failed" }
# Reuse installed models; fetch only missing roles.
$installedModels = (Invoke-RestMethod "http://127.0.0.1:11434/api/tags").models.name
foreach ($model in @("qwen2.5:3b", "phi4-mini:latest", "qwen2.5vl:3b")) {
    if ($installedModels -notcontains $model) {
        ollama pull $model
        if ($LASTEXITCODE -ne 0) { throw "Model download failed: $model" }
    }
}

# Create .env.local if missing
$envFile = Join-Path $PSScriptRoot ".env.local"
if (-not (Test-Path $envFile)) {
    @"
BOPS_SELF_HOSTED=1
BOPS_LOCAL_LLM=1
BOPS_LOCAL_LLM_URL=http://127.0.0.1:11434/v1
BOPS_LOCAL_MODEL=qwen2.5:3b
BOPS_REASONING_MODEL=phi4-mini:latest
BOPS_VISION_MODEL=qwen2.5vl:3b
BOPS_VISION_URL=http://127.0.0.1:11434/v1
BOPS_HARNESS_URL=http://127.0.0.1:8766
"@ | Set-Content $envFile -Encoding UTF8
    Write-Host "  [OK] Created .env.local" -ForegroundColor Green
} else {
    Write-Host "  [OK] .env.local already exists" -ForegroundColor Green
}

# Create .logs directory
New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot ".logs") | Out-Null
Write-Host "  [OK] .logs/ directory ready" -ForegroundColor Green

# Done
Write-Host ""
Write-Host "  ===============================================" -ForegroundColor Green
Write-Host "     Setup complete! Now run:                    " -ForegroundColor Green
Write-Host "                                                 " -ForegroundColor Green
Write-Host "       .\start-micky.ps1                         " -ForegroundColor Yellow
Write-Host "  ===============================================" -ForegroundColor Green
Write-Host ""
