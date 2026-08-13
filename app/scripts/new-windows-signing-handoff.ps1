[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$SourceTargetRoot,

  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$DestinationRoot,

  [string]$GitPath = 'C:\Program Files\Git\cmd\git.exe',

  [string]$NodePath = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ApprovedRepository = 'marolinik/waggle-os'
$TargetTriple = 'x86_64-pc-windows-msvc'
$ExpectedNodeVersion = 'v22.23.2'
$ExpectedNsisFileCount = 442
$ExpectedNsisInventorySha256 = '1FC822D1A183552A80ADEA01B0BF456F462B90518256EF1FE9EDFA22D76CD85A'
$OpenJsPublisher = 'CN=OpenJS Foundation, O=OpenJS Foundation, L=San Francisco, S=California, C=US'
$GitPublisher = 'CN=Johannes Schindelin, O=Johannes Schindelin, S=Nordrhein-Westfalen, C=DE'
$CodeSigningOid = '1.3.6.1.5.5.7.3.3'
$MaxTargetFileCount = 18000
$MaxTargetBytes = 768MB
$MaxResourceFileCount = 17500
$MaxResourceBytes = 600MB

function Get-HandoffHex {
  param([Parameter(Mandatory = $true)] [byte[]]$Bytes)

  return ([BitConverter]::ToString($Bytes) -replace '-', '')
}

function Get-HandoffBytesSha256 {
  param([Parameter(Mandatory = $true)] [byte[]]$Bytes)

  $algorithm = [Security.Cryptography.SHA256]::Create()
  try {
    return Get-HandoffHex ($algorithm.ComputeHash($Bytes))
  } finally {
    $algorithm.Dispose()
  }
}

function Get-HandoffNormalizedGitBlobSha1 {
  param([Parameter(Mandatory = $true)] [string]$Path)

  $strictUtf8 = [Text.UTF8Encoding]::new($false, $true)
  try {
    $text = $strictUtf8.GetString([IO.File]::ReadAllBytes($Path))
  } catch {
    throw 'Tracked handoff input is not canonical UTF-8 text.'
  }
  if ($text.Length -gt 0 -and $text[0] -eq [char]0xFEFF) {
    throw 'Tracked handoff input contains a UTF-8 BOM.'
  }
  $normalized = $text.Replace("`r`n", "`n")
  if ($normalized.Contains("`r")) {
    throw 'Tracked handoff input contains a non-canonical carriage return.'
  }
  $contentBytes = [Text.UTF8Encoding]::new($false).GetBytes($normalized)
  $headerBytes = [Text.Encoding]::ASCII.GetBytes("blob $($contentBytes.Length)`0")
  $algorithm = [Security.Cryptography.SHA1]::Create()
  try {
    return Get-HandoffHex ($algorithm.ComputeHash([byte[]]($headerBytes + $contentBytes)))
  } finally {
    $algorithm.Dispose()
  }
}

function Get-HandoffFileSha256 {
  param([Parameter(Mandatory = $true)] [string]$Path)

  $stream = [IO.File]::Open(
    $Path,
    [IO.FileMode]::Open,
    [IO.FileAccess]::Read,
    [IO.FileShare]::Read
  )
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try {
    return Get-HandoffHex ($algorithm.ComputeHash($stream))
  } finally {
    $algorithm.Dispose()
    $stream.Dispose()
  }
}

function Assert-HandoffSignedExecutable {
  param(
    [Parameter(Mandatory = $true)] [string]$Path,
    [Parameter(Mandatory = $true)] [string]$ExpectedPublisher,
    [Parameter(Mandatory = $true)] [string]$Label
  )

  $signature = Get-AuthenticodeSignature -LiteralPath $Path
  if ($signature.Status -ne [Management.Automation.SignatureStatus]::Valid -or
      [string]$signature.SignatureType -cne 'Authenticode' -or
      $null -eq $signature.SignerCertificate -or
      -not [string]::Equals(
        [string]$signature.SignerCertificate.Subject,
        $ExpectedPublisher,
        [StringComparison]::Ordinal
      )) {
    throw "$Label does not have the approved Authenticode publisher."
  }
  $hasCodeSigningEku = @(
    $signature.SignerCertificate.Extensions |
      Where-Object {
        $_ -is [Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]
      } |
      ForEach-Object { $_.EnhancedKeyUsages } |
      Where-Object { $_.Value -eq $CodeSigningOid }
  ).Count -gt 0
  if (-not $hasCodeSigningEku) { throw "$Label lacks the Code Signing EKU." }
}

function Get-HandoffTrustedPath {
  param(
    [Parameter(Mandatory = $true)] [string]$Path,
    [Parameter(Mandatory = $true)] [string]$Label,
    [ValidateSet('Leaf', 'Container')] [string]$PathType = 'Leaf',
    [switch]$AllowHardLink
  )

  if ([string]::IsNullOrWhiteSpace($Path) -or
      $Path -match '[\x00-\x1F\x7F]' -or
      $Path -notmatch '^[A-Za-z]:[\\/]' -or
      $Path -match '^[\\/]{2}' -or
      $Path.Substring(2) -match ':' -or
      $Path -match '(^|[\\/])\.\.?(?:[\\/]|$)' -or
      @($Path -split '[\\/]' | Where-Object { $_ -match '[. ]$' }).Count -ne 0) {
    throw "$Label must use a safe, fully qualified local Windows path."
  }

  $fullPath = [IO.Path]::GetFullPath($Path)
  $testPathType = if ($PathType -ceq 'Leaf') { 'Leaf' } else { 'Container' }
  if (-not (Test-Path -LiteralPath $fullPath -PathType $testPathType)) {
    throw "$Label does not exist as a $($PathType.ToLowerInvariant()): $fullPath"
  }

  $root = [IO.Path]::GetPathRoot($fullPath)
  $relative = $fullPath.Substring($root.Length)
  $current = $root
  foreach ($component in @($relative -split '[\\/]' | Where-Object { $_ })) {
    $current = Join-Path $current $component
    $item = Get-Item -LiteralPath $current -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "$Label traverses a reparse point: $current"
    }
    $linkTypeProperty = $item.PSObject.Properties['LinkType']
    if ($null -eq $linkTypeProperty) {
      throw "$Label filesystem provider does not expose link topology."
    }
    $linkType = [string]$linkTypeProperty.Value
    if (-not [string]::IsNullOrEmpty($linkType) -and
        -not ($AllowHardLink -and $linkType -ceq 'HardLink')) {
      throw "$Label traverses an unsupported linked filesystem object: $current"
    }
  }

  $resolved = (Resolve-Path -LiteralPath $fullPath).ProviderPath
  if (-not [string]::Equals(
      [IO.Path]::GetFullPath($resolved),
      $fullPath,
      [StringComparison]::OrdinalIgnoreCase
    )) {
    throw "$Label resolves to an unexpected path."
  }
  return $fullPath
}

