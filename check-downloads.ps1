# check-downloads.ps1 - Live download monitor for Micky
param(
    [switch]$Watch  # Continuous live refresh
)

$Host.UI.RawUI.WindowTitle = "Micky - Download Monitor"

function Get-OllamaProgress {
    # 1. Check if model is already downloaded in Ollama list
    try {
        $tags = (ollama list 2>$null) | Out-String
        if ($tags -match "qwen3:30b-a3b-q4_K_M") {
            return @{ Status = "READY"; Detail = "Model downloaded and available in Ollama (17.5 GB)" }
        }
    } catch { }

    # 2. Check task log files for live progress line
    $logFiles = @(
        "C:\Users\pali\.gemini\antigravity-ide\brain\3ce0e6cb-9f7b-4014-996f-03ff2e278a59\.system_generated\tasks\task-198.log",
        (Join-Path $PSScriptRoot ".logs\ollama-pull-qwen3-30b-a3b-q4_K_M.log")
    )
    foreach ($logFile in $logFiles) {
        if (Test-Path $logFile) {
            $line = Get-Content $logFile -Tail 1 -ErrorAction SilentlyContinue
            if ($line) {
                $pct = if ($line -match "(\d+%)") { $Matches[1] } else { "" }
                $size = if ($line -match "(\d+(\.\d+)?\s*(?:MB|GB)\s*/\s*\d+(\.\d+)?\s*(?:MB|GB))") { $Matches[1] } else { "" }
                $speed = if ($line -match "(\d+(\.\d+)?\s*(?:MB|KB|B)/s)") { $Matches[1] } else { "" }
                $detail = "$pct - $size at $speed".Trim(" -")
                if ($detail) {
                    return @{ Status = "DOWNLOADING"; Detail = $detail; Raw = $line }
                }
                return @{ Status = "DOWNLOADING"; Detail = $line.Trim(); Raw = $line }
            }
        }
    }
    return @{ Status = "WAITING"; Detail = "Pending start or waiting in queue" }
}

function Show-Dashboard {
    Clear-Host
    $now = Get-Date -Format "HH:mm:ss"

    Write-Host ""
    Write-Host "  ================================================================" -ForegroundColor Cyan
    Write-Host "                MICKY - DOWNLOADS PROGRESS MONITOR                " -ForegroundColor Yellow
    Write-Host "                    Last updated: $now                            " -ForegroundColor DarkGray
    Write-Host "  ================================================================" -ForegroundColor Cyan
    Write-Host ""

    # 1. OLLAMA MODELS
    Write-Host "  [1] LLM Models (Ollama)" -ForegroundColor White
    
    # qwen2.5:0.5b
    $qwenSmall = (ollama list 2>$null) -match "qwen2.5:0.5b"
    if ($qwenSmall) {
        Write-Host "      [OK] qwen2.5:0.5b  (Small LLM)   -> Ready (397 MB)" -ForegroundColor Green
    } else {
        Write-Host "      [..] qwen2.5:0.5b  (Small LLM)   -> Not found (run ollama pull qwen2.5:0.5b)" -ForegroundColor Yellow
    }

    # qwen3:30b-a3b-q4_K_M
    $ollama = Get-OllamaProgress
    if ($ollama.Status -eq "READY") {
        Write-Host "      [OK] qwen3:30b     (Main Brain)  -> Ready (18 GB)" -ForegroundColor Green
    } elseif ($ollama.Status -eq "DOWNLOADING") {
        Write-Host "      [>>] qwen3:30b     (Main Brain)  -> $($ollama.Detail)" -ForegroundColor Yellow
    } else {
        Write-Host "      [..] qwen3:30b     (Main Brain)  -> $($ollama.Detail)" -ForegroundColor DarkGray
    }

    Write-Host ""

    Write-Host "  STATUS & RECOMMENDATIONS:" -ForegroundColor White
    Write-Host "  - You CAN run .\start-micky.ps1 right now! Micky will use" -ForegroundColor Gray
    Write-Host "    the fast local qwen2.5:0.5b model until qwen3:30b finishes." -ForegroundColor Gray
    Write-Host "  - Press Ctrl+C anytime to exit this monitor." -ForegroundColor DarkGray
    Write-Host "  ================================================================" -ForegroundColor Cyan
    Write-Host ""
}

if ($Watch) {
    while ($true) {
        Show-Dashboard
        Start-Sleep -Seconds 3
    }
} else {
    Show-Dashboard
    Write-Host "  Tip: Run '.\check-downloads.ps1 -Watch' for continuous live updating.`n" -ForegroundColor DarkCyan
}

