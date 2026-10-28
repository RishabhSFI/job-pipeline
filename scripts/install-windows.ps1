# scripts/install-windows.ps1
# Sets up Job Pipeline on Windows:
#   - installs dependencies
#   - creates .env.local, config/applyKit.json and credentials\ if missing
#   - starts the dashboard when you log in (http://localhost:$Port)
#   - runs the job search every day at $Hour:00, catching up if the PC was off
# Safe to run again: it replaces its own scheduled tasks and never
# overwrites your settings.
#
#   powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1 -Port 3002 -Hour 7
#   ... -SkipTasks    files only, no scheduled tasks (used by tests)

param(
  [int]$Port = 3001,
  [int]$Hour = 8,
  [switch]$SkipTasks
)

$ErrorActionPreference = "Stop"
$Dir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $Dir

function Say($text) { Write-Host "`n== $text" }

# Stops a running dashboard so its port is free again.
function Stop-Dashboard($port) {
  Stop-ScheduledTask -TaskName "JobPipeline-dashboard" -ErrorAction SilentlyContinue
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}

if ($Dir -match "OneDrive") {
  Write-Host "This folder is inside OneDrive: $Dir"
  Write-Host "OneDrive syncing breaks the app's files. Move the folder, for example to"
  Write-Host "$env:USERPROFILE\Projects\Job-pipeline, and run this again."
  exit 1
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host "Node.js is not installed. Install the LTS version from https://nodejs.org, then open a new PowerShell window and run this again."
  exit 1
}
$major = [int](& node -p "process.versions.node.split('.')[0]")
if ($major -lt 20) {
  Write-Host "Node.js 20 or newer is needed (you have $(& node -v)). Update it from https://nodejs.org."
  exit 1
}

Say "Installing dependencies"
& npm ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }

Say "Creating your private files (existing ones are kept)"
New-Item -ItemType Directory -Force -Path credentials, logs, resumes | Out-Null
$envFile = Join-Path $Dir ".env.local"
$keyPath = (Join-Path $Dir "credentials\keys.json") -replace "\\", "/"
if (-not (Test-Path $envFile)) {
  $secret = -join ((1..48) | ForEach-Object { "{0:x}" -f (Get-Random -Maximum 16) })
  $text = Get-Content ".env.local.example" -Raw
  $text = $text -replace "(?m)^GOOGLE_SERVICE_ACCOUNT_KEY_PATH=.*$", "GOOGLE_SERVICE_ACCOUNT_KEY_PATH=$keyPath"
  $text = $text -replace "(?m)^CRON_SECRET=.*$", "CRON_SECRET=$secret"
  [IO.File]::WriteAllText($envFile, $text)
  Write-Host "Created .env.local"
}
$text = [IO.File]::ReadAllText($envFile)
if ($text -match "(?m)^DASHBOARD_PORT=") {
  $text = $text -replace "(?m)^DASHBOARD_PORT=.*$", "DASHBOARD_PORT=$Port"
} else {
  $text = $text.TrimEnd() + "`n`n# Set by the installer: where the dashboard runs`nDASHBOARD_PORT=$Port`n"
}
[IO.File]::WriteAllText($envFile, $text)
if (-not (Test-Path "config\applyKit.json")) {
  Copy-Item "config\applyKit.example.json" "config\applyKit.json"
  Write-Host "Created config\applyKit.json"
}

if ($SkipTasks) {
  Say "Done (scheduled tasks skipped)"
  exit 0
}

$nodeDir = Split-Path $node.Source
$npm = Join-Path $nodeDir "npm.cmd"
$nodeExe = $node.Source

Say "Starting the dashboard at login (port $Port)"
Stop-Dashboard $Port
$dashCmd = "Set-Location '$Dir'; & '$npm' run dev -- -p $Port *>> 'logs\dashboard.log'"
$dashAction = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command `"$dashCmd`""
$dashSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName "JobPipeline-dashboard" -Force `
  -Action $dashAction -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME) `
  -Settings $dashSettings -Description "Job Pipeline dashboard on http://localhost:$Port" | Out-Null

Say "Scheduling the daily job search at ${Hour}:00"
$trim = "if (Test-Path 'logs\run.log') { Get-Content 'logs\run.log' -Tail 2000 | Set-Content 'logs\run.log.tmp'; Move-Item -Force 'logs\run.log.tmp' 'logs\run.log' }"
$runCmd = "Set-Location '$Dir'; $trim; & '$nodeExe' --max-old-space-size=512 --env-file=.env.local scripts/run-pipeline.mjs *>> 'logs\run.log'"
$runAction = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command `"$runCmd`""
$runSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName "JobPipeline-daily" -Force `
  -Action $runAction -Trigger (New-ScheduledTaskTrigger -Daily -At ("{0:D2}:00" -f $Hour)) `
  -Settings $runSettings -Description "Job Pipeline daily job search" | Out-Null

Start-ScheduledTask -TaskName "JobPipeline-dashboard"

Say "Done"
Write-Host "Dashboard:   http://localhost:$Port  (give it ~20 seconds to start)"
Write-Host "Daily run:   every day at ${Hour}:00, log in logs\run.log"
Write-Host ""
Write-Host "Next, run:  npm run setup"
Write-Host "It walks you through connecting Google, adding your resume and your first search."
