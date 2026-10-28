# scripts/uninstall-windows.ps1
# Stops the dashboard and the daily run and removes their scheduled tasks.
# Your files, settings and Google Sheet are left alone.
#
#   powershell -ExecutionPolicy Bypass -File scripts\uninstall-windows.ps1

$envFile = Join-Path (Join-Path $PSScriptRoot "..") ".env.local"
$port = 3001
if ((Test-Path $envFile) -and ((Get-Content $envFile -Raw) -match "(?m)^DASHBOARD_PORT=(\d+)")) { $port = [int]$Matches[1] }
Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

foreach ($job in "dashboard", "daily") {
  Stop-ScheduledTask -TaskName "JobPipeline-$job" -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName "JobPipeline-$job" -Confirm:$false -ErrorAction SilentlyContinue
}
Write-Host "Scheduled tasks removed. Delete the project folder too if you want it gone."
