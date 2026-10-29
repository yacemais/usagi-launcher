[CmdletBinding()]
param(
  [string]$Instance = (Join-Path $env:APPDATA 'PrismLauncher\instances\Celestia_SMP_Alpha_0.1_Prism_Bootstrap'),
  [string]$Output = (Join-Path $PSScriptRoot "..\.scratch-runtime\modpack-$(Get-Date -Format 'yyyyMMdd-HHmmss')"),
  [string]$Review = '-',
  [string]$Version = 'auto',
  [string]$Baseline = 'published'
)
$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot '..')
try {
  & node tools/build-release-tools.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Release tools build failed.' }
  & node dist/tools/modpack-release.cjs prepare $Instance $Output $Review $Version $Baseline
  if ($LASTEXITCODE -ne 0) { throw 'Modpack preparation failed.' }
} finally { Pop-Location }
