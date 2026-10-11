$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$version = 'v24.21.0'
$archive = "node-$version-win-x64.zip"
$runtimeRoot = Join-Path $repoRoot 'runtimes/node24'
$downloadRoot = Join-Path $repoRoot 'work/runtime-downloads'
$nodeExe = Join-Path $runtimeRoot "node-$version-win-x64/node.exe"
if (Test-Path -LiteralPath $nodeExe) { & $nodeExe --version; exit 0 }
New-Item -ItemType Directory -Force -Path $runtimeRoot,$downloadRoot | Out-Null
$baseUrl = "https://nodejs.org/dist/$version"
$sums = (Invoke-WebRequest "$baseUrl/SHASUMS256.txt").Content
$line = ($sums -split "`n" | Where-Object { $_ -match "  $([regex]::Escape($archive))`$" })
if (!$line) { throw 'Pinned Node archive is missing from the official checksum list' }
$expectedHash = ($line.Trim() -split '\s+')[0]
$archivePath = Join-Path $downloadRoot $archive
Invoke-WebRequest "$baseUrl/$archive" -OutFile $archivePath
if ((Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash.ToLowerInvariant()) { throw 'Node archive checksum mismatch' }
Expand-Archive -LiteralPath $archivePath -DestinationPath $runtimeRoot
& $nodeExe --version