function Get-HandoffContainedRelativePath {
  param(
    [Parameter(Mandatory = $true)] [string]$Path,
    [Parameter(Mandatory = $true)] [string]$Root
  )

  $fullPath = [IO.Path]::GetFullPath($Path)
  $fullRoot = [IO.Path]::GetFullPath($Root).TrimEnd('\')
  $prefix = "$fullRoot\"
  if (-not $fullPath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
    return $null
  }
  return $fullPath.Substring($prefix.Length).Replace('/', '\')
}

function Assert-HandoffCanonicalRelativePath {
  param(
    [Parameter(Mandatory = $true)] [string]$Path,
    [Parameter(Mandatory = $true)] [string]$Label
  )

  if ([string]::IsNullOrWhiteSpace($Path) -or
      $Path -match '[\x00-\x1F\x7F]' -or
      $Path -match '(^|[\\/])\.\.?(?:[\\/]|$)' -or
      [IO.Path]::IsPathRooted($Path) -or
      $Path.Contains('/') -or
      $Path.Contains(':') -or
      @($Path -split '\\' | Where-Object { $_ -match '[. ]$' }).Count -ne 0) {
    throw "$Label contains an unsafe or non-canonical relative path."
  }
}

function Get-HandoffTreeFiles {
  param(
    [Parameter(Mandatory = $true)] [string]$Root,
    [Parameter(Mandatory = $true)] [string]$Label,
    [switch]$AllowCargoHardLinkPair,
    [string]$CargoReleaseRoot = '',
    [int]$MaxFileCount = [int]::MaxValue,
    [long]$MaxBytes = [long]::MaxValue,
    [int]$MaxDirectoryCount = [int]::MaxValue
  )

  if ($MaxFileCount -lt 1 -or $MaxBytes -lt 1 -or $MaxDirectoryCount -lt 1) {
    throw "$Label inventory bound is invalid."
  }
  $trustedRoot = Get-HandoffTrustedPath $Root $Label 'Container'
  $pending = [Collections.Generic.Queue[string]]::new()
  $files = [Collections.Generic.List[object]]::new()
  $exactPaths = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  $foldedPaths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  $totalBytes = [long]0
  $directoryCount = 1
  $pending.Enqueue($trustedRoot)
  while ($pending.Count -gt 0) {
    $directory = $pending.Dequeue()
    $enumerator = [IO.Directory]::EnumerateFileSystemEntries($directory).GetEnumerator()
    try {
      while ($enumerator.MoveNext()) {
      $item = Get-Item -LiteralPath ([string]$enumerator.Current) -Force
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "$Label contains a reparse point: $($item.FullName)"
      }
      $linkTypeProperty = $item.PSObject.Properties['LinkType']
      if ($null -eq $linkTypeProperty) {
        throw "$Label filesystem provider does not expose link topology."
      }
      $linkType = [string]$linkTypeProperty.Value
      if ($item.PSIsContainer) {
        if (-not [string]::IsNullOrEmpty($linkType)) {
          throw "$Label contains a linked directory."
        }
        $childDirectory = [IO.Path]::GetFullPath($item.FullName)
        if ($null -eq (Get-HandoffContainedRelativePath $childDirectory $trustedRoot)) {
          throw "$Label directory escaped its root."
        }
        $directoryCount++
        $directoryRelative = Get-HandoffContainedRelativePath $childDirectory $trustedRoot
        if ($directoryCount -gt $MaxDirectoryCount -or
            @($directoryRelative -split '\\').Count -gt 32) {
          throw "$Label exceeds its deterministic directory-count or depth bound."
        }
        $pending.Enqueue($childDirectory)
        continue
      }

      $path = [IO.Path]::GetFullPath($item.FullName)
      $relative = Get-HandoffContainedRelativePath $path $trustedRoot
      if ($null -eq $relative) { throw "$Label file escaped its root." }
      Assert-HandoffCanonicalRelativePath $relative $Label
      if (-not $exactPaths.Add($relative) -or -not $foldedPaths.Add($relative)) {
        throw "$Label contains a duplicate path or case-insensitive collision."
      }
      $streams = @(Get-Item -LiteralPath $path -Stream * -ErrorAction Stop)
      if ($streams.Count -ne 1 -or [string]$streams[0].Stream -cne ':$DATA') {
        throw "$Label contains an alternate data stream."
      }

      if (-not [string]::IsNullOrEmpty($linkType)) {
        if (-not $AllowCargoHardLinkPair -or $linkType -cne 'HardLink') {
          throw "$Label contains an unsupported hard link."
        }
        $releaseRoot = [IO.Path]::GetFullPath($CargoReleaseRoot)
        $main = [IO.Path]::GetFullPath((Join-Path $releaseRoot 'waggle.exe'))
        $dependency = [IO.Path]::GetFullPath((Join-Path $releaseRoot 'deps\waggle.exe'))
        if (-not [string]::Equals($path, $main, [StringComparison]::OrdinalIgnoreCase) -and
            -not [string]::Equals($path, $dependency, [StringComparison]::OrdinalIgnoreCase)) {
          throw "$Label permits only the exact Cargo executable hard-link pair."
        }
      }
      $fileSize = [long]$item.Length
      if ($files.Count -ge $MaxFileCount -or $fileSize -lt 0 -or
          $totalBytes -gt $MaxBytes - $fileSize) {
        throw "$Label exceeds its deterministic file-count or byte bound."
      }
      $totalBytes += $fileSize
      $files.Add([pscustomobject]@{ FullName = $path; RelativePath = $relative })
      }
    } finally {
      if ($enumerator -is [IDisposable]) { $enumerator.Dispose() }
    }
  }
  return @($files)
}

function Assert-HandoffMappingBounds {
  param(
    [Parameter(Mandatory = $true)] [object[]]$Mappings,
    [Parameter(Mandatory = $true)] [int]$MaxFileCount,
    [Parameter(Mandatory = $true)] [long]$MaxBytes,
    [Parameter(Mandatory = $true)] [string]$Label
  )

  if ($MaxFileCount -lt 1 -or $MaxBytes -lt 1 -or $Mappings.Count -gt $MaxFileCount) {
    throw "$Label exceeds its deterministic file-count or byte bound."
  }
  $totalBytes = [long]0
  foreach ($mapping in $Mappings) {
    $size = [long](Get-Item -LiteralPath ([string]$mapping.Source) -Force).Length
    if ($size -lt 0 -or $totalBytes -gt $MaxBytes - $size) {
      throw "$Label exceeds its deterministic file-count or byte bound."
    }
    $totalBytes += $size
  }
  return $totalBytes
}

function Assert-HandoffDefaultIndexFlags {
  param(
    [Parameter(Mandatory = $true)] [string]$Git,
    [Parameter(Mandatory = $true)] [string]$RepoRoot
  )

  foreach ($flag in @('-v', '-f')) {
    $entries = @(& $Git -C $RepoRoot ls-files $flag --full-name)
    if ($LASTEXITCODE -ne 0 -or $entries.Count -lt 100 -or
        @($entries | Where-Object { [string]$_ -notmatch '^H [^\x00-\x1F\x7F]+$' }).Count -ne 0) {
      throw 'Repository index contains assume-unchanged, skip-worktree, fsmonitor-valid, or non-default tracked state.'
    }
  }
  $fsmonitor = @(& $Git -C $RepoRoot config --get-all core.fsmonitor)
  $fsmonitorExitCode = $LASTEXITCODE
  if (($fsmonitorExitCode -ne 0 -and $fsmonitorExitCode -ne 1) -or
      $fsmonitor.Count -ne 0) {
    throw 'Repository must not enable core.fsmonitor for the signing handoff.'
  }
}

function Assert-HandoffRepositoryState {
  param(
    [Parameter(Mandatory = $true)] [string]$Git,
    [Parameter(Mandatory = $true)] [string]$RepoRoot,
    [Parameter(Mandatory = $true)] [string]$Revision,
    [Parameter(Mandatory = $true)] [string]$AppVersion,
    [Parameter(Mandatory = $true)] [string[]]$TrackedPaths
  )

  $actualRoot = [string](& $Git -C $RepoRoot rev-parse --show-toplevel)
  $head = [string](& $Git -C $RepoRoot rev-parse --verify HEAD)
  $tagCommit = [string](& $Git -C $RepoRoot rev-parse --verify "refs/tags/v$AppVersion`^{commit}")
  $status = @(& $Git -C $RepoRoot status --porcelain=v1 --untracked-files=all)
  if ($LASTEXITCODE -ne 0 -or
      -not [string]::Equals(
        [IO.Path]::GetFullPath($actualRoot),
        [IO.Path]::GetFullPath($RepoRoot),
        [StringComparison]::OrdinalIgnoreCase
      ) -or $head -cne $Revision -or $tagCommit -cne $Revision -or
      $status.Count -ne 0) {
    throw 'Windows signing handoff requires the clean exact tagged GITHUB_SHA.'
  }
  Assert-HandoffDefaultIndexFlags $Git $RepoRoot
  foreach ($trackedPath in $TrackedPaths) {
    & $Git -C $RepoRoot ls-files --error-unmatch -- $trackedPath | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "Windows signing handoff input is not tracked: $trackedPath"
    }
    $expectedBlob = [string](& $Git -C $RepoRoot rev-parse --verify "HEAD:$trackedPath")
    $actualBlob = Get-HandoffNormalizedGitBlobSha1 (Join-Path $RepoRoot $trackedPath)
    if ($LASTEXITCODE -ne 0 -or $expectedBlob -notmatch '^[0-9a-f]{40}$' -or
        -not [string]::Equals(
          $expectedBlob,
          $actualBlob,
          [StringComparison]::OrdinalIgnoreCase
        )) {
      throw "Tracked handoff input differs from its exact HEAD blob: $trackedPath"
    }
  }
}

