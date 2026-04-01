param(
    [ValidateSet("help", "up-local", "ai-service-dev", "backend-dev", "frontend-dev", "smoke")]
    [string]$Task = "help"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$backendDir = Join-Path $root "apps\trip-api-go"
$aiServiceDir = Join-Path $root "apps\trip-ai-service"
$frontendDir = Join-Path $root "apps\web-client"

function Step($text) {
    Write-Host "`n==> $text" -ForegroundColor Cyan
}

function Run([string]$cmd, [string]$workdir = "") {
    if (-not [string]::IsNullOrWhiteSpace($workdir)) {
        Push-Location $workdir
    }
    try {
        Write-Host "-> $cmd" -ForegroundColor DarkGray
        cmd.exe /c $cmd
        if ($LASTEXITCODE -ne 0) {
            throw "Command failed with exit code ${LASTEXITCODE}: $cmd"
        }
    } finally {
        if (-not [string]::IsNullOrWhiteSpace($workdir)) {
            Pop-Location
        }
    }
}

function Ensure-Command([string]$name, [string]$hint) {
    $command = Get-Command $name -ErrorAction SilentlyContinue
    if (-not $command) {
        throw "$name is not installed or not in PATH. $hint"
    }
}

function Resolve-GoExe {
    $go = Get-Command go -ErrorAction SilentlyContinue
    if ($go) {
        return $go.Source
    }

    $defaultGo = Join-Path $env:ProgramFiles "Go\bin\go.exe"
    if (Test-Path $defaultGo) {
        return $defaultGo
    }

    throw "go is not installed or not in PATH. Install Go from https://go.dev/dl/"
}

function Wait-HttpReady([string]$url, [int]$timeoutSeconds = 90) {
    $deadline = (Get-Date).AddSeconds($timeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Method Get -Uri $url -UseBasicParsing -TimeoutSec 3
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return
            }
        } catch {
            Start-Sleep -Milliseconds 800
        }
    }
    throw "Service not ready: $url"
}

function Print-Help {
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 -Task <task>"
    Write-Host ""
    Write-Host "Tasks:" -ForegroundColor Yellow
    Write-Host "  help         Show this help"
    Write-Host "  up-local     Print independent backend/admin start commands"
    Write-Host "  ai-service-dev Start Python AI service (trip-ai-service)"
    Write-Host "  backend-dev  Start Go backend (trip-api-go)"
    Write-Host "  frontend-dev Start admin console (web-client)"
    Write-Host "  smoke        Basic smoke check (health + auth token)"
}

switch ($Task) {
    "help" {
        Print-Help
    }
    "up-local" {
        Write-Host "Start AI service in terminal A:" -ForegroundColor Green
        Write-Host "  cd apps/trip-ai-service"
        Write-Host "  set BAILIAN_API_KEY=your-bailian-key"
        Write-Host "  python main.py"
        Write-Host ""
        Write-Host "Start backend in terminal B:" -ForegroundColor Green
        Write-Host "  cd apps/trip-api-go"
        Write-Host "  set AI_SERVICE_BASE_URL=http://127.0.0.1:8091"
        Write-Host "  go run ./cmd/trip-api-go"
        Write-Host ""
        Write-Host "Start admin console in terminal C:" -ForegroundColor Green
        Write-Host "  cd apps/web-client"
        Write-Host "  npm install"
        Write-Host "  npm run dev -- --host 127.0.0.1 --port 5500"
        Write-Host ""
        Write-Host "Open:" -ForegroundColor Green
        Write-Host "  Admin:    http://127.0.0.1:5500"
        Write-Host "  Trip API: http://127.0.0.1:8080/api/v1/health"
    }
    "ai-service-dev" {
        Ensure-Command "python" "Install Python 3 from https://www.python.org/downloads/"
        Step "Starting trip-ai-service"
        Run "python main.py" $aiServiceDir
    }
    "backend-dev" {
        $goExe = Resolve-GoExe
        Step "Starting trip-api-go"
        Run "`"$goExe`" run ./cmd/trip-api-go" $backendDir
    }
    "frontend-dev" {
        Ensure-Command "npm" "Install Node.js from https://nodejs.org/"
        Step "Installing admin console dependencies"
        Run "npm install" $frontendDir
        Step "Starting web-client"
        Run "npm run dev -- --host 127.0.0.1 --port 5500" $frontendDir
    }
    "smoke" {
        Step "Running basic smoke checks"
        try {
            $health = Invoke-WebRequest -Uri "http://127.0.0.1:8080/api/v1/health" -UseBasicParsing -TimeoutSec 5
            Write-Host "health => $($health.StatusCode) $($health.Content)"

            $tokenReq = @{ user_id = "smoke-user"; role = "USER"; client_secret = "dev-bootstrap-secret" } | ConvertTo-Json
            $tokenRes = Invoke-WebRequest -Uri "http://127.0.0.1:8080/api/v1/auth/token" -UseBasicParsing -Method Post -ContentType "application/json" -Body $tokenReq -TimeoutSec 5
            Write-Host "auth/token => $($tokenRes.StatusCode)"
        } catch {
            throw "smoke check failed: $($_.Exception.Message)"
        }
    }
}
