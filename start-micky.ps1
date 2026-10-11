# ============================================================
# start-micky.ps1 - Start ALL Micky servers in one command
# Run from the micky/ project root:  .\start-micky.ps1
# ============================================================
#
# Starts (in order):
#   1. Ollama        - LLM server      http://localhost:11434
#   2. Harness server- computer control http://localhost:8766
#   3. Next.js app   - web UI           http://localhost:3000
#
# All servers log to .logs/ directory.
# Press Ctrl+C to stop everything.
# ============================================================

param(
    [switch]$BrowserOnly, # run in web browser instead of native desktop window
    [switch]$NoBrowser,   # don't auto-open any window
    [switch]$Quiet        # less output
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# Paths
$Root    = $PSScriptRoot
$Logs    = Join-Path $Root ".logs"
$Scripts = Join-Path $Root "scripts"
New-Item -ItemType Directory -Force -Path $Logs | Out-Null

# Load .env.local into process environment
$envLocal = Join-Path $Root ".env.local"
if (Test-Path $envLocal) {
    Get-Content $envLocal | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $parts = $line.Split("=", 2)
            $k = $parts[0].Trim()
            $v = $parts[1].Trim()
            [System.Environment]::SetEnvironmentVariable($k, $v, "Process")
            Set-Item -Path "env:$k" -Value $v
        }
    }
}