function Get-HandoffHardLinkPaths {
  param([Parameter(Mandatory = $true)] [string]$Path)

  $fsutil = Get-HandoffTrustedPath 'C:\Windows\System32\fsutil.exe' 'fsutil' -AllowHardLink
  $raw = @(& $fsutil hardlink list $Path)
  if ($LASTEXITCODE -ne 0 -or $raw.Count -ne 2) {
    throw 'Cargo executable must have exactly two hard-link paths.'
  }
  $volumeRoot = [IO.Path]::GetPathRoot($Path).TrimEnd('\')
  return @($raw | ForEach-Object {
    if ([string]$_ -notmatch '^\\[^\\]') {
      throw 'fsutil returned a non-canonical hard-link path.'
    }
    [IO.Path]::GetFullPath($volumeRoot + [string]$_)
  })
}

function Assert-HandoffCargoPair {
  param(
    [Parameter(Mandatory = $true)] [string]$ReleaseRoot,
    [Parameter(Mandatory = $true)] [string]$Label
  )

  $release = Get-HandoffTrustedPath $ReleaseRoot "$Label release root" 'Container'
  $main = Get-HandoffTrustedPath (Join-Path $release 'waggle.exe') "$Label main" -AllowHardLink
  $dependency = Get-HandoffTrustedPath `
    (Join-Path $release 'deps\waggle.exe') "$Label dependency" -AllowHardLink
  $links = @(Get-HandoffHardLinkPaths $main)
  $set = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($link in $links) { [void]$set.Add($link) }
  if ($set.Count -ne 2 -or -not $set.Contains($main) -or -not $set.Contains($dependency) -or
      (Get-HandoffFileSha256 $main) -cne (Get-HandoffFileSha256 $dependency)) {
    throw "$Label does not have the exact equal-byte release\waggle.exe and release\deps\waggle.exe hard-link pair."
  }
}

function New-HandoffInventory {
  param(
    [Parameter(Mandatory = $true)] [object[]]$Mappings,
    [Parameter(Mandatory = $true)] [string]$Label
  )

  $entries = [Collections.Generic.List[object]]::new()
  $exactPaths = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  $foldedPaths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($mapping in $Mappings) {
    $relative = [string]$mapping.Path
    Assert-HandoffCanonicalRelativePath $relative $Label
    if (-not $exactPaths.Add($relative) -or -not $foldedPaths.Add($relative)) {
      throw "$Label contains a duplicate path or case-insensitive collision."
    }
    $source = [IO.Path]::GetFullPath([string]$mapping.Source)
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
      throw "$Label source file is missing."
    }
    $item = Get-Item -LiteralPath $source -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "$Label source file became a reparse point."
    }
    $linkTypeProperty = $item.PSObject.Properties['LinkType']
    if ($null -eq $linkTypeProperty -or
        -not ([string]::IsNullOrEmpty([string]$linkTypeProperty.Value) -or
          [string]$linkTypeProperty.Value -ceq 'HardLink')) {
      throw "$Label source file has an unsupported link topology."
    }
    $streams = @(Get-Item -LiteralPath $source -Stream * -ErrorAction Stop)
    if ($streams.Count -ne 1 -or [string]$streams[0].Stream -cne ':$DATA') {
      throw "$Label source file contains an alternate data stream."
    }
    $lock = [IO.File]::Open(
      $source,
      [IO.FileMode]::Open,
      [IO.FileAccess]::Read,
      [IO.FileShare]::Read
    )
    try {
      $entries.Add([pscustomobject][ordered]@{
        path = $relative
        size = [long]$item.Length
        sha256 = Get-HandoffFileSha256 $source
      })
    } finally {
      $lock.Dispose()
    }
  }
  $sorted = @($entries)
  [Array]::Sort($sorted, [Comparison[object]]{
    param($left, $right)
    return [StringComparer]::Ordinal.Compare([string]$left.path, [string]$right.path)
  })
  $canonical = @($sorted | ForEach-Object {
    [ordered]@{
      path = [string]$_.path
      size = [long]$_.size
      sha256 = ([string]$_.sha256).ToUpperInvariant()
    }
  }) | ConvertTo-Json -Depth 8 -Compress
  return [pscustomobject][ordered]@{
    entries = $sorted
    sha256 = Get-HandoffBytesSha256 ([Text.Encoding]::UTF8.GetBytes($canonical))
  }
}

function Assert-HandoffInventoriesEqual {
  param(
    [Parameter(Mandatory = $true)] [object]$Expected,
    [Parameter(Mandatory = $true)] [object]$Actual,
    [Parameter(Mandatory = $true)] [string]$Label
  )

  if (-not [string]::Equals(
      [string]$Expected.sha256,
      [string]$Actual.sha256,
      [StringComparison]::OrdinalIgnoreCase
    ) -or @($Expected.entries).Count -ne @($Actual.entries).Count) {
    throw "$Label inventory changed during handoff staging."
  }
  for ($index = 0; $index -lt @($Expected.entries).Count; $index++) {
    $left = @($Expected.entries)[$index]
    $right = @($Actual.entries)[$index]
    if ([string]$left.path -cne [string]$right.path -or
        [long]$left.size -ne [long]$right.size -or
        -not [string]::Equals(
          [string]$left.sha256,
          [string]$right.sha256,
          [StringComparison]::OrdinalIgnoreCase
        )) {
      throw "$Label inventory changed during handoff staging."
    }
  }
}

function Copy-HandoffMappings {
  param(
    [Parameter(Mandatory = $true)] [object[]]$Mappings,
    [Parameter(Mandatory = $true)] [string]$Root,
    [string]$SkipRelativePath = ''
  )

  foreach ($mapping in $Mappings) {
    $relative = [string]$mapping.Path
    if (-not [string]::IsNullOrEmpty($SkipRelativePath) -and
        $relative -ceq $SkipRelativePath) {
      continue
    }
    $destination = Join-Path $Root $relative
    [IO.Directory]::CreateDirectory((Split-Path $destination -Parent)) | Out-Null
    if (Test-Path -LiteralPath $destination) {
      throw 'Handoff destination contains an unexpected file or directory collision.'
    }
    [IO.File]::Copy([string]$mapping.Source, $destination, $false)
  }
}

function Get-HandoffMappings {
  param(
    [Parameter(Mandatory = $true)] [string]$ReleaseRoot,
    [Parameter(Mandatory = $true)] [string]$ResourcesRoot
  )

  $mappings = [Collections.Generic.List[object]]::new()
  foreach ($relative in @('waggle.exe', 'deps\waggle.exe')) {
    $mappings.Add([pscustomobject]@{
      Source = Join-Path $ReleaseRoot $relative
      Path = "$TargetTriple\release\$relative"
    })
  }
  foreach ($treeSpec in @(
      [pscustomobject]@{
        Root = Join-Path $ReleaseRoot 'nsis'
        Prefix = "$TargetTriple\release\nsis"
      },
      [pscustomobject]@{
        Root = Join-Path $ReleaseRoot 'bundle\nsis'
        Prefix = "$TargetTriple\release\bundle\nsis"
      }
    )) {
    $treeMaxCount = if ([string]$treeSpec.Prefix -like '*\bundle\nsis') { 1 } else { 128 }
    $treeMaxBytes = if ([string]$treeSpec.Prefix -like '*\bundle\nsis') { 256MB } else { 64MB }
    foreach ($file in @(Get-HandoffTreeFiles `
        ([string]$treeSpec.Root) 'Unsigned NSIS output' `
        -MaxFileCount $treeMaxCount -MaxBytes $treeMaxBytes `
        -MaxDirectoryCount 16)) {
      $mappings.Add([pscustomobject]@{
        Source = [string]$file.FullName
        Path = "$([string]$treeSpec.Prefix)\$([string]$file.RelativePath)"
      })
    }
  }
  foreach ($file in @(Get-HandoffTreeFiles `
      $ResourcesRoot 'Tauri sidecar resources' `
      -MaxFileCount $MaxResourceFileCount -MaxBytes $MaxResourceBytes `
      -MaxDirectoryCount 2400)) {
    $mappings.Add([pscustomobject]@{
      Source = [string]$file.FullName
      Path = "resources\$([string]$file.RelativePath)"
    })
  }
  return @($mappings)
}

function Get-HandoffResourceMappings {
  param([Parameter(Mandatory = $true)] [object[]]$TargetMappings)

  return @($TargetMappings | Where-Object {
    ([string]$_.Path).StartsWith('resources\', [StringComparison]::Ordinal)
  } | ForEach-Object {
    [pscustomobject]@{
      Source = [string]$_.Source
      Path = ([string]$_.Path).Substring('resources\'.Length)
    }
  })
}

function Get-HandoffTreeMappings {
  param(
    [Parameter(Mandatory = $true)] [string]$Root,
    [Parameter(Mandatory = $true)] [string]$Label,
    [switch]$AllowCargoHardLinkPair,
    [string]$CargoReleaseRoot = '',
    [int]$MaxFileCount = [int]::MaxValue,
    [long]$MaxBytes = [long]::MaxValue,
    [int]$MaxDirectoryCount = [int]::MaxValue
  )

  return @(Get-HandoffTreeFiles `
    $Root $Label `
    -AllowCargoHardLinkPair:$AllowCargoHardLinkPair `
    -CargoReleaseRoot $CargoReleaseRoot `
    -MaxFileCount $MaxFileCount -MaxBytes $MaxBytes `
    -MaxDirectoryCount $MaxDirectoryCount | ForEach-Object {
    [pscustomobject]@{ Source = [string]$_.FullName; Path = [string]$_.RelativePath }
  })
}

