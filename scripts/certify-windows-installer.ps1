[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerPath,

  [ValidateRange(30, 600)]
  [int]$StartupTimeoutSeconds = 150,

  [string]$ReceiptPath,

  [switch]$KeepArtifacts,

  [switch]$RequireAuthenticodeSignature,

  [string]$ExpectedSignerThumbprint,

  [string]$ExpectedSourceRevision,

  [switch]$VerifyManagedModel,

  [switch]$RequireVersionToVersionUpgrade,

  [string]$PreviousInstallerPath,

  [string]$ExpectedPreviousInstallerSha256,

  [string]$ExpectedPreviousVersion,

  [string]$ExpectedPreviousSourceRevision,

  [string]$ExpectedCandidateInstallerSha256,

  [string]$ExpectedCandidateVersion
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-True {
  param(
    [Parameter(Mandatory = $true)] [bool]$Condition,
    [Parameter(Mandatory = $true)] [string]$Message
  )
  if (-not $Condition) { throw $Message }
}

function Assert-ExpectedAuthenticodeSignature {
  param(
    [Parameter(Mandatory = $true)] [object]$Signature,
    [Parameter(Mandatory = $true)] [string]$ExpectedThumbprint,
    [Parameter(Mandatory = $true)] [string]$ArtifactLabel
  )

  $normalizedExpectedThumbprint = ($ExpectedThumbprint -replace '\s', '').ToUpperInvariant()
  Assert-True ($normalizedExpectedThumbprint -match '^[0-9A-F]{40}$') `
    'Expected signer thumbprint must be exactly 40 hexadecimal characters.'
  Assert-True ([string]$Signature.SignatureType -eq 'Authenticode') `
    "$ArtifactLabel does not contain a portable embedded Authenticode signature."
  Assert-True ($Signature.Status -eq [System.Management.Automation.SignatureStatus]::Valid) `
    "$ArtifactLabel Authenticode signature is not valid: $($Signature.Status)"
  Assert-True ($null -ne $Signature.SignerCertificate) `
    "$ArtifactLabel has no Authenticode signer certificate."
  Assert-True (
    [string]::Equals(
      ($Signature.SignerCertificate.Thumbprint -replace '\s', '').ToUpperInvariant(),
      $normalizedExpectedThumbprint,
      [System.StringComparison]::Ordinal
    )
  ) "$ArtifactLabel signer does not match the imported production certificate."
  Assert-True ($null -ne $Signature.TimeStamperCertificate) `
    "$ArtifactLabel has no validated Authenticode timestamp certificate."
}

function ConvertTo-StrictSemanticVersion {
  param(
    [Parameter(Mandatory = $true)] [string]$Value,
    [Parameter(Mandatory = $true)] [string]$Label
  )

  Assert-True ($Value -match '^\d+\.\d+\.\d+$') `
    "$Label must use strict numeric x.y.z format."
  return [version]$Value
}

function Get-InstalledProductVersion {
  param(
    [Parameter(Mandatory = $true)] [string]$ExecutablePath,
    [Parameter(Mandatory = $true)] [string]$ArtifactLabel
  )

  $rawVersion = [string](Get-Item -LiteralPath $ExecutablePath).VersionInfo.ProductVersion
  Assert-True (-not [string]::IsNullOrWhiteSpace($rawVersion)) `
    "$ArtifactLabel has no embedded product version."
  Assert-True ($rawVersion -match '^(?<version>\d+\.\d+\.\d+)(?:\.0)?(?:[+-].*)?$') `
    "$ArtifactLabel product version is not a supported x.y.z value: $rawVersion"
  return [ordered]@{
    raw = $rawVersion
    normalized = $Matches['version']
  }
}

function New-AuthenticodeArtifactReceipt {
  param(
    [Parameter(Mandatory = $true)] [System.IO.FileInfo]$File,
    [Parameter(Mandatory = $true)] [object]$Signature
  )

  $artifact = [ordered]@{
    name = $File.Name
    sha256 = (Get-FileHash -LiteralPath $File.FullName -Algorithm SHA256).Hash
    sizeBytes = $File.Length
    authenticodeStatus = [string]$Signature.Status
    signatureType = [string]$Signature.SignatureType
    signerSubject = $null
    signerThumbprint = $null
    timestampAuthoritySubject = $null
    timestampAuthorityThumbprint = $null
    timestampAuthorityNotBefore = $null
    timestampAuthorityNotAfter = $null
  }
  if ($Signature.SignerCertificate) {
    $artifact.signerSubject = $Signature.SignerCertificate.Subject
    $artifact.signerThumbprint = $Signature.SignerCertificate.Thumbprint
  }
  if ($Signature.TimeStamperCertificate) {
    $artifact.timestampAuthoritySubject = $Signature.TimeStamperCertificate.Subject
    $artifact.timestampAuthorityThumbprint = $Signature.TimeStamperCertificate.Thumbprint
    $artifact.timestampAuthorityNotBefore = $Signature.TimeStamperCertificate.NotBefore.ToUniversalTime().ToString('o')
    $artifact.timestampAuthorityNotAfter = $Signature.TimeStamperCertificate.NotAfter.ToUniversalTime().ToString('o')
  }
  return $artifact
}

function Assert-ArtifactIdentity {
  param(
    [Parameter(Mandatory = $true)] [string]$FilePath,
    [Parameter(Mandatory = $true)] [string]$ExpectedSha256,
    [Parameter(Mandatory = $true)] [string]$ExpectedSignerThumbprint,
    [Parameter(Mandatory = $true)] [string]$ArtifactLabel
  )

  Assert-True (Test-Path -LiteralPath $FilePath -PathType Leaf) `
    "$ArtifactLabel is missing."
  $actualSha256 = (Get-FileHash -LiteralPath $FilePath -Algorithm SHA256).Hash
  Assert-True ([string]::Equals(
    $actualSha256,
    $ExpectedSha256,
    [System.StringComparison]::OrdinalIgnoreCase
  )) "$ArtifactLabel SHA-256 changed during certification."
  $signature = Get-AuthenticodeSignature -LiteralPath $FilePath
  Assert-ExpectedAuthenticodeSignature $signature $ExpectedSignerThumbprint $ArtifactLabel
}

function Get-FreeTcpPort {
  $listener = [System.Net.Sockets.TcpListener]::new(
    [System.Net.IPAddress]::Loopback,
    0
  )
  try {
    $listener.Start()
    return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
  } finally {
    $listener.Stop()
  }
}

function Assert-TcpPortAvailable {
  param([Parameter(Mandatory = $true)] [int]$Port)

  Assert-True (Test-TcpPortAvailable $Port) `
    "Required desktop port $Port is already in use; refusing to disturb another service."
}

function Assert-VaultKeyAclRestricted {
  param([Parameter(Mandatory = $true)] [string]$KeyPath)

  Assert-True (Test-Path -LiteralPath $KeyPath -PathType Leaf) `
    'Windows vault key was not created during first boot.'
  $acl = Get-Acl -LiteralPath $KeyPath
  Assert-True ($acl.AreAccessRulesProtected) `
    'Windows vault key still inherits filesystem permissions.'

  $currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  Assert-True ($null -ne $currentSid) 'Could not resolve the current Windows security identifier.'
  $ownerSid = $acl.GetOwner([Security.Principal.SecurityIdentifier])
  Assert-True ([string]::Equals(
    $ownerSid.Value,
    $currentSid.Value,
    [System.StringComparison]::OrdinalIgnoreCase
  )) 'Windows vault key is not owned by the current user.'
  $rules = @(
    $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])
  )
  Assert-True ($rules.Count -eq 1) `
    "Windows vault key must have exactly one access rule; found $($rules.Count)."
  $allowRules = @(
    $rules |
      Where-Object {
        $_.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow
      }
  )
  $currentUserAllows = @(
    $allowRules | Where-Object {
      [string]::Equals(
        $_.IdentityReference.Value,
        $currentSid.Value,
        [System.StringComparison]::OrdinalIgnoreCase
      )
    }
  )
  $unexpectedAllows = @(
    $allowRules | Where-Object {
      -not [string]::Equals(
        $_.IdentityReference.Value,
        $currentSid.Value,
        [System.StringComparison]::OrdinalIgnoreCase
      )
    }
  )
  $unexpectedPrincipals = @(
    $unexpectedAllows | ForEach-Object { $_.IdentityReference.Value }
  )
  Assert-True ($unexpectedAllows.Count -eq 0) `
    "Windows vault key grants access to unexpected principals: $($unexpectedPrincipals -join ', ')"
  $fullControl = [Security.AccessControl.FileSystemRights]::FullControl
  $hasCurrentUserFullControl = @(
    $currentUserAllows | Where-Object {
      ($_.FileSystemRights -band $fullControl) -eq $fullControl
    }
  ).Count -gt 0
  Assert-True $hasCurrentUserFullControl `
    'Windows vault key does not grant the current user full control.'
}

function Test-TcpPortAvailable {
  param([Parameter(Mandatory = $true)] [int]$Port)

  $listener = [System.Net.Sockets.TcpListener]::new(
    [System.Net.IPAddress]::Loopback,
    $Port
  )
  try {
    $listener.Start()
    return $true
  } catch {
    return $false
  } finally {
    $listener.Stop()
  }
}

function Stop-StartedProcessTree {
  param([Parameter(Mandatory = $true)] [System.Diagnostics.Process]$Process)

  $taskkill = Join-Path $env:SystemRoot 'System32\taskkill.exe'
  $killInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $killInfo.FileName = $taskkill
  $killInfo.Arguments = "/PID $($Process.Id) /T /F"
  $killInfo.UseShellExecute = $false
  $killInfo.CreateNoWindow = $true
  $killInfo.RedirectStandardOutput = $true
  $killInfo.RedirectStandardError = $true
  $killInfo.WorkingDirectory = Split-Path -Parent $taskkill

  $killProcess = [System.Diagnostics.Process]::new()
  $killProcess.StartInfo = $killInfo
  try {
    Assert-True ($killProcess.Start()) "Could not start taskkill for process $($Process.Id)"
    Assert-True ($killProcess.WaitForExit(20000)) "Timed out terminating process tree $($Process.Id)"
    $killProcess.WaitForExit()
    if ($killProcess.ExitCode -ne 0) {
      $detail = $killProcess.StandardError.ReadToEnd().Trim()
      throw "Could not terminate process tree $($Process.Id): $detail"
    }
    Assert-True ($Process.WaitForExit(20000)) "Process tree root $($Process.Id) did not exit"
  } finally {
    $killProcess.Dispose()
  }
}

function Remove-CertificationControlEnvironment {
  param([Parameter(Mandatory = $true)] [System.Diagnostics.ProcessStartInfo]$Info)

  $explicitNames = @(
    'CI', 'GH_TOKEN', 'GITHUB_TOKEN',
    'WINDOWS_CODESIGN_PFX_BASE64', 'WINDOWS_CODESIGN_PFX_PASSWORD',
    'WINDOWS_UPGRADE_BASE_SHA256', 'WAGGLE_APPROVED_CODESIGN_THUMBPRINT',
    'WAGGLE_CODESIGN_THUMBPRINT', 'WAGGLE_RELEASE_VERSION'
  )
  foreach ($name in @($Info.Environment.Keys)) {
    if ($name -match '^(?:ACTIONS_|GITHUB_|RUNNER_|WAGGLE_UPGRADE_BASE_)' -or
        $explicitNames -contains $name) {
      $null = $Info.Environment.Remove($name)
    }
  }
}

function Invoke-RawProcess {
  param(
    [Parameter(Mandatory = $true)] [string]$FilePath,
    [Parameter(Mandatory = $true)] [string]$Arguments,
    [ValidateRange(1, 900)] [int]$TimeoutSeconds = 300
  )

  $info = [System.Diagnostics.ProcessStartInfo]::new()
  $info.FileName = $FilePath
  $info.Arguments = $Arguments
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.WorkingDirectory = Split-Path -Parent $FilePath
  Remove-CertificationControlEnvironment $info

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $info
  try {
    Assert-True ($process.Start()) "Could not start $FilePath"
    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
      Stop-StartedProcessTree $process
      throw "Timed out after ${TimeoutSeconds}s: $FilePath $Arguments"
    }
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) {
      throw "Process exited $($process.ExitCode): $FilePath $Arguments"
    }
  } finally {
    $process.Dispose()
  }
}

function Start-InstalledApp {
  param([Parameter(Mandatory = $true)] [string]$ExecutablePath)

  $info = [System.Diagnostics.ProcessStartInfo]::new()
  $info.FileName = $ExecutablePath
  $info.UseShellExecute = $false
  $info.WorkingDirectory = Split-Path -Parent $ExecutablePath
  Remove-CertificationControlEnvironment $info
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $info
  Assert-True ($process.Start()) "Could not start installed Waggle: $ExecutablePath"
  return $process
}

function Invoke-JsonRequest {
  param(
    [Parameter(Mandatory = $true)] [string]$Uri,
    [hashtable]$Headers = @{}
  )

  return Invoke-RestMethod -Uri $Uri -Method Get -Headers $Headers -TimeoutSec 5
}

function Invoke-JsonPostRequest {
  param(
    [Parameter(Mandatory = $true)] [string]$Uri,
    [Parameter(Mandatory = $true)] [hashtable]$Body,
    [hashtable]$Headers = @{},
    [ValidateRange(1, 3600)] [int]$TimeoutSeconds = 30
  )

  $json = $Body | ConvertTo-Json -Compress -Depth 8
  return Invoke-WebRequest `
    -Uri $Uri `
    -Method Post `
    -Headers $Headers `
    -ContentType 'application/json; charset=utf-8' `
    -Body ([System.Text.Encoding]::UTF8.GetBytes($json)) `
    -TimeoutSec $TimeoutSeconds `
    -UseBasicParsing
}

