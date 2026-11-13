param([int]$Port = 4000)
$ErrorActionPreference = 'Stop'
$workspacePath = Split-Path -Parent $PSScriptRoot
$toolPath = Join-Path $workspacePath 'output/cloudflared.exe'
if (-not (Test-Path -LiteralPath $toolPath)) { throw 'Unduh cloudflared resmi ke output/cloudflared.exe terlebih dahulu.' }
# Keep this terminal/process alive while testing callbacks. No credentials enter the tunnel arguments.
& $toolPath tunnel --url "http://localhost:$Port" --no-autoupdate
