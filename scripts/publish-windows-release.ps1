[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateSet('bootstrap', 'upgrade')]
  [string]$Mode
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-RemoteTagCommit {
  param([string]$Tag, [string]$ExpectedCommit)

  $remoteTagLines = @(
    git ls-remote --tags origin "refs/tags/$Tag" "refs/tags/$Tag^{}"
  )
  if ($LASTEXITCODE -ne 0 -or $remoteTagLines.Count -eq 0) {
    throw "Could not resolve remote release tag $Tag"
  }
  $resolvedTagLine = @(
    $remoteTagLines |
      Where-Object { $_ -match '\^\{\}$' } |
      Select-Object -First 1
  )
  if ($resolvedTagLine.Count -eq 0) {
    $resolvedTagLine = @($remoteTagLines | Select-Object -First 1)
  }
  $remoteTagSha = (
    [regex]::Split(([string]$resolvedTagLine[0]).Trim(), '\s+')
  )[0]
  if (-not [string]::Equals(
    $remoteTagSha,
    $ExpectedCommit,
    [System.StringComparison]::OrdinalIgnoreCase
  )) {
    throw "Remote release tag $Tag no longer resolves to the certified commit"
  }
}

function Get-ProtectedSignerIdentity {
  $approvedSubject = [string]$env:WINDOWS_CODESIGN_APPROVED_SUBJECT
  $approvedThumbprint = [string]$env:WINDOWS_CODESIGN_APPROVED_THUMBPRINT
  $hasApprovedSubject = -not [string]::IsNullOrWhiteSpace($approvedSubject)
  $hasApprovedThumbprint = -not [string]::IsNullOrWhiteSpace($approvedThumbprint)
  if ($hasApprovedSubject -eq $hasApprovedThumbprint) {
    throw 'Exactly one protected publication signer identity must be configured'
  }
  if ($hasApprovedSubject) {
    return [pscustomobject][ordered]@{
      mode = 'subject'
      subject = $approvedSubject
      thumbprint = $null
    }
  }

  $normalizedThumbprint = ($approvedThumbprint -replace '\s', '').ToUpperInvariant()
  if ($normalizedThumbprint -notmatch '^[0-9A-F]{40}$') {
    throw 'Protected publication signer thumbprint is invalid'
  }
  return [pscustomobject][ordered]@{
    mode = 'thumbprint'
    subject = $null
    thumbprint = $normalizedThumbprint
  }
}

function Assert-ExpectedAuthenticodeSignature {
  param([System.IO.FileInfo]$Artifact, [object]$ExpectedIdentity)

  $signature = Get-AuthenticodeSignature -FilePath $Artifact.FullName
  if ($signature.Status -ne 'Valid' -or
      [string]$signature.SignatureType -ne 'Authenticode' -or
      $null -eq $signature.SignerCertificate -or
      $null -eq $signature.TimeStamperCertificate) {
    throw "Artifact signature is no longer valid for the approved signer: $($Artifact.FullName)"
  }
  $signerSubject = [string]$signature.SignerCertificate.Subject
  $signerThumbprint = (
    [string]$signature.SignerCertificate.Thumbprint -replace '\s', ''
  ).ToUpperInvariant()
  $matchesProtectedIdentity = if ($ExpectedIdentity.mode -ceq 'subject') {
    [string]::Equals(
      $signerSubject,
      [string]$ExpectedIdentity.subject,
      [System.StringComparison]::Ordinal
    )
  } else {
    [string]::Equals(
      $signerThumbprint,
      [string]$ExpectedIdentity.thumbprint,
      [System.StringComparison]::Ordinal
    )
  }
  if (-not $matchesProtectedIdentity) {
    throw "Artifact signature is no longer valid for the approved signer: $($Artifact.FullName)"
  }
  return [pscustomobject][ordered]@{
    subject = $signerSubject
    thumbprint = $signerThumbprint
  }
}

function Assert-ReceiptSignerIdentity {
  param([object]$ReceiptArtifact, [object]$ActualIdentity, [string]$Label)

  if ([string]::IsNullOrWhiteSpace([string]$ReceiptArtifact.signerSubject) -or
      [string]::IsNullOrWhiteSpace([string]$ReceiptArtifact.signerThumbprint) -or
      -not [string]::Equals(
        [string]$ReceiptArtifact.signerSubject,
        [string]$ActualIdentity.subject,
        [System.StringComparison]::Ordinal
      ) -or
      -not [string]::Equals(
        ([string]$ReceiptArtifact.signerThumbprint -replace '\s', '').ToUpperInvariant(),
        [string]$ActualIdentity.thumbprint,
        [System.StringComparison]::Ordinal
      )) {
    throw "$Label signer identity does not match the certified Authenticode artifact"
  }
}

