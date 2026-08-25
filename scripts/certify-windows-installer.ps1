#Requires -Version 7.0

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

  [string]$ExpectedSignerSubject,

  [string]$ExpectedSourceRevision,

  [int]$WebViewDebugPort = 0,

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

function Assert-CleanRepositoryWorktree {
  param(
    [Parameter(Mandatory = $true)] [string]$GitExecutable,
    [Parameter(Mandatory = $true)] [string]$RepositoryRoot
  )

  $sourceStatus = @(
    & $GitExecutable -C $RepositoryRoot status --porcelain=v1 --untracked-files=all
  )
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not inspect the repository source state.'
  }
  if ($sourceStatus.Count -ne 0) {
    $sourceDetails = ($sourceStatus | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
    throw "Installer certification requires the complete repository worktree to match the expected revision.$([Environment]::NewLine)$sourceDetails"
  }
}

function Test-CertificateTimestamp {
  param([AllowNull()] [object]$Value)

  if ($null -eq $Value) { return $false }
  if ($Value -is [DateTime] -or $Value -is [DateTimeOffset]) { return $true }

  $text = [string]$Value
  if ([string]::IsNullOrWhiteSpace($text)) { return $false }

  $parsed = [DateTimeOffset]::MinValue
  return [DateTimeOffset]::TryParse(
    $text,
    [Globalization.CultureInfo]::InvariantCulture,
    [Globalization.DateTimeStyles]::RoundtripKind,
    [ref]$parsed
  )
}

function Assert-ExpectedAuthenticodeSignature {
  param(
    [Parameter(Mandatory = $true)] [object]$Signature,
    [AllowEmptyString()] [string]$ExpectedThumbprint,
    [AllowEmptyString()] [string]$ExpectedSubject,
    [Parameter(Mandatory = $true)] [string]$ArtifactLabel
  )

  $hasExpectedThumbprint = -not [string]::IsNullOrWhiteSpace($ExpectedThumbprint)
  $hasExpectedSubject = -not [string]::IsNullOrWhiteSpace($ExpectedSubject)
  Assert-True ($hasExpectedThumbprint -xor $hasExpectedSubject) `
    'Exactly one expected signer identity binding is required.'
  Assert-True ([string]$Signature.SignatureType -eq 'Authenticode') `
    "$ArtifactLabel does not contain a portable embedded Authenticode signature."
  Assert-True ($Signature.Status -eq [System.Management.Automation.SignatureStatus]::Valid) `
    "$ArtifactLabel Authenticode signature is not valid: $($Signature.Status)"
  Assert-True ($null -ne $Signature.SignerCertificate) `
    "$ArtifactLabel has no Authenticode signer certificate."
  if ($hasExpectedThumbprint) {
    $normalizedExpectedThumbprint = ($ExpectedThumbprint -replace '\s', '').ToUpperInvariant()
    Assert-True ($normalizedExpectedThumbprint -match '^[0-9A-F]{40}$') `
      'Expected signer thumbprint must be exactly 40 hexadecimal characters.'
    Assert-True (
      [string]::Equals(
        ($Signature.SignerCertificate.Thumbprint -replace '\s', '').ToUpperInvariant(),
        $normalizedExpectedThumbprint,
        [System.StringComparison]::Ordinal
      )
    ) "$ArtifactLabel signer does not match the imported production certificate."
  } else {
    Assert-True (
      [string]::Equals(
        [string]$Signature.SignerCertificate.Subject,
        $ExpectedSubject,
        [System.StringComparison]::Ordinal
      )
    ) "$ArtifactLabel signer subject does not match the approved production identity."
  }
  Assert-True ($null -ne $Signature.TimeStamperCertificate) `
    "$ArtifactLabel has no validated Authenticode timestamp certificate."
}

function Assert-LifecycleReceiptApprovedSigner {
  param(
    [Parameter(Mandatory = $true)] [object]$Receipt,
    [AllowEmptyString()] [string]$ExpectedThumbprint,
    [AllowEmptyString()] [string]$ExpectedSubject
  )

  $hasExpectedThumbprint = -not [string]::IsNullOrWhiteSpace($ExpectedThumbprint)
  $hasExpectedSubject = -not [string]::IsNullOrWhiteSpace($ExpectedSubject)
  Assert-True ($hasExpectedThumbprint -xor $hasExpectedSubject) `
    'Exactly one expected signer identity binding is required.'
  $expectedSigner = if ($hasExpectedSubject) {
    $ExpectedSubject
  } else {
    $normalizedExpectedThumbprint = ($ExpectedThumbprint -replace '\s', '').ToUpperInvariant()
    Assert-True ($normalizedExpectedThumbprint -match '^[0-9A-F]{40}$') `
      'Expected signer thumbprint must be exactly 40 hexadecimal characters.'
    $normalizedExpectedThumbprint
  }
  $comparison = if ($hasExpectedSubject) {
    [System.StringComparison]::Ordinal
  } else {
    [System.StringComparison]::OrdinalIgnoreCase
  }
  foreach ($artifact in @(
    $Receipt.previousInstaller,
    $Receipt.previousInstalledApp,
    $Receipt.installer,
    $Receipt.installedApp
  )) {
    $actualSigner = if ($hasExpectedSubject) {
      [string]$artifact.signerSubject
    } else {
      [string]$artifact.signerThumbprint
    }
    Assert-True ([string]::Equals(
      $actualSigner,
      $expectedSigner,
      $comparison
    )) 'Previous and candidate artifacts are not signed by the same approved signer.'
  }
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
    [AllowEmptyString()] [string]$ExpectedSignerThumbprint,
    [AllowEmptyString()] [string]$ExpectedSignerSubject,
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
  Assert-ExpectedAuthenticodeSignature `
    $signature $ExpectedSignerThumbprint $ExpectedSignerSubject $ArtifactLabel
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
    'WINDOWS_CODESIGN_APPROVED_SUBJECT', 'WINDOWS_CODESIGN_APPROVED_THUMBPRINT',
    'WINDOWS_UPGRADE_BASE_SHA256', 'WAGGLE_APPROVED_CODESIGN_SUBJECT',
    'WAGGLE_APPROVED_CODESIGN_THUMBPRINT', 'WAGGLE_CODESIGN_SUBJECT',
    'WAGGLE_CODESIGN_THUMBPRINT', 'WAGGLE_RELEASE_VERSION'
  )
  foreach ($name in @($Info.Environment.Keys)) {
    if ($name -match '^(?:ACTIONS_|GITHUB_|RUNNER_|WAGGLE_UPGRADE_BASE_)' -or
        $explicitNames -contains $name) {
      $null = $Info.Environment.Remove($name)
    }
  }
}

function Test-TcpPortHasListener {
  param([Parameter(Mandatory = $true)] [int]$Port)

  return @(
    [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() |
      Where-Object { $_.Port -eq $Port }
  ).Count -gt 0
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
  param(
    [Parameter(Mandatory = $true)] [string]$ExecutablePath,
    [ValidateRange(1024, 65535)] [int]$DebugPort = 0
  )

  $info = [System.Diagnostics.ProcessStartInfo]::new()
  $info.FileName = $ExecutablePath
  $info.UseShellExecute = $false
  $info.WorkingDirectory = Split-Path -Parent $ExecutablePath
  Remove-CertificationControlEnvironment $info
  if ($DebugPort -gt 0) {
    $info.Environment['WAGGLE_CERTIFIER_WEBVIEW_DEBUG_PORT'] = [string]$DebugPort
  }
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $info
  Assert-True ($process.Start()) "Could not start installed Waggle: $ExecutablePath"
  return $process
}

function Invoke-JsonRequest {
  param(
    [Parameter(Mandatory = $true)] [string]$Uri,
    [hashtable]$Headers = @{},
    [ValidateRange(1, 30)] [int]$TimeoutSeconds = 5
  )

  return Invoke-RestMethod -Uri $Uri -Method Get -Headers $Headers -TimeoutSec $TimeoutSeconds
}

function Invoke-BuiltInProxyLivenessProbe {
  param(
    [Parameter(Mandatory = $true)] [string]$Uri,
    [ValidateRange(1, 30)] [int]$AttemptTimeoutSeconds = 5,
    [ValidateRange(1, 2)] [int]$MaxAttempts = 2,
    [ValidateRange(0, 2000)] [int]$RetryDelayMilliseconds = 250
  )

  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt += 1) {
    try {
      return Invoke-JsonRequest -Uri $Uri -TimeoutSeconds $AttemptTimeoutSeconds
    } catch {
      if ($attempt -ge $MaxAttempts) { throw }
      if ($RetryDelayMilliseconds -gt 0) {
        Start-Sleep -Milliseconds $RetryDelayMilliseconds
      }
    }
  }
}

function Test-TransientLoopbackRequestFailure {
  param(
    [Parameter(Mandatory = $true)]
    [System.Management.Automation.ErrorRecord]$ErrorRecord
  )

  $responseProperty = $ErrorRecord.Exception.PSObject.Properties['Response']
  if ($null -ne $responseProperty) {
    $response = $responseProperty.Value
    try {
      return @(408, 425, 429, 500, 502, 503, 504) -contains [int]$response.StatusCode
    } catch {
      return $false
    }
  }

  $exception = $ErrorRecord.Exception
  return (
    $exception -is [System.Net.Http.HttpRequestException] -or
    $exception -is [System.Net.WebException] -or
    $exception -is [System.Threading.Tasks.TaskCanceledException] -or
    $exception -is [System.TimeoutException]
  )
}

function Invoke-SessionTokenBootstrapProbe {
  param(
    [Parameter(Mandatory = $true)] [string]$Uri,
    [hashtable]$Headers = @{},
    [ValidateRange(1, 30)] [int]$AttemptTimeoutSeconds = 5,
    [ValidateRange(1, 2)] [int]$MaxAttempts = 2,
    [ValidateRange(0, 2000)] [int]$RetryDelayMilliseconds = 250
  )

  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt += 1) {
    try {
      return Invoke-JsonRequest `
        -Uri $Uri `
        -Headers $Headers `
        -TimeoutSeconds $AttemptTimeoutSeconds
    } catch {
      if (
        $attempt -ge $MaxAttempts -or
        -not (Test-TransientLoopbackRequestFailure -ErrorRecord $_)
      ) {
        throw
      }
      if ($RetryDelayMilliseconds -gt 0) {
        Start-Sleep -Milliseconds $RetryDelayMilliseconds
      }
    }
  }
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