function Write-HandoffJsonNoBom {
  param(
    [Parameter(Mandatory = $true)] [string]$Path,
    [Parameter(Mandatory = $true)] [object]$Value
  )

  [IO.File]::WriteAllText(
    $Path,
    ($Value | ConvertTo-Json -Depth 32),
    [Text.UTF8Encoding]::new($false)
  )
}

function Write-HandoffOutput {
  param(
    [Parameter(Mandatory = $true)] [string]$Name,
    [Parameter(Mandatory = $true)] [string]$Value
  )

  if ($Name -notmatch '^[a-z_]+$' -or $Value -match '[\r\n\x00]') {
    throw 'GitHub output contains an unsafe name or value.'
  }
  $line = "$Name=$Value"
  Write-Host $line
  $outputPath = [Environment]::GetEnvironmentVariable('GITHUB_OUTPUT')
  if (-not [string]::IsNullOrWhiteSpace($outputPath)) {
    $trustedOutput = Get-HandoffTrustedPath $outputPath 'GITHUB_OUTPUT'
    [IO.File]::AppendAllText(
      $trustedOutput,
      $line + [Environment]::NewLine,
      [Text.UTF8Encoding]::new($false)
    )
  }
}

function New-HandoffBuildReceipt {
  param(
    [Parameter(Mandatory = $true)] [string]$SourceRevision,
    [Parameter(Mandatory = $true)] [object]$TargetInventory,
    [Parameter(Mandatory = $true)] [object]$ResourcesInventory,
    [Parameter(Mandatory = $true)] [object]$NsisInventory,
    [Parameter(Mandatory = $true)] [string]$CheckerSha256
  )

  if ($SourceRevision -notmatch '^[0-9a-f]{40}$' -or
      $CheckerSha256 -notmatch '^[0-9A-F]{64}$') {
    throw 'Handoff receipt requires an exact source revision and checker SHA-256.'
  }
  return [ordered]@{
    schemaVersion = 1
    repository = $ApprovedRepository
    sourceRevision = $SourceRevision
    targetTriple = $TargetTriple
    targetInventory = $TargetInventory
    resourcesInventory = $ResourcesInventory
    nsisInventory = $NsisInventory
    checker = [ordered]@{
      exitCode = 0
      sha256 = $CheckerSha256
    }
  }
}

