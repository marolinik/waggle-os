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

  [string]$ExpectedSourceRevision
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
    [Parameter(Mandatory = $true)] [string]$ServiceScript
  )

  $ids = [System.Collections.Generic.HashSet[int]]::new()
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
    if ($exactApp -or $exactSidecar) {
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
    [ValidateRange(5, 120)] [int]$TimeoutSeconds = 30
  )

  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  $consecutiveAvailableProbes = 0
  do {
    $ownedProcessIds = @(Get-InstalledProcessIds $AppExecutable $ServiceScript)
    if ($ownedProcessIds.Count -eq 0 -and (Test-TcpPortAvailable $Port)) {
      $consecutiveAvailableProbes++
      if ($consecutiveAvailableProbes -ge 2) { return }
    } else {
      $consecutiveAvailableProbes = 0
    }
    Start-Sleep -Milliseconds 300
  } while ([DateTime]::UtcNow -lt $deadline)

  $remainingProcessIds = @(Get-InstalledProcessIds $AppExecutable $ServiceScript)
  throw "Installed runtime did not stop cleanly; owned PIDs=$($remainingProcessIds -join ',') port=$Port"
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
    [Parameter(Mandatory = $true)] [string]$ServiceScript
  )

  $taskkill = Join-Path $env:SystemRoot 'System32\taskkill.exe'
  foreach ($processId in (Get-InstalledProcessIds $AppExecutable $ServiceScript)) {
    try {
      Invoke-RawProcess $taskkill "/PID $processId /T /F" 20
    } catch {
      # Killing the main process tree can make a separately captured child PID
      # disappear. Re-check exact ownership before treating that as a failure.
      $stillOwned = Get-InstalledProcessIds $AppExecutable $ServiceScript
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
  schemaVersion = 2
  status = 'running'
  startedAt = $startedAt.ToString('o')
  finishedAt = $null
  installer = [ordered]@{
    name = $installer.Name
    sha256 = (Get-FileHash -LiteralPath $InstallerPath -Algorithm SHA256).Hash
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
  }
  scratchRoot = $scratchRoot
  embeddingPayloadReady = $false
  embeddingPayload = $null
  managedModelVerified = $false
  bundledNpm = $null
  checks = [ordered]@{}
  error = $null
}

New-Item -ItemType Directory -Path $scratchRoot, $dataDir -Force | Out-Null

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
      'scripts/bundle-node.mjs',
      'scripts/certify-windows-installer.ps1',
      'scripts/check-sidecar-resources.mjs',
      'scripts/stage-sidecar-deps.mjs',
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
  $env:OLLAMA_HOST = "http://127.0.0.1:$(Get-FreeTcpPort)"
  $env:VLLM_HOST = "http://127.0.0.1:$(Get-FreeTcpPort)"
  $env:WAGGLE_SKIP_MARKETPLACE_SYNC = '1'
  $isolationPath = Join-Path $scratchRoot 'isolated-path'
  New-Item -ItemType Directory -Path $isolationPath -Force | Out-Null
  $env:PATH = $isolationPath
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
  Invoke-RawProcess $InstallerPath "/S /D=$installDir" 420
  Wait-ForPathState $appExecutable $true
  Assert-True (Test-Path -LiteralPath $uninstaller -PathType Leaf) 'Installer did not create uninstall.exe'
  Assert-True (Test-Path -LiteralPath $serviceScript -PathType Leaf) 'Installer omitted resources/service.js'
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
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
    Set-Content -LiteralPath $dataMarker -Value $runId -Encoding UTF8
  } finally {
    Stop-InstalledProcesses $appExecutable $serviceScript
    Wait-ForInstalledRuntimeStop $appExecutable $serviceScript 3333
    $firstProcess.Dispose()
  }

  # Prove a same-version repair actually restores installed bytes instead of
  # merely returning success while leaving a stale payload in place.
  $serviceHash = (Get-FileHash -LiteralPath $serviceScript -Algorithm SHA256).Hash
  Set-Content -LiteralPath $serviceScript -Value '// deliberately corrupted by installer certificate' -Encoding UTF8
  Assert-True ((Get-FileHash -LiteralPath $serviceScript -Algorithm SHA256).Hash -ne $serviceHash) `
    'Could not prepare the repair probe'
  Assert-NoForeignWaggleProcesses $appExecutable
  Invoke-RawProcess $InstallerPath "/S /D=$installDir" 420
  Wait-ForInstalledRuntimeStop $appExecutable $serviceScript 3333
  Assert-True ((Get-FileHash -LiteralPath $serviceScript -Algorithm SHA256).Hash -eq $serviceHash) `
    'Same-version repair did not restore resources/service.js'
  Assert-True (Test-Path -LiteralPath $dataMarker -PathType Leaf) 'Repair removed user data'
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
    Stop-InstalledProcesses $appExecutable $serviceScript
    Wait-ForInstalledRuntimeStop $appExecutable $serviceScript 3333
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
  Wait-ForInstalledRuntimeStop $appExecutable $serviceScript 3333
  $installerStarted = $false
  Assert-True (Test-Path -LiteralPath $dataMarker -PathType Leaf) `
    'Silent uninstall did not preserve user data by default'
  Assert-True (Test-Path -LiteralPath $profileDataMarker -PathType Leaf) `
    'Silent uninstall removed the Windows profile data path'
  Assert-True ((Get-Content -Raw -LiteralPath $profileDataMarker).Trim() -eq $runId) `
    'Silent uninstall changed the Windows profile data marker'
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
    Stop-InstalledProcesses $appExecutable $serviceScript
    if ($receipt.status -eq 'passed') {
      Wait-ForInstalledRuntimeStop $appExecutable $serviceScript 3333
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
      Wait-ForInstalledRuntimeStop $appExecutable $serviceScript 3333
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