# Colour helpers
function Log-Info  ($msg) { Write-Host "  $msg" -ForegroundColor Cyan }
function Log-Ok    ($msg) { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Log-Warn  ($msg) { Write-Host "  ! $msg" -ForegroundColor Yellow }
function Log-Error ($msg) { Write-Host "  [ERR] $msg" -ForegroundColor Red }
function Log-Head  ($msg) { Write-Host "`n$msg" -ForegroundColor White }

# Command helper
function Get-Exe ($name) {
    $cmdCmd = Get-Command "$name.cmd" -ErrorAction SilentlyContinue
    if ($cmdCmd) { return $cmdCmd.Source }
    $cmdExe = Get-Command "$name.exe" -ErrorAction SilentlyContinue
    if ($cmdExe) { return $cmdExe.Source }
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

# Port check
function Test-Port ($port) {
    try {
        $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if ($conn) { return $true }
    } catch { }
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $conn = $tcp.BeginConnect("127.0.0.1", $port, $null, $null)
        $ok = $conn.AsyncWaitHandle.WaitOne(800, $false)
        $tcp.Close()
        return $ok
    } catch { return $false }
}

# HTTP health check
function Wait-Http ($url, $label, $maxSecs = 60) {
    Log-Info "Waiting for $label ($url)..."
    for ($i = 0; $i -lt $maxSecs * 2; $i++) {
        try {
            $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1 -ErrorAction SilentlyContinue
            if ($r.StatusCode -lt 400) {
                Log-Ok "$label is ready"
                return $true
            }
        } catch { }
        Start-Sleep -Milliseconds 500
    }
    Log-Warn "$label did not respond within ${maxSecs}s - continuing anyway"
    return $false
}

# Tracked child processes
$Children = [System.Collections.Generic.List[System.Diagnostics.Process]]::new()

function Start-Bg ($name, $exe, $arguments, $logFile) {
    $p = Start-Process -FilePath $exe -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput $logFile -RedirectStandardError "$logFile.err" -WorkingDirectory $Root
    $Children.Add($p)
    Log-Info "Started $name (PID $($p.Id)) -> log: $logFile"
    return $p
}

function Stop-All {
    Log-Head "Stopping all Micky servers..."
    foreach ($p in $Children) {
        try {
            if (-not $p.HasExited) {
                $p.Kill($true)   # recursive - kills child tree too
                Log-Ok "Stopped PID $($p.Id)"
            }
        } catch { }
    }
    Log-Ok "All stopped. Goodbye."
}

# Register Ctrl+C handler
[Console]::TreatControlCAsInput = $false
$null = Register-EngineEvent PowerShell.Exiting -Action { Stop-All }

# ================================================================
# BANNER
# ================================================================
Write-Host ""
Write-Host "  =======================================" -ForegroundColor Yellow
Write-Host "             MICKY - Starting up         " -ForegroundColor Yellow
Write-Host "  =======================================" -ForegroundColor Yellow
Write-Host ""

# ================================================================
# 1. OLLAMA
# ================================================================
Log-Head "1/3  Ollama LLM server"

if (Test-Port 11434) {
    Log-Ok "Ollama already running on :11434"
} else {
    # Find ollama.exe
    $ollamaExe = Get-Exe "ollama"
    if (-not $ollamaExe) {
        Log-Error "ollama not found on PATH. Install from https://ollama.com/download then re-run."
        exit 1
    }
    $null = Start-Bg "Ollama" $ollamaExe "serve" (Join-Path $Logs "ollama.log")
    $null = Wait-Http "http://localhost:11434/api/tags" "Ollama" 30
}

# Pull models if missing (non-blocking - happens in background)
$localModel = if ($env:BOPS_LOCAL_MODEL) { $env:BOPS_LOCAL_MODEL } else { "qwen2.5:3b" }
$neededModels = @($localModel)

foreach ($model in $neededModels) {
    try {
        $tags = (Invoke-RestMethod "http://localhost:11434/api/tags" -ErrorAction SilentlyContinue).models.name
        if ($tags -notcontains $model) {
            Log-Info "Pulling $model in background (this may take a while first time)..."
            $pullLog = Join-Path $Logs "ollama-pull-$($model -replace '[:\/]','-').log"
            $null = Start-Bg "ollama-pull-$model" (Get-Command ollama).Source "pull $model" $pullLog
        } else {
            Log-Ok "Model $model already available"
        }
    } catch {
        Log-Warn "Could not check model list - skipping pull"
    }
}

# ================================================================
# 2. HARNESS SERVER
# ================================================================
Log-Head "2/3  Harness server (computer control)"

$harnessPort = if ($env:BOPS_HARNESS_PORT) { $env:BOPS_HARNESS_PORT } else { "8766" }
if (Test-Port ([int]$harnessPort)) {
    Log-Ok "Harness server already running on :$harnessPort"
} else {
    $pyExe = Get-Exe "python"
    if (-not $pyExe) { $pyExe = Get-Exe "python3" }
    if (-not $pyExe) {
        Log-Error "python not found on PATH."
        exit 1
    }
    $harnessScript = Join-Path $Scripts "harness-server.py"
    $null = Start-Bg "HarnessServer" $pyExe "`"$harnessScript`"" (Join-Path $Logs "harness-server.log")
    $null = Wait-Http "http://127.0.0.1:$harnessPort/health" "Harness" 15
}

# ================================================================
# 3. NEXT.JS APP & ELECTRON DESKTOP APP
# ================================================================
Log-Head "3/3  Next.js & Desktop Native Window"

$appPort = "3000"
$npxExe = Get-Exe "npx"
if (-not $npxExe) {
    Log-Error "npx not found. Install Node.js from https://nodejs.org"
    exit 1
}

# Check node_modules exists
if (-not (Test-Path (Join-Path $Root "node_modules"))) {
    Log-Info "node_modules missing - running npm install first..."
    & npm install --prefix $Root 2>&1 | Out-File (Join-Path $Logs "npm-install.log")
    Log-Ok "npm install complete"
}

if (Test-Port 3000) {
    Log-Ok "Next.js already running on :$appPort"
} else {
    $nativeBuild = Test-Path (Join-Path $Root '.next-native/BUILD_ID')
    if ($nativeBuild) {
        $env:MICKY_BUILD_DIR = '.next-native'
        $nextArguments = "next start --hostname 127.0.0.1 --port $appPort"
    } else { $nextArguments = "next dev --hostname 127.0.0.1 --port $appPort" }
    $null = Start-Bg "NextJS" $npxExe $nextArguments (Join-Path $Logs "nextjs.log")
    $null = Wait-Http "http://localhost:$appPort/api/health" "Next.js" 60
}

# Launch Native Desktop Window (Electron)
if (-not $BrowserOnly -and -not $NoBrowser) {
    Log-Head "Launching Micky Desktop Native Window..."
    $electronExe = Get-Exe "electron"
    if ($electronExe) {
        $null = Start-Bg "Electron" $electronExe "`"$Root`"" (Join-Path $Logs "electron.log")
    } else {
        $null = Start-Bg "ElectronNpx" $npxExe "electron `"$Root`"" (Join-Path $Logs "electron.log")
    }
    Log-Ok "Desktop Window opened"
} elseif ($BrowserOnly -and -not $NoBrowser) {
    Start-Sleep 1
    Start-Process "http://localhost:$appPort"
}

# ================================================================
# ALL DONE
# ================================================================
Write-Host ""
Write-Host "  ===============================================" -ForegroundColor Green
Write-Host "             Micky is ready!                     " -ForegroundColor Green
Write-Host "  ===============================================" -ForegroundColor Green
Write-Host "     Mode     ->  Native Desktop Application     " -ForegroundColor Green
Write-Host "     Ollama   ->  http://localhost:11434         " -ForegroundColor Green
Write-Host "     Harness  ->  http://localhost:$harnessPort" -ForegroundColor Green
Write-Host "     Web Port ->  http://localhost:3000          " -ForegroundColor Green
Write-Host "     Logs     ->  .logs/                         " -ForegroundColor Green
Write-Host "  ===============================================" -ForegroundColor Green
Write-Host "     Press Ctrl+C to stop all servers            " -ForegroundColor DarkGray
Write-Host "  ===============================================" -ForegroundColor Green
Write-Host ""


# Keep script alive - wait for Ctrl+C
try {
    while ($true) {
        Start-Sleep 5
        # Check if Next.js died and restart it
        $nextAlive = @($Children | Where-Object { -not $_.HasExited })
        if ($nextAlive.Count -eq 0) {
            Log-Warn "All server processes have exited."
            break
        }
    }
} finally {
    Stop-All
}
