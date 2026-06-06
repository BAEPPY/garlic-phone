$Root = $PSScriptRoot
$Node = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if (!(Test-Path $Node)) {
  Write-Host "Node runtime not found."
  Write-Host $Node
  Read-Host "Press Enter to close"
  exit 1
}

Set-Location $Root
Write-Host "Starting Drawing Phone at http://localhost:4173"
& $Node (Join-Path $Root "server.js")
