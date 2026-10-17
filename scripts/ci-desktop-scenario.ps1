# Launches the installed RC test build with a CDP port, waits until WebView2
# answers, runs one desktop harness scenario, then quits the app.
# Used by .github/workflows/desktop.yml; targets only linkgo-rctest.exe.
param(
  [Parameter(Mandatory = $true)][string]$Exe,
  [Parameter(Mandatory = $true)][ValidateSet("fresh", "upgraded")][string]$Scenario,
  [string]$Port = "9222",
  [int]$StartupSeconds = 90
)

$ErrorActionPreference = "Stop"

if ((Split-Path -Leaf $Exe) -ne "linkgo-rctest.exe") {
  throw "Refusing to launch $Exe; only the RC test build may be driven"
}

$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$Port"
$app = Start-Process -FilePath $Exe -PassThru
Remove-Item Env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS

try {
  $deadline = (Get-Date).AddSeconds($StartupSeconds)
  $ready = $false
  while ((Get-Date) -lt $deadline) {
    if ($app.HasExited) { throw "linkgo-rctest.exe exited during startup (code $($app.ExitCode))" }
    try {
      $targets = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/list" -TimeoutSec 2
      if (@($targets | Where-Object { $_.url -like "http://tauri.localhost*" -or $_.url -like "tauri://localhost*" }).Count -gt 0) {
        $ready = $true
        break
      }
    } catch {
      # WebView2 is not listening yet.
    }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw "Linkgo main window did not appear over CDP within $StartupSeconds s" }

  $env:LINKGO_DESKTOP_SCENARIO = $Scenario
  $env:LINKGO_CDP_PORT = $Port
  bun run test:desktop
  if ($LASTEXITCODE -ne 0) { throw "Desktop harness failed for scenario $Scenario" }
} finally {
  if (-not $app.HasExited) {
    taskkill /IM linkgo-rctest.exe /F | Out-Null
    $app.WaitForExit(15000) | Out-Null
  }
}
