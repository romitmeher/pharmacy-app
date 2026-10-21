param([int]$InstallerProcessId = 0)
$ErrorActionPreference = 'Stop'
$trainingBackend = Split-Path -Parent $PSScriptRoot
$trainingPython = Join-Path $trainingBackend '.venv-training/Scripts/python.exe'
$trainingRoot = Join-Path (Split-Path -Parent $trainingBackend) 'data/medicine_photos/training/mobilenet-v3-small'
New-Item -ItemType Directory -Path $trainingRoot -Force | Out-Null
function Write-TrainingStage([string]$Stage, [string]$Detail = '') {
    @{stage=$Stage;detail=$Detail;updated_at=(Get-Date).ToString('o')} |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $trainingRoot 'job.json')
}
try {
    Write-TrainingStage 'waiting_for_cuda_install'
    if ($InstallerProcessId -gt 0) {
        Wait-Process -Id $InstallerProcessId -Timeout 7200 -ErrorAction SilentlyContinue
    }
    Set-Location -LiteralPath $trainingBackend
    Write-TrainingStage 'verifying_gpu'
    & $trainingPython -c 'import torch; assert torch.cuda.is_available(), "CUDA unavailable"; x=torch.randn(128,128,device="cuda"); y=x@x; torch.cuda.synchronize(); print({"gpu":torch.cuda.get_device_name(0),"cuda":torch.version.cuda,"matrix_test":bool(torch.isfinite(y).all())})'
    if ($LASTEXITCODE -ne 0) { throw 'GPU verification failed; application environment was not changed.' }
    Write-TrainingStage 'training'
    & $trainingPython (Join-Path $PSScriptRoot 'train_medicine_classifier.py') --epochs 12 --batch-size 24
    if ($LASTEXITCODE -ne 0) { throw 'Training failed. See training-errors.log and report.json.' }
    Write-TrainingStage 'trained_experimental' 'Weights saved; live deployment remains disabled pending independent evaluation.'
} catch {
    Write-TrainingStage 'failed' $_.Exception.Message
    throw
}