function Invoke-HandoffDestinationTransaction {
  param(
    [Parameter(Mandatory = $true)] [string]$DestinationRoot,
    [Parameter(Mandatory = $true)] [string]$DestinationParentRoot,
    [Parameter(Mandatory = $true)] [object[]]$TargetMappings,
    [Parameter(Mandatory = $true)] [object[]]$ResourceMappings,
    [Parameter(Mandatory = $true)] [object[]]$NsisMappings,
    [Parameter(Mandatory = $true)] [object]$ExpectedTargetInventory,
    [Parameter(Mandatory = $true)] [object]$ExpectedResourcesInventory,
    [Parameter(Mandatory = $true)] [object]$ExpectedNsisInventory,
    [Parameter(Mandatory = $true)] [string]$SourceRevision,
    [Parameter(Mandatory = $true)] [string]$CheckerSha256,
    [scriptblock]$FinalSourceAssertion = {},
    [int]$TargetFileCountLimit = $MaxTargetFileCount,
    [long]$TargetByteLimit = $MaxTargetBytes,
    [int]$ResourceFileCountLimit = $MaxResourceFileCount,
    [long]$ResourceByteLimit = $MaxResourceBytes,
    [int]$NsisFileCountLimit = $ExpectedNsisFileCount,
    [long]$NsisByteLimit = 16MB
  )

  $destinationParent = Get-HandoffTrustedPath `
    $DestinationParentRoot 'Handoff destination parent' 'Container'
  if ([string]::IsNullOrWhiteSpace($DestinationRoot) -or
      -not [IO.Path]::IsPathRooted($DestinationRoot) -or
      $DestinationRoot -match '[\x00-\x1F\x7F]' -or
      $DestinationRoot -match '(^|[\\/])\.\.?(?:[\\/]|$)') {
    throw 'DestinationRoot must be a safe, fully qualified local Windows path.'
  }
  $destination = [IO.Path]::GetFullPath($DestinationRoot).TrimEnd('\')
  if (-not [string]::Equals(
      (Split-Path $destination -Parent),
      $destinationParent.TrimEnd('\'),
      [StringComparison]::OrdinalIgnoreCase
    ) -or (Split-Path $destination -Leaf) -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$' -or
      (Test-Path -LiteralPath $destination)) {
    throw 'DestinationRoot must be an absent direct child of its trusted parent.'
  }

  [void](Assert-HandoffMappingBounds `
    $TargetMappings $TargetFileCountLimit $TargetByteLimit 'Hosted target inventory')
  [void](Assert-HandoffMappingBounds `
    $ResourceMappings $ResourceFileCountLimit $ResourceByteLimit `
    'Hosted resources inventory')
  [void](Assert-HandoffMappingBounds `
    $NsisMappings $NsisFileCountLimit $NsisByteLimit 'Hosted NSIS inventory')

  $prebuiltRoot = Join-Path $destination 'prebuilt'
  $stagedNsisRoot = Join-Path $destination 'nsis-toolchain'
  $receiptPath = Join-Path $destination 'build-receipt.json'
  try {
    [IO.Directory]::CreateDirectory($prebuiltRoot) | Out-Null
    [IO.Directory]::CreateDirectory($stagedNsisRoot) | Out-Null
    $mainRelative = "$TargetTriple\release\waggle.exe"
    Copy-HandoffMappings $TargetMappings $prebuiltRoot $mainRelative
    $stagedDependency = Join-Path `
      $prebuiltRoot "$TargetTriple\release\deps\waggle.exe"
    $stagedMain = Join-Path $prebuiltRoot $mainRelative
    New-Item -ItemType HardLink -Path $stagedMain -Target $stagedDependency | Out-Null
    Copy-HandoffMappings $NsisMappings $stagedNsisRoot

    Assert-HandoffCargoPair `
      (Join-Path $prebuiltRoot "$TargetTriple\release") 'Staged Cargo output'
    $stagedTargetMappings = @(Get-HandoffTreeMappings `
      $prebuiltRoot 'Staged prebuilt tree' -AllowCargoHardLinkPair `
      -CargoReleaseRoot (Join-Path $prebuiltRoot "$TargetTriple\release") `
      -MaxFileCount $TargetFileCountLimit -MaxBytes $TargetByteLimit `
      -MaxDirectoryCount 2500)
    $stagedResourceMappings = @(Get-HandoffTreeMappings `
      (Join-Path $prebuiltRoot 'resources') 'Staged sidecar resources' `
      -MaxFileCount $ResourceFileCountLimit -MaxBytes $ResourceByteLimit `
      -MaxDirectoryCount 2400)
    $stagedNsisMappings = @(Get-HandoffTreeMappings `
      $stagedNsisRoot 'Staged NSIS toolchain' `
      -MaxFileCount $NsisFileCountLimit -MaxBytes $NsisByteLimit `
      -MaxDirectoryCount 128)
    & $FinalSourceAssertion $prebuiltRoot $stagedNsisRoot
    $targetInventory = New-HandoffInventory $stagedTargetMappings 'Staged target inventory'
    $resourcesInventory = New-HandoffInventory `
      $stagedResourceMappings 'Staged resources inventory'
    $nsisInventory = New-HandoffInventory $stagedNsisMappings 'Staged NSIS inventory'
    Assert-HandoffInventoriesEqual `
      $ExpectedTargetInventory $targetInventory 'Hosted target'
    Assert-HandoffInventoriesEqual `
      $ExpectedResourcesInventory $resourcesInventory 'Hosted resources'
    Assert-HandoffInventoriesEqual `
      $ExpectedNsisInventory $nsisInventory 'Hosted NSIS toolchain'

    & $FinalSourceAssertion $prebuiltRoot $stagedNsisRoot
    $receipt = New-HandoffBuildReceipt `
      $SourceRevision $targetInventory $resourcesInventory $nsisInventory $CheckerSha256
    Write-HandoffJsonNoBom $receiptPath $receipt
    $receiptSha256 = Get-HandoffFileSha256 $receiptPath
    return [pscustomobject][ordered]@{
      ArtifactRoot = $destination
      PrebuiltRoot = $prebuiltRoot
      NsisToolchainRoot = $stagedNsisRoot
      ReceiptPath = $receiptPath
      ReceiptSha256 = $receiptSha256
      Receipt = $receipt
    }
  } catch {
    if (Test-Path -LiteralPath $destination -PathType Container) {
      [IO.Directory]::Delete($destination, $true)
    }
    throw
  }
}