function Get-CertificateSessionHeaders {
  param(
    [Parameter(Mandatory = $true)] [string]$BaseUrl,
    [Parameter(Mandatory = $true)] [string]$NodeExecutable,
    [Parameter(Mandatory = $true)] [string]$BootstrapHelperPath,
    [ValidateRange(1024, 65535)] [int]$DebugPort,
    [switch]$AllowLegacyUi
  )

  Assert-True (Test-Path -LiteralPath $BootstrapHelperPath -PathType Leaf) `
    'Tauri bootstrap helper is missing.'
  $stderrPath = Join-Path ([System.IO.Path]::GetTempPath()) `
    "waggle-bootstrap-token-$([Guid]::NewGuid().ToString('N')).stderr.log"
  $tokenResponse = $null
  try {
    $helperArguments = @(
      '--experimental-websocket',
      $BootstrapHelperPath,
      '--port',
      [string]$DebugPort,
      '--timeout-ms',
      '60000'
    )
    if ($AllowLegacyUi) { $helperArguments += '--allow-legacy-ui' }
    $tokenJson = & $NodeExecutable @helperArguments 2> $stderrPath
    $tokenExitCode = $LASTEXITCODE
    $tokenErrorRaw = if (Test-Path -LiteralPath $stderrPath) {
      Get-Content -Raw -LiteralPath $stderrPath
    } else {
      ''
    }
    $tokenError = (@($tokenErrorRaw) -join [Environment]::NewLine).Trim()
    Assert-True ($tokenExitCode -eq 0) `
      "Tauri bootstrap IPC helper failed: $tokenError"
    $tokenJsonText = ([string](@($tokenJson) -join [Environment]::NewLine)).Trim()
    $tokenPayload = $null
    if (-not [string]::IsNullOrWhiteSpace($tokenJsonText)) {
      try {
        $tokenPayload = ConvertFrom-Json -InputObject $tokenJsonText -ErrorAction Stop
      } catch {
        $tokenPayload = $null
      }
    }
    Assert-True ($null -ne $tokenPayload) `
      'Tauri bootstrap IPC helper returned invalid JSON output.'
    $bootstrapTokenProperty = $tokenPayload.PSObject.Properties['bootstrapToken']
    Assert-True ($null -ne $bootstrapTokenProperty) `
      'Tauri bootstrap IPC helper returned no credential field.'
    $uiReadyProperty = $tokenPayload.PSObject.Properties['uiReady']
    $uiStartupStateProperty = $tokenPayload.PSObject.Properties['uiStartupState']
    $uiPathProperty = $tokenPayload.PSObject.Properties['uiPath']
    $uiTextLengthProperty = $tokenPayload.PSObject.Properties['uiTextLength']
    Assert-True (
      $null -ne $uiReadyProperty -and
      $uiReadyProperty.Value -is [bool] -and
      $uiReadyProperty.Value
    ) 'Installed Waggle WebView did not render its application shell.'
    Assert-True (
      $null -ne $uiStartupStateProperty -and
      $uiStartupStateProperty.Value -is [string] -and
      [string]$uiStartupStateProperty.Value -ceq $(
        if ($AllowLegacyUi) { 'legacy-ready' } else { 'ready' }
      )
    ) 'Installed Waggle WebView did not commit its application shell.'
    Assert-True (
      $null -ne $uiPathProperty -and
      $uiPathProperty.Value -is [string] -and
      ([string]$uiPathProperty.Value).StartsWith('/')
    ) 'Installed Waggle WebView returned an invalid application route.'
    Assert-True (
      $null -ne $uiTextLengthProperty -and
      ($uiTextLengthProperty.Value -is [int] -or $uiTextLengthProperty.Value -is [long]) -and
      [long]$uiTextLengthProperty.Value -gt 0
    ) 'Installed Waggle WebView rendered no visible application content.'
    $bootstrapToken = [string]$bootstrapTokenProperty.Value
    Assert-True ($bootstrapToken.Length -ge 32 -and $bootstrapToken.Length -le 200) `
      'Tauri bootstrap IPC helper returned an invalid credential.'
    $tokenResponse = Invoke-SessionTokenBootstrapProbe `
      -Uri "$BaseUrl/api/auth/session-token" `
      -Headers @{ 'x-waggle-desktop-bootstrap' = $bootstrapToken }
  } finally {
    if (Test-Path -LiteralPath $stderrPath) {
      Remove-Item -LiteralPath $stderrPath -Force -ErrorAction SilentlyContinue
    }
  }
  Assert-True ($null -ne $tokenResponse) `
    'Session-token bootstrap returned no JSON response.'
  $sessionTokenProperty = $tokenResponse.PSObject.Properties['token']
  Assert-True ($null -ne $sessionTokenProperty) `
    'Session-token bootstrap returned no token field.'
  $sessionToken = [string]$sessionTokenProperty.Value
  Assert-True (-not [string]::IsNullOrWhiteSpace($sessionToken)) `
    'Session-token bootstrap returned no token.'
  return @{ Authorization = "Bearer $sessionToken" }
}

function Assert-CertificateLifecycleData {
  param(
    [Parameter(Mandatory = $true)] [string]$BaseUrl,
    [Parameter(Mandatory = $true)] [hashtable]$Headers,
    [Parameter(Mandatory = $true)] [object]$State,
    [Parameter(Mandatory = $true)] [string]$DataDir
  )

  $escapedWorkspaceId = [uri]::EscapeDataString([string]$State.workspaceId)
  $workspace = Invoke-JsonRequest "$BaseUrl/api/workspaces/$escapedWorkspaceId" $Headers
  Assert-True ([string]$workspace.id -ceq [string]$State.workspaceId) `
    'Persisted workspace id changed or disappeared.'
  Assert-True ([string]$workspace.name -ceq [string]$State.workspaceName) `
    'Persisted workspace name changed or disappeared.'
  Assert-True ([string]$workspace.group -ceq [string]$State.workspaceGroup) `
    'Persisted workspace group changed or disappeared.'

  $personalList = Invoke-JsonRequest "$BaseUrl/api/memory/frames?limit=200" $Headers
  $personalResults = @($personalList.results)
  Assert-True ([long]$personalList.count -eq $personalResults.Count) `
    'Personal memory response count does not match its result set.'
  $personalMatches = @($personalResults | Where-Object {
    [long]$_.id -eq [long]$State.personalFrameId -and
      [string]$_.mind -ceq 'personal' -and
      [string]$_.source_mind -ceq 'personal' -and
      [string]$_.content -ceq [string]$State.personalContent
  })
  Assert-True ($personalMatches.Count -eq 1) `
    'Persisted personal memory marker is missing or ambiguous.'

  $workspaceList = Invoke-JsonRequest `
    "$BaseUrl/api/memory/frames?workspaceId=$escapedWorkspaceId&limit=200" `
    $Headers
  $workspaceResults = @($workspaceList.results)
  Assert-True ([long]$workspaceList.count -eq $workspaceResults.Count) `
    'Workspace memory response count does not match its result set.'
  $workspaceMatches = @($workspaceResults | Where-Object {
    [long]$_.id -eq [long]$State.workspaceFrameId -and
      [string]$_.mind -ceq 'workspace' -and
      [string]$_.source_mind -ceq 'workspace' -and
      [string]$_.content -ceq [string]$State.workspaceContent
  })
  Assert-True ($workspaceMatches.Count -eq 1) `
    'Persisted workspace memory marker is missing or ambiguous.'

  foreach ($frame in @($personalMatches[0], $workspaceMatches[0])) {
    Assert-True ([string]$frame.source -ceq 'tool_verified') `
      'Persisted lifecycle memory lost its provenance.'
    Assert-True ([string]$frame.importance -ceq 'important') `
      'Persisted lifecycle memory lost its importance.'
    Assert-True (@('I', 'P', 'B') -contains [string]$frame.frameType) `
      'Persisted lifecycle memory returned an invalid frame type.'
    Assert-True (Test-CertificateTimestamp $frame.timestamp) `
      'Persisted lifecycle memory returned an invalid timestamp.'
    $parsedAccessCount = 0L
    Assert-True ([long]::TryParse([string]$frame.accessCount, [ref]$parsedAccessCount)) `
      'Persisted lifecycle memory returned an invalid access count.'
  }

  $workspaceDir = Join-Path $DataDir "workspaces\$($State.workspaceId)"
  foreach ($path in @(
    (Join-Path $DataDir 'personal.mind'),
    (Join-Path $workspaceDir 'workspace.json'),
    (Join-Path $workspaceDir 'workspace.mind')
  )) {
    Assert-True (Test-Path -LiteralPath $path -PathType Leaf) `
      "Lifecycle data file is missing: $path"
  }
  foreach ($path in @(
    (Join-Path $workspaceDir 'sessions'),
    (Join-Path $workspaceDir 'files\attachments'),
    (Join-Path $workspaceDir 'files\exports'),
    (Join-Path $workspaceDir 'files\notes')
  )) {
    Assert-True (Test-Path -LiteralPath $path -PathType Container) `
      "Lifecycle workspace directory is missing: $path"
  }
}

function New-CertificateLifecycleData {
  param(
    [Parameter(Mandatory = $true)] [string]$BaseUrl,
    [Parameter(Mandatory = $true)] [hashtable]$Headers,
    [Parameter(Mandatory = $true)] [string]$RunId,
    [Parameter(Mandatory = $true)] [string]$DataDir
  )

  $workspaceName = "Installer certificate $RunId"
  $workspaceGroup = 'Installer certificate'
  $workspaceResponse = Invoke-JsonPostRequest "$BaseUrl/api/workspaces" @{
    name = $workspaceName
    group = $workspaceGroup
  } $Headers
  $workspace = $workspaceResponse.Content | ConvertFrom-Json
  Assert-True ([int]$workspaceResponse.StatusCode -eq 201) `
    'Could not create the lifecycle certificate workspace.'
  Assert-True ([string]$workspace.id -match '^[a-z0-9]+(?:-[a-z0-9]+)*$') `
    'Lifecycle certificate workspace returned an invalid id.'
  Assert-True ([string]$workspace.name -ceq $workspaceName) `
    'Lifecycle certificate workspace returned an unexpected name.'
  Assert-True ([string]$workspace.group -ceq $workspaceGroup) `
    'Lifecycle certificate workspace returned an unexpected group.'
  Assert-True (Test-CertificateTimestamp $workspace.created) `
    'Lifecycle certificate workspace returned an invalid creation timestamp.'

  $personalContent = "installer-certificate-personal-memory-$RunId"
  $personalResponse = Invoke-JsonPostRequest "$BaseUrl/api/memory/frames?extract=false" @{
    content = $personalContent
    importance = 'important'
    source = 'tool_verified'
  } $Headers
  $personal = $personalResponse.Content | ConvertFrom-Json
  Assert-True (
    [int]$personalResponse.StatusCode -eq 200 -and
      $personal.saved -eq $true -and
      [string]$personal.mind -ceq 'personal' -and
      [string]$personal.importance -ceq 'important' -and
      [string]$personal.source -ceq 'tool_verified'
  ) 'Could not seed the lifecycle certificate personal memory.'
  Assert-True ($personal.frameId -is [int] -or $personal.frameId -is [long]) `
    'Lifecycle certificate personal memory returned no numeric frame id.'

  $workspaceContent = "installer-certificate-workspace-memory-$RunId"
  $workspaceMemoryResponse = Invoke-JsonPostRequest "$BaseUrl/api/memory/frames?extract=false" @{
    content = $workspaceContent
    workspaceId = [string]$workspace.id
    importance = 'important'
    source = 'tool_verified'
  } $Headers
  $workspaceMemory = $workspaceMemoryResponse.Content | ConvertFrom-Json
  Assert-True (
    [int]$workspaceMemoryResponse.StatusCode -eq 200 -and
      $workspaceMemory.saved -eq $true -and
      [string]$workspaceMemory.mind -ceq 'workspace' -and
      [string]$workspaceMemory.importance -ceq 'important' -and
      [string]$workspaceMemory.source -ceq 'tool_verified'
  ) 'Could not seed the lifecycle certificate workspace memory.'
  Assert-True ($workspaceMemory.frameId -is [int] -or $workspaceMemory.frameId -is [long]) `
    'Lifecycle certificate workspace memory returned no numeric frame id.'

  $state = [ordered]@{
    workspaceId = [string]$workspace.id
    workspaceName = $workspaceName
    workspaceGroup = $workspaceGroup
    personalContent = $personalContent
    personalFrameId = [long]$personal.frameId
    workspaceContent = $workspaceContent
    workspaceFrameId = [long]$workspaceMemory.frameId
  }
  Assert-CertificateLifecycleData $BaseUrl $Headers $state $DataDir
  return $state
}

function Get-CertificateRelativePath {
  param(
    [Parameter(Mandatory = $true)] [string]$Root,
    [Parameter(Mandatory = $true)] [string]$Child
  )

  $resolvedRoot = [System.IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
  $resolvedChild = [System.IO.Path]::GetFullPath($Child)
  Assert-True (
    $resolvedChild.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)
  ) "Certificate profile entry escapes the owned root: $resolvedChild"
  return $resolvedChild.Substring($resolvedRoot.Length).Replace('\', '/')
}

function Get-CertificateDataManifest {
  param(
    [Parameter(Mandatory = $true)] [string]$ProfileDataDir,
    [switch]$SkipHashes
  )

  $resolvedRoot = [System.IO.Path]::GetFullPath($ProfileDataDir).TrimEnd('\')
  Assert-True (Test-Path -LiteralPath $resolvedRoot -PathType Container) `
    "Certificate profile directory is missing: $resolvedRoot"
  $root = Get-Item -LiteralPath $resolvedRoot -Force
  Assert-True (($root.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0) `
    "Certificate profile root must not be a reparse point: $resolvedRoot"

  $queue = [System.Collections.Generic.Queue[System.IO.DirectoryInfo]]::new()
  $queue.Enqueue([System.IO.DirectoryInfo]$root)
  $paths = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase
  )
  $entries = @()
  while ($queue.Count -gt 0) {
    $directory = $queue.Dequeue()
    foreach ($item in @(Get-ChildItem -LiteralPath $directory.FullName -Force)) {
      Assert-True (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0) `
        "Certificate profile contains a reparse point: $($item.FullName)"
      $relativePath = Get-CertificateRelativePath $resolvedRoot $item.FullName
      Assert-True ($paths.Add($relativePath)) `
        "Certificate profile contains an ambiguous path: $relativePath"
      if ($item.PSIsContainer) {
        $entries += [ordered]@{
          path = $relativePath
          type = 'directory'
          sizeBytes = 0L
          sha256 = $null
        }
        $queue.Enqueue([System.IO.DirectoryInfo]$item)
      } else {
        $entries += [ordered]@{
          path = $relativePath
          type = 'file'
          sizeBytes = [long]$item.Length
          sha256 = if ($SkipHashes) {
            $null
          } else {
            (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash
          }
        }
      }
    }
  }
  return @($entries | Sort-Object { [string]$_.path })
}

function Assert-CertificateDataManifest {
  param(
    [Parameter(Mandatory = $true)] [object[]]$Expected,
    [Parameter(Mandatory = $true)] [object[]]$Actual
  )

  Assert-True ($Actual.Count -eq $Expected.Count) `
    'Silent uninstall changed the default-profile manifest entry count.'
  for ($index = 0; $index -lt $Expected.Count; $index++) {
    foreach ($property in @('path', 'type', 'sizeBytes', 'sha256')) {
      Assert-True (
        [string]::Equals(
          [string]$Actual[$index][$property],
          [string]$Expected[$index][$property],
          [System.StringComparison]::Ordinal
        )
      ) "Silent uninstall changed default-profile manifest entry '$($Expected[$index].path)' ($property)."
    }
  }
}

function Get-CertificateDataManifestDigest {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyCollection()]
    [object[]]$manifest
  )

  $payload = ConvertTo-Json -InputObject @($manifest) -Compress -Depth 4
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $digest = $sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($payload))
    return ([System.BitConverter]::ToString($digest)).Replace('-', '')
  } finally {
    $sha256.Dispose()
  }
}

function Get-SidecarProvenance {
  param([Parameter(Mandatory = $true)] [string]$Path)

  Assert-True (Test-Path -LiteralPath $Path -PathType Leaf) `
    "Sidecar bundle is missing: $Path"
  $file = Get-Item -LiteralPath $Path
  Assert-True (($file.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0) `
    "Sidecar bundle must not be a reparse point: $Path"
  $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
  $newlineIndex = [Array]::IndexOf($bytes, [byte]10)
  Assert-True ($newlineIndex -gt 0) 'Sidecar bundle is missing embedded provenance.'
  $firstLine = [System.Text.Encoding]::UTF8.GetString($bytes, 0, $newlineIndex)
  $prefix = '// Waggle-Sidecar-Provenance: '
  Assert-True ($firstLine.StartsWith($prefix, [System.StringComparison]::Ordinal)) `
    'Sidecar bundle is missing embedded provenance.'
  $encoded = $firstLine.Substring($prefix.Length)
  Assert-True (
    $encoded.Length -gt 0 -and
    ($encoded.Length % 4) -eq 0 -and
    $encoded -cmatch '^[A-Za-z0-9+/]+={0,2}$'
  ) 'Sidecar embedded provenance is not canonical base64.'
  try {
    $jsonBytes = [Convert]::FromBase64String($encoded)
  } catch {
    throw 'Sidecar embedded provenance is not canonical base64.'
  }
  Assert-True (
    [string]::Equals(
      [Convert]::ToBase64String($jsonBytes),
      $encoded,
      [System.StringComparison]::Ordinal
    )
  ) 'Sidecar embedded provenance is not canonical base64.'
  try {
    $manifest = [System.Text.Encoding]::UTF8.GetString($jsonBytes) |
      ConvertFrom-Json
  } catch {
    throw 'Sidecar embedded provenance is not valid JSON.'
  }
  Assert-True ($null -ne $manifest -and [int]$manifest.schemaVersion -eq 1) `
    'Sidecar embedded provenance schemaVersion must be 1.'
  Assert-True ([string]$manifest.sourceRevision -cmatch '^[0-9a-f]{40}$') `
    'Sidecar embedded provenance sourceRevision is invalid.'
  Assert-True (
    [string]::Equals(
      [string]$manifest.entryPoint,
      'packages/server/src/local/service.ts',
      [System.StringComparison]::Ordinal
    )
  ) 'Sidecar embedded provenance entryPoint is invalid.'

  $sourceInputs = @($manifest.sourceInputs)
  Assert-True ($sourceInputs.Count -gt 0) 'Sidecar embedded provenance sourceInputs are missing.'
  $requiredInputs = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::Ordinal
  )
  foreach ($required in @(
    'package-lock.json',
    'package.json',
    'packages/server/src/local/service.ts',
    'scripts/build-sidecar.mjs'
  )) {
    [void]$requiredInputs.Add($required)
  }
  $previousPath = $null
  foreach ($input in $sourceInputs) {
    $relative = [string]$input.path
    $parts = @($relative.Split('/'))
    Assert-True (
      -not [string]::IsNullOrWhiteSpace($relative) -and
      -not $relative.Contains('\') -and
      -not $relative.Contains([char]0) -and
      -not [System.IO.Path]::IsPathRooted($relative.Replace('/', '\')) -and
      -not ($parts | Where-Object { $_ -in @('', '.', '..', 'node_modules') })
    ) 'Sidecar embedded provenance source input path is unsafe.'
    if ($null -ne $previousPath) {
      Assert-True ([string]::CompareOrdinal($previousPath, $relative) -lt 0) `
        'Sidecar embedded provenance source inputs are not unique and sorted.'
    }
    Assert-True ([string]$input.sha256 -cmatch '^[0-9a-f]{64}$') `
      'Sidecar embedded provenance source input hash is invalid.'
    $previousPath = $relative
    [void]$requiredInputs.Remove($relative)
  }
  Assert-True ($requiredInputs.Count -eq 0) `
    'Sidecar embedded provenance omits required source inputs.'

  $payloadOffset = $newlineIndex + 1
  $payloadLength = $bytes.Length - $payloadOffset
  Assert-True (
    $null -ne $manifest.bundlePayload -and
    [long]$manifest.bundlePayload.sizeBytes -eq $payloadLength -and
    [string]$manifest.bundlePayload.sha256 -cmatch '^[0-9a-f]{64}$'
  ) 'Sidecar bundle payload does not match embedded provenance.'
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $payloadDigest = $sha256.ComputeHash($bytes, $payloadOffset, $payloadLength)
  } finally {
    $sha256.Dispose()
  }
  $payloadSha256 = ([System.BitConverter]::ToString($payloadDigest)).Replace('-', '')
  Assert-True (
    [string]::Equals(
      $payloadSha256,
      [string]$manifest.bundlePayload.sha256,
      [System.StringComparison]::OrdinalIgnoreCase
    )
  ) 'Sidecar bundle payload does not match embedded provenance.'

  $provenanceSha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $provenanceDigest = $provenanceSha.ComputeHash($jsonBytes)
  } finally {
    $provenanceSha.Dispose()
  }
  return [ordered]@{
    manifest = $manifest
    bundleSha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    provenanceSha256 = ([System.BitConverter]::ToString($provenanceDigest)).Replace('-', '')
    payloadSha256 = $payloadSha256
    sourceInputCount = $sourceInputs.Count
  }
}

function Assert-SidecarBundleBinding {
  param(
    [Parameter(Mandatory = $true)] [object]$Packaged,
    [Parameter(Mandatory = $true)] [object]$Installed
  )

  Assert-True (
    [string]::Equals(
      [string]$Installed.bundleSha256,
      [string]$Packaged.bundleSha256,
      [System.StringComparison]::OrdinalIgnoreCase
    )
  ) 'Installed resources/service.js does not match the source-bound bundle.'
  Assert-True (
    [string]::Equals(
      [string]$Installed.provenanceSha256,
      [string]$Packaged.provenanceSha256,
      [System.StringComparison]::OrdinalIgnoreCase
    ) -and
    [string]::Equals(
      [string]$Installed.manifest.sourceRevision,
      [string]$Packaged.manifest.sourceRevision,
      [System.StringComparison]::Ordinal
    ) -and
    [int]$Installed.sourceInputCount -eq [int]$Packaged.sourceInputCount
  ) 'Installed resources/service.js provenance does not match the certified source.'
}

function Assert-SidecarSourceBinding {
  param(
    [Parameter(Mandatory = $true)] [object]$Provenance,
    [Parameter(Mandatory = $true)] [string]$RepositoryRoot,
    [Parameter(Mandatory = $true)] [string]$ExpectedRevision,
    [Parameter(Mandatory = $true)] [string]$GitExecutable
  )

  Assert-True (
    [string]::Equals(
      [string]$Provenance.manifest.sourceRevision,
      $ExpectedRevision,
      [System.StringComparison]::Ordinal
    )
  ) 'Sidecar provenance revision does not match expected source revision.'
    $repositoryRootItem = Get-Item -LiteralPath $RepositoryRoot -ErrorAction Stop
    Assert-True $repositoryRootItem.PSIsContainer `
        "Sidecar provenance repository root is not a directory: $RepositoryRoot"
    $resolvedRepositoryRoot = $repositoryRootItem.FullName.TrimEnd('\')
    $repositoryPrefix = $resolvedRepositoryRoot + '\'
  $sourceInputs = @($Provenance.manifest.sourceInputs)
  $sourcePaths = @($sourceInputs | ForEach-Object { [string]$_.path })
  foreach ($input in $sourceInputs) {
    $relative = [string]$input.path
    $sourcePath = [System.IO.Path]::GetFullPath(
            (Join-Path $resolvedRepositoryRoot ($relative.Replace('/', '\')))
    )
    Assert-True (
      $sourcePath.StartsWith($repositoryPrefix, [System.StringComparison]::OrdinalIgnoreCase)
    ) "Sidecar provenance source path escapes the repository: $relative"
    Assert-True (Test-Path -LiteralPath $sourcePath -PathType Leaf) `
      "Sidecar provenance source input is missing: $relative"
    $sourceFile = Get-Item -LiteralPath $sourcePath
    Assert-True (($sourceFile.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0) `
      "Sidecar provenance source input is a reparse point: $relative"
    Assert-True (
      [string]::Equals(
        (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash,
        [string]$input.sha256,
        [System.StringComparison]::OrdinalIgnoreCase
      )
    ) "Sidecar provenance source hash changed: $relative"
    & $GitExecutable -C $RepositoryRoot ls-files --error-unmatch -- $relative 2>$null |
      Out-Null
    Assert-True ($LASTEXITCODE -eq 0) "Sidecar provenance source is not tracked: $relative"
    & $GitExecutable -C $RepositoryRoot cat-file -e "${ExpectedRevision}:$relative" 2>$null
    Assert-True ($LASTEXITCODE -eq 0) `
      "Sidecar provenance source is absent from expected revision: $relative"
  }
  for ($offset = 0; $offset -lt $sourcePaths.Count; $offset += 100) {
    $lastIndex = [Math]::Min($offset + 99, $sourcePaths.Count - 1)
    $sourceChunk = @($sourcePaths[$offset..$lastIndex])
    $diffArguments = @(
      '-C',
      $RepositoryRoot,
      'diff',
      '--quiet',
      $ExpectedRevision,
      '--'
    ) + $sourceChunk
    & $GitExecutable @diffArguments
    Assert-True ($LASTEXITCODE -eq 0) `
      'Sidecar provenance source inputs differ from the expected revision.'
  }
}

function Get-ExternalProfileRootSnapshot {
  param(
    [Parameter(Mandatory = $true)] [string]$Name,
    [Parameter(Mandatory = $true)] [string]$Path
  )

  $resolvedPath = [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
  $parentPath = [System.IO.Path]::GetDirectoryName($resolvedPath)
  $leafName = [System.IO.Path]::GetFileName($resolvedPath)
  Assert-True (-not [string]::IsNullOrWhiteSpace($parentPath)) `
    "External profile root has no parent directory: $resolvedPath"
  Assert-True (Test-Path -LiteralPath $parentPath -PathType Container) `
    "External profile root parent is missing: $parentPath"
  $matches = @(
    Get-ChildItem -LiteralPath $parentPath -Force |
      Where-Object {
        [string]::Equals($_.Name, $leafName, [System.StringComparison]::OrdinalIgnoreCase)
      }
  )
  Assert-True ($matches.Count -le 1) `
    "External profile root has ambiguous directory entries: $resolvedPath"
  if ($matches.Count -eq 0) {
    return [ordered]@{
      name = $Name
      path = $resolvedPath
      existedBefore = $false
      entryCount = 0
      manifestSha256 = $null
    }
  }

  $root = $matches[0]
  Assert-True ($root.PSIsContainer) `
    "External profile root must be a directory: $resolvedPath"
  Assert-True (($root.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0) `
    "External profile root must not be a reparse point: $resolvedPath"
  $manifest = @(Get-CertificateDataManifest $resolvedPath)
  return [ordered]@{
    name = $Name
    path = $resolvedPath
    existedBefore = $true
    entryCount = $manifest.Count
    manifestSha256 = (Get-CertificateDataManifestDigest $manifest)
  }
}

function Assert-ExternalProfileRootsUnchanged {
  param([Parameter(Mandatory = $true)] [object[]]$Expected)

  foreach ($baseline in @($Expected)) {
    if (-not [bool]$baseline.existedBefore) {
      $actual = Get-ExternalProfileRootSnapshot `
        -Name ([string]$baseline.name) `
        -Path ([string]$baseline.path)
      Assert-True (-not [bool]$actual.existedBefore) `
        "Installer created external profile root '$($baseline.name)': $($baseline.path)"
      continue
    }

    $actual = Get-ExternalProfileRootSnapshot `
      -Name ([string]$baseline.name) `
      -Path ([string]$baseline.path)
    Assert-True ([bool]$actual.existedBefore) `
      "Installer removed external profile root '$($baseline.name)': $($baseline.path)"
    Assert-True ([long]$actual.entryCount -eq [long]$baseline.entryCount) `
      "Installer changed external profile root entry count '$($baseline.name)'."
    Assert-True ([string]::Equals(
      [string]$actual.manifestSha256,
      [string]$baseline.manifestSha256,
      [System.StringComparison]::Ordinal
    )) "Installer changed external profile root '$($baseline.name)'."
  }
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

function Assert-NoVisibleConsoleDescendant {
  param([Parameter(Mandatory = $true)] [int]$RootProcessId)

  if ($null -eq ('WaggleInstallerWindowProbe' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class WaggleInstallerWindowProbe
{
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool IsWindowVisible(IntPtr hWnd);
}
'@
  }

  $processes = @(Get-CimInstance Win32_Process -ErrorAction Stop)
  $descendantIds = [System.Collections.Generic.HashSet[int]]::new()
  $frontier = @($RootProcessId)
  while ($frontier.Count -gt 0) {
    $next = @()
    foreach ($process in $processes) {
      if ($frontier -contains [int]$process.ParentProcessId -and
          $descendantIds.Add([int]$process.ProcessId)) {
        $next += [int]$process.ProcessId
      }
    }
    $frontier = $next
  }
  $consoleHosts = @(
    $processes | Where-Object {
      $descendantIds.Contains([int]$_.ProcessId) -and [string]::Equals(
        [string]$_.Name,
        'conhost.exe',
        [System.StringComparison]::OrdinalIgnoreCase
      )
    }
  )
  $visibleConsoles = @(
    $consoleHosts | Where-Object {
      $consoleProcessId = [int]$_.ProcessId
      $consoleProcess = Get-Process -Id $consoleProcessId -ErrorAction SilentlyContinue
      if ($null -eq $consoleProcess) { return $false }
      try {
        $consoleProcess.Refresh()
        $windowHandle = $consoleProcess.MainWindowHandle
        return $windowHandle -ne [IntPtr]::Zero -and
          [WaggleInstallerWindowProbe]::IsWindowVisible($windowHandle)
      } catch {
        if ($null -ne (Get-Process -Id $consoleProcessId -ErrorAction SilentlyContinue)) {
          throw
        }
        return $false
      }
    }
  )
  Assert-True ($visibleConsoles.Count -eq 0) `
    'Installed Waggle spawned a visible console host.'
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
    $busyPorts = @($ports | Where-Object { Test-TcpPortHasListener $_ })
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
  $remainingBusyPorts = @($ports | Where-Object { Test-TcpPortHasListener $_ })
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

function Assert-CertificateUninstallPostconditions {
  param(
    [Parameter(Mandatory = $true)] [string]$InstallDir,
    [Parameter(Mandatory = $true)] [string]$UninstallRegistry,
    [Parameter(Mandatory = $true)] [string]$ProductRegistry,
    [Parameter(Mandatory = $true)] [string]$RunRegistry,
    [Parameter(Mandatory = $true)] [string]$RunRegistryValue,
    [Parameter(Mandatory = $true)] [string[]]$ShortcutPaths,
    [Parameter(Mandatory = $true)] [string]$AppExecutable,
    [Parameter(Mandatory = $true)] [string]$ServiceScript,
    [Parameter(Mandatory = $true)] [int]$Port,
    [string]$ManagedRuntimeRoot = '',
    [int[]]$AdditionalPorts = @()
  )

  Wait-ForPathState $InstallDir $false 90
  Wait-ForPathState $UninstallRegistry $false 30
  Wait-ForPathState $ProductRegistry $false 30
  Assert-True (-not (Test-RegistryValue $RunRegistry $RunRegistryValue)) `
    'Silent uninstall left or replaced the Waggle autostart entry.'
  foreach ($shortcut in $ShortcutPaths) {
    Wait-ForPathState $shortcut $false 30
  }
  Wait-ForInstalledRuntimeStop $AppExecutable $ServiceScript $Port `
    -ManagedRuntimeRoot $ManagedRuntimeRoot -AdditionalPorts $AdditionalPorts
  Assert-NoForeignWaggleProcesses $AppExecutable
  Assert-TcpPortAvailable $Port
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

function Assert-SafeReceiptPath {
  param([Parameter(Mandatory = $true)] [string]$ReceiptPath)

  $resolvedReceipt = [System.IO.Path]::GetFullPath($ReceiptPath)
  $existingReceipt = Get-Item -LiteralPath $resolvedReceipt -Force -ErrorAction SilentlyContinue
  Assert-True ($null -eq $existingReceipt) `
    "Receipt path already exists; refusing to overwrite: $resolvedReceipt"

  $parent = Split-Path -Parent $resolvedReceipt
  Assert-True (-not [string]::IsNullOrWhiteSpace($parent)) `
    "Receipt path has no parent directory: $resolvedReceipt"
  $resolvedParent = [System.IO.Path]::GetFullPath($parent).TrimEnd('\')
  Assert-True (Test-Path -LiteralPath $resolvedParent -PathType Container) `
    "Receipt parent directory must already exist: $resolvedParent"
  $cursor = Get-Item -LiteralPath $resolvedParent -Force
  while ($null -ne $cursor) {
    Assert-True ($cursor -is [System.IO.DirectoryInfo]) `
      "Receipt parent is not a directory: $($cursor.FullName)"
    Assert-True (($cursor.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0) `
      "Receipt parent must not be a reparse point: $($cursor.FullName)"
    $cursor = $cursor.Parent
  }
}

function Reserve-CertificateReceiptPath {
  param([Parameter(Mandatory = $true)] [string]$ReceiptPath)

  Assert-SafeReceiptPath $ReceiptPath
  return [System.IO.File]::Open(
    $ReceiptPath,
    [System.IO.FileMode]::CreateNew,
    [System.IO.FileAccess]::Write,
    [System.IO.FileShare]::None
  )
}

function Write-CertificateReceipt {
  param(
    [Parameter(Mandatory = $true)] [System.IO.FileStream]$Reservation,
    [Parameter(Mandatory = $true)] [string]$Content
  )

  $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($Content)
  try {
    Assert-True ($Reservation.CanWrite -and $Reservation.Length -eq 0) `
      'Certificate receipt reservation is not exclusively writable and empty.'
    $Reservation.Write($bytes, 0, $bytes.Length)
    $Reservation.Flush($true)
  } finally {
    $Reservation.Dispose()
  }
}

function Assert-SafeScratchRoot {
  param(
    [Parameter(Mandatory = $true)] [string]$ScratchRoot,
    [Parameter(Mandatory = $true)] [string]$RunId
  )

  $resolved = [System.IO.Path]::GetFullPath($ScratchRoot).TrimEnd('\')
  $expected = [System.IO.Path]::GetFullPath(
    (Join-Path ([System.IO.Path]::GetTempPath()) "waggle-installer-cert-$RunId")
  ).TrimEnd('\')
  Assert-True ([string]::Equals(
    $resolved,
    $expected,
    [System.StringComparison]::OrdinalIgnoreCase
  )) "Scratch root is not the exact temp root for certificate run ${RunId}: $resolved"
}

function Assert-CertificateScratchOwnership {
  param(
    [Parameter(Mandatory = $true)] [string]$ScratchRoot,
    [Parameter(Mandatory = $true)] [string]$OwnershipMarker,
    [Parameter(Mandatory = $true)] [string]$RunId,
    [switch]$RequireOnlyMarker
  )

  $resolvedRoot = [System.IO.Path]::GetFullPath($ScratchRoot).TrimEnd('\')
  Assert-SafeScratchRoot $resolvedRoot $RunId
  $rootItem = Get-Item -LiteralPath $resolvedRoot -Force
  Assert-True ($rootItem.PSIsContainer -and (
    $rootItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint
  ) -eq 0) "Scratch root is missing or is a reparse point: $resolvedRoot"
  $expectedMarker = Join-Path $resolvedRoot ".waggle-installer-certificate-owner-$RunId"
  Assert-True ([string]::Equals(
    [System.IO.Path]::GetFullPath($OwnershipMarker),
    $expectedMarker,
    [System.StringComparison]::OrdinalIgnoreCase
  )) "Scratch ownership marker has an unexpected path: $OwnershipMarker"
  $markerItem = Get-Item -LiteralPath $expectedMarker -Force
  Assert-True (-not $markerItem.PSIsContainer -and (
    $markerItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint
  ) -eq 0) "Scratch ownership marker is missing or is a reparse point: $expectedMarker"
  Assert-True ((Get-Content -Raw -LiteralPath $expectedMarker) -ceq $RunId) `
    "Scratch ownership marker does not match certificate run ${RunId}."
  $manifest = @(Get-CertificateDataManifest $resolvedRoot -SkipHashes)
  if ($RequireOnlyMarker) {
    Assert-True (
      $manifest.Count -eq 1 -and
        [string]$manifest[0].path -ceq (Split-Path -Leaf $expectedMarker)
    ) "Scratch root changed before ownership was established: $resolvedRoot"
  }
}

function New-CertificateScratchRoot {
  param(
    [Parameter(Mandatory = $true)] [string]$ScratchRoot,
    [Parameter(Mandatory = $true)] [string]$RunId
  )

  $resolvedRoot = [System.IO.Path]::GetFullPath($ScratchRoot).TrimEnd('\')
  Assert-SafeScratchRoot $resolvedRoot $RunId
  Assert-True (-not (Test-Path -LiteralPath $resolvedRoot)) `
    "Scratch root already exists; refusing to adopt it: $resolvedRoot"
  $createdRoot = New-Item -ItemType Directory -Path $resolvedRoot -ErrorAction Stop
  Assert-True ($createdRoot.PSIsContainer -and (
    $createdRoot.Attributes -band [System.IO.FileAttributes]::ReparsePoint
  ) -eq 0) "New scratch root is not a normal directory: $resolvedRoot"
  $ownershipMarker = Join-Path $resolvedRoot ".waggle-installer-certificate-owner-$RunId"
  $markerBytes = [System.Text.UTF8Encoding]::new($false).GetBytes($RunId)
  $markerStream = [System.IO.File]::Open(
    $ownershipMarker,
    [System.IO.FileMode]::CreateNew,
    [System.IO.FileAccess]::Write,
    [System.IO.FileShare]::None
  )
  try {
    $markerStream.Write($markerBytes, 0, $markerBytes.Length)
    $markerStream.Flush($true)
  } finally {
    $markerStream.Dispose()
  }
  Assert-CertificateScratchOwnership $resolvedRoot $ownershipMarker $RunId -RequireOnlyMarker
  return $ownershipMarker
}

function Remove-CertificateScratchRoot {
  param(
    [Parameter(Mandatory = $true)] [string]$ScratchRoot,
    [Parameter(Mandatory = $true)] [string]$OwnershipMarker,
    [Parameter(Mandatory = $true)] [string]$RunId
  )

  $resolvedRoot = [System.IO.Path]::GetFullPath($ScratchRoot).TrimEnd('\')
  Assert-CertificateScratchOwnership $resolvedRoot $OwnershipMarker $RunId
  $manifest = @(Get-CertificateDataManifest $resolvedRoot -SkipHashes)
  $markerRelativePath = Get-CertificateRelativePath $resolvedRoot $OwnershipMarker
  foreach ($entry in @($manifest | Where-Object {
    $_.type -eq 'file' -and -not [string]::Equals(
      [string]$_.path,
      $markerRelativePath,
      [System.StringComparison]::OrdinalIgnoreCase
    )
  })) {
    $entryPath = Join-Path $resolvedRoot ([string]$entry.path).Replace('/', '\')
    $item = Get-Item -LiteralPath $entryPath -Force -ErrorAction Stop
    Assert-True (-not $item.PSIsContainer -and (
      $item.Attributes -band [System.IO.FileAttributes]::ReparsePoint
    ) -eq 0) "Refusing to remove replaced scratch file: $entryPath"
    Remove-Item -LiteralPath $entryPath -Force
  }
  $directories = @($manifest | Where-Object {
    $_.type -eq 'directory'
  } | Sort-Object { ([string]$_.path).Length } -Descending)
  foreach ($entry in $directories) {
    $entryPath = Join-Path $resolvedRoot ([string]$entry.path).Replace('/', '\')
    $item = Get-Item -LiteralPath $entryPath -Force -ErrorAction Stop
    Assert-True ($item.PSIsContainer -and (
      $item.Attributes -band [System.IO.FileAttributes]::ReparsePoint
    ) -eq 0) "Refusing to remove replaced scratch directory: $entryPath"
    Assert-True (@(Get-ChildItem -LiteralPath $entryPath -Force).Count -eq 0) `
      "Certificate scratch directory changed during cleanup: $entryPath"
    Remove-Item -LiteralPath $entryPath -Force
  }
  $remaining = @(Get-ChildItem -LiteralPath $resolvedRoot -Force)
  Assert-True (
    $remaining.Count -eq 1 -and
      [string]::Equals(
        $remaining[0].FullName,
        [System.IO.Path]::GetFullPath($OwnershipMarker),
        [System.StringComparison]::OrdinalIgnoreCase
      )
  ) 'Certificate scratch changed before ownership-marker cleanup.'
  Assert-CertificateScratchOwnership $resolvedRoot $OwnershipMarker $RunId -RequireOnlyMarker
  Remove-Item -LiteralPath $OwnershipMarker -Force
  $rootItem = Get-Item -LiteralPath $resolvedRoot -Force -ErrorAction Stop
  Assert-True ($rootItem.PSIsContainer -and (
    $rootItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint
  ) -eq 0) "Refusing to remove replaced scratch root: $resolvedRoot"
  Assert-True (@(Get-ChildItem -LiteralPath $resolvedRoot -Force).Count -eq 0) `
    "Certificate scratch root changed during cleanup: $resolvedRoot"
  Remove-Item -LiteralPath $resolvedRoot -Force
  Assert-True (-not (Test-Path -LiteralPath $resolvedRoot)) `
    "Certificate scratch cleanup did not remove the owned root: $resolvedRoot"
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

function Remove-CertificateProfileData {
  param(
    [Parameter(Mandatory = $true)] [string]$ProfileDataDir,
    [Parameter(Mandatory = $true)] [string]$ProfileDataMarker,
    [Parameter(Mandatory = $true)] [string]$RunId,
    [Parameter(Mandatory = $true)] [bool]$ProfileAbsenceProven,
    [Parameter(Mandatory = $true)] [bool]$RuntimeConfirmedStopped
  )

  Assert-True $ProfileAbsenceProven `
    'Refusing to clean a profile whose pre-certificate absence was not proven.'
  Assert-True $RuntimeConfirmedStopped `
    'Refusing to clean the certificate profile before runtime shutdown is proven.'
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
  Assert-True (Test-Path -LiteralPath $ProfileDataMarker -PathType Leaf) `
    "Certificate ownership marker is missing: $ProfileDataMarker"
  Assert-True ((Get-Content -Raw -LiteralPath $ProfileDataMarker).Trim() -eq $RunId) `
    "Refusing to remove a profile marker not owned by this certificate: $ProfileDataMarker"

  $entries = @(Get-CertificateDataManifest $resolvedDataDir -SkipHashes)
  $markerRelativePath = Get-CertificateRelativePath $resolvedDataDir $ProfileDataMarker
  foreach ($entry in @($entries | Where-Object {
    $_.type -eq 'file' -and -not [string]::Equals(
      [string]$_.path,
      $markerRelativePath,
      [System.StringComparison]::OrdinalIgnoreCase
    )
  })) {
    $entryPath = Join-Path $resolvedDataDir ([string]$entry.path).Replace('/', '\')
    $item = Get-Item -LiteralPath $entryPath -Force
    Assert-True (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0) `
      "Refusing to remove a replaced profile entry: $entryPath"
    Remove-Item -LiteralPath $entryPath -Force
  }
  $directories = @($entries | Where-Object { $_.type -eq 'directory' } | Sort-Object {
    ([string]$_.path).Length
  } -Descending)
  foreach ($entry in $directories) {
    $entryPath = Join-Path $resolvedDataDir ([string]$entry.path).Replace('/', '\')
    $item = Get-Item -LiteralPath $entryPath -Force
    Assert-True (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0) `
      "Refusing to remove a replaced profile directory: $entryPath"
    Assert-True (@(Get-ChildItem -LiteralPath $entryPath -Force).Count -eq 0) `
      "Certificate profile directory changed during cleanup: $entryPath"
    Remove-Item -LiteralPath $entryPath -Force
  }
  $remaining = @(Get-ChildItem -LiteralPath $resolvedDataDir -Force)
  Assert-True (
    $remaining.Count -eq 1 -and
      [string]::Equals(
        $remaining[0].FullName,
        [System.IO.Path]::GetFullPath($ProfileDataMarker),
        [System.StringComparison]::OrdinalIgnoreCase
      )
  ) 'Certificate profile changed before ownership-marker cleanup.'
  Remove-Item -LiteralPath $ProfileDataMarker -Force
  Remove-Item -LiteralPath $resolvedDataDir -Force
  Assert-True (-not (Test-Path -LiteralPath $resolvedDataDir)) `
    'Certificate profile cleanup did not remove the owned profile root.'
}

$hasExpectedSignerThumbprint = -not [string]::IsNullOrWhiteSpace($ExpectedSignerThumbprint)
$hasExpectedSignerSubject = -not [string]::IsNullOrWhiteSpace($ExpectedSignerSubject)
if ($RequireAuthenticodeSignature) {
  Assert-True ($hasExpectedSignerThumbprint -xor $hasExpectedSignerSubject) `
    'Exactly one expected signer identity binding is required when Authenticode is required.'
  if ($hasExpectedSignerThumbprint) {
    $normalizedExpectedSignerThumbprint = (
      $ExpectedSignerThumbprint -replace '\s', ''
    ).ToUpperInvariant()
    Assert-True ($normalizedExpectedSignerThumbprint -match '^[0-9A-F]{40}$') `
      'Expected signer thumbprint must be exactly 40 hexadecimal characters.'
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
    $previousInstallerSignature `
    $ExpectedSignerThumbprint `
    $ExpectedSignerSubject `
    'Previous release installer'
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
Assert-SafeScratchRoot $scratchRoot $runId
$installDir = Join-Path $scratchRoot 'install'
$profileDataDir = Join-Path $env:USERPROFILE '.waggle'
$externalProfileRootTargets = @(
  [ordered]@{ name = '.hive-mind'; path = (Join-Path $env:USERPROFILE '.hive-mind') }
  [ordered]@{ name = '.ollama'; path = (Join-Path $env:USERPROFILE '.ollama') }
)
$dataDir = $profileDataDir
$appExecutable = Join-Path $installDir 'waggle.exe'
$serviceScript = Join-Path $installDir 'resources\service.js'
$packagedServiceScript = [System.IO.Path]::GetFullPath(
  (Join-Path $PSScriptRoot '..\app\src-tauri\resources\service.js')
)
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
$profileDataMarker = Join-Path $profileDataDir "installer-certificate-profile-marker-$runId.txt"
$uninstallRegistry = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Waggle'
$productRegistry = 'HKCU:\Software\egzakta\Waggle'
$runRegistry = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$runRegistryValue = 'Waggle'
$shortcutCandidates = Get-WaggleShortcutPaths
$startedAt = [DateTime]::UtcNow
$installerStarted = $false
$profileAbsenceProven = $false
$externalProfileRootsPreProven = $false
$externalProfileRootBaselines = @()
$profileRootOwned = $false
$runtimeConfirmedStopped = $false
$certificateLifecycleData = $null
$preUninstallDataManifest = @()
$installedShortcuts = @()
$uninstallPostconditionsConfirmed = $false
$environmentNamesToClear = @(
  'WAGGLE_NODE_PATH', 'WAGGLE_DATA_DIR', 'NODE_PATH', 'NODE_OPTIONS', 'DOCKER_HOST',
  'WAGGLE_TRUST_LOCALHOST', 'WAGGLE_SQLITE_VEC_PATH', 'ONNXRUNTIME_NODE_BINDING_PATH',
  'EMBEDDING_PROVIDER', 'EMBEDDING_MODEL', 'OLLAMA_EMBED_MODEL',
  'WAGGLE_EMBEDDING_PROVIDER', 'HIVE_MIND_EMBEDDING_PROVIDER',
  'VOYAGE_API_KEY', 'WAGGLE_VOYAGE_API_KEY', 'WAGGLE_EVAL_MODE',
  'WAGGLE_SUPPRESS_EMBEDDING_WARNING', 'WAGGLE_LITELLM_URL',
  'WAGGLE_NPM_LIFECYCLE_WITNESS_PREFIX',
  'OLLAMA_MODELS', 'HF_HOME', 'HF_HUB_CACHE', 'TRANSFORMERS_CACHE', 'XDG_CACHE_HOME',
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
  schemaVersion = 4
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
      sidecarSourceRevision = $null
      sidecarBundleSha256 = $null
      sidecarProvenanceSha256 = $null
      sidecarSourceInputCount = 0
      windowsInboxTools = [ordered]@{}
  }
  scratchRoot = $scratchRoot
  embeddingPayloadReady = $false
  embeddingPayload = $null
  certifiedTier = $null
  managedModelVerified = $false
  managedModelDigest = $null
  lifecycleData = $null
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
      managedModelName = $null
      managedModelDigest = $null
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

$receiptReservation = Reserve-CertificateReceiptPath $ReceiptPath
$scratchOwnershipMarker = $null
$ollamaPort = 0
Assert-True (
  $WebViewDebugPort -eq 0 -or
  ($WebViewDebugPort -ge 1024 -and $WebViewDebugPort -le 65535)
) 'WebViewDebugPort must be 0 or an integer between 1024 and 65535.'
$managedRuntimeRoot = Join-Path $dataDir 'runtimes\ollama'
$managedCertificateModel = 'qwen2.5:0.5b'
$managedOperationTimeoutSeconds = 3600

try {
  $scratchOwnershipMarker = New-CertificateScratchRoot $scratchRoot $runId
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

  $nodeCommand = Get-Command node -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
  Assert-True ($null -ne $nodeCommand) 'Node.js is required to reproduce the sidecar bundle.'
  $bootstrapHelperPath = Join-Path $PSScriptRoot 'read-tauri-bootstrap-token.mjs'
  Assert-True (Test-Path -LiteralPath $bootstrapHelperPath -PathType Leaf) `
    'Tauri bootstrap helper is missing.'
  Assert-True (Test-Path -LiteralPath $packagedServiceScript -PathType Leaf) `
    'Packaged resources/service.js is missing before certification.'
  $sidecarHashBeforeRebuild = (
    Get-FileHash -LiteralPath $packagedServiceScript -Algorithm SHA256
  ).Hash
  & $nodeCommand.Source (Join-Path $PSScriptRoot 'build-sidecar.mjs')
  Assert-True ($LASTEXITCODE -eq 0) 'Could not reproduce packaged resources/service.js.'
  $sidecarHashAfterRebuild = (
    Get-FileHash -LiteralPath $packagedServiceScript -Algorithm SHA256
  ).Hash
  Assert-True (
    [string]::Equals(
      $sidecarHashBeforeRebuild,
      $sidecarHashAfterRebuild,
      [System.StringComparison]::OrdinalIgnoreCase
    )
  ) 'Packaged resources/service.js does not match a clean sidecar rebuild.'
  $packagedSidecarProvenance = Get-SidecarProvenance $packagedServiceScript
  & $nodeCommand.Source `
    (Join-Path $PSScriptRoot 'check-sidecar-resources.mjs') `
    --expected-source-revision `
    ([string]$packagedSidecarProvenance.manifest.sourceRevision)
  Assert-True ($LASTEXITCODE -eq 0) 'Packaged sidecar resources failed provenance preflight.'
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
    Assert-CleanRepositoryWorktree `
      -GitExecutable $gitCommand.Source `
      -RepositoryRoot $repositoryRoot
    $receipt.evidence.sourceRevision = $repositoryRevision
    $receipt.checks['sourceRevision'] = $true
    $receipt.checks['sourceFilesClean'] = $true

    Assert-SidecarSourceBinding `
      -Provenance $packagedSidecarProvenance `
      -RepositoryRoot $repositoryRoot `
      -ExpectedRevision $repositoryRevision `
      -GitExecutable $gitCommand.Source
  } else {
    $receipt.evidence.sourceRevision = [Environment]::GetEnvironmentVariable('GITHUB_SHA', 'Process')
  }
  if ([string]::IsNullOrWhiteSpace([string]$receipt.evidence.sourceRevision)) {
    $receipt.evidence.sourceRevision = [string]$packagedSidecarProvenance.manifest.sourceRevision
  }
  $receipt.evidence.sidecarSourceRevision =
    [string]$packagedSidecarProvenance.manifest.sourceRevision
  $receipt.evidence.sidecarBundleSha256 = [string]$packagedSidecarProvenance.bundleSha256
  $receipt.evidence.sidecarProvenanceSha256 =
    [string]$packagedSidecarProvenance.provenanceSha256
  $receipt.evidence.sidecarSourceInputCount =
    [int]$packagedSidecarProvenance.sourceInputCount
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
    Assert-ExpectedAuthenticodeSignature `
      $signature $ExpectedSignerThumbprint $ExpectedSignerSubject 'Release installer'
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
  $profileAbsenceProven = $true
  $processHome = [Environment]::GetEnvironmentVariable('HOME', 'Process')
  if (-not [string]::IsNullOrWhiteSpace($processHome)) {
    Assert-True ([string]::Equals(
      [System.IO.Path]::GetFullPath($processHome).TrimEnd('\'),
      [System.IO.Path]::GetFullPath($env:USERPROFILE).TrimEnd('\'),
      [System.StringComparison]::OrdinalIgnoreCase
    )) 'HOME must resolve to USERPROFILE so external profile isolation cannot be redirected.'
  }
  $externalProfileRootBaselines = @(
    foreach ($target in $externalProfileRootTargets) {
      Get-ExternalProfileRootSnapshot `
        -Name ([string]$target.name) `
        -Path ([string]$target.path)
    }
  )
  $receipt.evidence['externalProfileRoots'] = @(
    foreach ($baseline in $externalProfileRootBaselines) {
      [ordered]@{
        name = [string]$baseline.name
        path = [string]$baseline.path
        existedBefore = [bool]$baseline.existedBefore
        entryCount = [long]$baseline.entryCount
        manifestSha256 = $baseline.manifestSha256
      }
    }
  )
  $externalProfileRootsPreProven = $true
  $receipt.checks['externalProfileRootsPreProven'] = $true
  # The desktop webview and Rust shell currently share the fixed loopback port
  # 3333 contract. Refuse before creating profile state rather than clean up
  # after colliding with another installation.
  Assert-TcpPortAvailable 3333
  New-Item -ItemType Directory -Path $profileDataDir | Out-Null
  $profileRoot = Get-Item -LiteralPath $profileDataDir -Force
  Assert-True (($profileRoot.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0) `
    'Certificate profile root must not be a reparse point.'
  Set-Content -LiteralPath $profileDataMarker -Value $runId -Encoding UTF8
  $profileRootOwned = $true

  $env:WAGGLE_PORT = '3333'
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
  Assert-True (
    [string]::IsNullOrEmpty(
      [Environment]::GetEnvironmentVariable('WAGGLE_DATA_DIR', 'Process')
    )
  ) 'WAGGLE_DATA_DIR must be absent so the packaged default-profile fallback is exercised.'
  Assert-True (
    [string]::Equals(
      [System.IO.Path]::GetFullPath($dataDir).TrimEnd('\'),
      [System.IO.Path]::GetFullPath((Join-Path $env:USERPROFILE '.waggle')).TrimEnd('\'),
      [System.StringComparison]::OrdinalIgnoreCase
    )
  ) 'Certificate data directory is not the real Windows default profile.'
  $receipt.checks['defaultProfileDataDir'] = $true

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
  $upgradeManagedModelName = $null
  $upgradeManagedModelDigest = $null
  if ($RequireVersionToVersionUpgrade) {
    Assert-ArtifactIdentity `
      $PreviousInstallerPath `
      $ExpectedPreviousInstallerSha256 `
      $ExpectedSignerThumbprint `
      $ExpectedSignerSubject `
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
      $previousInstalledAppSignature `
      $ExpectedSignerThumbprint `
      $ExpectedSignerSubject `
      'Previous installed Waggle executable'
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
    $webViewDebugPort = if ($WebViewDebugPort -gt 0) { $WebViewDebugPort } else { Get-FreeTcpPort }
    $previousProcess = Start-InstalledApp $appExecutable $webViewDebugPort
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
      $previousHeaders = Get-CertificateSessionHeaders `
        $previousBaseUrl $nodeCommand.Source $bootstrapHelperPath $webViewDebugPort `
        -AllowLegacyUi
      $receipt.checks['previousUi'] = $true
      $previousTier = Invoke-JsonRequest "$previousBaseUrl/api/tier" $previousHeaders
      Assert-True ([string]$previousTier.tier -ceq 'FREE') `
        "The protected previous release reported an unexpected effective tier: $($previousTier.tier)"
      $receipt.checks['previousSoloTier'] = $true
      if ($VerifyManagedModel) {
        $previousBootstrapResponse = Invoke-JsonPostRequest `
          "$previousBaseUrl/api/local-inference/bootstrap" `
          @{} `
          $previousHeaders `
          $managedOperationTimeoutSeconds
        $previousBootstrap = $previousBootstrapResponse.Content | ConvertFrom-Json
        Assert-True (
          [int]$previousBootstrapResponse.StatusCode -eq 200 -and
          $previousBootstrap.ok -eq $true -and
          $previousBootstrap.dockerRequired -eq $false
        ) 'The protected previous release could not bootstrap its managed local runtime.'
        $previousPullResponse = Invoke-JsonPostRequest `
          "$previousBaseUrl/api/local-inference/pull" `
          @{ model = $managedCertificateModel } `
          $previousHeaders `
          $managedOperationTimeoutSeconds
        $previousPull = $previousPullResponse.Content | ConvertFrom-Json
        Assert-True (
          [int]$previousPullResponse.StatusCode -eq 200 -and
          $previousPull.ok -eq $true -and
          $previousPull.verifiedGeneration -eq $true
        ) 'The protected previous release could not seed the managed local model.'
        Assert-True ([string]$previousPull.digest -match '^sha256:[0-9a-f]{64}$') `
          'The protected previous release returned no immutable managed-model digest.'
        $upgradeManagedModelName = [string]$previousPull.model
        $upgradeManagedModelDigest = [string]$previousPull.digest
        Assert-True (-not [string]::IsNullOrWhiteSpace($upgradeManagedModelName)) `
          'The protected previous release returned no managed-model identity.'
        $receipt.upgrade.managedModelName = $upgradeManagedModelName
        $receipt.upgrade.managedModelDigest = $upgradeManagedModelDigest
        $receipt.checks['previousManagedModelSeeded'] = $true
      }
      $certificateLifecycleData = New-CertificateLifecycleData `
        $previousBaseUrl $previousHeaders $runId $dataDir
      $receipt.lifecycleData = $certificateLifecycleData
      $receipt.checks['realWorkspaceAndMemorySeeded'] = $true
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
        -ManagedRuntimeRoot $managedRuntimeRoot -AdditionalPorts @($ollamaPort, $webViewDebugPort)
      $previousProcess.Dispose()
    }

    Assert-NoForeignWaggleProcesses $appExecutable
    Assert-ArtifactIdentity `
      $InstallerPath `
      $ExpectedCandidateInstallerSha256 `
      $ExpectedSignerThumbprint `
      $ExpectedSignerSubject `
      'Candidate installer before upgrade'
    Invoke-RawProcess $InstallerPath "/S /D=$installDir" 420
    Assert-ArtifactIdentity `
      $InstallerPath `
      $ExpectedCandidateInstallerSha256 `
      $ExpectedSignerThumbprint `
      $ExpectedSignerSubject `
      'Candidate installer after upgrade'
    Wait-ForInstalledRuntimeStop $appExecutable $serviceScript 3333 `
      -ManagedRuntimeRoot $managedRuntimeRoot -AdditionalPorts @($ollamaPort, $webViewDebugPort)
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
  $installedSidecarProvenance = Get-SidecarProvenance $serviceScript
  Assert-SidecarBundleBinding `
    -Packaged $packagedSidecarProvenance `
    -Installed $installedSidecarProvenance
  $receipt.checks['sidecarSourceProvenance'] = $true
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
  $offlinePackageArchiveRoot = Join-Path $scratchRoot 'offline-npm-archive'
  $offlinePackageArchivePayload = Join-Path $offlinePackageArchiveRoot 'package'
  $offlinePackageArchive = Join-Path $scratchRoot 'waggle-offline-install-probe-1.0.0.tgz'
  $offlinePackageTar = Join-Path $isolationPath 'tar.exe'
  $offlineLifecycleWitnessPrefix = Join-Path $scratchRoot 'offline-npm-lifecycle'
  $offlineInstallRoot = Join-Path $scratchRoot 'offline-npm-install'
  $offlineCache = Join-Path $scratchRoot 'offline-npm-cache'
  $isolatedUserConfig = Join-Path $scratchRoot 'empty-user.npmrc'
  $isolatedGlobalConfig = Join-Path $scratchRoot 'empty-global.npmrc'
  New-Item -ItemType Directory -Path @(
    $offlinePackageSource,
    $offlinePackageArchivePayload,
    $offlineInstallRoot,
    $offlineCache
  ) -Force | Out-Null
  Set-Content -LiteralPath $isolatedUserConfig -Value '' -NoNewline
  Set-Content -LiteralPath $isolatedGlobalConfig -Value '' -NoNewline
  $offlinePackageManifest = [ordered]@{
    name = 'waggle-offline-install-probe'
    version = '1.0.0'
    scripts = [ordered]@{
      prepare = "node -e `"require('node:fs').writeFileSync(process.env.WAGGLE_NPM_LIFECYCLE_WITNESS_PREFIX + '-prepare-ran.txt','unexpected')`""
      prepack = "node -e `"require('node:fs').writeFileSync(process.env.WAGGLE_NPM_LIFECYCLE_WITNESS_PREFIX + '-prepack-ran.txt','unexpected')`""
      install = "node -e `"require('node:fs').writeFileSync(process.env.WAGGLE_NPM_LIFECYCLE_WITNESS_PREFIX + '-install-ran.txt','unexpected')`""
    }
  }
  $offlinePackageManifest | ConvertTo-Json -Depth 4 |
    Set-Content -LiteralPath (Join-Path $offlinePackageSource 'package.json') -Encoding UTF8
  Copy-Item `
    -LiteralPath (Join-Path $offlinePackageSource 'package.json') `
    -Destination (Join-Path $offlinePackageArchivePayload 'package.json')
  Invoke-RawProcess $offlinePackageTar (
    '-czf "{0}" -C "{1}" package' -f $offlinePackageArchive, $offlinePackageArchiveRoot
  ) 60
  $offlinePackageArchiveItem = Get-Item -LiteralPath $offlinePackageArchive -Force
  Assert-True (
    $offlinePackageArchiveItem -is [System.IO.FileInfo] -and
      ($offlinePackageArchiveItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0
  ) 'Offline npm probe archive is missing or is a reparse point.'
  Assert-True (@(Get-ChildItem -LiteralPath $offlineCache -Force).Count -eq 0) `
    'Offline npm certificate cache was not clean before the probe.'
  [Environment]::SetEnvironmentVariable(
    'WAGGLE_NPM_LIFECYCLE_WITNESS_PREFIX',
    $offlineLifecycleWitnessPrefix,
    'Process'
  )
  $npmInstallOutput = @(
    & $bundledNode $bundledNpmCli install --offline --ignore-scripts --no-audit --no-fund `
      --package-lock=false --save=false --userconfig $isolatedUserConfig `
      --globalconfig $isolatedGlobalConfig --cache $offlineCache --prefix $offlineInstallRoot `
      -- $offlinePackageArchive 2>&1
  )
  Assert-True ($LASTEXITCODE -eq 0) `
    "Bundled npm offline local install failed: $($npmInstallOutput -join [Environment]::NewLine)"
  $installedOfflinePackage = Join-Path $offlineInstallRoot 'node_modules\waggle-offline-install-probe'
  Assert-True (Test-Path -LiteralPath (Join-Path $installedOfflinePackage 'package.json') -PathType Leaf) `
    'Bundled npm did not install the local offline package.'
  $installedOfflinePackageItem = Get-Item -LiteralPath $installedOfflinePackage -Force
  Assert-True (
    $installedOfflinePackageItem -is [System.IO.DirectoryInfo] -and
      ($installedOfflinePackageItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0
  ) 'Bundled npm installed the local offline package as a reparse point.'
  foreach ($lifecycleMarker in @('prepare-ran.txt', 'prepack-ran.txt', 'install-ran.txt')) {
    $lifecycleWitness = "$offlineLifecycleWitnessPrefix-$lifecycleMarker"
    Assert-True (-not (Test-Path -LiteralPath $lifecycleWitness)) `
      "Bundled npm executed lifecycle script marker $lifecycleMarker despite --ignore-scripts."
  }
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
    Assert-ExpectedAuthenticodeSignature `
      $installedAppSignature $ExpectedSignerThumbprint $ExpectedSignerSubject 'Installed Waggle executable'
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
    Assert-LifecycleReceiptApprovedSigner `
      $receipt $ExpectedSignerThumbprint $ExpectedSignerSubject
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
  $webViewDebugPort = if ($WebViewDebugPort -gt 0) { $WebViewDebugPort } else { Get-FreeTcpPort }
  $firstProcess = Start-InstalledApp $appExecutable $webViewDebugPort
  try {
    $health = Wait-ForHealth $baseUrl $StartupTimeoutSeconds
    $firstProcess.Refresh()
    Assert-True (-not $firstProcess.HasExited) 'The installed desktop process exited during first boot'
    Assert-NoVisibleConsoleDescendant $firstProcess.Id
    $serviceLogPath = Join-Path $dataDir 'logs\service.log'
    Assert-True (Test-Path -LiteralPath $serviceLogPath -PathType Leaf) `
      'Hidden sidecar did not create its diagnostic service log.'
    $receipt.checks['firstBootHiddenService'] = $true
    $receipt.checks['serviceLog'] = $true
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
    $proxy = Invoke-BuiltInProxyLivenessProbe -Uri "$baseUrl/v1/health/liveliness"
    Assert-True ($proxy.status -eq 'healthy') 'Built-in provider proxy is not healthy'
    Assert-True ((Get-HttpStatusCode "$baseUrl/api/tier") -eq 401) `
      'A protected API route did not reject an unauthenticated loopback request'
    $receipt.checks['unauthenticatedProtectedRoute'] = $true
    $headers = Get-CertificateSessionHeaders `
      $baseUrl $nodeCommand.Source $bootstrapHelperPath $webViewDebugPort
    $receipt.checks['firstBootUi'] = $true
    $tier = Invoke-JsonRequest "$baseUrl/api/tier" $headers
    Assert-True ([string]$tier.tier -ceq 'FREE') `
      "A clean Solo install reported an unexpected effective tier: $($tier.tier)"
    $receipt.certifiedTier = 'FREE'
    $receipt.checks['soloTier'] = $true
    if ($RequireVersionToVersionUpgrade) {
      Assert-True ($null -ne $certificateLifecycleData) `
        'Upgrade lifecycle data was not created by the previous release.'
      Assert-CertificateLifecycleData $baseUrl $headers $certificateLifecycleData $dataDir
      $receipt.checks['upgradeRealWorkspaceAndMemoryPreserved'] = $true
    } else {
      $certificateLifecycleData = New-CertificateLifecycleData `
        $baseUrl $headers $runId $dataDir
      $receipt.lifecycleData = $certificateLifecycleData
      $receipt.checks['realWorkspaceAndMemorySeeded'] = $true
    }
    $marketplace = Invoke-JsonRequest `
      "$baseUrl/api/marketplace/search?type=mcp&source=mcp_registry&limit=100" `
      $headers `
      -TimeoutSeconds 30
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
    if (-not $RequireVersionToVersionUpgrade) {
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
    }
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

      if ($RequireVersionToVersionUpgrade) {
        Assert-True (
          -not [string]::IsNullOrWhiteSpace($upgradeManagedModelName) -and
          $upgradeManagedModelDigest -match '^sha256:[0-9a-f]{64}$'
        ) 'The upgrade certificate has no previous managed-model identity.'
        $preservedStatus = Invoke-JsonRequest "$baseUrl/api/local-inference/status" $headers
        $preservedOllamaServers = @(
          $preservedStatus.servers | Where-Object { [string]$_.type -eq 'ollama' }
        )
        Assert-True ($preservedStatus.offlineReady -eq $true -and $preservedOllamaServers.Count -eq 1) `
          'The candidate did not start the managed model preserved from the previous release.'
        Assert-True (@($preservedOllamaServers[0].models) -contains $upgradeManagedModelName) `
          'The candidate did not advertise the managed model preserved from the previous release.'
        Assert-True ($null -ne $preservedOllamaServers[0].modelDigests) `
          'The candidate did not advertise managed-model digests after upgrade.'
        $preservedDigestProperty = $preservedOllamaServers[0].modelDigests.PSObject.Properties[
          $upgradeManagedModelName
        ]
        Assert-True (
          $null -ne $preservedDigestProperty -and
          [string]$preservedDigestProperty.Value -ceq $upgradeManagedModelDigest
        ) 'The candidate changed the managed-model digest during upgrade.'
        $receipt.checks['upgradeManagedModelPreserved'] = $true
      }

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
      if ($RequireVersionToVersionUpgrade) {
        Assert-True (
          [string]$pull.model -ceq $upgradeManagedModelName -and
          [string]$pull.digest -ceq $upgradeManagedModelDigest
        ) 'The candidate managed-model verification did not preserve the previous release digest.'
      }
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
      -ManagedRuntimeRoot $managedRuntimeRoot -AdditionalPorts @($ollamaPort, $webViewDebugPort)
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
      $ExpectedSignerSubject `
      'Candidate installer before repair'
  }
  Invoke-RawProcess $InstallerPath "/S /D=$installDir" 420
  if ($RequireVersionToVersionUpgrade) {
    Assert-ArtifactIdentity `
      $InstallerPath `
      $ExpectedCandidateInstallerSha256 `
      $ExpectedSignerThumbprint `
      $ExpectedSignerSubject `
      'Candidate installer after repair'
  }
  Wait-ForInstalledRuntimeStop $appExecutable $serviceScript 3333 `
    -ManagedRuntimeRoot $managedRuntimeRoot -AdditionalPorts @($ollamaPort, $webViewDebugPort)
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
  $receipt.checks['repairRegistrations'] = $true

  $runtimeConfirmedStopped = $false
  $webViewDebugPort = if ($WebViewDebugPort -gt 0) { $WebViewDebugPort } else { Get-FreeTcpPort }
  $secondProcess = Start-InstalledApp $appExecutable $webViewDebugPort
  try {
    $null = Wait-ForHealth $baseUrl $StartupTimeoutSeconds
    $secondProcess.Refresh()
    Assert-True (-not $secondProcess.HasExited) 'The installed desktop process exited after repair'
    Assert-NoVisibleConsoleDescendant $secondProcess.Id
    $receipt.checks['repairHiddenService'] = $true
    $repairHeaders = Get-CertificateSessionHeaders `
      $baseUrl $nodeCommand.Source $bootstrapHelperPath $webViewDebugPort
    $receipt.checks['repairUi'] = $true
    $repairTier = Invoke-JsonRequest "$baseUrl/api/tier" $repairHeaders
    Assert-True ([string]$repairTier.tier -ceq 'FREE') `
      "The repaired Solo install reported an unexpected effective tier: $($repairTier.tier)"
    $receipt.checks['repairSoloTier'] = $true
    Assert-CertificateLifecycleData $baseUrl $repairHeaders $certificateLifecycleData $dataDir
    if ($VerifyManagedModel) {
      $managedModelName = [string]$receipt.managedModel.name
      Assert-True (-not [string]::IsNullOrWhiteSpace($managedModelName)) `
        'The repair certificate lost the managed model identity.'
      $repairManagedStatus = $null
      $repairManagedDeadline = [DateTime]::UtcNow.AddSeconds(300)
      do {
        try {
          $repairManagedStatus = Invoke-JsonRequest "$baseUrl/api/local-inference/status" $repairHeaders
        } catch {
          $repairManagedStatus = $null
        }
        if ($null -ne $repairManagedStatus -and $repairManagedStatus.offlineReady -eq $true) {
          break
        }
        Start-Sleep -Seconds 1
      } while ([DateTime]::UtcNow -lt $repairManagedDeadline)
      Assert-True ($null -ne $repairManagedStatus -and $repairManagedStatus.offlineReady -eq $true) `
        'The persisted managed local model did not become ready after repair.'
      $repairOllamaServers = @(
        $repairManagedStatus.servers | Where-Object { [string]$_.type -eq 'ollama' }
      )
      Assert-True ($repairOllamaServers.Count -eq 1) `
        'The repaired install did not expose exactly one Ollama runtime.'
      Assert-True (@($repairOllamaServers[0].models) -contains $managedModelName) `
        'The repaired install did not preserve the certified managed model.'
      Assert-True ($null -ne $repairOllamaServers[0].modelDigests) `
        'The repaired install did not advertise managed-model digests.'
      $repairDigestProperty = $repairOllamaServers[0].modelDigests.PSObject.Properties[
        $managedModelName
      ]
      Assert-True (
        $null -ne $repairDigestProperty -and
        [string]$repairDigestProperty.Value -ceq [string]$receipt.managedModelDigest
      ) 'The repaired install changed the certified managed-model digest.'
      $receipt.checks['repairManagedModelDigestPreserved'] = $true

      $proxyChatResponse = Invoke-JsonPostRequest "$baseUrl/v1/chat/completions" @{
        model = "ollama/$managedModelName"
        messages = @(
          [ordered]@{
            role = 'user'
            content = 'Reply with one short sentence confirming that local proxy inference works.'
          }
        )
        max_tokens = 32
        stream = $false
      } $repairHeaders 300
      Assert-True ([int]$proxyChatResponse.StatusCode -eq 200) `
        'The repaired built-in proxy did not complete a managed local-model request.'
      $proxyChat = $proxyChatResponse.Content | ConvertFrom-Json
      $proxyChoices = @($proxyChat.choices)
      Assert-True ($proxyChoices.Count -eq 1) `
        'The repaired built-in proxy returned an unexpected choice count.'
      $proxyContent = [string]$proxyChoices[0].message.content
      Assert-True (-not [string]::IsNullOrWhiteSpace($proxyContent)) `
        'The repaired built-in proxy completed without response content.'
      Assert-True ([string]$proxyChat.model -eq $managedModelName) `
        'The repaired built-in proxy did not strip the Ollama routing prefix.'
      $receipt.managedModel['proxyRestartChatResponseChars'] = $proxyContent.Length
      $receipt.checks['managedModelProxyRestartChat'] = $true
    }
    $receipt.checks['repairPreservedData'] = $true
    $receipt.checks['repairRealWorkspaceAndMemoryPreserved'] = $true
    $receipt.checks['relaunchAfterRepair'] = $true
  } finally {
    Stop-InstalledProcesses $appExecutable $serviceScript $managedRuntimeRoot
    Wait-ForInstalledRuntimeStop $appExecutable $serviceScript 3333 `
      -ManagedRuntimeRoot $managedRuntimeRoot -AdditionalPorts @($ollamaPort, $webViewDebugPort)
    $runtimeConfirmedStopped = $true
    $secondProcess.Dispose()
  }

  Assert-NoForeignWaggleProcesses $appExecutable
  $preUninstallDataManifest = @(Get-CertificateDataManifest $profileDataDir)
  Assert-True ($preUninstallDataManifest.Count -gt 0) `
    'Default-profile manifest is empty before uninstall.'
  $receipt.lifecycleData['preUninstallManifestEntryCount'] = $preUninstallDataManifest.Count
  $receipt.lifecycleData['preUninstallManifestSha256'] = Get-CertificateDataManifestDigest `
    $preUninstallDataManifest
  $runtimeConfirmedStopped = $false
  Invoke-RawProcess $registeredUninstaller '/S' 300
  Wait-ForPathState $installDir $false 90
  # NSIS copies the uninstaller to a temporary process. The launcher can exit
  # and the install directory can disappear before that process finishes the
  # registry and shortcut tail, so wait on the actual postconditions.
  Wait-ForPathState $uninstallRegistry $false 30
  $receipt.checks['uninstallerCleanup'] = $true
  Remove-CertificateProductRegistry $productRegistry $installDir
  Assert-CertificateUninstallPostconditions `
    -InstallDir $installDir `
    -UninstallRegistry $uninstallRegistry `
    -ProductRegistry $productRegistry `
    -RunRegistry $runRegistry `
    -RunRegistryValue $runRegistryValue `
    -ShortcutPaths $shortcutCandidates `
    -AppExecutable $appExecutable `
    -ServiceScript $serviceScript `
    -Port 3333 `
    -ManagedRuntimeRoot $managedRuntimeRoot `
    -AdditionalPorts @($ollamaPort, $webViewDebugPort)
  $uninstallPostconditionsConfirmed = $true
  $runtimeConfirmedStopped = $true
  $postUninstallDataManifest = @(Get-CertificateDataManifest $profileDataDir)
  Assert-CertificateDataManifest $preUninstallDataManifest $postUninstallDataManifest
  $postUninstallManifestSha256 = Get-CertificateDataManifestDigest $postUninstallDataManifest
  Assert-True (
    [string]$postUninstallManifestSha256 -ceq
      [string]$receipt.lifecycleData.preUninstallManifestSha256
  ) 'Silent uninstall changed the default-profile manifest digest.'
  $receipt.lifecycleData['postUninstallManifestSha256'] = $postUninstallManifestSha256
  $receipt.checks['uninstallRealWorkspaceAndMemoryPreserved'] = $true
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
  Remove-CertificateProfileData `
    $profileDataDir $profileDataMarker $runId $profileAbsenceProven $runtimeConfirmedStopped
  $profileRootOwned = $false
  $receipt.checks['certificateProfileCleanup'] = $true
  $receipt.status = 'passed'
} catch {
  $receipt.status = 'failed'
  $receipt.error = $_.Exception.Message
  $serviceLog = Join-Path $dataDir 'logs\service.log'
  if (Test-Path -LiteralPath $serviceLog -PathType Leaf) {
    $receipt['serviceLogTail'] = @(Get-Content -LiteralPath $serviceLog -Tail 80)
  }
  throw
} finally {
  try {
    $runtimeConfirmedStopped = $false
    Stop-InstalledProcesses $appExecutable $serviceScript $managedRuntimeRoot
    Wait-ForInstalledRuntimeStop $appExecutable $serviceScript 3333 `
      -ManagedRuntimeRoot $managedRuntimeRoot -AdditionalPorts @($ollamaPort, $webViewDebugPort)
    Assert-NoForeignWaggleProcesses $appExecutable
    Assert-TcpPortAvailable 3333
    $runtimeConfirmedStopped = $true
  } catch {
    $receipt.status = 'failed'
    $receipt['runtimeCleanupError'] = $_.Exception.Message
  }
  if (Test-Path -LiteralPath $uninstaller -PathType Leaf) {
    try {
      $runtimeConfirmedStopped = $false
      Assert-NoForeignWaggleProcesses $appExecutable
      Invoke-RawProcess $uninstaller '/S' 300
      Wait-ForPathState $installDir $false 90
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
  if ($installerStarted) {
    $uninstallPostconditionsConfirmed = $false
    try {
      Assert-CertificateUninstallPostconditions `
        -InstallDir $installDir `
        -UninstallRegistry $uninstallRegistry `
        -ProductRegistry $productRegistry `
        -RunRegistry $runRegistry `
        -RunRegistryValue $runRegistryValue `
        -ShortcutPaths $shortcutCandidates `
        -AppExecutable $appExecutable `
        -ServiceScript $serviceScript `
        -Port 3333 `
        -ManagedRuntimeRoot $managedRuntimeRoot `
        -AdditionalPorts @($ollamaPort, $webViewDebugPort)
      $runtimeConfirmedStopped = $true
      $uninstallPostconditionsConfirmed = $true
    } catch {
      $receipt.status = 'failed'
      $receipt['uninstallPostconditionError'] = $_.Exception.Message
    }
  } elseif (-not $uninstallPostconditionsConfirmed) {
    $uninstallPostconditionsConfirmed = $runtimeConfirmedStopped
  }
  if ($profileRootOwned -and $uninstallPostconditionsConfirmed) {
    try {
      Remove-CertificateProfileData `
        $profileDataDir $profileDataMarker $runId $profileAbsenceProven $runtimeConfirmedStopped
      $profileRootOwned = $false
    } catch {
      $receipt.status = 'failed'
      $receipt['profileCleanupError'] = $_.Exception.Message
    }
  } elseif ($profileRootOwned) {
    $receipt.status = 'failed'
    $receipt['profileCleanupError'] = `
      'Certificate profile was preserved because uninstall postconditions were not proven.'
  }
  if ($externalProfileRootsPreProven) {
    try {
      Assert-ExternalProfileRootsUnchanged $externalProfileRootBaselines
      $receipt.checks['externalProfileRootsUnchanged'] = $true
    } catch {
      $receipt.status = 'failed'
      $receipt['externalProfileIsolationError'] = $_.Exception.Message
    }
  } elseif ($receipt.status -eq 'passed') {
    $receipt.status = 'failed'
    $receipt['externalProfileIsolationError'] = `
      'External profile roots were not proven before installer execution.'
  }
  if ($receipt.status -eq 'passed' -and -not $KeepArtifacts) {
    try {
      Remove-CertificateScratchRoot $scratchRoot $scratchOwnershipMarker $runId
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
  $receiptJson = $receipt | ConvertTo-Json -Depth 8
  Write-CertificateReceipt $receiptReservation $receiptJson
}

if ($receipt.status -ne 'passed') {
  $failureDetail = if ($receipt.error) {
    $receipt.error
  } elseif ($receipt.Contains('externalProfileIsolationError')) {
    $receipt['externalProfileIsolationError']
  } elseif ($receipt.Contains('environmentRestoreError')) {
    $receipt['environmentRestoreError']
  } elseif ($receipt.Contains('scratchCleanupError')) {
    $receipt['scratchCleanupError']
  } else {
    'unknown failure'
  }
  throw "Windows installer certificate failed: $failureDetail"
}
Write-Host "Windows installer certificate passed: $ReceiptPath"