function Assert-LifecycleReceiptSignerIdentities {
  param(
    [object]$Receipt,
    [object]$PreviousLiveIdentity,
    [object]$CandidateLiveIdentity
  )

  Assert-ReceiptSignerIdentity `
    $Receipt.previousInstaller `
    $PreviousLiveIdentity `
    'Upgrade previous-installer receipt'
  Assert-ReceiptSignerIdentity `
    $Receipt.previousInstalledApp `
    $PreviousLiveIdentity `
    'Upgrade previous-installed-app receipt'
  Assert-ReceiptSignerIdentity `
    $Receipt.installer `
    $CandidateLiveIdentity `
    'Upgrade candidate-installer receipt'
  Assert-ReceiptSignerIdentity `
    $Receipt.installedApp `
    $CandidateLiveIdentity `
    'Upgrade candidate-installed-app receipt'
}

function Assert-PassingWindowsCertificateReceipt {
  param([object]$Receipt, [string]$ExpectedMode, [string]$Label)

  $schemaVersionIsIntegral = (
    $Receipt.schemaVersion -is [int] -or
    $Receipt.schemaVersion -is [long]
  )
  if (-not $schemaVersionIsIntegral -or
      [long]$Receipt.schemaVersion -ne 4 -or
      -not ($Receipt.certificationMode -is [string]) -or
      -not [string]::Equals(
        $Receipt.certificationMode,
        $ExpectedMode,
        [System.StringComparison]::Ordinal
      ) -or
      -not ($Receipt.status -is [string]) -or
      -not [string]::Equals(
        $Receipt.status,
        'passed',
        [System.StringComparison]::Ordinal
      )) {
    throw "$Label is not a passing schema-v4 certificate"
  }
}

function Assert-PassingWindowsCertificateCheck {
  param([object]$Receipt, [string]$CheckName, [string]$Label)

  $check = $Receipt.checks.PSObject.Properties[$CheckName]
  if ($null -eq $check -or -not [bool]::True.Equals($check.Value)) {
    throw "$Label check did not pass: $CheckName"
  }
}

function Assert-ExactReleaseAssets {
  param([object]$Release, [object[]]$ExpectedAssets)

  $expectedNames = [string[]]@(
    $ExpectedAssets | ForEach-Object { [string]$_.Name }
  )
  $actualNames = [string[]]@(
    $Release.assets | ForEach-Object { [string]$_.name }
  )
  [System.Array]::Sort($expectedNames, [System.StringComparer]::Ordinal)
  [System.Array]::Sort($actualNames, [System.StringComparer]::Ordinal)
  if ($expectedNames.Count -ne $actualNames.Count) {
    throw 'Published release assets do not exactly match the certified artifact set'
  }
  for ($index = 0; $index -lt $expectedNames.Count; $index += 1) {
    if (-not [string]::Equals(
      $expectedNames[$index],
      $actualNames[$index],
      [System.StringComparison]::Ordinal
    )) {
      throw 'Published release assets do not exactly match the certified artifact set'
    }
  }
}

function Set-ReadOnlyCreatedReleaseId {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value) -or
      $null -ne (
        Get-Variable -Name createdReleaseId -Scope Script `
          -ErrorAction SilentlyContinue
      )) {
    throw 'Created release identity must be set exactly once'
  }
  Set-Variable `
    -Name createdReleaseId `
    -Scope Script `
    -Value $Value `
    -Option ReadOnly
}

function Assert-ReleaseIdentity {
  param(
    [object]$Release,
    [string]$ExpectedId,
    [string]$ExpectedTag,
    [bool]$ExpectedDraft,
    [string]$Label
  )

  if ([string]::IsNullOrWhiteSpace($ExpectedId) -or
      [string]$Release.id -cne $ExpectedId -or
      [string]$Release.tagName -cne $ExpectedTag -or
      [string]$Release.name -cne "Waggle $ExpectedTag" -or
      -not ($Release.isDraft -is [bool]) -or
      -not [bool]::Equals($Release.isDraft, $ExpectedDraft) -or
      -not ($Release.isPrerelease -is [bool]) -or
      [bool]::True.Equals($Release.isPrerelease)) {
    throw "$Label identity does not match the newly-created release"
  }
}

function New-ReleaseAssetManifest {
  param([System.IO.FileInfo[]]$Assets)

  $manifest = @(
    foreach ($asset in $Assets) {
      if ($null -eq $asset -or
          -not $asset.Exists -or
          [System.IO.Path]::GetFileName($asset.Name) -cne $asset.Name) {
        throw 'Release asset manifest contains an invalid local file'
      }
      [pscustomobject]@{
        Name = [string]$asset.Name
        FullName = [string]$asset.FullName
        SizeBytes = [int64]$asset.Length
        Sha256 = (
          Get-FileHash -LiteralPath $asset.FullName -Algorithm SHA256
        ).Hash.ToUpperInvariant()
      }
    }
  )
  for ($left = 0; $left -lt $manifest.Count; $left += 1) {
    for ($right = $left + 1; $right -lt $manifest.Count; $right += 1) {
      if ([string]::Equals(
        [string]$manifest[$left].Name,
        [string]$manifest[$right].Name,
        [System.StringComparison]::Ordinal
      )) {
        throw 'Release asset manifest contains a duplicate exact filename'
      }
    }
  }
  return $manifest
}

function Assert-ReleaseAssetFileMatchesManifest {
  param(
    [string]$Path,
    [object]$ExpectedAsset,
    [string]$Label
  )

  $asset = Get-Item -LiteralPath $Path -ErrorAction Stop
  $sha256 = (
    Get-FileHash -LiteralPath $asset.FullName -Algorithm SHA256
  ).Hash
  if (-not ($asset -is [System.IO.FileInfo]) -or
      [string]$asset.Name -cne [string]$ExpectedAsset.Name -or
      [int64]$asset.Length -ne [int64]$ExpectedAsset.SizeBytes -or
      -not [string]::Equals(
        $sha256,
        [string]$ExpectedAsset.Sha256,
        [System.StringComparison]::OrdinalIgnoreCase
      )) {
    throw "$Label does not match the immutable release-asset manifest"
  }
}

function Assert-LocalReleaseAssetsUnchanged {
  param([object[]]$Manifest)

  foreach ($expectedAsset in $Manifest) {
    Assert-ReleaseAssetFileMatchesManifest `
      ([string]$expectedAsset.FullName) `
      $expectedAsset `
      "Local release asset $($expectedAsset.Name)"
  }
}

