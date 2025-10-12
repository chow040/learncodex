# Helper to start the TA FastAPI server with sane defaults
param(
  [string]$TradingAgentsPath = 'D:\learinvscode\learncodex\TradingAgents-main',
  [string]$PythonExe = 'D:\Python\\.venv-tradingagents\\Scripts\\python.exe',
  [int]$Port = 8000
)

$env:TRADING_AGENTS_PATH = $TradingAgentsPath
# load keys from backend/.env if it exists
$envFile = Join-Path (Join-Path (Get-Location).Path '..') 'backend\.env'
if (Test-Path $envFile) {
  Write-Host "Loading env vars from $envFile"
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*#') { return }
    if ($_ -match '^(\w+)=(.*)$') {
      $k = $matches[1]
      $v = $matches[2]
        # Trim surrounding quotes if present
        if ($v.Length -ge 2 -and ($v.StartsWith('"') -and $v.EndsWith('"') -or $v.StartsWith("'") -and $v.EndsWith("'"))) {
          $v = $v.Substring(1, $v.Length - 2)
        }
        if ($v -ne '') {
          Set-Item -Path Env:$k -Value $v
        }
    }
  }
}

Write-Host "Starting TA server (python: $PythonExe) on port $Port"
# Ensure PYTHONPATH includes the repository root so 'backend' is importable
$repoRoot = (Resolve-Path (Join-Path (Get-Location).Path '..')).Path
Write-Host "Setting PYTHONPATH=$repoRoot"
Set-Item -Path Env:PYTHONPATH -Value $repoRoot
& $PythonExe -m uvicorn backend.python.ta_server:app --host 127.0.0.1 --port $Port
