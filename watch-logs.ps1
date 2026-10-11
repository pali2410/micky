# watch-logs.ps1 — Tail all Micky server logs at once

$Logs = Join-Path $PSScriptRoot ".logs"

$jobs = @(
    @{ name="Ollama";   file="ollama.log";          color="Cyan"    },
    @{ name="Harness";  file="harness-server.log";  color="Yellow"  },
    @{ name="Next.js";  file="nextjs.log";           color="Green"   }
)

Write-Host "Watching logs in $Logs — Ctrl+C to stop`n"

$running = @{}
foreach ($j in $jobs) {
    $path = Join-Path $Logs $j.file
    if (-not (Test-Path $path)) { New-Item -Force $path | Out-Null }
    $color = $j.color; $name = $j.name
    $running[$name] = Start-Job -ScriptBlock {
        param($p, $n, $c)
        Get-Content -Path $p -Wait -Tail 0 | ForEach-Object {
            Write-Host "[$n] $_" -ForegroundColor $c
        }
    } -ArgumentList $path, $name, $color
}

try { while ($true) { Start-Sleep 1; $running.Values | Receive-Job } }
finally { $running.Values | Stop-Job; $running.Values | Remove-Job }
