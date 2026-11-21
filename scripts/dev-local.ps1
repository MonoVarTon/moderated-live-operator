$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$tsx = Join-Path $projectRoot "node_modules\.bin\tsx.cmd"

if (-not (Test-Path $tsx)) {
  throw "Dependencies are missing. From the project root run: pnpm install --frozen-lockfile"
}

$env:NODE_ENV = "development"
$env:HOST = "127.0.0.1"
$env:LIVE_DRAFT_MODE = "offline-demo"
if (-not $env:PORT) {
  $env:PORT = "3000"
}

Push-Location $projectRoot
try {
  & $tsx "server\_core\index.ts"
  $exitCode = $LASTEXITCODE
} finally {
  Pop-Location
}
exit $exitCode
