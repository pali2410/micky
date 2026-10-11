# Report configured services and installed files without guessing readiness.
$projectRoot = Split-Path $PSScriptRoot -Parent
$config = @{}
Get-Content (Join-Path $projectRoot '.env.local') | ForEach-Object {
 if ($_ -match '^([^#=]+)=(.*)$') { $config[$Matches[1].Trim()] = $Matches[2].Trim().Trim('"') }
}
$harnessPort = if ($config.ContainsKey('BOPS_HARNESS_PORT')) { [int]$config['BOPS_HARNESS_PORT'] } else { 8766 }
Write-Host 'Micky local desktop services'
foreach ($service in @(@{Name='Renderer';Port=3000},@{Name='Computer harness';Port=$harnessPort},@{Name='Ollama';Port=11434})) {
 $listener = Get-NetTCPConnection -LocalPort $service.Port -State Listen -ErrorAction SilentlyContinue
 Write-Host ('{0}: {1} on {2}' -f $service.Name, $(if ($listener) {'Listening'} else {'Offline'}), $service.Port)
}
try {
 $models = (Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3).models.name
 foreach ($role in @('BOPS_LOCAL_MODEL','BOPS_REASONING_MODEL','BOPS_VISION_MODEL')) {
  $model = $config[$role]
  Write-Host ('{0}: {1} ({2})' -f $role, $model, $(if ($model -in $models) {'installed'} else {'not found'}))
 }
} catch { Write-Host 'Could not query installed language models.' }
Write-Host ('Logs: {0}' -f (Join-Path $projectRoot '.logs'))
