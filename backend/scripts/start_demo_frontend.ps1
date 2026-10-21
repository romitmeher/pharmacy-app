$ErrorActionPreference = 'Stop'
$demoWorkspace = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location -LiteralPath (Join-Path $demoWorkspace 'frontend')
$env:SMARTPHARM_DEMO = '1'
$env:NEXT_PUBLIC_API_URL = 'http://127.0.0.1:5000'
& npm.cmd run dev -- --hostname 127.0.0.1 --port 3000
exit $LASTEXITCODE
