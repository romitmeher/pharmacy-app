$ErrorActionPreference = 'Stop'
$demoWorkspace = $PSScriptRoot
$demoData = Join-Path $demoWorkspace 'data/demo'
New-Item -ItemType Directory -Path $demoData -Force | Out-Null
foreach ($demoPort in @(5000, 3000)) {
    if (Get-NetTCPConnection -State Listen -LocalPort $demoPort -ErrorAction SilentlyContinue) {
        throw "Port $demoPort is already running. Open http://localhost:3000 if the demo is active."
    }
}
$demoShell = (Get-Process -Id $PID).Path
$demoBackend = Start-Process -FilePath (Join-Path $demoWorkspace 'backend/venv/Scripts/python.exe') `
    -ArgumentList @('-u','scripts/demo_environment.py') -WorkingDirectory (Join-Path $demoWorkspace 'backend') `
    -WindowStyle Hidden -RedirectStandardOutput (Join-Path $demoData 'backend.log') `
    -RedirectStandardError (Join-Path $demoData 'backend-errors.log') -PassThru
$demoFrontend = Start-Process -FilePath $demoShell -ArgumentList @('-NoProfile','-File',
    ('"' + (Join-Path $demoWorkspace 'backend/scripts/start_demo_frontend.ps1') + '"')) `
    -WorkingDirectory $demoWorkspace -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $demoData 'frontend.log') `
    -RedirectStandardError (Join-Path $demoData 'frontend-errors.log') -PassThru
@{backend_pid=$demoBackend.Id;frontend_pid=$demoFrontend.Id;url='http://localhost:3000'} |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $demoData 'running.json')
Write-Output 'App starting at http://localhost:3000 using Aiven MySQL and PostgreSQL. Sign in with your existing pharmacy account.'
