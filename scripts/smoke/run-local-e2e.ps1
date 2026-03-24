param(
    [string]$UserId = "smoke-user",
    [string]$Destination = "beijing",
    [string]$BootstrapSecret = "dev-bootstrap-secret",
    [string]$EnvFile = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$tripApiDir = Join-Path $root "apps\trip-api-go"
$logsDir = Join-Path $root "tmp\smoke-logs"

if ([string]::IsNullOrWhiteSpace($EnvFile)) {
    $EnvFile = Join-Path $root ".env"
}

New-Item -ItemType Directory -Path $logsDir -Force | Out-Null

$tripApiOutLog = Join-Path $logsDir "trip-api.out.log"
$tripApiErrLog = Join-Path $logsDir "trip-api.err.log"
if (Test-Path $tripApiOutLog) { Remove-Item $tripApiOutLog -Force }
if (Test-Path $tripApiErrLog) { Remove-Item $tripApiErrLog -Force }

$tripApiProcess = $null

function Load-EnvFile {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path $Path)) {
        return
    }

    $count = 0
    foreach ($rawLine in Get-Content -Path $Path) {
        $line = $rawLine.Trim()
        if (-not $line) { continue }
        if ($line.StartsWith("#")) { continue }
        if ($line -notmatch "^\s*([^=]+)=(.*)$") { continue }

        $key = $Matches[1].Trim()
        $value = $Matches[2].Trim()
        if (-not $key) { continue }

        if ($value.Length -ge 2) {
            if (
                ($value.StartsWith('"') -and $value.EndsWith('"')) -or
                ($value.StartsWith("'") -and $value.EndsWith("'"))
            ) {
                $value = $value.Substring(1, $value.Length - 2)
            }
        }

        [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
        $count += 1
    }

    if ($count -gt 0) {
        Write-Host "Loaded $count env vars from $Path"
    }
}

function Wait-HttpReady {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [int]$TimeoutSeconds = 90
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Method Get -Uri $Url -UseBasicParsing -TimeoutSec 3
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return
            }
        } catch {
            Start-Sleep -Milliseconds 800
        }
    }
    throw "service not ready: $Url"
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

    throw "go command not found. Please install Go and add it to PATH."
}

function Invoke-ApiJson {
    param(
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$Url,
        [hashtable]$Headers = @{},
        $Body = $null
    )
    $invokeParams = @{
        Method = $Method
        Uri = $Url
        Headers = $Headers
        UseBasicParsing = $true
        TimeoutSec = 20
    }
    if ($null -ne $Body) {
        $invokeParams["ContentType"] = "application/json"
        $invokeParams["Body"] = ($Body | ConvertTo-Json -Depth 100)
    }
    $response = Invoke-WebRequest @invokeParams
    return ($response.Content | ConvertFrom-Json)
}

try {
    Load-EnvFile -Path $EnvFile

    Write-Host "[1/7] Starting trip-api on :8080 ..."
    $goExe = Resolve-GoExe

    $tripEnv = @(
        "set ""BOOTSTRAP_CLIENT_SECRET=$BootstrapSecret""",
        """$goExe"" run ./cmd/trip-api-go"
    ) -join "&&"
    $tripApiProcess = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c $tripEnv" `
        -WorkingDirectory $tripApiDir `
        -RedirectStandardOutput $tripApiOutLog `
        -RedirectStandardError $tripApiErrLog `
        -PassThru

    Wait-HttpReady -Url "http://127.0.0.1:8080/api/v1/health" -TimeoutSeconds 120
    Write-Host "[2/7] trip-api is healthy."

    $baseUrl = "http://127.0.0.1:8080"
    Write-Host "[3/7] Issuing token ..."
    $tokenResponse = Invoke-ApiJson -Method "POST" -Url "$baseUrl/api/v1/auth/token" -Body @{
        user_id = $UserId
        role = "USER"
        client_secret = $BootstrapSecret
    }
    $token = $tokenResponse.access_token
    if ([string]::IsNullOrWhiteSpace($token)) {
        throw "failed to receive access token"
    }
    $authHeaders = @{ Authorization = "Bearer $token" }

    Write-Host "[4/7] Generating and replanning itinerary ..."
    $generated = Invoke-ApiJson -Method "POST" -Url "$baseUrl/api/v1/plans/generate" -Headers $authHeaders -Body @{
        origin_city = "shanghai"
        destination = $Destination
        days = 3
        budget_level = "medium"
        companions = @("friend")
        travel_styles = @("history", "food")
        must_go = @()
        avoid = @()
        start_date = "2026-05-01"
        pace = "relaxed"
        user_id = $UserId
    }

    $replanned = Invoke-ApiJson -Method "POST" -Url "$baseUrl/api/v1/plans/replan" -Headers $authHeaders -Body @{
        itinerary = $generated
        patch = @{
            change_type = "budget"
            affected_days = @(0)
            new_budget_level = "high"
            preserve_locked = $true
        }
    }

    Write-Host "[5/7] Saving and reading history ..."
    $saved = Invoke-ApiJson -Method "POST" -Url "$baseUrl/api/v1/plans/save" -Headers $authHeaders -Body @{
        user_id = $UserId
        itinerary = $replanned
    }
    $savedId = $saved.id
    $history = Invoke-ApiJson -Method "GET" -Url "$baseUrl/api/v1/plans/saved?limit=20" -Headers $authHeaders
    $loaded = Invoke-ApiJson -Method "GET" -Url "$baseUrl/api/v1/plans/saved/$savedId" -Headers $authHeaders
    $summary = Invoke-ApiJson -Method "GET" -Url "$baseUrl/api/v1/plans/saved/$savedId/summary" -Headers $authHeaders

    Write-Host "[6/7] Validating smoke result payload."
    if ([string]::IsNullOrWhiteSpace($savedId)) {
        throw "saved plan id is missing"
    }
    Write-Host "[7/7] Smoke flow complete."
    $result = [ordered]@{
        user_id = $UserId
        request_id = $generated.request_id
        replan_confidence = $replanned.confidence
        saved_plan_id = $savedId
        history_count = @($history).Count
        loaded_destination = $loaded.itinerary.destination
        summary_preview = ([string]$summary.summary).Substring(0, [Math]::Min(80, ([string]$summary.summary).Length))
        trip_api_stdout_log = $tripApiOutLog
        trip_api_stderr_log = $tripApiErrLog
    }
    $result | ConvertTo-Json -Depth 20
}
finally {
    if ($tripApiProcess) {
        cmd /c "taskkill /PID $($tripApiProcess.Id) /T /F" | Out-Null
    }
}
