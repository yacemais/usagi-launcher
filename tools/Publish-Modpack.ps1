[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$Stage,
  [Parameter(Mandatory=$true)][string]$PrivateKey,
  [string]$Gh = 'gh',
  [string]$Target = 'main',
  [switch]$ResumeDraft
)
$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot '..')
try {
  $stagePath = (Resolve-Path -LiteralPath $Stage).Path
  & node tools/build-release-tools.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Release tools build failed.' }
  & node dist/tools/modpack-release.cjs sign $stagePath $PrivateKey
  if ($LASTEXITCODE -ne 0) { throw 'Release signing failed. No upload attempted.' }
  & node dist/tools/modpack-release.cjs validate $stagePath
  if ($LASTEXITCODE -ne 0) { throw 'Release validation failed. No upload attempted.' }
  $planFile = Join-Path $stagePath 'release-plan.json'
  $plan = Get-Content -LiteralPath $planFile -Raw | ConvertFrom-Json
  $planHash = (Get-FileHash -LiteralPath $planFile -Algorithm SHA256).Hash.ToLowerInvariant()
  Write-Host "Repository: $($plan.repository)"
  Write-Host "Release: $($plan.tag), target: $Target"
  Get-Content -LiteralPath (Join-Path $stagePath 'assets\changelog.md') | Write-Host
  $plan.assets | Format-Table name,size,sha256 -AutoSize | Out-Host
  Write-Host "Review the full manifest, file changes, notices and release-plan.json in $stagePath."
  $expected = "publish $($plan.tag) $planHash"
  $approval = Read-Host "Approve uploading these exact assets and publishing this release by typing '$expected'"
  if ($approval -cne $expected) { throw 'Publication not approved. No remote changes made.' }
  if ((Get-FileHash -LiteralPath $planFile -Algorithm SHA256).Hash.ToLowerInvariant() -cne $planHash) { throw 'The reviewed plan changed. Prepare and review again.' }
  & node dist/tools/modpack-release.cjs validate $stagePath
  if ($LASTEXITCODE -ne 0) { throw 'Final release validation failed.' }
  if (-not $ResumeDraft) {
    $existing = & $Gh api "repos/$($plan.repository)/releases" --paginate --jq '.[].tag_name'
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect existing releases. No remote changes made.' }
    if ($existing -ccontains $plan.tag) { throw 'This release already exists. Published assets are never overwritten. Use -ResumeDraft only for an interrupted draft.' }
    & $Gh release create $plan.tag --repo $plan.repository --target $Target --title "Usagi Modpack $($plan.version)" --notes-file (Join-Path $stagePath 'assets\changelog.md') --draft --latest=false
    if ($LASTEXITCODE -ne 0) { throw 'Draft creation failed.' }
  }
  $remoteJson = & $Gh release view $plan.tag --repo $plan.repository --json databaseId,isDraft
  if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect the draft.' }
  $remote = $remoteJson | ConvertFrom-Json
  if (-not $remote.isDraft) { throw 'Only an unpublished draft may receive assets.' }
  $remoteAssetsJson = & $Gh api "repos/$($plan.repository)/releases/$($remote.databaseId)/assets" --paginate --slurp --jq 'add'
  if ($LASTEXITCODE -ne 0) { throw 'Cannot list every draft asset.' }
  $remoteAssets = $remoteAssetsJson | ConvertFrom-Json
  foreach ($remoteAsset in $remoteAssets) {
    if (-not ($plan.assets | Where-Object { $_.name -ceq $remoteAsset.name })) { throw "Draft contains an unreviewed asset: $($remoteAsset.name)" }
  }
  foreach ($asset in $plan.assets) {
    $assetFile = Join-Path $stagePath "assets\$($asset.name)"
    if ((Get-FileHash -LiteralPath $assetFile -Algorithm SHA256).Hash.ToLowerInvariant() -cne $asset.sha256) { throw "Asset changed after approval: $($asset.name)" }
    $present = $remoteAssets | Where-Object { $_.name -ceq $asset.name }
    if ($present) {
      $remoteAssetJson = & $Gh api "repos/$($plan.repository)/releases/assets/$($present.id)"
      if ($LASTEXITCODE -ne 0) { throw 'Cannot verify the existing draft asset.' }
      $remoteAsset = $remoteAssetJson | ConvertFrom-Json
      if ($remoteAsset.size -ne $asset.size -or $remoteAsset.digest -cne "sha256:$($asset.sha256)") { throw 'An existing draft asset has different bytes. No overwrite is allowed.' }
    } else {
      & $Gh release upload $plan.tag $assetFile --repo $plan.repository
      if ($LASTEXITCODE -ne 0) { throw 'Upload interrupted. The release remains a draft; rerun with -ResumeDraft after review.' }
    }
  }
  $draftAssets = & $Gh api "repos/$($plan.repository)/releases/$($remote.databaseId)/assets" --paginate --slurp --jq 'add'
  if ($LASTEXITCODE -ne 0) { throw 'Cannot validate the uploaded draft.' }
  $uploaded = $draftAssets | ConvertFrom-Json
  if ($uploaded.Count -ne $plan.assets.Count) { throw 'Uploaded asset count differs from the reviewed release.' }
  foreach ($asset in $plan.assets) {
    $found = $uploaded | Where-Object { $_.name -ceq $asset.name }
    if (-not $found -or $found.size -ne $asset.size -or $found.digest -cne "sha256:$($asset.sha256)") { throw "Uploaded asset verification failed: $($asset.name)" }
  }
  & node dist/tools/modpack-release.cjs validate $stagePath
  if ($LASTEXITCODE -ne 0) { throw 'The published baseline changed during upload. The release remains a draft.' }
  & $Gh release edit $plan.tag --repo $plan.repository --draft=false --prerelease=false --latest=false
  if ($LASTEXITCODE -ne 0) { throw 'Publication failed. Inspect the retained draft before retrying.' }
  & node dist/tools/modpack-release.cjs verify-public $stagePath
  if ($LASTEXITCODE -ne 0) { throw 'Release is published but public verification failed. Inspect the release and Pages workflow.' }
} finally { Pop-Location }
