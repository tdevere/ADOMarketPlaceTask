param(
  [string]$target,
  [string]$tools,
  [bool]$captureNetworkTrace = $false,
  [string]$customScript = '',
  [bool]$saveArtifacts = $true
)

$script:pwsh = $PSVersionTable.PSVersion
Write-Host "Running Network Troubleshoot task (PowerShell wrapper)"
$node = Join-Path $PSScriptRoot 'index.js'
if (Test-Path $node) {
  node $node
} else {
  Write-Error "Node runner not found: $node"
  exit 1
}