function Assert-RemoteReleaseAssetContents {
  param(
    [string]$Tag,
    [object]$Release,
    [object[]]$Manifest,
    [string]$Stage
  )

  Assert-ExactReleaseAssets $Release $Manifest
  Assert-LocalReleaseAssetsUnchanged $Manifest
  if ([string]::IsNullOrWhiteSpace([string]$env:RUNNER_TEMP)) {
    throw 'RUNNER_TEMP is required for remote release-asset verification'
  }
  $downloadRoot = Join-Path `
    ([string]$env:RUNNER_TEMP) `
    "waggle-release-$Stage-$([guid]::NewGuid().ToString('N'))"
  New-Item -ItemType Directory -Path $downloadRoot -ErrorAction Stop |
    Out-Null
  try {
    gh release download $Tag --dir $downloadRoot
    if ($LASTEXITCODE -ne 0) {
      throw "Could not download $Stage release assets for byte verification"
    }
    $downloadedFiles = @(
      Get-ChildItem -LiteralPath $downloadRoot -File
    )
    if ($downloadedFiles.Count -ne $Manifest.Count) {
      throw "$Stage release download does not contain the exact asset count"
    }
    foreach ($expectedAsset in $Manifest) {
      Assert-ReleaseAssetFileMatchesManifest `
        (Join-Path $downloadRoot ([string]$expectedAsset.Name)) `
        $expectedAsset `
        "$Stage remote release asset $($expectedAsset.Name)"
    }
  } finally {
    if (Test-Path -LiteralPath $downloadRoot) {
      Remove-Item -LiteralPath $downloadRoot -Recurse -Force
    }
  }
  Assert-LocalReleaseAssetsUnchanged $Manifest
}

function Assert-ManagedModelAndMemoryEvidence {
  param([object]$Receipt, [string]$Label)

  if (-not [bool]::True.Equals($Receipt.managedModelVerified)) {
    throw "$Label does not prove a managed local-model chat completion"
  }
  if ([string]$Receipt.managedModelDigest -notmatch '^sha256:[0-9a-f]{64}$') {
    throw "$Label does not bind the managed model to an immutable manifest digest"
  }
  if (-not [string]::Equals(
    [string]$Receipt.certifiedTier,
    'FREE',
    [System.StringComparison]::Ordinal
  )) {
    throw "$Label does not certify the Solo/FREE tier"
  }
  if ([string]::IsNullOrWhiteSpace(
        [string]$Receipt.lifecycleData.workspaceId
      ) -or
      [long]$Receipt.lifecycleData.personalFrameId -lt 1 -or
      [long]$Receipt.lifecycleData.workspaceFrameId -lt 1 -or
      [int]$Receipt.lifecycleData.preUninstallManifestEntryCount -lt 1 -or
      [string]$Receipt.lifecycleData.preUninstallManifestSha256 -notmatch '^[0-9A-F]{64}$' -or
      [string]$Receipt.lifecycleData.postUninstallManifestSha256 -notmatch '^[0-9A-F]{64}$' -or
      -not [string]::Equals(
        [string]$Receipt.lifecycleData.preUninstallManifestSha256,
        [string]$Receipt.lifecycleData.postUninstallManifestSha256,
        [System.StringComparison]::Ordinal
      )) {
    throw "$Label does not bind real workspace and memory data to an unchanged uninstall manifest"
  }
}

function Assert-ReceiptSourceHashes {
  param(
    [object[]]$Receipts,
    [System.IO.FileInfo]$Installer,
    [string]$SourceRevision
  )

  $currentCertifierHash = (
    Get-FileHash -LiteralPath 'scripts/certify-windows-installer.ps1' `
      -Algorithm SHA256
  ).Hash
  $currentHookHash = (
    Get-FileHash -LiteralPath 'app/src-tauri/nsis/installer.nsi' `
      -Algorithm SHA256
  ).Hash
  $releaseDirectory = Split-Path -Parent (
    Split-Path -Parent $Installer.DirectoryName
  )
  $generatedInstallerScripts = @(
    Get-ChildItem -LiteralPath (Join-Path $releaseDirectory 'nsis') `
      -Recurse -Filter 'installer.nsi' -File
  )
  if ($generatedInstallerScripts.Count -ne 1) {
    throw 'Could not uniquely resolve generated NSIS source during publication'
  }
  $currentGeneratedInstallerHash = (
    Get-FileHash -LiteralPath $generatedInstallerScripts[0].FullName `
      -Algorithm SHA256
  ).Hash
  $currentSidecarPath = 'app/src-tauri/resources/service.js'
  if (-not (Test-Path -LiteralPath $currentSidecarPath -PathType Leaf)) {
    throw 'Current source-bound sidecar bundle is missing during publication'
  }
  $currentSidecarBytes = [System.IO.File]::ReadAllBytes(
    (Get-Item -LiteralPath $currentSidecarPath).FullName
  )
  $sidecarNewlineIndex = [Array]::IndexOf($currentSidecarBytes, [byte]10)
  if ($sidecarNewlineIndex -le 0) {
    throw 'Current sidecar bundle is missing embedded provenance'
  }
  $sidecarFirstLine = [System.Text.Encoding]::UTF8.GetString(
    $currentSidecarBytes,
    0,
    $sidecarNewlineIndex
  )
  $sidecarPrefix = '// Waggle-Sidecar-Provenance: '
  if (-not $sidecarFirstLine.StartsWith($sidecarPrefix, [System.StringComparison]::Ordinal)) {
    throw 'Current sidecar bundle is missing embedded provenance'
  }
  $sidecarEncodedProvenance = $sidecarFirstLine.Substring($sidecarPrefix.Length)
  try {
    $sidecarProvenanceBytes = [Convert]::FromBase64String($sidecarEncodedProvenance)
    if (-not [string]::Equals(
      [Convert]::ToBase64String($sidecarProvenanceBytes),
      $sidecarEncodedProvenance,
      [System.StringComparison]::Ordinal
    )) {
      throw 'non-canonical provenance'
    }
    $sidecarManifest = [System.Text.Encoding]::UTF8.GetString($sidecarProvenanceBytes) |
      ConvertFrom-Json
  } catch {
    throw 'Current sidecar bundle has invalid embedded provenance'
  }
  if (-not [string]::Equals(
    [string]$sidecarManifest.sourceRevision,
    $SourceRevision,
    [System.StringComparison]::Ordinal
  ) -or @($sidecarManifest.sourceInputs).Count -lt 4) {
    throw 'Current sidecar provenance does not bind the publication source revision'
  }
  $sidecarProvenanceHasher = [System.Security.Cryptography.SHA256]::Create()
  try {
    $currentSidecarProvenanceHash = (
      [System.BitConverter]::ToString(
        $sidecarProvenanceHasher.ComputeHash($sidecarProvenanceBytes)
      )
    ).Replace('-', '')
  } finally {
    $sidecarProvenanceHasher.Dispose()
  }
  $currentSidecarHash = (
    Get-FileHash -LiteralPath $currentSidecarPath -Algorithm SHA256
  ).Hash
  $currentSidecarSourceInputCount = @($sidecarManifest.sourceInputs).Count

  foreach ($certificateData in $Receipts) {
    if (-not [string]::Equals(
          $currentCertifierHash,
          [string]$certificateData.evidence.certifierSha256,
          [System.StringComparison]::OrdinalIgnoreCase
        ) -or
        -not [string]::Equals(
          $currentHookHash,
          [string]$certificateData.evidence.installerHookSha256,
          [System.StringComparison]::OrdinalIgnoreCase
        ) -or
        -not [string]::Equals(
          $currentGeneratedInstallerHash,
          [string]$certificateData.evidence.generatedInstallerScriptSha256,
          [System.StringComparison]::OrdinalIgnoreCase
        ) -or
        -not [string]::Equals(
          $currentSidecarHash,
          [string]$certificateData.evidence.sidecarBundleSha256,
          [System.StringComparison]::OrdinalIgnoreCase
        ) -or
        -not [string]::Equals(
          $currentSidecarProvenanceHash,
          [string]$certificateData.evidence.sidecarProvenanceSha256,
          [System.StringComparison]::OrdinalIgnoreCase
        ) -or
        -not [string]::Equals(
          $SourceRevision,
          [string]$certificateData.evidence.sidecarSourceRevision,
          [System.StringComparison]::Ordinal
        ) -or
        [int]$certificateData.evidence.sidecarSourceInputCount -ne
          $currentSidecarSourceInputCount
      ) {
      throw 'Lifecycle receipt source hashes do not match the release checkout'
    }
  }
}

function Assert-ReleaseDoesNotExist {
  param([string]$Tag)

  $probeOutput = @(gh release view $Tag --json id 2>&1)
  $probeExitCode = $LASTEXITCODE
  if ($probeExitCode -eq 0) {
    throw "Refusing to use a pre-existing release: $Tag"
  }
  $probeText = [string]::Join("`n", [string[]]$probeOutput)
  if ($probeText -notmatch '(?i)(release not found|HTTP\s+404)') {
    throw "Could not prove that release $Tag does not already exist"
  }
}

function Assert-PublicationTagBindings {
  param([string]$ReleaseMode, [string]$Tag, [string]$Commit)

  if ($ReleaseMode -ceq 'upgrade') {
    Assert-RemoteTagCommit `
      ([string]$env:WINDOWS_UPGRADE_BASE_TAG) `
      ([string]$env:WAGGLE_UPGRADE_BASE_COMMIT)
  }
  Assert-RemoteTagCommit $Tag $Commit
}

if (-not [string]::Equals(
  $Mode,
  [string]$env:WAGGLE_RELEASE_MODE,
  [System.StringComparison]::Ordinal
)) {
  throw 'Publisher mode does not match the resolved Windows release mode'
}

$tag = [string]$env:GITHUB_REF_NAME
$sourceRevision = [string]$env:GITHUB_SHA
if ($tag -notmatch '^v\d+\.\d+\.\d+$' -or
    $sourceRevision -cnotmatch '^[0-9a-f]{40}$') {
  throw 'Publication requires an exact release tag and lowercase commit identity'
}

$baselineInputs = @(
  [string]$env:WINDOWS_UPGRADE_BASE_TAG,
  [string]$env:WINDOWS_UPGRADE_BASE_ASSET_NAME,
  [string]$env:WINDOWS_UPGRADE_BASE_SHA256,
  [string]$env:WINDOWS_UPGRADE_BASE_COMMIT
)
if (@($baselineInputs | Where-Object { $_ -ne $_.Trim() }).Count -gt 0) {
  throw 'Protected Windows upgrade-baseline inputs must not contain surrounding whitespace'
}

if ($Mode -ceq 'bootstrap') {
  $expectedBootstrapIdentity = "v0.2.0@$env:GITHUB_SHA"
  if ($tag -cne 'v0.2.0' -or
      -not [string]::Equals(
        [string]$env:WINDOWS_BOOTSTRAP_RELEASE_IDENTITY,
        $expectedBootstrapIdentity,
        [System.StringComparison]::Ordinal
      ) -or
      @($baselineInputs | Where-Object {
        -not [string]::IsNullOrEmpty($_)
      }).Count -ne 0) {
    throw 'Bootstrap publication is not bound to the exact authorized v0.2.0 release'
  }
} else {
  if (-not [string]::IsNullOrEmpty(
        [string]$env:WINDOWS_BOOTSTRAP_RELEASE_IDENTITY
      ) -or
      @($baselineInputs | Where-Object {
        [string]::IsNullOrEmpty($_)
      }).Count -ne 0) {
    throw 'Upgrade publication requires an empty bootstrap authorization and all baseline inputs'
  }
}

$installers = @(
  Get-ChildItem -LiteralPath 'app/src-tauri/target' -Recurse `
    -Filter '*-setup.exe' -File |
    Where-Object { $_.DirectoryName -match '[\\/]bundle[\\/]nsis$' }
)
if ($installers.Count -ne 1) {
  throw "Expected exactly one certified NSIS installer, found $($installers.Count)"
}
$installer = $installers[0]
$cleanReceipt = Get-Item -LiteralPath (
  Join-Path $installer.DirectoryName 'windows-installer-certificate.json'
)
$upgradeReceiptPath = Join-Path `
  $installer.DirectoryName `
  'windows-installer-upgrade-certificate.json'
if ($Mode -ceq 'bootstrap' -and
    (Test-Path -LiteralPath $upgradeReceiptPath)) {
  throw 'Bootstrap publication found an unexpected upgrade certificate'
}

$cleanReceiptData = Get-Content -Raw -LiteralPath $cleanReceipt.FullName |
  ConvertFrom-Json
Assert-PassingWindowsCertificateReceipt `
  $cleanReceiptData 'same-version-repair' 'Windows clean-install receipt'

if (-not [string]::Equals(
      [string]$cleanReceiptData.evidence.sourceRevision,
      $sourceRevision,
      [System.StringComparison]::Ordinal
    ) -or
    -not [string]::Equals(
      [string]$cleanReceiptData.installer.name,
      $installer.Name,
      [System.StringComparison]::Ordinal
    ) -or
    [int64]$cleanReceiptData.installer.sizeBytes -ne $installer.Length) {
  throw 'Clean-install receipt identity does not match the release artifact and commit'
}

$candidateVersion = [string](
  Get-Content -Raw -LiteralPath 'app/src-tauri/tauri.conf.json' |
    ConvertFrom-Json
).version
if ($candidateVersion -notmatch '^\d+\.\d+\.\d+$' -or
    $tag -cne "v$candidateVersion" -or
    [string]$env:WAGGLE_CERTIFIED_CANDIDATE_VERSION -cne $candidateVersion -or
    ($Mode -ceq 'bootstrap' -and $candidateVersion -cne '0.2.0')) {
  throw 'Published candidate version is not independently bound to the release tag'
}

$installerSha256 = (
  Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256
).Hash
if (-not [string]::Equals(
      $installerSha256,
      [string]$env:WAGGLE_CERTIFIED_CANDIDATE_SHA256,
      [System.StringComparison]::OrdinalIgnoreCase
    ) -or
    -not [string]::Equals(
      $installerSha256,
      [string]$cleanReceiptData.installer.sha256,
      [System.StringComparison]::OrdinalIgnoreCase
    )) {
  throw 'Certified installer hash no longer matches the clean receipt and pre-publication output'
}

$approvedSignerIdentity = Get-ProtectedSignerIdentity
$installerSignerIdentity = Assert-ExpectedAuthenticodeSignature $installer $approvedSignerIdentity
if ($cleanReceiptData.installer.authenticodeStatus -ne 'Valid' -or
    $cleanReceiptData.installedApp.authenticodeStatus -ne 'Valid' -or
    $cleanReceiptData.installer.signatureType -ne 'Authenticode' -or
    $cleanReceiptData.installedApp.signatureType -ne 'Authenticode' -or
    [string]::IsNullOrWhiteSpace(
      [string]$cleanReceiptData.installer.timestampAuthorityThumbprint
    ) -or
    [string]::IsNullOrWhiteSpace(
      [string]$cleanReceiptData.installedApp.timestampAuthorityThumbprint
    )) {
  throw 'Clean-install receipt does not preserve valid signer and timestamp evidence'
}
Assert-ReceiptSignerIdentity `
  $cleanReceiptData.installer $installerSignerIdentity 'Clean-install installer receipt'
Assert-ReceiptSignerIdentity `
  $cleanReceiptData.installedApp $installerSignerIdentity 'Clean-install installed-app receipt'
Assert-ManagedModelAndMemoryEvidence `
  $cleanReceiptData `
  'Clean-install receipt'

$cleanRequiredChecks = @(
  'sourceRevision', 'sourceFilesClean', 'sidecarSourceProvenance',
  'generatedInstallerInclude',
  'profileDataDeletionAbsent', 'baseAppDataDeletionNeutralized',
  'authenticodeSignature', 'authenticodeSigner', 'authenticodeTimestamp',
  'installedAppAuthenticodeSignature', 'installedAppAuthenticodeSigner',
  'installedAppAuthenticodeTimestamp', 'silentInstall',
  'vaultKeyAclRestricted', 'windowsInboxTools', 'noModelChatSetupRequired',
  'soloTier', 'dockerIndependentRuntimePrerequisites',
  'managedRuntimeBootstrap', 'managedModelPull', 'managedModelChat',
  'managedModelProxyRestartChat', 'managedRuntimeCleanup',
  'sameVersionRepair', 'repairSoloTier', 'repairManagedModelDigestPreserved',
  'relaunchAfterRepair', 'silentUninstall', 'defaultProfileDataDir',
  'realWorkspaceAndMemorySeeded', 'repairRealWorkspaceAndMemoryPreserved',
  'uninstallRealWorkspaceAndMemoryPreserved', 'configuredDataDirPreserved',
  'profileDataPathPreserved', 'certificateProfileCleanup',
  'externalProfileRootsUnchanged', 'environmentRestored'
)
foreach ($checkName in $cleanRequiredChecks) {
  Assert-PassingWindowsCertificateCheck `
    $cleanReceiptData $checkName 'Clean-install receipt'
}

$receiptDataSet = @($cleanReceiptData)
if ($Mode -ceq 'bootstrap') {
  $releaseAssets = @($installer, $cleanReceipt)
} else {
  $upgradeReceipt = Get-Item -LiteralPath $upgradeReceiptPath
  $receiptData = Get-Content -Raw -LiteralPath $upgradeReceipt.FullName |
    ConvertFrom-Json
  Assert-PassingWindowsCertificateReceipt `
    $receiptData 'version-to-version-upgrade' 'Windows lifecycle receipt'

  if (-not [string]::Equals(
        [string]$receiptData.evidence.sourceRevision,
        $sourceRevision,
        [System.StringComparison]::Ordinal
      ) -or
      -not [string]::Equals(
        [string]$receiptData.installer.name,
        $installer.Name,
        [System.StringComparison]::Ordinal
      ) -or
      [int64]$receiptData.installer.sizeBytes -ne $installer.Length -or
      -not [string]::Equals(
        $installerSha256,
        [string]$receiptData.installer.sha256,
        [System.StringComparison]::OrdinalIgnoreCase
      )) {
    throw 'Upgrade receipt does not match the release artifact and commit'
  }

  $baseInstaller = Get-Item -LiteralPath (
    [string]$env:WAGGLE_UPGRADE_BASE_INSTALLER_PATH
  )
  $baseSha256 = (
    Get-FileHash -LiteralPath $baseInstaller.FullName -Algorithm SHA256
  ).Hash
  if (-not [string]::Equals(
    [string]$env:WAGGLE_UPGRADE_BASE_COMMIT,
    [string]$env:WINDOWS_UPGRADE_BASE_COMMIT,
    [System.StringComparison]::OrdinalIgnoreCase
  )) {
    throw 'Certified Windows upgrade baseline commit no longer matches the protected commit'
  }
  Assert-RemoteTagCommit `
    ([string]$env:WINDOWS_UPGRADE_BASE_TAG) `
    ([string]$env:WAGGLE_UPGRADE_BASE_COMMIT)
  if ([string]$env:WINDOWS_UPGRADE_BASE_TAG -notmatch '^v(?<version>\d+\.\d+\.\d+)$' -or
      $Matches['version'] -cne [string]$receiptData.upgrade.previousVersion -or
      $Matches['version'] -cne [string]$env:WAGGLE_UPGRADE_BASE_VERSION -or
      [string]$receiptData.upgrade.previousSourceRevision -cne
        [string]$env:WAGGLE_UPGRADE_BASE_COMMIT -or
      [string]$receiptData.upgrade.candidateVersion -cne $candidateVersion -or
      [string]$receiptData.upgrade.observedPreviousVersion -cne
        [string]$receiptData.upgrade.previousVersion -or
      [string]$receiptData.upgrade.observedCandidateVersion -cne
        [string]$receiptData.upgrade.candidateVersion) {
    throw 'Lifecycle receipt does not bind the observed upgrade versions to the protected release versions'
  }
  if ($baseInstaller.Name -cne [string]$env:WINDOWS_UPGRADE_BASE_ASSET_NAME -or
      [string]$receiptData.previousInstaller.name -cne $baseInstaller.Name -or
      [int64]$receiptData.previousInstaller.sizeBytes -ne $baseInstaller.Length -or
      -not [string]::Equals(
        $baseSha256,
        [string]$env:WINDOWS_UPGRADE_BASE_SHA256,
        [System.StringComparison]::OrdinalIgnoreCase
      ) -or
      -not [string]::Equals(
        $baseSha256,
        [string]$receiptData.previousInstaller.sha256,
        [System.StringComparison]::OrdinalIgnoreCase
      )) {
    throw 'Lifecycle receipt previous installer does not match the protected upgrade baseline'
  }
  if ($receiptData.installer.authenticodeStatus -ne 'Valid' -or
      $receiptData.installedApp.authenticodeStatus -ne 'Valid' -or
      $receiptData.previousInstaller.authenticodeStatus -ne 'Valid' -or
      $receiptData.previousInstalledApp.authenticodeStatus -ne 'Valid' -or
      $receiptData.installer.signatureType -ne 'Authenticode' -or
      $receiptData.installedApp.signatureType -ne 'Authenticode' -or
      $receiptData.previousInstaller.signatureType -ne 'Authenticode' -or
      $receiptData.previousInstalledApp.signatureType -ne 'Authenticode') {
    throw 'Lifecycle receipt does not contain valid previous and candidate signatures'
  }
  $baseInstallerSignerIdentity = Assert-ExpectedAuthenticodeSignature $baseInstaller $approvedSignerIdentity
  Assert-LifecycleReceiptSignerIdentities `
    $receiptData $baseInstallerSignerIdentity $installerSignerIdentity
  foreach ($timestampThumbprint in @(
    $receiptData.previousInstaller.timestampAuthorityThumbprint,
    $receiptData.previousInstalledApp.timestampAuthorityThumbprint,
    $receiptData.installer.timestampAuthorityThumbprint,
    $receiptData.installedApp.timestampAuthorityThumbprint
  )) {
    if ([string]::IsNullOrWhiteSpace([string]$timestampThumbprint)) {
      throw 'Lifecycle receipt is missing a validated Authenticode timestamp'
    }
  }
  Assert-ManagedModelAndMemoryEvidence $receiptData 'Upgrade receipt'
  if ([string]::IsNullOrWhiteSpace(
        [string]$receiptData.upgrade.managedModelName
      ) -or
      [string]$receiptData.upgrade.managedModelDigest -notmatch
        '^sha256:[0-9a-f]{64}$' -or
      -not [string]::Equals(
        [string]$receiptData.upgrade.managedModelName,
        [string]$receiptData.managedModel.name,
        [System.StringComparison]::Ordinal
      ) -or
      -not [string]::Equals(
        [string]$receiptData.upgrade.managedModelDigest,
        [string]$receiptData.managedModelDigest,
        [System.StringComparison]::Ordinal
      )) {
    throw 'Upgrade receipt does not preserve the previous managed-model identity and digest'
  }

  $upgradeRequiredChecks = @(
    'sourceRevision', 'sourceFilesClean', 'sidecarSourceProvenance',
    'generatedInstallerInclude',
    'profileDataDeletionAbsent', 'baseAppDataDeletionNeutralized',
    'authenticodeSignature', 'authenticodeSigner', 'authenticodeTimestamp',
    'installedAppAuthenticodeSignature', 'installedAppAuthenticodeSigner',
    'installedAppAuthenticodeTimestamp', 'previousInstallerHash',
    'previousInstallerAuthenticodeSignature',
    'previousInstallerAuthenticodeSigner',
    'previousInstallerAuthenticodeTimestamp',
    'previousInstalledAppAuthenticodeSignature',
    'previousInstalledAppAuthenticodeSigner',
    'previousInstalledAppAuthenticodeTimestamp', 'candidateInstallerHash',
    'versionOrder', 'previousVersion', 'candidateVersion', 'previousInstall',
    'previousLaunch', 'sameApprovedSigner', 'versionToVersionUpgrade',
    'upgradeSameInstallDirectory', 'upgradeConfiguredDataPreserved',
    'upgradeProfileDataPreserved', 'upgradeVaultKeyPreserved',
    'upgradeRegistrations', 'candidateLaunch', 'relaunchAfterUpgrade',
    'silentInstall', 'vaultKeyAclRestricted', 'windowsInboxTools', 'soloTier',
    'previousSoloTier', 'dockerIndependentRuntimePrerequisites',
    'managedRuntimeBootstrap', 'managedModelPull', 'managedModelChat',
    'managedModelProxyRestartChat', 'managedRuntimeCleanup',
    'previousManagedModelSeeded', 'upgradeManagedModelPreserved',
    'sameVersionRepair', 'repairSoloTier', 'repairManagedModelDigestPreserved',
    'relaunchAfterRepair', 'silentUninstall', 'defaultProfileDataDir',
    'realWorkspaceAndMemorySeeded', 'upgradeRealWorkspaceAndMemoryPreserved',
    'repairRealWorkspaceAndMemoryPreserved',
    'uninstallRealWorkspaceAndMemoryPreserved',
    'configuredDataDirPreserved', 'profileDataPathPreserved',
    'certificateProfileCleanup', 'externalProfileRootsUnchanged', 'environmentRestored'
  )
  foreach ($checkName in $upgradeRequiredChecks) {
    Assert-PassingWindowsCertificateCheck `
      $receiptData $checkName 'Upgrade receipt'
  }
  $receiptDataSet = @($cleanReceiptData, $receiptData)
  $releaseAssets = @($installer, $cleanReceipt, $upgradeReceipt)
}

$nonPassingChecks = @(
  foreach ($certificateData in $receiptDataSet) {
    $certificateData.checks.PSObject.Properties |
      Where-Object { -not [bool]::True.Equals($_.Value) }
  }
)
if ($nonPassingChecks.Count -gt 0) {
  throw "Lifecycle receipts contain non-passing checks: $($nonPassingChecks.Name -join ', ')"
}

$releaseAssetManifest = @(New-ReleaseAssetManifest $releaseAssets)
Assert-LocalReleaseAssetsUnchanged $releaseAssetManifest
Assert-ReceiptSourceHashes $receiptDataSet $installer $sourceRevision
Assert-PublicationTagBindings $Mode $tag $sourceRevision
Assert-ReleaseDoesNotExist $tag

gh release create $tag --verify-tag --draft --title "Waggle $tag" `
  --notes 'See the release notes for details.'
if ($LASTEXITCODE -ne 0) {
  throw "Could not create a dedicated $Mode draft release: $tag"
}
$releaseData = gh release view $tag `
  --json id,isDraft,isPrerelease,tagName,name,assets |
  ConvertFrom-Json
if ($LASTEXITCODE -ne 0) {
  throw "Could not inspect newly-created $Mode draft release $tag"
}
Set-ReadOnlyCreatedReleaseId ([string]$releaseData.id)
Assert-ReleaseIdentity `
  $releaseData $createdReleaseId $tag $true 'Newly-created draft release'
if (@($releaseData.assets).Count -ne 0) {
  throw "Could not verify newly-created $Mode draft release $tag"
}

Assert-PublicationTagBindings $Mode $tag $sourceRevision
$releaseAssetPaths = [string[]]@(
  $releaseAssetManifest | ForEach-Object { $_.FullName }
)
gh release upload $tag @releaseAssetPaths
if ($LASTEXITCODE -ne 0) {
  throw "Could not upload certified Windows $Mode assets to $tag"
}
$uploadedRelease = gh release view $tag `
  --json id,isDraft,isPrerelease,tagName,name,assets |
  ConvertFrom-Json
if ($LASTEXITCODE -ne 0) {
  throw "Could not verify uploaded $Mode draft $tag"
}
Assert-ReleaseIdentity `
  $uploadedRelease $createdReleaseId $tag $true 'Uploaded draft release'
Assert-ExactReleaseAssets $uploadedRelease $releaseAssets
Assert-RemoteReleaseAssetContents $tag $uploadedRelease $releaseAssetManifest 'uploaded'

Assert-PublicationTagBindings $Mode $tag $sourceRevision
gh release edit $tag --draft=false --prerelease=false
if ($LASTEXITCODE -ne 0) {
  throw "Could not publish certified Windows $Mode release $tag"
}
$publishedRelease = gh release view $tag `
  --json id,isDraft,isPrerelease,tagName,name,assets |
  ConvertFrom-Json
if ($LASTEXITCODE -ne 0) {
  throw "Published Windows $Mode release $tag is not final"
}
Assert-ReleaseIdentity `
  $publishedRelease $createdReleaseId $tag $false 'Published release'
Assert-ExactReleaseAssets $publishedRelease $releaseAssets
Assert-RemoteReleaseAssetContents $tag $publishedRelease $releaseAssetManifest 'published'