function Invoke-WindowsSigningHandoff {
  if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or
      -not [Environment]::Is64BitProcess) {
    throw 'Windows signing handoff requires 64-bit Windows.'
  }

  $repoRoot = Get-HandoffTrustedPath `
    (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) `
    'Repository root' 'Container'
  $expectedBoundary = [ordered]@{
    GITHUB_ACTIONS = 'true'
    RUNNER_ENVIRONMENT = 'github-hosted'
    RUNNER_OS = 'Windows'
    GITHUB_REPOSITORY = $ApprovedRepository
    GITHUB_REF_TYPE = 'tag'
  }
  foreach ($entry in $expectedBoundary.GetEnumerator()) {
    if ([Environment]::GetEnvironmentVariable([string]$entry.Key) -cne [string]$entry.Value) {
      throw "Windows signing handoff requires exact $($entry.Key) boundary evidence."
    }
  }
  $workspace = Get-HandoffTrustedPath `
    ([Environment]::GetEnvironmentVariable('GITHUB_WORKSPACE')) `
    'GITHUB_WORKSPACE' 'Container'
  if (-not [string]::Equals($workspace, $repoRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Windows signing handoff must run from the exact GitHub workspace.'
  }

  $revision = [Environment]::GetEnvironmentVariable('GITHUB_SHA')
  if ($revision -notmatch '^[0-9a-f]{40}$') {
    throw 'GITHUB_SHA must be one exact lowercase commit revision.'
  }
  $expectedGitPath = 'C:\Program Files\Git\cmd\git.exe'
  if (-not [string]::Equals(
      [IO.Path]::GetFullPath($GitPath),
      $expectedGitPath,
      [StringComparison]::OrdinalIgnoreCase
    )) {
    throw 'Git executable must use the canonical Git for Windows path.'
  }
  $git = Get-HandoffTrustedPath $expectedGitPath 'Git executable' -AllowHardLink
  $runnerToolCache = Get-HandoffTrustedPath `
    ([Environment]::GetEnvironmentVariable('RUNNER_TOOL_CACHE')) `
    'RUNNER_TOOL_CACHE' 'Container'
  $expectedNodePath = Join-Path $runnerToolCache 'node\22.23.2\x64\node.exe'
  if ([string]::IsNullOrWhiteSpace($NodePath)) {
    $NodePath = $expectedNodePath
  } elseif (-not [string]::Equals(
      [IO.Path]::GetFullPath($NodePath),
      [IO.Path]::GetFullPath($expectedNodePath),
      [StringComparison]::OrdinalIgnoreCase
    )) {
    throw 'Node.js runtime must use the exact setup-node tool-cache path.'
  }
  $node = Get-HandoffTrustedPath $NodePath 'Node.js runtime' -AllowHardLink
  $configPath = Get-HandoffTrustedPath `
    (Join-Path $repoRoot 'app\src-tauri\tauri.conf.json') 'Tauri config'
  $checkerPath = Get-HandoffTrustedPath `
    (Join-Path $repoRoot 'scripts\check-sidecar-resources.mjs') `
    'Sidecar resource checker'

  $toolLocks = [Collections.Generic.List[IDisposable]]::new()
  try {
    foreach ($toolPath in @($git, $node, $configPath, $checkerPath)) {
      $toolLocks.Add([IO.File]::Open(
        $toolPath,
        [IO.FileMode]::Open,
        [IO.FileAccess]::Read,
        [IO.FileShare]::Read
      ))
    }
    Assert-HandoffSignedExecutable $git $GitPublisher 'Git executable'
    Assert-HandoffSignedExecutable $node $OpenJsPublisher 'Node.js runtime'
    $nodeVersion = [string](& $node --version)
    if ($LASTEXITCODE -ne 0 -or $nodeVersion -cne $ExpectedNodeVersion) {
      throw "Node.js runtime must be exactly $ExpectedNodeVersion."
    }
    $appVersion = [string](
      Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
    ).version
    if ($appVersion -notmatch '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$' -or
        [Environment]::GetEnvironmentVariable('GITHUB_REF_NAME') -cne "v$appVersion") {
      throw 'Windows signing handoff requires the exact app-version release tag.'
    }

  $trackedHandoffPaths = @(
      'app/scripts/new-windows-signing-handoff.ps1',
      'scripts/check-sidecar-resources.mjs',
      'app/src-tauri/tauri.conf.json'
    )
  Assert-HandoffRepositoryState `
    $git $repoRoot $revision $appVersion $trackedHandoffPaths

  $expectedSourceTarget = [IO.Path]::GetFullPath(
    (Join-Path $repoRoot 'app\src-tauri\target')
  )
  $sourceTargetCandidate = if ([IO.Path]::IsPathRooted($SourceTargetRoot)) {
    $SourceTargetRoot
  } else {
    Join-Path $repoRoot $SourceTargetRoot
  }
  $sourceTarget = Get-HandoffTrustedPath `
    $sourceTargetCandidate 'Unsigned Cargo target root' 'Container'
  if (-not [string]::Equals(
      $sourceTarget,
      $expectedSourceTarget,
      [StringComparison]::OrdinalIgnoreCase
    )) {
    throw 'Unsigned Cargo target root must be the canonical repository target root.'
  }
  $sourceRelease = Get-HandoffTrustedPath `
    (Join-Path $sourceTarget "$TargetTriple\release") `
    'Unsigned Cargo release root' 'Container'
  Assert-HandoffCargoPair $sourceRelease 'Unsigned Cargo output'
  $sourceNsis = Get-HandoffTrustedPath `
    (Join-Path $sourceRelease 'nsis') 'Generated NSIS input root' 'Container'
  $sourceBundleNsis = Get-HandoffTrustedPath `
    (Join-Path $sourceRelease 'bundle\nsis') 'Generated NSIS bundle root' 'Container'
  if (@(Get-HandoffTreeFiles `
        $sourceNsis 'Generated NSIS input root' `
        -MaxFileCount 128 -MaxBytes 64MB -MaxDirectoryCount 16).Count -eq 0 -or
      @(Get-HandoffTreeFiles `
        $sourceBundleNsis 'Generated NSIS bundle root' `
        -MaxFileCount 1 -MaxBytes 256MB -MaxDirectoryCount 1).Count -eq 0) {
    throw 'A completed full unsigned NSIS build is required before handoff.'
  }
  $expectedInstaller = Get-HandoffTrustedPath `
    (Join-Path $sourceBundleNsis "Waggle_${appVersion}_x64-setup.exe") `
    'Unsigned NSIS installer'
  $bundleFiles = @(Get-HandoffTreeFiles `
    $sourceBundleNsis 'Generated NSIS bundle root' `
    -MaxFileCount 1 -MaxBytes 256MB -MaxDirectoryCount 1)
  if ($bundleFiles.Count -ne 1 -or
      -not [string]::Equals(
        [string]$bundleFiles[0].FullName,
        $expectedInstaller,
        [StringComparison]::OrdinalIgnoreCase
      )) {
    throw 'Generated NSIS bundle root must contain only the exact versioned installer.'
  }
  foreach ($unsignedPath in @(
      (Join-Path $sourceRelease 'waggle.exe'),
      (Join-Path $sourceRelease 'deps\waggle.exe'),
      $expectedInstaller
    )) {
    $signature = Get-AuthenticodeSignature -LiteralPath $unsignedPath
    if ($signature.Status -ne [Management.Automation.SignatureStatus]::NotSigned -or
        [string]$signature.SignatureType -cne 'None') {
      throw 'Windows signing handoff accepts only an unsigned executable and NSIS installer.'
    }
  }

  $resourcesRoot = Get-HandoffTrustedPath `
    (Join-Path $repoRoot 'app\src-tauri\resources') `
    'Tauri sidecar resources' 'Container'
  $localAppData = [Environment]::GetFolderPath('LocalApplicationData')
  $nsisToolchainRoot = Get-HandoffTrustedPath `
    (Join-Path $localAppData 'tauri\NSIS') 'Tauri NSIS toolchain' 'Container'
  $checkerSha256 = Get-HandoffFileSha256 $checkerPath

  $targetMappings = @(Get-HandoffMappings $sourceRelease $resourcesRoot)
  $resourceMappings = @(Get-HandoffResourceMappings $targetMappings)
  $targetBytes = [long](Assert-HandoffMappingBounds `
    $targetMappings $MaxTargetFileCount $MaxTargetBytes 'Hosted target inventory')
  [void](Assert-HandoffMappingBounds `
    $resourceMappings $MaxResourceFileCount $MaxResourceBytes 'Hosted resources inventory')
  $nsisMappings = @(Get-HandoffTreeMappings `
    $nsisToolchainRoot 'Tauri NSIS toolchain' `
    -MaxFileCount $ExpectedNsisFileCount -MaxBytes 16MB -MaxDirectoryCount 128)
  $nsisBytes = [long](Assert-HandoffMappingBounds `
    $nsisMappings $ExpectedNsisFileCount 16MB 'Hosted NSIS inventory')
  $expectedTargetInventory = New-HandoffInventory $targetMappings 'Hosted target inventory'
  $expectedResourcesInventory = New-HandoffInventory `
    $resourceMappings 'Hosted resources inventory'
  $expectedNsisInventory = New-HandoffInventory $nsisMappings 'Hosted NSIS inventory'
  if (@($expectedNsisInventory.entries).Count -ne $ExpectedNsisFileCount -or
      [string]$expectedNsisInventory.sha256 -cne $ExpectedNsisInventorySha256) {
    throw 'Tauri NSIS toolchain does not match the pinned 442-file closure.'
  }

  $savedTargetArch = [Environment]::GetEnvironmentVariable('TARGET_ARCH')
  $savedNodeOptions = [Environment]::GetEnvironmentVariable('NODE_OPTIONS')
  $savedNodePath = [Environment]::GetEnvironmentVariable('NODE_PATH')
  try {
    [Environment]::SetEnvironmentVariable('TARGET_ARCH', 'x64')
    [Environment]::SetEnvironmentVariable('NODE_OPTIONS', $null)
    [Environment]::SetEnvironmentVariable('NODE_PATH', $null)
    Push-Location $repoRoot
    try {
      & $node $checkerPath --expected-source-revision $revision
      if ($LASTEXITCODE -ne 0) {
        throw "Sidecar resource checker failed with exit code $LASTEXITCODE."
      }
    } finally {
      Pop-Location
    }
  } finally {
    [Environment]::SetEnvironmentVariable('TARGET_ARCH', $savedTargetArch)
    [Environment]::SetEnvironmentVariable('NODE_OPTIONS', $savedNodeOptions)
    [Environment]::SetEnvironmentVariable('NODE_PATH', $savedNodePath)
  }
  if ((Get-HandoffFileSha256 $checkerPath) -cne $checkerSha256) {
    throw 'Sidecar resource checker changed while it was executing.'
  }

  $runnerTemp = Get-HandoffTrustedPath `
    ([Environment]::GetEnvironmentVariable('RUNNER_TEMP')) 'RUNNER_TEMP' 'Container'
  if ([string]::IsNullOrWhiteSpace($DestinationRoot) -or
      -not [IO.Path]::IsPathRooted($DestinationRoot) -or
      $DestinationRoot -match '[\x00-\x1F\x7F]' -or
      $DestinationRoot -match '(^|[\\/])\.\.?(?:[\\/]|$)') {
    throw 'DestinationRoot must be a safe, fully qualified local Windows path.'
  }
  $destination = [IO.Path]::GetFullPath($DestinationRoot).TrimEnd('\')
  if (-not [string]::Equals(
      (Split-Path $destination -Parent),
      $runnerTemp.TrimEnd('\'),
      [StringComparison]::OrdinalIgnoreCase
    ) -or (Split-Path $destination -Leaf) -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$' -or
      (Test-Path -LiteralPath $destination)) {
    throw 'DestinationRoot must be an absent direct child of RUNNER_TEMP.'
  }
  if ($targetBytes -gt [long]::MaxValue - $nsisBytes -or
      $targetBytes + $nsisBytes -gt [long]::MaxValue - 1GB) {
    throw 'Handoff disk-capacity calculation overflowed.'
  }
  $requiredFreeBytes = $targetBytes + $nsisBytes + 1GB
  $availableFreeBytes = [IO.DriveInfo]::new(
    [IO.Path]::GetPathRoot($destination)
  ).AvailableFreeSpace
  if ($availableFreeBytes -lt $requiredFreeBytes) {
    throw "RUNNER_TEMP has insufficient free space for the bounded handoff: requires $requiredFreeBytes bytes."
  }

  $finalSourceAssertion = {
    $lockedHead = [string](& $git -C $repoRoot rev-parse --verify HEAD)
    $lockedStatus = @(& $git -C $repoRoot status --porcelain=v1 --untracked-files=all)
    if ($LASTEXITCODE -ne 0 -or $lockedHead -cne $revision -or $lockedStatus.Count -ne 0 -or
        (Get-HandoffFileSha256 $checkerPath) -cne $checkerSha256) {
      throw 'Repository or checker changed while the handoff was being assembled.'
    }
    Assert-HandoffDefaultIndexFlags $git $repoRoot
  }.GetNewClosure()
  $handoff = Invoke-HandoffDestinationTransaction `
    -DestinationRoot $destination -DestinationParentRoot $runnerTemp `
    -TargetMappings $targetMappings -ResourceMappings $resourceMappings `
    -NsisMappings $nsisMappings `
    -ExpectedTargetInventory $expectedTargetInventory `
    -ExpectedResourcesInventory $expectedResourcesInventory `
    -ExpectedNsisInventory $expectedNsisInventory `
    -SourceRevision $revision -CheckerSha256 $checkerSha256 `
    -FinalSourceAssertion $finalSourceAssertion

  Write-HandoffOutput 'artifact_root' $handoff.ArtifactRoot
  Write-HandoffOutput 'prebuilt_root' $handoff.PrebuiltRoot
  Write-HandoffOutput 'nsis_toolchain_root' $handoff.NsisToolchainRoot
  Write-HandoffOutput 'receipt_path' $handoff.ReceiptPath
  Write-HandoffOutput 'receipt_sha256' $handoff.ReceiptSha256
  Write-HandoffOutput 'source_revision' $revision
  } finally {
    foreach ($toolLock in $toolLocks) { $toolLock.Dispose() }
  }
}

if ($MyInvocation.InvocationName -ne '.') {
  Invoke-WindowsSigningHandoff
}
