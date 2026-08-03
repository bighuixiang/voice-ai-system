param(
  [string]$Spec = "tests/e2e/retrieval-preview.spec.ts",
  [int]$ApiPort = 18787,
  [int]$UiPort = 15173,
  [int]$TimeoutSeconds = 60
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot ".." )).Path
$apiRoot = Join-Path $repoRoot "api"
$uiRoot = Join-Path $repoRoot "ui"
$logRoot = Join-Path $repoRoot ".tmp-playwright-windows"
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
$apiOut = Join-Path $logRoot "api.stdout.log"
$apiErr = Join-Path $logRoot "api.stderr.log"
$uiOut = Join-Path $logRoot "ui.stdout.log"
$uiErr = Join-Path $logRoot "ui.stderr.log"
$started = @()

function Stop-StartedProcess {
  param([int]$ProcessId)
  if ($ProcessId -le 0) { return }
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Wait-Http {
  param([string]$Uri)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return }
    } catch { }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $deadline)
  throw "Timed out waiting for $Uri"
}

$oldApiPort = $env:NOVEL_API_PORT
$oldUiPort = $env:NOVEL_UI_PORT
$oldApiBase = $env:API_BASE_URL
$oldReuse = $env:PLAYWRIGHT_REUSE_EXISTING_SERVER
$oldCodex = $env:CODEX_COMMAND
$oldWorker = $env:RUNTIME_WORKER_AUTOSTART
$oldOrigins = $env:NOVEL_API_ORIGINS
try {
  $env:NOVEL_API_PORT = [string]$ApiPort
  $env:NOVEL_UI_PORT = [string]$UiPort
  $env:API_BASE_URL = "http://127.0.0.1:$ApiPort"
  $env:PLAYWRIGHT_REUSE_EXISTING_SERVER = "1"
  $env:CODEX_COMMAND = "node `"$(Join-Path $repoRoot 'scripts/mock-codex-agent.cjs')`""
  $env:RUNTIME_WORKER_AUTOSTART = "0"
  $env:NOVEL_API_ORIGINS = "http://127.0.0.1:$UiPort,http://localhost:$UiPort"

  $api = Start-Process -FilePath (Join-Path $env:ProgramFiles "nodejs\node.exe") `
    -ArgumentList @((Join-Path $apiRoot "node_modules\tsx\dist\cli.mjs"), "src/server.ts") `
    -WorkingDirectory $apiRoot -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr -WindowStyle Hidden -PassThru
  $started += $api.Id
  $ui = Start-Process -FilePath (Join-Path $env:ProgramFiles "nodejs\node.exe") `
    -ArgumentList @((Join-Path $uiRoot "node_modules\vite\bin\vite.js"), "--host", "127.0.0.1", "--port", [string]$UiPort) `
    -WorkingDirectory $uiRoot -RedirectStandardOutput $uiOut -RedirectStandardError $uiErr -WindowStyle Hidden -PassThru
  $started += $ui.Id

  Wait-Http "http://127.0.0.1:$ApiPort/health"
  Wait-Http "http://127.0.0.1:$UiPort"
  & npm.cmd exec playwright test $Spec --project=chromium
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  foreach ($processId in $started) { Stop-StartedProcess -ProcessId $processId }
  if ($null -eq $oldApiPort) { Remove-Item Env:NOVEL_API_PORT -ErrorAction SilentlyContinue } else { $env:NOVEL_API_PORT = $oldApiPort }
  if ($null -eq $oldUiPort) { Remove-Item Env:NOVEL_UI_PORT -ErrorAction SilentlyContinue } else { $env:NOVEL_UI_PORT = $oldUiPort }
  if ($null -eq $oldApiBase) { Remove-Item Env:API_BASE_URL -ErrorAction SilentlyContinue } else { $env:API_BASE_URL = $oldApiBase }
  if ($null -eq $oldReuse) { Remove-Item Env:PLAYWRIGHT_REUSE_EXISTING_SERVER -ErrorAction SilentlyContinue } else { $env:PLAYWRIGHT_REUSE_EXISTING_SERVER = $oldReuse }
  if ($null -eq $oldCodex) { Remove-Item Env:CODEX_COMMAND -ErrorAction SilentlyContinue } else { $env:CODEX_COMMAND = $oldCodex }
  if ($null -eq $oldWorker) { Remove-Item Env:RUNTIME_WORKER_AUTOSTART -ErrorAction SilentlyContinue } else { $env:RUNTIME_WORKER_AUTOSTART = $oldWorker }
  if ($null -eq $oldOrigins) { Remove-Item Env:NOVEL_API_ORIGINS -ErrorAction SilentlyContinue } else { $env:NOVEL_API_ORIGINS = $oldOrigins }
}
