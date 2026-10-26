param(
    [string]$Project = 'midyear-forest-455216-c9',
    [string]$Region = 'asia-south1',
    [string]$ImageTag = ('deploy-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
)
$ErrorActionPreference = 'Stop'
function Invoke-Cloud([string[]]$Arguments) {
    & gcloud @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'GCP operation failed; inspect the preceding error.' }
}
$deploymentRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location -LiteralPath $deploymentRoot
try {
    $projectNumber = & gcloud projects describe $Project '--format=value(projectNumber)'
    if ($LASTEXITCODE -ne 0) { throw 'Cannot read GCP project.' }
    $apiUrl = "https://smartpharm-api-$projectNumber.$Region.run.app"
    $webUrl = "https://smartpharm-web-$projectNumber.$Region.run.app"
    $imageBase = "$Region-docker.pkg.dev/$Project/smartpharm"
    Invoke-Cloud -Arguments @('builds','submit','.', '--config=deploy/gcp/backend.cloudbuild.yaml',"--substitutions=_IMAGE=$imageBase/backend`:$ImageTag,_CACHE_IMAGE=$imageBase/backend`:cache", "--project=$Project",'--quiet')
    Invoke-Cloud -Arguments @('builds','submit','.', '--config=deploy/gcp/frontend.cloudbuild.yaml',"--substitutions=_IMAGE=$imageBase/frontend`:$ImageTag,_API_URL=$apiUrl", "--project=$Project",'--quiet')
    $runtimeAccount = "smartpharm-runtime@$Project.iam.gserviceaccount.com"
    $secretRefs = 'DATABASE_URL=smartpharm-database-url:latest,SECRET_KEY=smartpharm-secret-key:latest,PGVECTOR_URL=smartpharm-pgvector-url:latest,GEMINI_API_KEY=smartpharm-gemini-api-key:latest,TAVILY_API_KEY=smartpharm-tavily-api-key:latest,/secrets/mysql/ca.pem=smartpharm-mysql-ca:latest'
    Invoke-Cloud -Arguments @('run','deploy','smartpharm-api',"--image=$imageBase/backend`:$ImageTag", "--project=$Project", "--region=$Region", "--service-account=$runtimeAccount", '--allow-unauthenticated','--cpu=4','--memory=4Gi','--min-instances=0','--max-instances=2','--concurrency=1','--timeout=300', '--command=waitress-serve', '--args=--listen=0.0.0.0:8080,--threads=1,run:app', "--set-secrets=$secretRefs", "--set-env-vars=^|^FLASK_ENV=production|OMP_NUM_THREADS=4|SMARTPHARM_DATA_DIR=/app/data|DB_SSL_CA=/secrets/mysql/ca.pem|CORS_ORIGINS=$webUrl", '--quiet')
    Invoke-Cloud -Arguments @('run','deploy','smartpharm-web',"--image=$imageBase/frontend`:$ImageTag", "--project=$Project", "--region=$Region", "--service-account=smartpharm-web-runtime@$Project.iam.gserviceaccount.com", '--allow-unauthenticated','--cpu=1','--memory=512Mi','--min-instances=0','--max-instances=2','--quiet')
    $health = Invoke-WebRequest -UseBasicParsing -Uri "$apiUrl/api/health"
    if ($health.StatusCode -ne 200) { throw 'API health check failed.' }
    Write-Output "SmartPharm: $webUrl"
} finally { Pop-Location }