function Get-HttpStatusCode {
  param([Parameter(Mandatory = $true)] [string]$Uri)

  try {
    return [int](Invoke-WebRequest -Uri $Uri -Method Get -TimeoutSec 5 -UseBasicParsing).StatusCode
  } catch {
    if ($_.Exception.Response) {
      return [int]$_.Exception.Response.StatusCode
    }
    throw
  }
}

function Wait-ForHealth {
  param(
    [Parameter(Mandatory = $true)] [string]$BaseUrl,
    [Parameter(Mandatory = $true)] [int]$TimeoutSeconds
  )

  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  $lastError = $null
  while ([DateTime]::UtcNow -lt $deadline) {
    try {
      $health = Invoke-JsonRequest "$BaseUrl/health"
      if ($health.mode -eq 'local' -and $health.database.healthy -eq $true) {
        return $health
      }
      $lastError = 'Unexpected health payload'
    } catch {
      $lastError = $_.Exception.Message
    }
    Start-Sleep -Milliseconds 500
  }
  throw "Waggle did not become healthy within ${TimeoutSeconds}s. Last error: $lastError"
}

function Get-InstalledProcessIds {
  param(
    [Parameter(Mandatory = $true)] [string]$AppExecutable,
    [Parameter(Mandatory = $true)] [string]$ServiceScript,
    [string]$ManagedRuntimeRoot = ''
  )

  $ids = [System.Collections.Generic.HashSet[int]]::new()
  $managedRoot = if ([string]::IsNullOrWhiteSpace($ManagedRuntimeRoot)) {
    $null
  } else {
    [System.IO.Path]::GetFullPath($ManagedRuntimeRoot).TrimEnd('\', '/')
  }
  $processes = Get-CimInstance Win32_Process -ErrorAction Stop
  foreach ($process in $processes) {
    $exactApp = $process.ExecutablePath -and
      [string]::Equals(
        [System.IO.Path]::GetFullPath($process.ExecutablePath),
        [System.IO.Path]::GetFullPath($AppExecutable),
        [System.StringComparison]::OrdinalIgnoreCase
      )
    $exactSidecar = $process.CommandLine -and
      $process.CommandLine.IndexOf(
        $ServiceScript,
        [System.StringComparison]::OrdinalIgnoreCase
      ) -ge 0
    $managedRuntime = $managedRoot -and (
      ($process.ExecutablePath -and
        [System.IO.Path]::GetFullPath($process.ExecutablePath).StartsWith(
          "$managedRoot\",
          [System.StringComparison]::OrdinalIgnoreCase
        )) -or
      ($process.CommandLine -and
        $process.CommandLine.IndexOf(
          $managedRoot,
          [System.StringComparison]::OrdinalIgnoreCase
        ) -ge 0)
    )
    if ($exactApp -or $exactSidecar -or $managedRuntime) {
      $null = $ids.Add([int]$process.ProcessId)
    }
  }
  return @($ids)
}

function Wait-ForInstalledRuntimeStop {
  param(
    [Parameter(Mandatory = $true)] [string]$AppExecutable,
    [Parameter(Mandatory = $true)] [string]$ServiceScript,
    [Parameter(Mandatory = $true)] [int]$Port,
    [string]$ManagedRuntimeRoot = '',
    [int[]]$AdditionalPorts = @(),
    [ValidateRange(5, 120)] [int]$TimeoutSeconds = 30
  )

  $ports = @($Port) + @($AdditionalPorts | Where-Object { $_ -ge 1 -and $_ -le 65535 })
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  $consecutiveAvailableProbes = 0
  do {
    $ownedProcessIds = @(
      Get-InstalledProcessIds $AppExecutable $ServiceScript $ManagedRuntimeRoot
    )
    $busyPorts = @($ports | Where-Object { -not (Test-TcpPortAvailable $_) })
    if ($ownedProcessIds.Count -eq 0 -and $busyPorts.Count -eq 0) {
      $consecutiveAvailableProbes++
      if ($consecutiveAvailableProbes -ge 2) { return }
    } else {
      $consecutiveAvailableProbes = 0
    }
    Start-Sleep -Milliseconds 300
  } while ([DateTime]::UtcNow -lt $deadline)

  $remainingProcessIds = @(
    Get-InstalledProcessIds $AppExecutable $ServiceScript $ManagedRuntimeRoot
  )
  $remainingBusyPorts = @($ports | Where-Object { -not (Test-TcpPortAvailable $_) })
  throw "Installed runtime did not stop cleanly; owned PIDs=$($remainingProcessIds -join ',') ports=$($remainingBusyPorts -join ',')"
}

function Assert-NoForeignWaggleProcesses {
  param([Parameter(Mandatory = $true)] [string]$ExpectedAppExecutable)

  $expectedPath = [System.IO.Path]::GetFullPath($ExpectedAppExecutable)
  $foreignProcesses = @(
    Get-CimInstance Win32_Process -Filter "Name = 'waggle.exe'" -ErrorAction Stop |
      Where-Object {
        -not $_.ExecutablePath -or -not [string]::Equals(
          [System.IO.Path]::GetFullPath($_.ExecutablePath),
          $expectedPath,
          [System.StringComparison]::OrdinalIgnoreCase
        )
      }
  )
  $details = @($foreignProcesses | ForEach-Object { "$($_.ProcessId):$($_.ExecutablePath)" })
  Assert-True ($foreignProcesses.Count -eq 0) `
    "A non-certificate Waggle process could be terminated by NSIS: $($details -join ', ')"
}

function Test-RegistryValue {
  param(
    [Parameter(Mandatory = $true)] [string]$KeyPath,
    [Parameter(Mandatory = $true)] [string]$ValueName
  )

  if (-not (Test-Path -LiteralPath $KeyPath)) { return $false }
  $key = Get-Item -LiteralPath $KeyPath
  return $key.GetValueNames() -contains $ValueName
}

function Stop-InstalledProcesses {
  param(
    [Parameter(Mandatory = $true)] [string]$AppExecutable,
    [Parameter(Mandatory = $true)] [string]$ServiceScript,
    [string]$ManagedRuntimeRoot = ''
  )

  $taskkill = Join-Path $env:SystemRoot 'System32\taskkill.exe'
  foreach ($processId in (Get-InstalledProcessIds $AppExecutable $ServiceScript $ManagedRuntimeRoot)) {
    try {
      Invoke-RawProcess $taskkill "/PID $processId /T /F" 20
    } catch {
      # Killing the main process tree can make a separately captured child PID
      # disappear. Re-check exact ownership before treating that as a failure.
      $stillOwned = Get-InstalledProcessIds $AppExecutable $ServiceScript $ManagedRuntimeRoot
      if ($stillOwned -contains $processId) { throw }
    }
  }
}

function Wait-ForPathState {
  param(
    [Parameter(Mandatory = $true)] [string]$LiteralPath,
    [Parameter(Mandatory = $true)] [bool]$ShouldExist,
    [ValidateRange(5, 120)] [int]$TimeoutSeconds = 60
  )

  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    if ((Test-Path -LiteralPath $LiteralPath) -eq $ShouldExist) { return }
    Start-Sleep -Milliseconds 300
  }
  throw "Path did not reach expected state (exists=$ShouldExist): $LiteralPath"
}

function Get-WaggleShortcutPaths {
  $desktop = [Environment]::GetFolderPath('Desktop')
  $programs = [Environment]::GetFolderPath('Programs')
  return @(
    (Join-Path $desktop 'Waggle.lnk'),
    (Join-Path $programs 'Waggle.lnk'),
    (Join-Path $programs 'Waggle\Waggle.lnk')
  )
}

function Assert-ShortcutTargets {
  param(
    [Parameter(Mandatory = $true)] [string[]]$ShortcutPaths,
    [Parameter(Mandatory = $true)] [string]$ExpectedTarget
  )

  $shell = New-Object -ComObject WScript.Shell
  foreach ($shortcutPath in $ShortcutPaths) {
    $shortcut = $shell.CreateShortcut($shortcutPath)
    Assert-True (
      [string]::Equals(
        [System.IO.Path]::GetFullPath($shortcut.TargetPath),
        [System.IO.Path]::GetFullPath($ExpectedTarget),
        [System.StringComparison]::OrdinalIgnoreCase
      )
    ) "Shortcut does not target the installed Waggle executable: $shortcutPath"
  }
}

function Assert-SafeScratchRoot {
  param([Parameter(Mandatory = $true)] [string]$ScratchRoot)

  $resolved = [System.IO.Path]::GetFullPath($ScratchRoot).TrimEnd('\')
  $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
  $leaf = Split-Path -Leaf $resolved
  Assert-True ($resolved.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) `
    "Scratch root escaped the system temp directory: $resolved"
  Assert-True ($leaf.StartsWith('waggle-installer-cert-', [System.StringComparison]::Ordinal)) `
    "Refusing to clean an unexpected scratch directory: $resolved"
}

function Remove-CertificateProductRegistry {
  param(
    [Parameter(Mandatory = $true)] [string]$ProductRegistry,
    [Parameter(Mandatory = $true)] [string]$ExpectedInstallDir
  )

  if (-not (Test-Path -LiteralPath $ProductRegistry)) { return }
  $item = Get-Item -LiteralPath $ProductRegistry
  $storedInstallDir = [string]$item.GetValue('')
  Assert-True (-not [string]::IsNullOrWhiteSpace($storedInstallDir)) `
    "Refusing to remove product registry key without an owned install path: $ProductRegistry"
  Assert-True (
    [string]::Equals(
      [System.IO.Path]::GetFullPath($storedInstallDir.Trim('"')),
      [System.IO.Path]::GetFullPath($ExpectedInstallDir),
      [System.StringComparison]::OrdinalIgnoreCase
    )
  ) "Refusing to remove product registry key owned by another install: $storedInstallDir"
  Remove-Item -LiteralPath $ProductRegistry -Recurse -Force
}

function Clear-AbandonedCertificateProductRegistry {
  param(
    [Parameter(Mandatory = $true)] [string]$ProductRegistry,
    [Parameter(Mandatory = $true)] [string]$UninstallRegistry
  )

  if (-not (Test-Path -LiteralPath $ProductRegistry)) { return }
  Assert-True (-not (Test-Path -LiteralPath $UninstallRegistry)) `
    'Refusing to remove product metadata while Waggle is registered.'

  $item = Get-Item -LiteralPath $ProductRegistry
  $storedInstallDir = [string]$item.GetValue('')
  Assert-True (-not [string]::IsNullOrWhiteSpace($storedInstallDir)) `
    "Refusing to remove product registry key without an install path: $ProductRegistry"

  $resolvedInstallDir = [System.IO.Path]::GetFullPath($storedInstallDir.Trim('"')).TrimEnd('\')
  $certificateRoot = Split-Path -Parent $resolvedInstallDir
  $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
  Assert-True ($resolvedInstallDir.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) `
    "Refusing to remove product metadata outside the system temp directory: $resolvedInstallDir"
  Assert-True ((Split-Path -Leaf $resolvedInstallDir) -eq 'install') `
    "Refusing to remove product metadata for an unexpected install directory: $resolvedInstallDir"
  Assert-True ((Split-Path -Leaf $certificateRoot).StartsWith('waggle-installer-cert-', [System.StringComparison]::Ordinal)) `
    "Refusing to remove product metadata not owned by the installer certificate: $resolvedInstallDir"
  Assert-True (-not (Test-Path -LiteralPath $resolvedInstallDir)) `
    "Refusing to remove product metadata for an install directory that still exists: $resolvedInstallDir"

  Remove-CertificateProductRegistry $ProductRegistry $resolvedInstallDir
}

function Remove-CertificateProfileMarker {
  param(
    [Parameter(Mandatory = $true)] [string]$ProfileDataDir,
    [Parameter(Mandatory = $true)] [string]$ProfileDataMarker,
    [Parameter(Mandatory = $true)] [string]$RunId
  )

  $expectedDataDir = [System.IO.Path]::GetFullPath((Join-Path $env:USERPROFILE '.waggle')).TrimEnd('\')
  $resolvedDataDir = [System.IO.Path]::GetFullPath($ProfileDataDir).TrimEnd('\')
  Assert-True (
    [string]::Equals($resolvedDataDir, $expectedDataDir, [System.StringComparison]::OrdinalIgnoreCase)
  ) "Refusing to clean an unexpected profile directory: $resolvedDataDir"
  Assert-True (
    [string]::Equals(
      [System.IO.Path]::GetFullPath((Split-Path -Parent $ProfileDataMarker)).TrimEnd('\'),
      $resolvedDataDir,
      [System.StringComparison]::OrdinalIgnoreCase
    )
  ) "Refusing to clean a profile marker outside the certificate directory: $ProfileDataMarker"
  Assert-True ((Split-Path -Leaf $ProfileDataMarker) -eq "installer-certificate-profile-marker-$RunId.txt") `
    "Refusing to clean an unexpected profile marker: $ProfileDataMarker"

  if (Test-Path -LiteralPath $ProfileDataMarker -PathType Leaf) {
    Assert-True ((Get-Content -Raw -LiteralPath $ProfileDataMarker).Trim() -eq $RunId) `
      "Refusing to remove a profile marker not owned by this certificate: $ProfileDataMarker"
    Remove-Item -LiteralPath $ProfileDataMarker -Force
  }
  if (Test-Path -LiteralPath $ProfileDataDir -PathType Container) {
    Assert-True (@(Get-ChildItem -LiteralPath $ProfileDataDir -Force).Count -eq 0) `
      "Certificate profile directory contains unexpected data: $ProfileDataDir"
    Remove-Item -LiteralPath $ProfileDataDir -Force
  }
}

$installer = Get-Item -LiteralPath $InstallerPath
Assert-True (-not $installer.PSIsContainer) 'InstallerPath must be a file'
Assert-True ($installer.Extension -eq '.exe') 'InstallerPath must be an NSIS .exe'
$InstallerPath = $installer.FullName
$candidateInstallerHash = (Get-FileHash -LiteralPath $InstallerPath -Algorithm SHA256).Hash

$previousInstaller = $null
$previousInstallerSignature = $null
$previousInstallerEvidence = $null
$previousVersionObject = $null
$candidateVersionObject = $null
$upgradeInputs = @(
  $PreviousInstallerPath,
  $ExpectedPreviousInstallerSha256,
  $ExpectedPreviousVersion,
  $ExpectedPreviousSourceRevision,
  $ExpectedCandidateInstallerSha256,
  $ExpectedCandidateVersion
)
$hasUpgradeInputs = @(
  $upgradeInputs | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) }
).Count -gt 0
Assert-True ($RequireVersionToVersionUpgrade -or -not $hasUpgradeInputs) `
  'Version-to-version inputs require RequireVersionToVersionUpgrade.'
if ($RequireVersionToVersionUpgrade) {
  Assert-True $RequireAuthenticodeSignature `
    'Version-to-version certification requires Authenticode signature enforcement.'
  Assert-True ($hasUpgradeInputs -and @(
    $upgradeInputs | Where-Object { [string]::IsNullOrWhiteSpace([string]$_) }
  ).Count -eq 0) 'Version-to-version certification requires every previous and candidate input.'
  Assert-True ($ExpectedPreviousInstallerSha256 -match '^[0-9A-Fa-f]{64}$') `
    'Previous installer SHA-256 must be exactly 64 hexadecimal characters.'
  Assert-True ($ExpectedCandidateInstallerSha256 -match '^[0-9A-Fa-f]{64}$') `
    'Candidate installer SHA-256 must be exactly 64 hexadecimal characters.'
  Assert-True ($ExpectedPreviousSourceRevision -match '^[0-9A-Fa-f]{40}$') `
    'Previous source revision must be exactly 40 hexadecimal characters.'
  Assert-True ([string]::Equals(
    $candidateInstallerHash,
    $ExpectedCandidateInstallerSha256,
    [System.StringComparison]::OrdinalIgnoreCase
  )) 'Candidate installer does not match the pre-certification SHA-256.'
  $previousVersionObject = ConvertTo-StrictSemanticVersion `
    $ExpectedPreviousVersion 'Previous version'
  $candidateVersionObject = ConvertTo-StrictSemanticVersion `
    $ExpectedCandidateVersion 'Candidate version'
  Assert-True ($candidateVersionObject -gt $previousVersionObject) `
    'Candidate version must be newer than the previous version.'

  $previousInstaller = Get-Item -LiteralPath $PreviousInstallerPath
  Assert-True (-not $previousInstaller.PSIsContainer) 'PreviousInstallerPath must be a file.'
  Assert-True ($previousInstaller.Extension -eq '.exe') `
    'PreviousInstallerPath must be an NSIS .exe.'
  $PreviousInstallerPath = $previousInstaller.FullName
  Assert-True (-not [string]::Equals(
    $PreviousInstallerPath,
    $InstallerPath,
    [System.StringComparison]::OrdinalIgnoreCase
  )) 'Previous installer and candidate installer must be distinct files.'
  $previousInstallerHash = (
    Get-FileHash -LiteralPath $PreviousInstallerPath -Algorithm SHA256
  ).Hash
  Assert-True ([string]::Equals(
    $previousInstallerHash,
    $ExpectedPreviousInstallerSha256,
    [System.StringComparison]::OrdinalIgnoreCase
  )) 'Previous installer does not match the protected SHA-256.'
  $previousInstallerSignature = Get-AuthenticodeSignature -LiteralPath $PreviousInstallerPath
  Assert-ExpectedAuthenticodeSignature `
    $previousInstallerSignature $ExpectedSignerThumbprint 'Previous release installer'
  $previousInstallerEvidence = New-AuthenticodeArtifactReceipt `
    $previousInstaller $previousInstallerSignature
  $previousInstallerEvidence['expectedVersion'] = $ExpectedPreviousVersion
}

if (-not $ReceiptPath) {
  $ReceiptPath = Join-Path $installer.DirectoryName 'windows-installer-certificate.json'
}
$ReceiptPath = [System.IO.Path]::GetFullPath($ReceiptPath)
$installerHookPath = [System.IO.Path]::GetFullPath(
  (Join-Path $PSScriptRoot '..\app\src-tauri\nsis\installer.nsi')
)

$runId = [Guid]::NewGuid().ToString('N')
$scratchRoot = Join-Path ([System.IO.Path]::GetTempPath()) "waggle-installer-cert-$runId"
Assert-SafeScratchRoot $scratchRoot
$installDir = Join-Path $scratchRoot 'install'
$dataDir = Join-Path $scratchRoot 'data'
$appExecutable = Join-Path $installDir 'waggle.exe'
$serviceScript = Join-Path $installDir 'resources\service.js'
$canonicalMarketplaceDb = [System.IO.Path]::GetFullPath(
  (Join-Path $PSScriptRoot '..\packages\marketplace\marketplace.db')
)
$installedMarketplaceDb = Join-Path $installDir 'resources\marketplace.db'
$writableMarketplaceDb = Join-Path $dataDir 'marketplace.db'
$bundledNode = Join-Path $installDir 'resources\node.exe'
$bundledNpmRuntime = Join-Path $installDir 'resources\node_modules\waggle-node-runtime'
$bundledNpmCli = Join-Path $bundledNpmRuntime 'node_modules\npm\bin\npm-cli.js'
$bundledNpxCli = Join-Path $bundledNpmRuntime 'node_modules\npm\bin\npx-cli.js'
$bundledNpmWrapper = Join-Path $bundledNpmRuntime 'bin\npm.cmd'
$bundledNpxWrapper = Join-Path $bundledNpmRuntime 'bin\npx.cmd'
$uninstaller = Join-Path $installDir 'uninstall.exe'
$dataMarker = Join-Path $dataDir 'installer-certificate-marker.txt'
$profileDataDir = Join-Path $env:USERPROFILE '.waggle'
$profileDataMarker = Join-Path $profileDataDir "installer-certificate-profile-marker-$runId.txt"
$uninstallRegistry = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Waggle'
$productRegistry = 'HKCU:\Software\egzakta\Waggle'
$runRegistry = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$runRegistryValue = 'Waggle'
$shortcutCandidates = Get-WaggleShortcutPaths
$startedAt = [DateTime]::UtcNow
$installerStarted = $false
$profileMarkerOwned = $false
$environmentNamesToClear = @(
  'WAGGLE_NODE_PATH', 'NODE_PATH', 'NODE_OPTIONS', 'DOCKER_HOST',
  'WAGGLE_TRUST_LOCALHOST', 'WAGGLE_SQLITE_VEC_PATH', 'ONNXRUNTIME_NODE_BINDING_PATH',
  'EMBEDDING_PROVIDER', 'EMBEDDING_MODEL', 'OLLAMA_EMBED_MODEL',
  'WAGGLE_EMBEDDING_PROVIDER', 'HIVE_MIND_EMBEDDING_PROVIDER',
  'VOYAGE_API_KEY', 'WAGGLE_VOYAGE_API_KEY', 'WAGGLE_EVAL_MODE',
  'WAGGLE_SUPPRESS_EMBEDDING_WARNING', 'WAGGLE_LITELLM_URL',
  'LITELLM_API_KEY', 'LITELLM_MASTER_KEY',
  'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY',
  'GOOGLE_API_KEY', 'XAI_API_KEY', 'DEEPSEEK_API_KEY',
  'MISTRAL_API_KEY', 'DASHSCOPE_API_KEY', 'MINIMAX_API_KEY',
  'ZHIPU_API_KEY', 'MOONSHOT_API_KEY', 'PERPLEXITY_API_KEY',
  'OPENROUTER_API_KEY'
)
$environmentNamesToClear += @(
  Get-ChildItem Env: |
    Where-Object { $_.Name -match '(?i)^npm_' } |
    ForEach-Object { $_.Name }
)
$environmentNamesToClear = @($environmentNamesToClear | Sort-Object -Unique)
$isolatedEnvironmentNames = @(
  'PATH', 'WAGGLE_PORT', 'WAGGLE_DATA_DIR', 'WAGGLE_HOST',
  'OLLAMA_HOST', 'VLLM_HOST', 'WAGGLE_SKIP_MARKETPLACE_SYNC'
) + $environmentNamesToClear
$environmentSnapshot = @{}
foreach ($name in $isolatedEnvironmentNames) {
  $environmentSnapshot[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

$receipt = [ordered]@{
  schemaVersion = 3
  certificationMode = if ($RequireVersionToVersionUpgrade) {
    'version-to-version-upgrade'
  } else {
    'same-version-repair'
  }
  status = 'running'
  startedAt = $startedAt.ToString('o')
  finishedAt = $null
  installer = [ordered]@{
    name = $installer.Name
    sha256 = $candidateInstallerHash
    sizeBytes = $installer.Length
    authenticodeStatus = $null
    signatureType = $null
    signerSubject = $null
    signerThumbprint = $null
    timestampAuthoritySubject = $null
    timestampAuthorityThumbprint = $null
    timestampAuthorityNotBefore = $null
    timestampAuthorityNotAfter = $null
  }
  previousInstaller = $previousInstallerEvidence
  previousInstalledApp = $null
  installedApp = $null
  platform = [ordered]@{
    os = [Environment]::OSVersion.VersionString
    architecture = $env:PROCESSOR_ARCHITECTURE
    powershell = $PSVersionTable.PSVersion.ToString()
  }
  evidence = [ordered]@{
    certificateRunId = $runId
    sourceRevision = $null
    workflowRunId = [Environment]::GetEnvironmentVariable('GITHUB_RUN_ID', 'Process')
    workflowRunAttempt = [Environment]::GetEnvironmentVariable('GITHUB_RUN_ATTEMPT', 'Process')
    certifierSha256 = $null
    installerHookSha256 = $null
    generatedInstallerScriptSha256 = $null
    generatedInstallerHookPath = $null
    windowsInboxTools = [ordered]@{}
  }
  scratchRoot = $scratchRoot
  embeddingPayloadReady = $false
  embeddingPayload = $null
  managedModelVerified = $false
  managedModelDigest = $null
  bundledNpm = $null
  upgrade = if ($RequireVersionToVersionUpgrade) {
    [ordered]@{
      previousVersion = $ExpectedPreviousVersion
      candidateVersion = $ExpectedCandidateVersion
      previousSourceRevision = $ExpectedPreviousSourceRevision.ToLowerInvariant()
      installDirectory = $installDir
      observedPreviousVersion = $null
      observedCandidateVersion = $null
      configuredDataMarkerSha256 = $null
      profileMarkerSha256 = $null
      vaultKeySha256 = $null
    }
  } else {
    $null
  }
  checks = [ordered]@{}
  error = $null
}

if ($RequireVersionToVersionUpgrade) {
  $receipt.checks['previousInstallerHash'] = $true
  $receipt.checks['previousInstallerAuthenticodeSignature'] = $true
  $receipt.checks['previousInstallerAuthenticodeSigner'] = $true
  $receipt.checks['previousInstallerAuthenticodeTimestamp'] = $true
  $receipt.checks['candidateInstallerHash'] = $true
  $receipt.checks['versionOrder'] = $true
}

New-Item -ItemType Directory -Path $scratchRoot, $dataDir -Force | Out-Null
$ollamaPort = 0
$managedRuntimeRoot = Join-Path $dataDir 'runtimes\ollama'

try {
  Assert-True (Test-Path -LiteralPath $installerHookPath -PathType Leaf) `
    'Configured NSIS installer hook is missing.'
  $installerHookFile = Get-Item -LiteralPath $installerHookPath
  $installerHook = Get-Content -Raw -LiteralPath $installerHookPath
  Assert-True (-not ($installerHook -match '(?im)^\s*!macro\s+NSIS_HOOK_POSTUNINSTALL\b')) `
    'Custom post-uninstall behavior could affect profile data.'
  Assert-True ($installerHook -match '(?im)^\s*!macro\s+NSIS_HOOK_PREUNINSTALL\b') `
    'Custom pre-uninstall data-preservation hook is missing.'
  Assert-True ($installerHook -match '(?im)^\s*StrCpy\s+\$DeleteAppDataCheckboxState\s+0\s*$') `
    'Custom pre-uninstall hook does not neutralize Tauri app-data deletion.'
  Assert-True (-not (
    $installerHook -match '(?im)^\s*(?:RMDir|Delete)\b[^\r\n]*\$PROFILE[\\/]+\.waggle(?:[\\/"\s]|$)'
  )) 'NSIS hook contains a destructive Waggle-data operation.'
  if ($RequireAuthenticodeSignature) {
    Assert-True (-not [string]::IsNullOrWhiteSpace($ExpectedSourceRevision)) `
      'Release certification requires the expected source revision.'
  }
  if (-not [string]::IsNullOrWhiteSpace($ExpectedSourceRevision)) {
    $normalizedExpectedSourceRevision = $ExpectedSourceRevision.Trim().ToLowerInvariant()
    Assert-True ($normalizedExpectedSourceRevision -match '^[0-9a-f]{40}$') `
      'Expected source revision must be exactly 40 hexadecimal characters.'
    $gitCommand = Get-Command git -CommandType Application -ErrorAction SilentlyContinue |
      Select-Object -First 1
    Assert-True ($null -ne $gitCommand) 'git is required to bind the installer receipt to source.'
    $repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    $revisionOutput = @(& $gitCommand.Source -C $repositoryRoot rev-parse HEAD 2>$null)
    Assert-True ($LASTEXITCODE -eq 0 -and $revisionOutput.Count -eq 1) `
      'Could not resolve the repository source revision.'
    $repositoryRevision = ([string]$revisionOutput[0]).Trim().ToLowerInvariant()
    Assert-True ($repositoryRevision -eq $normalizedExpectedSourceRevision) `
      "Repository revision $repositoryRevision does not match expected source $normalizedExpectedSourceRevision."
    $trackedSourcePaths = @(
      'scripts/build-sidecar.mjs',
      'scripts/bundle-node.mjs',
      'scripts/certify-windows-installer.ps1',
      'scripts/check-sidecar-resources.mjs',
      'scripts/stage-sidecar-deps.mjs',
      'packages/server/src/local/index.ts',
      'packages/marketplace/marketplace.db',
      'app/src-tauri/src/service.rs',
      'app/src-tauri/nsis/installer.nsi'
    )
    foreach ($trackedSourcePath in $trackedSourcePaths) {
      & $gitCommand.Source -C $repositoryRoot ls-files --error-unmatch -- $trackedSourcePath 2>$null | Out-Null
      Assert-True ($LASTEXITCODE -eq 0) "Certification source is not tracked: $trackedSourcePath"
      & $gitCommand.Source -C $repositoryRoot cat-file -e "${repositoryRevision}:$trackedSourcePath" 2>$null
      Assert-True ($LASTEXITCODE -eq 0) `
        "Certification source is absent from expected revision: $trackedSourcePath"
    }
    $diffArguments = @('-C', $repositoryRoot, 'diff', '--quiet', $repositoryRevision, '--') + $trackedSourcePaths
    & $gitCommand.Source @diffArguments
    Assert-True ($LASTEXITCODE -eq 0) `
      'Installer certification source files differ from the expected revision.'
    $receipt.evidence.sourceRevision = $repositoryRevision
    $receipt.checks['sourceRevision'] = $true
    $receipt.checks['sourceFilesClean'] = $true
  } else {
    $receipt.evidence.sourceRevision = [Environment]::GetEnvironmentVariable('GITHUB_SHA', 'Process')
  }
  $receipt.evidence.certifierSha256 = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash
  $receipt.evidence.installerHookSha256 = (Get-FileHash -LiteralPath $installerHookPath -Algorithm SHA256).Hash
  $releaseDirectory = Split-Path -Parent (Split-Path -Parent $installer.DirectoryName)
  $generatedInstallerScripts = @(
    Get-ChildItem -LiteralPath (Join-Path $releaseDirectory 'nsis') -Recurse -Filter 'installer.nsi' -File
  )
  Assert-True ($generatedInstallerScripts.Count -eq 1) `
    "Expected exactly one generated NSIS script, found $($generatedInstallerScripts.Count)"
  $generatedInstallerScript = $generatedInstallerScripts[0]
  Assert-True ($generatedInstallerScript.LastWriteTimeUtc -ge $installerHookFile.LastWriteTimeUtc) `
    'Generated NSIS source predates the configured installer hook; the build is stale.'
  Assert-True ($installer.LastWriteTimeUtc -ge $installerHookFile.LastWriteTimeUtc) `
    'Setup executable predates the configured installer hook; the artifact is stale.'
  Assert-True ($installer.LastWriteTimeUtc -ge $generatedInstallerScript.LastWriteTimeUtc) `
    'Generated NSIS source is newer than the setup executable; the artifact is stale.'
  $generatedInstallerContent = Get-Content -Raw -LiteralPath $generatedInstallerScript.FullName
  $matchingHookIncludes = 0
  foreach ($includeMatch in [regex]::Matches(
    $generatedInstallerContent,
    '(?im)^\s*!include\s+"(?<path>[^"]+)"\s*$'
  )) {
    try {
      $resolvedIncludePath = [System.IO.Path]::GetFullPath($includeMatch.Groups['path'].Value)
    } catch {
      continue
    }
    if ([string]::Equals(
      $resolvedIncludePath,
      $installerHookFile.FullName,
      [System.StringComparison]::OrdinalIgnoreCase
    )) {
      $matchingHookIncludes++
    }
  }
  Assert-True ($matchingHookIncludes -eq 1) `
    "Generated NSIS source must include the exact configured hook once; found $matchingHookIncludes matches."
  $receipt.evidence.generatedInstallerScriptSha256 = (
    Get-FileHash -LiteralPath $generatedInstallerScript.FullName -Algorithm SHA256
  ).Hash
  $receipt.evidence.generatedInstallerHookPath = $installerHookFile.FullName
  $receipt.checks['generatedInstallerSource'] = $true
  $receipt.checks['generatedInstallerInclude'] = $true
  $receipt.checks['profileDataDeletionAbsent'] = $true
  $receipt.checks['baseAppDataDeletionNeutralized'] = $true

  $signature = Get-AuthenticodeSignature -LiteralPath $InstallerPath
  $receipt.installer.authenticodeStatus = [string]$signature.Status
  $receipt.installer.signatureType = [string]$signature.SignatureType
  if ($signature.SignerCertificate) {
    $receipt.installer.signerSubject = $signature.SignerCertificate.Subject
    $receipt.installer.signerThumbprint = $signature.SignerCertificate.Thumbprint
  }
  if ($signature.TimeStamperCertificate) {
    $receipt.installer.timestampAuthoritySubject = $signature.TimeStamperCertificate.Subject
    $receipt.installer.timestampAuthorityThumbprint = $signature.TimeStamperCertificate.Thumbprint
    $receipt.installer.timestampAuthorityNotBefore = $signature.TimeStamperCertificate.NotBefore.ToUniversalTime().ToString('o')
    $receipt.installer.timestampAuthorityNotAfter = $signature.TimeStamperCertificate.NotAfter.ToUniversalTime().ToString('o')
  }
  if ($RequireAuthenticodeSignature) {
    Assert-True (-not [string]::IsNullOrWhiteSpace($ExpectedSignerThumbprint)) `
      'Release certification requires the expected signer thumbprint.'
    Assert-ExpectedAuthenticodeSignature $signature $ExpectedSignerThumbprint 'Release installer'
    $receipt.checks['authenticodeSignature'] = $true
    $receipt.checks['authenticodeSigner'] = $true
    $receipt.checks['authenticodeTimestamp'] = $true
  }

  Clear-AbandonedCertificateProductRegistry $productRegistry $uninstallRegistry
  Assert-True (-not (Test-Path -LiteralPath $uninstallRegistry)) `
    'A current-user Waggle installation is already registered; refusing to replace it during certification.'
  Assert-True (-not (Test-Path -LiteralPath $productRegistry)) `
    'Waggle installer metadata already exists; refusing to overwrite another installation location.'
  Assert-True (-not (Test-RegistryValue $runRegistry $runRegistryValue)) `
    'A pre-existing Waggle autostart entry makes this certificate unsafe.'
  $receipt.checks['runRegistryCollisionGuard'] = $true
  Assert-NoForeignWaggleProcesses $appExecutable
  $receipt.checks['foreignProcessCollisionGuard'] = $true
  foreach ($shortcut in $shortcutCandidates) {
    Assert-True (-not (Test-Path -LiteralPath $shortcut)) `
      "A pre-existing Waggle shortcut makes this certificate unsafe: $shortcut"
  }
  Assert-True (-not (Test-Path -LiteralPath $profileDataDir)) `
    "Profile data already exists at $profileDataDir; run this certificate under a disposable Windows user."
  New-Item -ItemType Directory -Path $profileDataDir | Out-Null
  Set-Content -LiteralPath $profileDataMarker -Value $runId -Encoding UTF8
  $profileMarkerOwned = $true

  # The desktop webview and Rust shell currently share the fixed loopback port
  # 3333 contract. Refuse to run rather than collide with another installation.
  Assert-TcpPortAvailable 3333
  $env:WAGGLE_PORT = '3333'
  $env:WAGGLE_DATA_DIR = $dataDir
  $env:WAGGLE_HOST = '127.0.0.1'
  $ollamaPort = Get-FreeTcpPort
  $env:OLLAMA_HOST = "http://127.0.0.1:$ollamaPort"
  $env:VLLM_HOST = "http://127.0.0.1:$(Get-FreeTcpPort)"
  $env:WAGGLE_SKIP_MARKETPLACE_SYNC = '1'
  $isolationPath = Join-Path $scratchRoot 'isolated-path'
  New-Item -ItemType Directory -Path $isolationPath -Force | Out-Null
  $systemDirectory = [Environment]::GetFolderPath('System')
  foreach ($toolName in @('tar.exe', 'taskkill.exe')) {
    $sourceTool = Join-Path $systemDirectory $toolName
    Assert-True (Test-Path -LiteralPath $sourceTool -PathType Leaf) `
      "Required Windows inbox tool is missing: $sourceTool"
    $toolSignature = Get-AuthenticodeSignature -LiteralPath $sourceTool
    Assert-True ($toolSignature.Status -eq [System.Management.Automation.SignatureStatus]::Valid) `
      "Required Windows inbox tool has no valid signature: $sourceTool"
    $stagedTool = Join-Path $isolationPath $toolName
    Copy-Item -LiteralPath $sourceTool -Destination $stagedTool
    $sourceToolHash = (Get-FileHash -LiteralPath $sourceTool -Algorithm SHA256).Hash
    Assert-True ((Get-FileHash -LiteralPath $stagedTool -Algorithm SHA256).Hash -eq $sourceToolHash) `
      "Staged Windows inbox tool differs from its signed source: $toolName"
    $receipt.evidence.windowsInboxTools[$toolName] = $sourceToolHash
  }
  $env:PATH = $isolationPath
  foreach ($toolName in @('tar.exe', 'taskkill.exe')) {
    $resolvedTool = Get-Command $toolName -CommandType Application -ErrorAction Stop |
      Select-Object -First 1
    Assert-True (
      [string]::Equals(
        [System.IO.Path]::GetFullPath($resolvedTool.Source),
        [System.IO.Path]::GetFullPath((Join-Path $isolationPath $toolName)),
        [System.StringComparison]::OrdinalIgnoreCase
      )
    ) "Isolation PATH did not resolve the staged Windows inbox tool: $toolName"
  }
  $receipt.checks['windowsInboxTools'] = $true
  foreach ($name in $environmentNamesToClear) {
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
  }

  $unexpectedApplications = @(
    @('node.exe', 'npm.cmd', 'npx.cmd', 'docker.exe', 'ollama.exe', 'python.exe') |
      Where-Object { Get-Command $_ -CommandType Application -ErrorAction SilentlyContinue }
  )
  Assert-True ($unexpectedApplications.Count -eq 0) `
    "Isolation PATH still exposes external runtimes: $($unexpectedApplications -join ', ')"
  $receipt.checks['externalRuntimeIsolation'] = $true

  # NSIS /D must be the final argument and must not be quoted, even when its
  # absolute path contains spaces. Do not add /R: the certificate launches and
  # owns the exact installed process itself.
  Assert-NoForeignWaggleProcesses $appExecutable
  $installerStarted = $true
  $upgradeVaultKeySha256 = $null
  $upgradeDataMarkerSha256 = $null
  $upgradeProfileMarkerSha256 = $null
  if ($RequireVersionToVersionUpgrade) {
    Assert-ArtifactIdentity `
      $PreviousInstallerPath `
      $ExpectedPreviousInstallerSha256 `
      $ExpectedSignerThumbprint `
      'Previous installer before install'
    Invoke-RawProcess $PreviousInstallerPath "/S /D=$installDir" 420
    Wait-ForPathState $appExecutable $true
    Assert-True (Test-Path -LiteralPath $uninstaller -PathType Leaf) `
      'Previous installer did not create uninstall.exe.'
    $previousRegistration = Get-ItemProperty -LiteralPath $uninstallRegistry
    Assert-True ([string]$previousRegistration.DisplayVersion -eq $ExpectedPreviousVersion) `
      'Previous installer registry version does not match the protected previous version.'
    Assert-True ([string]::Equals(
      ([string]$previousRegistration.InstallLocation).Trim('"'),
      $installDir,
      [System.StringComparison]::OrdinalIgnoreCase
    )) 'Previous installer did not use the isolated install directory.'
    $previousRegisteredUninstaller = ([string]$previousRegistration.UninstallString).Trim().Trim('"')
    Assert-True ([string]::Equals(
      [System.IO.Path]::GetFullPath($previousRegisteredUninstaller),
      [System.IO.Path]::GetFullPath($uninstaller),
      [System.StringComparison]::OrdinalIgnoreCase
    )) 'Previous installer registered an unexpected uninstaller.'
    $previousProductRegistration = Get-Item -LiteralPath $productRegistry
    Assert-True ([string]::Equals(
      [System.IO.Path]::GetFullPath(([string]$previousProductRegistration.GetValue('')).Trim('"')),
      [System.IO.Path]::GetFullPath($installDir),
      [System.StringComparison]::OrdinalIgnoreCase
    )) 'Previous installer product metadata does not match the isolated target.'

    $previousInstalledAppFile = Get-Item -LiteralPath $appExecutable
    $previousInstalledAppSignature = Get-AuthenticodeSignature -LiteralPath $appExecutable
    Assert-ExpectedAuthenticodeSignature `
      $previousInstalledAppSignature $ExpectedSignerThumbprint 'Previous installed Waggle executable'
    $previousInstalledProductVersion = Get-InstalledProductVersion `
      $appExecutable 'Previous installed Waggle executable'
    Assert-True ($previousInstalledProductVersion.normalized -eq $ExpectedPreviousVersion) `
      'Previous installed executable version does not match the protected previous version.'
    $receipt.previousInstalledApp = New-AuthenticodeArtifactReceipt `
      $previousInstalledAppFile $previousInstalledAppSignature
    $receipt.previousInstalledApp['productVersion'] = $previousInstalledProductVersion.raw
    $receipt.upgrade.observedPreviousVersion = $previousInstalledProductVersion.normalized
    $receipt.checks['previousInstall'] = $true
    $receipt.checks['previousVersion'] = $true
    $receipt.checks['previousInstalledAppAuthenticodeSignature'] = $true
    $receipt.checks['previousInstalledAppAuthenticodeSigner'] = $true
    $receipt.checks['previousInstalledAppAuthenticodeTimestamp'] = $true

    $previousBaseUrl = "http://127.0.0.1:$($env:WAGGLE_PORT)"
    Assert-TcpPortAvailable 3333
    $previousProcess = Start-InstalledApp $appExecutable
    try {
      $null = Wait-ForHealth $previousBaseUrl $StartupTimeoutSeconds
      $previousProcess.Refresh()
      Assert-True (-not $previousProcess.HasExited) `
        'The previous desktop process exited before upgrade state was prepared.'
      $previousVaultKeyPath = Join-Path $dataDir '.vault-key'
      Assert-VaultKeyAclRestricted $previousVaultKeyPath
      New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
      Set-Content -LiteralPath $dataMarker -Value $runId -Encoding UTF8
      Assert-True (Test-Path -LiteralPath $profileDataMarker -PathType Leaf) `
        'Previous launch removed the profile preservation marker.'
      $upgradeVaultKeySha256 = (
        Get-FileHash -LiteralPath $previousVaultKeyPath -Algorithm SHA256
      ).Hash
      $upgradeDataMarkerSha256 = (
        Get-FileHash -LiteralPath $dataMarker -Algorithm SHA256
      ).Hash
      $upgradeProfileMarkerSha256 = (
        Get-FileHash -LiteralPath $profileDataMarker -Algorithm SHA256
      ).Hash
      $receipt.upgrade.vaultKeySha256 = $upgradeVaultKeySha256
      $receipt.upgrade.configuredDataMarkerSha256 = $upgradeDataMarkerSha256
      $receipt.upgrade.profileMarkerSha256 = $upgradeProfileMarkerSha256
      $receipt.checks['previousLaunch'] = $true
    } finally {
      Stop-InstalledProcesses $appExecutable $serviceScript $managedRuntimeRoot
      Wait-ForInstalledRuntimeStop $appExecutable $serviceScript 3333 `
        -ManagedRuntimeRoot $managedRuntimeRoot -AdditionalPorts @($ollamaPort)
      $previousProcess.Dispose()
    }

    Assert-NoForeignWaggleProcesses $appExecutable
    Assert-ArtifactIdentity `
      $InstallerPath `
      $ExpectedCandidateInstallerSha256 `
      $ExpectedSignerThumbprint `
      'Candidate installer before upgrade'
    Invoke-RawProcess $InstallerPath "/S /D=$installDir" 420
    Assert-ArtifactIdentity `
      $InstallerPath `
      $ExpectedCandidateInstallerSha256 `
      $ExpectedSignerThumbprint `
      'Candidate installer after upgrade'
    Wait-ForInstalledRuntimeStop $appExecutable $serviceScript 3333 `
      -ManagedRuntimeRoot $managedRuntimeRoot -AdditionalPorts @($ollamaPort)
    Wait-ForPathState $appExecutable $true
    $upgradeRegistration = Get-ItemProperty -LiteralPath $uninstallRegistry
    Assert-True ([string]$upgradeRegistration.DisplayVersion -eq $ExpectedCandidateVersion) `
      'Candidate installer registry version does not match the protected candidate version.'
    Assert-True ([string]::Equals(
      ([string]$upgradeRegistration.InstallLocation).Trim('"'),
      $installDir,
      [System.StringComparison]::OrdinalIgnoreCase
    )) 'Upgrade changed the registered install directory.'
    Assert-True ([string]::Equals(
      [System.IO.Path]::GetFullPath(([string]$upgradeRegistration.UninstallString).Trim().Trim('"')),
      [System.IO.Path]::GetFullPath($previousRegisteredUninstaller),
      [System.StringComparison]::OrdinalIgnoreCase
    )) 'Upgrade changed the registered uninstaller location.'
    $upgradeProductRegistration = Get-Item -LiteralPath $productRegistry
    Assert-True ([string]::Equals(
      [System.IO.Path]::GetFullPath(([string]$upgradeProductRegistration.GetValue('')).Trim('"')),
      [System.IO.Path]::GetFullPath($installDir),
      [System.StringComparison]::OrdinalIgnoreCase
    )) 'Upgrade changed the product install location.'
    Assert-True (
      (Get-FileHash -LiteralPath $dataMarker -Algorithm SHA256).Hash -eq $upgradeDataMarkerSha256
    ) 'Upgrade changed or removed configured user data.'
    Assert-True (
      (Get-FileHash -LiteralPath $profileDataMarker -Algorithm SHA256).Hash -eq
        $upgradeProfileMarkerSha256
    ) 'Upgrade changed or removed the profile data marker.'
    $receipt.checks['candidateVersion'] = $true
    $receipt.checks['versionToVersionUpgrade'] = $true
    $receipt.checks['upgradeSameInstallDirectory'] = $true
    $receipt.checks['upgradeConfiguredDataPreserved'] = $true
    $receipt.checks['upgradeProfileDataPreserved'] = $true
    $receipt.checks['upgradeRegistrations'] = $true
  } else {
    Invoke-RawProcess $InstallerPath "/S /D=$installDir" 420
  }
  Wait-ForPathState $appExecutable $true
  Assert-True (Test-Path -LiteralPath $uninstaller -PathType Leaf) 'Installer did not create uninstall.exe'
  Assert-True (Test-Path -LiteralPath $serviceScript -PathType Leaf) 'Installer omitted resources/service.js'
  Assert-True (Test-Path -LiteralPath $canonicalMarketplaceDb -PathType Leaf) `
    'The tracked canonical marketplace database is missing.'
  Assert-True (Test-Path -LiteralPath $installedMarketplaceDb -PathType Leaf) `
    'Installer omitted resources\marketplace.db'
  $installedMarketplaceFile = Get-Item -LiteralPath $installedMarketplaceDb
  Assert-True (
    ($installedMarketplaceFile.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0
  ) 'Installed resources\marketplace.db must not be a reparse point.'
  $marketplaceResourceSha256 = (
    Get-FileHash -LiteralPath $canonicalMarketplaceDb -Algorithm SHA256
  ).Hash
  Assert-True (
    (Get-FileHash -LiteralPath $installedMarketplaceDb -Algorithm SHA256).Hash -eq
      $marketplaceResourceSha256
  ) 'Installed resources\marketplace.db does not match the tracked canonical database.'
  $receipt.evidence['marketplaceResourceSha256'] = $marketplaceResourceSha256
  $receipt.checks['marketplaceResource'] = $true
  Assert-True (Test-Path -LiteralPath $bundledNode -PathType Leaf) `
    'Installer omitted the bundled Node.js runtime'
  Assert-True (Test-Path -LiteralPath (Join-Path $installDir 'resources\node_modules') -PathType Container) `
    'Installer omitted staged runtime dependencies'
  $bundledRuntimeFiles = @(
    (Join-Path $bundledNpmRuntime 'package.json'),
    (Join-Path $bundledNpmRuntime 'NODE-LICENSE'),
    (Join-Path $bundledNpmRuntime 'node_modules\npm\LICENSE'),
    $bundledNpmCli,
    $bundledNpxCli,
    $bundledNpmWrapper,
    $bundledNpxWrapper
  )
  foreach ($runtimeFile in $bundledRuntimeFiles) {
    Assert-True (Test-Path -LiteralPath $runtimeFile -PathType Leaf) `
      "Installer omitted bundled npm runtime file: $runtimeFile"
  }

  $npmVersionOutput = @(& $bundledNode $bundledNpmCli --version 2>$null)
  Assert-True ($LASTEXITCODE -eq 0 -and $npmVersionOutput.Count -eq 1) `
    'Bundled npm CLI did not execute through the installed Node runtime.'
  $npxVersionOutput = @(& $bundledNode $bundledNpxCli --version 2>$null)
  Assert-True ($LASTEXITCODE -eq 0 -and $npxVersionOutput.Count -eq 1) `
    'Bundled npx CLI did not execute through the installed Node runtime.'
  $npmVersion = ([string]$npmVersionOutput[0]).Trim()
  $npxVersion = ([string]$npxVersionOutput[0]).Trim()
  Assert-True ($npmVersion -match '^\d+\.\d+\.\d+$' -and $npmVersion -eq $npxVersion) `
    "Bundled npm/npx versions do not match: npm=$npmVersion npx=$npxVersion"
  $cmdExe = Join-Path $env:SystemRoot 'System32\cmd.exe'
  Invoke-RawProcess $cmdExe ('/d /s /c ""{0}" --version"' -f $bundledNpmWrapper) 60
  Invoke-RawProcess $cmdExe ('/d /s /c ""{0}" --version"' -f $bundledNpxWrapper) 60

  $offlinePackageSource = Join-Path $scratchRoot 'offline-npm-package'
  $offlineInstallRoot = Join-Path $scratchRoot 'offline-npm-install'
  $offlineCache = Join-Path $scratchRoot 'offline-npm-cache'
  $isolatedUserConfig = Join-Path $scratchRoot 'empty-user.npmrc'
  $isolatedGlobalConfig = Join-Path $scratchRoot 'empty-global.npmrc'
  New-Item -ItemType Directory -Path @(
    $offlinePackageSource,
    $offlineInstallRoot,
    $offlineCache
  ) -Force | Out-Null
  Set-Content -LiteralPath $isolatedUserConfig -Value '' -NoNewline
  Set-Content -LiteralPath $isolatedGlobalConfig -Value '' -NoNewline
  $offlinePackageManifest = [ordered]@{
    name = 'waggle-offline-install-probe'
    version = '1.0.0'
    scripts = [ordered]@{
      install = "node -e `"require('node:fs').writeFileSync('lifecycle-ran.txt','unexpected')`""
    }
  }
  $offlinePackageManifest | ConvertTo-Json -Depth 4 |
    Set-Content -LiteralPath (Join-Path $offlinePackageSource 'package.json') -Encoding UTF8
  Assert-True (@(Get-ChildItem -LiteralPath $offlineCache -Force).Count -eq 0) `
    'Offline npm certificate cache was not clean before the probe.'
  $npmInstallOutput = @(
    & $bundledNode $bundledNpmCli install --offline --ignore-scripts --no-audit --no-fund `
      --package-lock=false --save=false --userconfig $isolatedUserConfig `
      --globalconfig $isolatedGlobalConfig --cache $offlineCache --prefix $offlineInstallRoot `
      -- $offlinePackageSource 2>&1
  )
  Assert-True ($LASTEXITCODE -eq 0) `
    "Bundled npm offline local install failed: $($npmInstallOutput -join [Environment]::NewLine)"
  $installedOfflinePackage = Join-Path $offlineInstallRoot 'node_modules\waggle-offline-install-probe'
  Assert-True (Test-Path -LiteralPath (Join-Path $installedOfflinePackage 'package.json') -PathType Leaf) `
    'Bundled npm did not install the local offline package.'
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $installedOfflinePackage 'lifecycle-ran.txt'))) `
    'Bundled npm executed a lifecycle script despite --ignore-scripts.'
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $offlinePackageSource 'lifecycle-ran.txt'))) `
    'Bundled npm executed a lifecycle script in the local package source.'
  $receipt.checks['silentInstall'] = $true
  $receipt.checks['bundledRuntimePayload'] = $true
  $receipt.checks['bundledNpmCli'] = $true
  $receipt.checks['bundledNpmWrappers'] = $true
  $receipt.checks['bundledNpmOfflineInstall'] = $true
  $receipt.checks['bundledNpmIgnoreScriptsFlagHonored'] = $true
  $receipt.bundledNpm = [ordered]@{
    version = $npmVersion
    npmCli = $bundledNpmCli
    npxCli = $bundledNpxCli
    cacheWasClean = $true
    offlinePackage = 'waggle-offline-install-probe@1.0.0'
    ignoreScriptsFlagHonored = $true
  }
  $installedAppFile = Get-Item -LiteralPath $appExecutable
  $installedAppSignature = Get-AuthenticodeSignature -LiteralPath $appExecutable
  $receipt.installedApp = [ordered]@{
    name = $installedAppFile.Name
    sha256 = (Get-FileHash -LiteralPath $appExecutable -Algorithm SHA256).Hash
    sizeBytes = $installedAppFile.Length
    authenticodeStatus = [string]$installedAppSignature.Status
    signatureType = [string]$installedAppSignature.SignatureType
    signerSubject = $null
    signerThumbprint = $null
    timestampAuthoritySubject = $null
    timestampAuthorityThumbprint = $null
    timestampAuthorityNotBefore = $null
    timestampAuthorityNotAfter = $null
  }
  if ($installedAppSignature.SignerCertificate) {
    $receipt.installedApp.signerSubject = $installedAppSignature.SignerCertificate.Subject
    $receipt.installedApp.signerThumbprint = $installedAppSignature.SignerCertificate.Thumbprint
  }
  if ($installedAppSignature.TimeStamperCertificate) {
    $receipt.installedApp.timestampAuthoritySubject = $installedAppSignature.TimeStamperCertificate.Subject
    $receipt.installedApp.timestampAuthorityThumbprint = $installedAppSignature.TimeStamperCertificate.Thumbprint
    $receipt.installedApp.timestampAuthorityNotBefore = $installedAppSignature.TimeStamperCertificate.NotBefore.ToUniversalTime().ToString('o')
    $receipt.installedApp.timestampAuthorityNotAfter = $installedAppSignature.TimeStamperCertificate.NotAfter.ToUniversalTime().ToString('o')
  }
  $receipt.checks['installedAppPayload'] = $true
  if ($RequireAuthenticodeSignature) {
    Assert-ExpectedAuthenticodeSignature $installedAppSignature $ExpectedSignerThumbprint 'Installed Waggle executable'
    $receipt.checks['installedAppAuthenticodeSignature'] = $true
    $receipt.checks['installedAppAuthenticodeSigner'] = $true
    $receipt.checks['installedAppAuthenticodeTimestamp'] = $true
  }
  if ($RequireVersionToVersionUpgrade) {
    $installedProductVersion = Get-InstalledProductVersion `
      $appExecutable 'Installed Waggle executable'
    Assert-True ($installedProductVersion.normalized -eq $ExpectedCandidateVersion) `
      'Installed candidate executable version does not match the protected candidate version.'
    $receipt.installedApp['productVersion'] = $installedProductVersion.raw
    $receipt.upgrade.observedCandidateVersion = $installedProductVersion.normalized
    Assert-True ([string]::Equals(
      [string]$receipt.previousInstaller.signerThumbprint,
      [string]$receipt.installer.signerThumbprint,
      [System.StringComparison]::OrdinalIgnoreCase
    ) -and [string]::Equals(
      [string]$receipt.previousInstalledApp.signerThumbprint,
      [string]$receipt.installedApp.signerThumbprint,
      [System.StringComparison]::OrdinalIgnoreCase
    )) 'Previous and candidate artifacts are not signed by the same approved signer.'
    $receipt.checks['sameApprovedSigner'] = $true
  }

  $registered = Get-ItemProperty -LiteralPath $uninstallRegistry
  Assert-True (
    [string]::Equals(
      ([string]$registered.InstallLocation).Trim('"'),
      $installDir,
      [System.StringComparison]::OrdinalIgnoreCase
    )
  ) 'Installer registry location does not match the isolated target'
  $registeredUninstallerCommand = ([string]$registered.UninstallString).Trim()
  Assert-True (
    $registeredUninstallerCommand.StartsWith('"') -and $registeredUninstallerCommand.EndsWith('"')
  ) 'Installer registered an ambiguous uninstall command'
  $registeredUninstaller = $registeredUninstallerCommand.Trim('"')
  Assert-True (
    [string]::Equals(
      [System.IO.Path]::GetFullPath($registeredUninstaller),
      [System.IO.Path]::GetFullPath($uninstaller),
      [System.StringComparison]::OrdinalIgnoreCase
    )
  ) 'Installer registry uninstall command does not target the isolated uninstaller'
  $receipt.checks['uninstallRegistration'] = $true
  $receipt.checks['registeredUninstaller'] = $true
  $productRegistration = Get-Item -LiteralPath $productRegistry
  Assert-True (
    [string]::Equals(
      [System.IO.Path]::GetFullPath(([string]$productRegistration.GetValue('')).Trim('"')),
      [System.IO.Path]::GetFullPath($installDir),
      [System.StringComparison]::OrdinalIgnoreCase
    )
  ) 'Installer product metadata does not match the isolated target'
  $receipt.checks['productRegistration'] = $true

  $desktopShortcut = $shortcutCandidates[0]
  $startMenuShortcuts = @(
    $shortcutCandidates | Select-Object -Skip 1 | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf }
  )
  Assert-True (Test-Path -LiteralPath $desktopShortcut -PathType Leaf) `
    'Installer did not create the desktop shortcut'
  Assert-True ($startMenuShortcuts.Count -ge 1) 'Installer did not create a Start Menu shortcut'
  $installedShortcuts = @($desktopShortcut) + $startMenuShortcuts
  Assert-ShortcutTargets $installedShortcuts $appExecutable
  $receipt.checks['shortcuts'] = $true

  $baseUrl = "http://127.0.0.1:$($env:WAGGLE_PORT)"
  Assert-TcpPortAvailable 3333
  $firstProcess = Start-InstalledApp $appExecutable
  try {
    $health = Wait-ForHealth $baseUrl $StartupTimeoutSeconds
    $firstProcess.Refresh()
    Assert-True (-not $firstProcess.HasExited) 'The installed desktop process exited during first boot'
    $sidecarNpmPrefix = Join-Path $dataDir 'npm\prefix'
    $sidecarNpmCache = Join-Path $dataDir 'npm\cache'
    Assert-True (Test-Path -LiteralPath $sidecarNpmPrefix -PathType Container) `
      'First boot did not create the sidecar npm prefix directory.'
    Assert-True (Test-Path -LiteralPath $sidecarNpmCache -PathType Container) `
      'First boot did not create the sidecar npm cache directory.'
    $receipt.checks['sidecarNpmDataDirectories'] = $true
    $vaultKeyPath = Join-Path $dataDir '.vault-key'
    Assert-VaultKeyAclRestricted $vaultKeyPath
    $receipt.checks['vaultKeyAclRestricted'] = $true
    if ($RequireVersionToVersionUpgrade) {
      Assert-True (
        (Get-FileHash -LiteralPath $vaultKeyPath -Algorithm SHA256).Hash -eq $upgradeVaultKeySha256
      ) 'Upgrade changed the existing Windows vault key.'
      Assert-True (
        (Get-FileHash -LiteralPath $dataMarker -Algorithm SHA256).Hash -eq $upgradeDataMarkerSha256
      ) 'Candidate launch changed or removed configured user data.'
      Assert-True (
        (Get-FileHash -LiteralPath $profileDataMarker -Algorithm SHA256).Hash -eq
          $upgradeProfileMarkerSha256
      ) 'Candidate launch changed or removed the profile data marker.'
      $receipt.checks['upgradeVaultKeyPreserved'] = $true
      $receipt.checks['candidateLaunch'] = $true
      $receipt.checks['relaunchAfterUpgrade'] = $true
    }
    $proxy = Invoke-JsonRequest "$baseUrl/v1/health/liveliness"
    Assert-True ($proxy.status -eq 'healthy') 'Built-in provider proxy is not healthy'
    Assert-True ((Get-HttpStatusCode "$baseUrl/api/tier") -eq 401) `
      'A protected API route did not reject an unauthenticated loopback request'
    $receipt.checks['unauthenticatedProtectedRoute'] = $true
    $tokenResponse = Invoke-JsonRequest "$baseUrl/api/auth/session-token"
    Assert-True (-not [string]::IsNullOrWhiteSpace([string]$tokenResponse.token)) `
      'Session-token bootstrap returned no token'
    $headers = @{ Authorization = "Bearer $($tokenResponse.token)" }
    $null = Invoke-JsonRequest "$baseUrl/api/tier" $headers
    $marketplace = Invoke-JsonRequest `
      "$baseUrl/api/marketplace/search?type=mcp&source=mcp_registry&limit=100" `
      $headers
    $marketplacePackages = @($marketplace.packages)
    Assert-True ($marketplacePackages.Count -ge 1) `
      'Clean installed marketplace API returned no trusted MCP catalog entries.'
    $marketplaceNames = @($marketplacePackages | ForEach-Object { [string]$_.name })
    Assert-True ($marketplaceNames -contains 'memory') `
      'Clean installed marketplace API did not return the canonical memory MCP.'
    Assert-True (Test-Path -LiteralPath $writableMarketplaceDb -PathType Leaf) `
      'First boot did not create the writable marketplace database.'
    Assert-True (
      (Get-FileHash -LiteralPath $installedMarketplaceDb -Algorithm SHA256).Hash -eq
        $marketplaceResourceSha256
    ) 'First boot modified the immutable resources\marketplace.db payload.'
    $receipt.checks['marketplaceApi'] = $true
    $chatProbeMessage = "installer-certificate-no-model-$runId"
    $chatResponse = Invoke-JsonPostRequest "$baseUrl/api/chat" @{
      message = $chatProbeMessage
      sessionId = "installer-certificate-no-model-$runId"
    } $headers
    $chatContent = [string]$chatResponse.Content
    Assert-True ([int]$chatResponse.StatusCode -eq 200) `
      'Clean no-model chat did not return HTTP 200.'
    Assert-True (
      ([string]$chatResponse.Headers['Content-Type']).StartsWith('text/event-stream')
    ) 'Clean no-model chat did not return an SSE stream.'
    Assert-True ([regex]::Matches(
      $chatContent,
      '(?m)^event:[ \t]*done[ \t]*\r?$'
    ).Count -eq 1) 'Clean no-model chat did not complete with exactly one done event.'
    Assert-True (-not ($chatContent -match '(?m)^event:[ \t]*error[ \t]*\r?$')) `
      'Clean no-model chat emitted an error event.'
    Assert-True ($chatContent.Contains('No AI model is ready')) `
      'Clean no-model chat did not report that model setup is required.'
    Assert-True (-not $chatContent.Contains($chatProbeMessage)) `
      'Clean no-model chat echoed the prompt instead of reporting setup-required state.'
    $receipt.checks['noModelChatSetupRequired'] = $true
    $embedding = Invoke-JsonRequest "$baseUrl/api/embedding/status" $headers
    Assert-True ($embedding.activeProvider -eq 'inprocess') `
      "Clean install did not load the in-process embedding model: $($embedding.activeProvider)"
    Assert-True ($embedding.modelName -eq 'Xenova/all-MiniLM-L6-v2') `
      "Clean install loaded an unexpected embedding model: $($embedding.modelName)"
    $embeddingModelPath = Join-Path $dataDir 'models\Xenova\all-MiniLM-L6-v2\onnx\model.onnx'
    Assert-True (Test-Path -LiteralPath $embeddingModelPath -PathType Leaf) `
      'In-process embedding model reported ready without a model payload'
    $embeddingModelFile = Get-Item -LiteralPath $embeddingModelPath
    Assert-True ($embeddingModelFile.Length -gt 10MB) 'Downloaded embedding model payload is unexpectedly small'
    $localInference = Invoke-JsonRequest "$baseUrl/api/local-inference/status" $headers
    Assert-True ($localInference.dockerRequired -eq $false) 'Local inference incorrectly requires Docker'
    Assert-True ($localInference.managedRuntime.supported -eq $true) `
      'Managed local inference runtime is not supported by the packaged Windows app'
    if ($VerifyManagedModel) {
      $managedCertificateModel = 'qwen2.5:0.5b'
      $managedOperationTimeoutSeconds = 3600
      $bootstrapResponse = Invoke-JsonPostRequest `
        "$baseUrl/api/local-inference/bootstrap" `
        @{} `
        $headers `
        $managedOperationTimeoutSeconds
      $bootstrap = $bootstrapResponse.Content | ConvertFrom-Json
      Assert-True ([int]$bootstrapResponse.StatusCode -eq 200 -and $bootstrap.ok -eq $true) `
        'The packaged managed local runtime did not bootstrap successfully.'
      Assert-True ($bootstrap.dockerRequired -eq $false) `
        'The packaged managed local runtime unexpectedly requires Docker.'
      $receipt.checks['managedRuntimeBootstrap'] = $true

      $pullResponse = Invoke-JsonPostRequest `
        "$baseUrl/api/local-inference/pull" `
        @{ model = $managedCertificateModel } `
        $headers `
        $managedOperationTimeoutSeconds
      $pull = $pullResponse.Content | ConvertFrom-Json
      Assert-True (
        [int]$pullResponse.StatusCode -eq 200 -and
        $pull.ok -eq $true -and
        $pull.verifiedGeneration -eq $true
      ) 'The managed local model did not complete its generation probe.'
      Assert-True (-not [string]::IsNullOrWhiteSpace([string]$pull.model)) `
        'The managed local model pull returned no installed model identity.'
      Assert-True ([string]$pull.digest -match '^sha256:[0-9a-f]{64}$') `
        'The managed local model pull returned no immutable manifest digest.'
      $receipt.checks['managedModelPull'] = $true

      $managedStatus = Invoke-JsonRequest "$baseUrl/api/local-inference/status" $headers
      Assert-True ($managedStatus.offlineReady -eq $true) `
        'The managed local model was pulled but offline readiness is false.'
      Assert-True ([int]$managedStatus.totalLocalModels -ge 1) `
        'The managed runtime did not advertise an installed local model.'
      $localChatResponse = Invoke-JsonPostRequest "$baseUrl/api/chat" @{
        message = 'Reply with one short sentence confirming that local inference works.'
        model = "ollama/$($pull.model)"
        sessionId = "installer-certificate-managed-model-$runId"
      } $headers 300
      $localChatContent = [string]$localChatResponse.Content
      Assert-True ([int]$localChatResponse.StatusCode -eq 200) `
        'Managed local-model chat did not return HTTP 200.'
      Assert-True (
        ([string]$localChatResponse.Headers['Content-Type']).StartsWith('text/event-stream')
      ) 'Managed local-model chat did not return an SSE stream.'
      Assert-True (-not ($localChatContent -match '(?m)^event:[ \t]*error[ \t]*\r?$')) `
        'Managed local-model chat emitted an error event.'
      Assert-True (-not $localChatContent.Contains('No AI model is ready')) `
        'Managed local-model chat fell back to setup-required mode.'
      $localDoneMatches = [regex]::Matches(
        $localChatContent,
        '(?m)^event:[ \t]*done[ \t]*\r?\ndata:[ \t]*(?<data>[^\r\n]+)\r?$'
      )
      Assert-True ($localDoneMatches.Count -eq 1) `
        'Managed local-model chat did not complete with exactly one done event.'
      $localDone = $localDoneMatches[0].Groups['data'].Value | ConvertFrom-Json
      Assert-True (-not [string]::IsNullOrWhiteSpace([string]$localDone.content)) `
        'Managed local-model chat completed without response content.'
      Assert-True ([string]$localDone.model -eq "ollama/$($pull.model)") `
        'Managed local-model chat reported a model other than the requested local model.'
      $receipt.managedModelVerified = $true
      $receipt.managedModelDigest = [string]$pull.digest
      $receipt.managedModel = [ordered]@{
        name = [string]$pull.model
        manifestDigest = [string]$pull.digest
        pullGenerationVerified = $true
        chatResponseChars = ([string]$localDone.content).Length
      }
      $receipt.checks['managedModelChat'] = $true
    }
    $receipt.checks['firstBoot'] = $true
    $receipt.checks['database'] = $health.database.healthy
    $receipt.checks['builtInProxyLiveness'] = $true
    $receipt.checks['sessionAuth'] = $true
    $receipt.embeddingPayloadReady = $true
    $receipt.embeddingPayload = [ordered]@{
      name = $embedding.modelName
      sizeBytes = $embeddingModelFile.Length
    }
    $receipt.checks['embeddingPayloadReady'] = $true
    $receipt.checks['dockerIndependentRuntimePrerequisites'] = $true
    if ($RequireVersionToVersionUpgrade) {
      Assert-True (
        (Get-FileHash -LiteralPath (Join-Path $dataDir '.vault-key') -Algorithm SHA256).Hash -eq
          $upgradeVaultKeySha256
      ) 'Candidate activity changed the upgraded Windows vault key.'
      Assert-True (
        (Get-FileHash -LiteralPath $dataMarker -Algorithm SHA256).Hash -eq
          $upgradeDataMarkerSha256
      ) 'Candidate activity changed or removed upgraded user data.'
      Assert-True (
        (Get-FileHash -LiteralPath $profileDataMarker -Algorithm SHA256).Hash -eq
          $upgradeProfileMarkerSha256
      ) 'Candidate activity changed or removed upgraded profile data.'
    } else {
      New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
      Set-Content -LiteralPath $dataMarker -Value $runId -Encoding UTF8
    }
  } finally {
    Stop-InstalledProcesses $appExecutable $serviceScript $managedRuntimeRoot
    Wait-ForInstalledRuntimeStop $appExecutable $serviceScript 3333 `
      -ManagedRuntimeRoot $managedRuntimeRoot -AdditionalPorts @($ollamaPort)
    $firstProcess.Dispose()
  }

  # Prove a same-version repair actually restores installed bytes instead of
  # merely returning success while leaving a stale payload in place.
  $serviceHash = (Get-FileHash -LiteralPath $serviceScript -Algorithm SHA256).Hash
  Set-Content -LiteralPath $serviceScript -Value '// deliberately corrupted by installer certificate' -Encoding UTF8
  Set-Content -LiteralPath $installedMarketplaceDb `
    -Value 'deliberately corrupted by installer certificate' -Encoding UTF8
  Assert-True ((Get-FileHash -LiteralPath $serviceScript -Algorithm SHA256).Hash -ne $serviceHash) `
    'Could not prepare the repair probe'
  Assert-True (
    (Get-FileHash -LiteralPath $installedMarketplaceDb -Algorithm SHA256).Hash -ne
      $marketplaceResourceSha256
  ) 'Could not prepare the marketplace repair probe'
  Assert-NoForeignWaggleProcesses $appExecutable
  if ($RequireVersionToVersionUpgrade) {
    Assert-ArtifactIdentity `
      $InstallerPath `
      $ExpectedCandidateInstallerSha256 `
      $ExpectedSignerThumbprint `
      'Candidate installer before repair'
  }
  Invoke-RawProcess $InstallerPath "/S /D=$installDir" 420
  if ($RequireVersionToVersionUpgrade) {
    Assert-ArtifactIdentity `
      $InstallerPath `
      $ExpectedCandidateInstallerSha256 `
      $ExpectedSignerThumbprint `
      'Candidate installer after repair'
  }
  Wait-ForInstalledRuntimeStop $appExecutable $serviceScript 3333 `
    -ManagedRuntimeRoot $managedRuntimeRoot -AdditionalPorts @($ollamaPort)
  Assert-True ((Get-FileHash -LiteralPath $serviceScript -Algorithm SHA256).Hash -eq $serviceHash) `
    'Same-version repair did not restore resources/service.js'
  Assert-True (
    (Get-FileHash -LiteralPath $installedMarketplaceDb -Algorithm SHA256).Hash -eq
      $marketplaceResourceSha256
  ) 'Same-version repair did not restore resources/marketplace.db'
  Assert-True (Test-Path -LiteralPath $dataMarker -PathType Leaf) 'Repair removed user data'
  if ($RequireVersionToVersionUpgrade) {
    Assert-True (
      (Get-FileHash -LiteralPath (Join-Path $dataDir '.vault-key') -Algorithm SHA256).Hash -eq
        $upgradeVaultKeySha256
    ) 'Same-version repair changed the upgraded Windows vault key.'
    Assert-True (
      (Get-FileHash -LiteralPath $dataMarker -Algorithm SHA256).Hash -eq $upgradeDataMarkerSha256
    ) 'Same-version repair changed upgraded user data.'
    Assert-True (
      (Get-FileHash -LiteralPath $profileDataMarker -Algorithm SHA256).Hash -eq
        $upgradeProfileMarkerSha256
    ) 'Same-version repair changed upgraded profile data.'
  }
  $repairRegistration = Get-ItemProperty -LiteralPath $uninstallRegistry
  Assert-True (
    [string]::Equals(
      ([string]$repairRegistration.InstallLocation).Trim('"'),
      $installDir,
      [System.StringComparison]::OrdinalIgnoreCase
    )
  ) 'Repair changed the registered install location'
  Assert-True (
    [string]::Equals(
      [System.IO.Path]::GetFullPath(([string]$repairRegistration.UninstallString).Trim().Trim('"')),
      [System.IO.Path]::GetFullPath($registeredUninstaller),
      [System.StringComparison]::OrdinalIgnoreCase
    )
  ) 'Repair changed the registered uninstaller'
  $repairProductRegistration = Get-Item -LiteralPath $productRegistry
  Assert-True (
    [string]::Equals(
      [System.IO.Path]::GetFullPath(([string]$repairProductRegistration.GetValue('')).Trim('"')),
      [System.IO.Path]::GetFullPath($installDir),
      [System.StringComparison]::OrdinalIgnoreCase
    )
  ) 'Repair changed the product install location'
  foreach ($shortcut in $installedShortcuts) {
    Assert-True (Test-Path -LiteralPath $shortcut -PathType Leaf) `
      "Repair removed an installed shortcut: $shortcut"
  }
  Assert-ShortcutTargets $installedShortcuts $appExecutable
  $receipt.checks['sameVersionRepair'] = $true
  $receipt.checks['repairPreservedData'] = $true
  $receipt.checks['repairRegistrations'] = $true

  $secondProcess = Start-InstalledApp $appExecutable
  try {
    $null = Wait-ForHealth $baseUrl $StartupTimeoutSeconds
    $secondProcess.Refresh()
    Assert-True (-not $secondProcess.HasExited) 'The installed desktop process exited after repair'
    $receipt.checks['relaunchAfterRepair'] = $true
  } finally {
    Stop-InstalledProcesses $appExecutable $serviceScript $managedRuntimeRoot
    Wait-ForInstalledRuntimeStop $appExecutable $serviceScript 3333 `
      -ManagedRuntimeRoot $managedRuntimeRoot -AdditionalPorts @($ollamaPort)
    $secondProcess.Dispose()
  }

  Assert-NoForeignWaggleProcesses $appExecutable
  Invoke-RawProcess $registeredUninstaller '/S' 300
  Wait-ForPathState $installDir $false 90
  # NSIS copies the uninstaller to a temporary process. The launcher can exit
  # and the install directory can disappear before that process finishes the
  # registry and shortcut tail, so wait on the actual postconditions.
  Wait-ForPathState $uninstallRegistry $false 30
  Assert-True (-not (Test-RegistryValue $runRegistry $runRegistryValue)) `
    'Silent uninstall left or replaced the Waggle autostart entry'
  foreach ($shortcut in $installedShortcuts) {
    Wait-ForPathState $shortcut $false 30
  }
  $receipt.checks['uninstallerCleanup'] = $true
  Remove-CertificateProductRegistry $productRegistry $installDir
  Wait-ForPathState $productRegistry $false 30
  Wait-ForInstalledRuntimeStop $appExecutable $serviceScript 3333 `
    -ManagedRuntimeRoot $managedRuntimeRoot -AdditionalPorts @($ollamaPort)
  if ($VerifyManagedModel) {
    $receipt.checks['managedRuntimeCleanup'] = $true
  }
  $installerStarted = $false
  Assert-True (Test-Path -LiteralPath $dataMarker -PathType Leaf) `
    'Silent uninstall did not preserve user data by default'
  Assert-True (Test-Path -LiteralPath $profileDataMarker -PathType Leaf) `
    'Silent uninstall removed the Windows profile data path'
  Assert-True ((Get-Content -Raw -LiteralPath $profileDataMarker).Trim() -eq $runId) `
    'Silent uninstall changed the Windows profile data marker'
  if ($RequireVersionToVersionUpgrade) {
    Assert-True (
      (Get-FileHash -LiteralPath (Join-Path $dataDir '.vault-key') -Algorithm SHA256).Hash -eq
        $upgradeVaultKeySha256
    ) 'Silent uninstall changed the upgraded Windows vault key.'
    Assert-True (
      (Get-FileHash -LiteralPath $dataMarker -Algorithm SHA256).Hash -eq $upgradeDataMarkerSha256
    ) 'Silent uninstall changed upgraded user data.'
    Assert-True (
      (Get-FileHash -LiteralPath $profileDataMarker -Algorithm SHA256).Hash -eq
        $upgradeProfileMarkerSha256
    ) 'Silent uninstall changed upgraded profile data.'
  }
  $receipt.checks['silentUninstall'] = $true
  $receipt.checks['certificateRegistryCleanup'] = $true
  $receipt.checks['configuredDataDirPreserved'] = $true
  $receipt.checks['profileDataPathPreserved'] = $true
  Remove-CertificateProfileMarker $profileDataDir $profileDataMarker $runId
  $profileMarkerOwned = $false
  $receipt.status = 'passed'
} catch {
  $receipt.status = 'failed'
  $receipt.error = $_.Exception.Message
  $serverLog = Join-Path $dataDir 'server.log'
  if (Test-Path -LiteralPath $serverLog -PathType Leaf) {
    $receipt['serverLogTail'] = @(Get-Content -LiteralPath $serverLog -Tail 80)
  }
  throw
} finally {
  try {
    Stop-InstalledProcesses $appExecutable $serviceScript $managedRuntimeRoot
    if ($receipt.status -eq 'passed') {
      Wait-ForInstalledRuntimeStop $appExecutable $serviceScript 3333 `
        -ManagedRuntimeRoot $managedRuntimeRoot -AdditionalPorts @($ollamaPort)
    }
  } catch {
    $receipt.status = 'failed'
    $receipt['runtimeCleanupError'] = $_.Exception.Message
  }
  if (Test-Path -LiteralPath $uninstaller -PathType Leaf) {
    try {
      Assert-NoForeignWaggleProcesses $appExecutable
      Invoke-RawProcess $uninstaller '/S' 300
      Wait-ForPathState $installDir $false 90
      Wait-ForInstalledRuntimeStop $appExecutable $serviceScript 3333 `
        -ManagedRuntimeRoot $managedRuntimeRoot -AdditionalPorts @($ollamaPort)
    } catch {
      $receipt.status = 'failed'
      $receipt['uninstallerCleanupError'] = $_.Exception.Message
    }
  }
  if ($installerStarted) {
    try {
      Remove-CertificateProductRegistry $productRegistry $installDir
    } catch {
      $receipt.status = 'failed'
      $receipt['cleanupError'] = $_.Exception.Message
    }
  }
  if ($profileMarkerOwned) {
    try {
      Remove-CertificateProfileMarker $profileDataDir $profileDataMarker $runId
      $profileMarkerOwned = $false
    } catch {
      $receipt.status = 'failed'
      $receipt['profileCleanupError'] = $_.Exception.Message
    }
  }
  if ($receipt.status -eq 'passed' -and -not $KeepArtifacts) {
    try {
      Assert-SafeScratchRoot $scratchRoot
      Remove-Item -LiteralPath $scratchRoot -Recurse -Force
    } catch {
      $receipt.status = 'failed'
      $receipt['scratchCleanupError'] = $_.Exception.Message
    }
  }
  try {
    foreach ($name in $isolatedEnvironmentNames) {
      [Environment]::SetEnvironmentVariable($name, $environmentSnapshot[$name], 'Process')
    }
    $receipt.checks['environmentRestored'] = $true
  } catch {
    $receipt.status = 'failed'
    $receipt['environmentRestoreError'] = $_.Exception.Message
  }
  $receipt.finishedAt = [DateTime]::UtcNow.ToString('o')
  $receipt['durationSeconds'] = [Math]::Round(([DateTime]::UtcNow - $startedAt).TotalSeconds, 3)
  $receiptDirectory = Split-Path -Parent $ReceiptPath
  New-Item -ItemType Directory -Path $receiptDirectory -Force | Out-Null
  $receipt | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ReceiptPath -Encoding UTF8
}

if ($receipt.status -ne 'passed') {
  $failureDetail = if ($receipt.error) {
    $receipt.error
  } elseif ($receipt.Contains('environmentRestoreError')) {
    $receipt['environmentRestoreError']
  } else {
    'unknown failure'
  }
  throw "Windows installer certificate failed: $failureDetail"
}
Write-Host "Windows installer certificate passed: $ReceiptPath"
