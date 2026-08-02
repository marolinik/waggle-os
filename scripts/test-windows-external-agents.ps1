[CmdletBinding()]
param(
  [string[]]$HostIds = @(),
  [string]$ReceiptDir = '',
  [string]$RunnerNode = '',
  [switch]$AuthenticatedTasks
)

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') {
  throw 'This guarded real-agent runner is Windows-only.'
}

function Resolve-ReceiptLayout([string]$RequestedReceiptDir) {
  if ([string]::IsNullOrWhiteSpace($RequestedReceiptDir)) { return $null }
  $fullPath = [IO.Path]::GetFullPath($RequestedReceiptDir)
  $trimmedPath = $fullPath.TrimEnd(
    [IO.Path]::DirectorySeparatorChar,
    [IO.Path]::AltDirectorySeparatorChar
  )
  $trimmedRoot = [IO.Path]::GetPathRoot($fullPath).TrimEnd(
    [IO.Path]::DirectorySeparatorChar,
    [IO.Path]::AltDirectorySeparatorChar
  )
  if ([string]::IsNullOrWhiteSpace($trimmedPath) -or
      $trimmedPath.Equals($trimmedRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'ReceiptDir must name a child directory, not a filesystem root.'
  }
  $parent = [IO.Path]::GetFullPath([IO.Path]::GetDirectoryName($trimmedPath))
  $leaf = [IO.Path]::GetFileName($trimmedPath)
  if ([string]::IsNullOrWhiteSpace($leaf)) {
    throw 'ReceiptDir must have a non-empty final directory name.'
  }
  return [pscustomobject]@{
    Root = $trimmedPath
    Parent = $parent
    StagingRoot = Join-Path $parent (
      ".$leaf.staging-$([guid]::NewGuid().ToString('N'))"
    )
  }
}

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$script:runnerNodePath = if ([string]::IsNullOrWhiteSpace($RunnerNode)) {
  (Get-Command node.exe -ErrorAction Stop).Source
} else {
  (Resolve-Path -LiteralPath $RunnerNode -ErrorAction Stop).Path
}
$script:playwrightCli = (Resolve-Path -LiteralPath (
  Join-Path $repoRoot 'node_modules\playwright\cli.js'
)).Path
$script:vitestCli = (Resolve-Path -LiteralPath (
  Join-Path $repoRoot 'node_modules\vitest\vitest.mjs'
)).Path
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$runRoot = Join-Path $tempBase ("waggle-windows-external-agents-" + [guid]::NewGuid().ToString('N'))
$hookProfile = Join-Path $runRoot 'hook-profile'
$receiptLayout = Resolve-ReceiptLayout -RequestedReceiptDir $ReceiptDir
$receiptRoot = if ($null -eq $receiptLayout) { $null } else { $receiptLayout.Root }
if ($AuthenticatedTasks -and $null -eq $receiptRoot) {
  throw 'AuthenticatedTasks requires a fresh ReceiptDir for durable release evidence.'
}
$rawReceiptRoot = Join-Path $runRoot 'raw-receipts'
$receiptParent = if ($null -eq $receiptLayout) { $null } else { $receiptLayout.Parent }
$receiptStagingRoot = if ($null -eq $receiptLayout) { $null } else { $receiptLayout.StagingRoot }
$receiptStagingOwned = $false
$expectedReceiptNames = @('hooks-report.json', 'tools-report.json')
if ($AuthenticatedTasks) { $expectedReceiptNames += 'authenticated-tasks-report.json' }
$originalEnvironment = @{}
$profileVariables = @(
  'USERPROFILE', 'HOME', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA',
  'CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'HERMES_HOME', 'HERMES_PROFILE'
)
$secretVariables = @(
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'OPENAI_API_KEY',
  'OPENAI_ACCESS_TOKEN',
  'OPENROUTER_API_KEY',
  'GOOGLE_API_KEY',
  'GEMINI_API_KEY',
  'GROQ_API_KEY',
  'XAI_API_KEY',
  'MISTRAL_API_KEY',
  'COHERE_API_KEY',
  'DEEPSEEK_API_KEY',
  'AZURE_OPENAI_API_KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_PROFILE',
  'AWS_CONFIG_FILE',
  'AWS_SHARED_CREDENTIALS_FILE',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'CLOUDSDK_CONFIG',
  'AZURE_CONFIG_DIR',
  'KUBECONFIG',
  'DOCKER_CONFIG',
  'DOCKER_HOST',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'STRIPE_SECRET_KEY',
  'DATABASE_URL',
  'NPM_TOKEN',
  'HF_TOKEN',
  'HUGGING_FACE_HUB_TOKEN',
  'RENDER_API_KEY',
  'SSH_AUTH_SOCK',
  'GIT_ASKPASS',
  'SSH_ASKPASS',
  'GIT_SSH_COMMAND',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NODE_OPTIONS'
)
$secretNamePattern = '(?i)(^|_)(API_KEY|ACCESS_TOKEN|AUTH_TOKEN|TOKEN|SECRET|PASSWORD|CREDENTIALS?|COOKIE|DSN)(_|$)'
$ambientSecretVariables = @(
  Get-ChildItem Env: |
    Where-Object { $_.Name -match $secretNamePattern } |
    ForEach-Object { $_.Name }
)
$secretVariables = @($secretVariables + $ambientSecretVariables | Select-Object -Unique)
$runnerVariables = @(
  'WAGGLE_E2E_HOST_IDS',
  'WAGGLE_E2E_REAL_HOOKS',
  'WAGGLE_E2E_HOOK_HOME',
  'WAGGLE_E2E_REAL_TOOLS',
  'WAGGLE_E2E_TEMP_ROOT',
  'WAGGLE_E2E_DATA_DIR',
  'WAGGLE_E2E_PORT',
  'WAGGLE_E2E_BASE_URL',
  'WAGGLE_E2E_SKIP_LITELLM',
  'WAGGLE_E2E_REUSE_EXISTING_SERVER',
  'PLAYWRIGHT_JSON_OUTPUT_FILE',
  'PATH',
  'WAGGLE_LIVE_EXTERNAL_AGENTS',
  'WAGGLE_LIVE_HERMES_PROVIDER',
  'WAGGLE_LIVE_HERMES_MODEL'
)
$environmentToRestore = @($profileVariables + $secretVariables + $runnerVariables | Select-Object -Unique)
$requestedHostIds = if ($HostIds.Count -eq 0) {
  $null
} else {
  $emptyHostIds = @(
    $HostIds | Where-Object { $_ -match '(^|,)\s*(?=,|$)' }
  )
  if ($emptyHostIds.Count -gt 0) {
    throw 'HostIds cannot contain empty values.'
  }
  $normalizedHostIds = @(
    $HostIds |
      ForEach-Object { $_ -split ',' } |
      ForEach-Object { $_.Trim() }
  )
  $duplicateHostIds = @(
    $normalizedHostIds |
      Group-Object |
      Where-Object { $_.Count -gt 1 } |
      ForEach-Object { $_.Name }
  )
  if ($duplicateHostIds.Count -gt 0) {
    throw "HostIds cannot contain duplicate values: $($duplicateHostIds -join ', ')"
  }
  $normalizedHostIds -join ','
}
$authenticatedHostIds = @('claude-code', 'codex', 'hermes')
if ($AuthenticatedTasks) {
  if ($null -eq $requestedHostIds) {
    $requestedHostIds = $authenticatedHostIds -join ','
  }
  $selectedAuthenticatedHosts = @($requestedHostIds -split ',')
  $hostDelta = @(Compare-Object -ReferenceObject $authenticatedHostIds -DifferenceObject $selectedAuthenticatedHosts)
  if ($hostDelta.Count -gt 0 -or $selectedAuthenticatedHosts.Count -ne $authenticatedHostIds.Count) {
    throw "AuthenticatedTasks requires exactly: $($authenticatedHostIds -join ', ')"
  }
  $requestedHostIds = $authenticatedHostIds -join ','
}
$receiptHostIds = if ($null -eq $requestedHostIds) { @() } else { @($requestedHostIds -split ',') }

foreach ($name in $environmentToRestore) {
  $item = Get-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
  $originalEnvironment[$name] = if ($null -eq $item) { $null } else { $item.Value }
}

function Set-ProcessEnvironment([string]$Name, [AllowNull()][string]$Value) {
  [Environment]::SetEnvironmentVariable($Name, $Value, 'Process')
}

function Restore-ProcessEnvironment([string]$Name) {
  Set-ProcessEnvironment -Name $Name -Value $originalEnvironment[$Name]
}

function Assert-NoReparsePointInPath([string]$Path, [string]$FailureMessage) {
  $current = [IO.Path]::GetFullPath($Path)
  while (-not [string]::IsNullOrWhiteSpace($current)) {
    $item = $null
    try {
      $item = Get-Item -LiteralPath $current -Force -ErrorAction Stop
    } catch [System.Management.Automation.ItemNotFoundException] {
      $item = $null
    }
    if ($null -ne $item -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
      throw "$FailureMessage`: $current"
    }
    $parent = [IO.Path]::GetDirectoryName($current)
    if ([string]::IsNullOrWhiteSpace($parent) -or
        $parent.Equals($current, [StringComparison]::OrdinalIgnoreCase)) {
      break
    }
    $current = $parent
  }
}

function Copy-IsolatedAuthenticationFile(
  [string]$Source,
  [string]$Destination,
  [string]$OwnedRoot
) {
  $sourceItem = Get-Item -LiteralPath $Source -Force -ErrorAction Stop
  if ($sourceItem.PSIsContainer -or
      ($sourceItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
      $sourceItem.Length -le 0) {
    throw 'Authentication source must be a non-empty regular file'
  }
  $resolvedOwnedRoot = [IO.Path]::GetFullPath($OwnedRoot).TrimEnd(
    [IO.Path]::DirectorySeparatorChar,
    [IO.Path]::AltDirectorySeparatorChar
  ) + [IO.Path]::DirectorySeparatorChar
  $resolvedDestination = [IO.Path]::GetFullPath($Destination)
  if (-not $resolvedDestination.StartsWith($resolvedOwnedRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Authentication copy escaped the owned run profile'
  }
  $destinationParent = [IO.Path]::GetDirectoryName($resolvedDestination)
  Assert-NoReparsePointInPath -Path $destinationParent `
    -FailureMessage 'Authentication copy path contains a reparse point'
  $null = New-Item -ItemType Directory -Path $destinationParent -Force
  Assert-NoReparsePointInPath -Path $destinationParent `
    -FailureMessage 'Authentication copy path contains a reparse point'
  [IO.File]::Copy($sourceItem.FullName, $resolvedDestination, $false)
  $destinationItem = Get-Item -LiteralPath $resolvedDestination -Force
  if ($destinationItem.PSIsContainer -or
      ($destinationItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
      $destinationItem.Length -ne $sourceItem.Length) {
    throw 'Isolated authentication copy failed verification'
  }
}

function New-IsolatedCodexShim(
  [string]$ShimRoot,
  [string]$CodexHome,
  [string]$OwnedRoot
) {
  $resolvedOwnedRoot = [IO.Path]::GetFullPath($OwnedRoot).TrimEnd(
    [IO.Path]::DirectorySeparatorChar,
    [IO.Path]::AltDirectorySeparatorChar
  ) + [IO.Path]::DirectorySeparatorChar
  $resolvedShimRoot = [IO.Path]::GetFullPath($ShimRoot)
  $resolvedCodexHome = [IO.Path]::GetFullPath($CodexHome)
  foreach ($candidate in @($resolvedShimRoot, $resolvedCodexHome)) {
    if (-not ($candidate + [IO.Path]::DirectorySeparatorChar).StartsWith(
      $resolvedOwnedRoot,
      [StringComparison]::OrdinalIgnoreCase
    )) {
      throw 'Codex isolation path escaped the owned run profile'
    }
    Assert-NoReparsePointInPath -Path $candidate `
      -FailureMessage 'Codex isolation path contains a reparse point'
  }
  $realCodexCmd = (Get-Command codex.cmd -CommandType Application -ErrorAction Stop |
    Select-Object -First 1).Source
  $realCodexCmdItem = Get-Item -LiteralPath $realCodexCmd -Force
  if ($realCodexCmdItem.PSIsContainer -or
      ($realCodexCmdItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'Codex npm command must be a regular file'
  }
  $cmdText = [IO.File]::ReadAllText($realCodexCmdItem.FullName)
  $entryMatch = [regex]::Match(
    $cmdText,
    '"%dp0%[\\/]+([^"\r\n]*node_modules[\\/]@openai[\\/]codex[\\/]bin[\\/]codex\.js)"',
    [Text.RegularExpressions.RegexOptions]::IgnoreCase
  )
  if (-not $entryMatch.Success) {
    throw 'Codex npm command did not expose a shell-free JavaScript entrypoint'
  }
  $realCodexEntry = [IO.Path]::GetFullPath((
    Join-Path ([IO.Path]::GetDirectoryName($realCodexCmdItem.FullName)) $entryMatch.Groups[1].Value
  ))
  $realCodexEntryItem = Get-Item -LiteralPath $realCodexEntry -Force
  if ($realCodexEntryItem.PSIsContainer -or
      ($realCodexEntryItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'Codex JavaScript entrypoint must be a regular file'
  }
  $null = New-Item -ItemType Directory -Path $resolvedShimRoot
  Assert-NoReparsePointInPath -Path $resolvedShimRoot `
    -FailureMessage 'Codex isolation path contains a reparse point'
  $launcherPath = Join-Path $resolvedShimRoot 'codex-isolated.mjs'
  $shimPath = Join-Path $resolvedShimRoot 'codex.cmd'
  $encodedCodexHome = ConvertTo-Json -InputObject $resolvedCodexHome -Compress
  $encodedCodexEntry = ConvertTo-Json -InputObject $realCodexEntryItem.FullName -Compress
  $launcher = @"
import { spawn } from 'node:child_process';
process.env.CODEX_HOME = $encodedCodexHome;
const child = spawn(process.execPath, [$encodedCodexEntry, ...process.argv.slice(2)], {
  env: process.env,
  stdio: 'inherit',
  windowsHide: true,
});
child.once('error', (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
child.once('exit', (code) => process.exit(code ?? 1));
"@
  $shim = @'
@ECHO off
SET "_prog=node"
"%_prog%" "%dp0%\codex-isolated.mjs" %*
'@
  [IO.File]::WriteAllText($launcherPath, $launcher, [Text.UTF8Encoding]::new($false))
  [IO.File]::WriteAllText($shimPath, $shim, [Text.ASCIIEncoding]::new())
  return [pscustomobject]@{
    Directory = $resolvedShimRoot
    Launcher = $launcherPath
    Shim = $shimPath
  }
}

function New-OwnedHermesProfile(
  [string]$ProfilesRoot,
  [string]$ProfileName,
  [string]$OwnedRoot
) {
  $resolvedProfilesRoot = [IO.Path]::GetFullPath($ProfilesRoot)
  $resolvedOwnedRoot = [IO.Path]::GetFullPath($OwnedRoot).TrimEnd(
    [IO.Path]::DirectorySeparatorChar,
    [IO.Path]::AltDirectorySeparatorChar
  )
  $ownedPrefix = $resolvedOwnedRoot + [IO.Path]::DirectorySeparatorChar
  if (-not ($resolvedProfilesRoot + [IO.Path]::DirectorySeparatorChar).StartsWith(
    $ownedPrefix,
    [StringComparison]::OrdinalIgnoreCase
  )) {
    throw 'Hermes authenticated profile root escaped the owned run tree'
  }
  Assert-NoReparsePointInPath -Path $resolvedProfilesRoot `
    -FailureMessage 'Hermes authenticated profile path contains a reparse point'
  $profileHome = Join-Path $resolvedProfilesRoot $ProfileName
  if (Test-Path -LiteralPath $profileHome) {
    throw 'Refusing to overwrite an existing Hermes authenticated profile'
  }

  $null = & hermes profile create $ProfileName --no-alias --no-skills
  $profileCreateExitCode = $LASTEXITCODE
  if ($profileCreateExitCode -ne 0 -or
      -not (Test-Path -LiteralPath $profileHome -PathType Container)) {
    throw 'Hermes authenticated profile creation failed'
  }
  Assert-NoReparsePointInPath -Path $profileHome `
    -FailureMessage 'Hermes authenticated profile path contains a reparse point'
  $profileItem = Get-Item -LiteralPath $profileHome -Force
  $resolvedProfileHome = [IO.Path]::GetFullPath($profileItem.FullName)
  if (($profileItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
      -not [IO.Path]::GetDirectoryName($resolvedProfileHome).Equals(
        $resolvedProfilesRoot,
        [StringComparison]::OrdinalIgnoreCase
      )) {
    throw 'Hermes authenticated profile ownership verification failed'
  }
  $ownerToken = [guid]::NewGuid().ToString('N')
  $ownershipMarker = Join-Path $resolvedProfileHome ".waggle-e2e-owner-$ownerToken"
  Write-HermesOwnershipMarker -Path $ownershipMarker -Token $ownerToken
  return [pscustomobject]@{
    ProfileName = $ProfileName
    ProfilesRoot = $resolvedProfilesRoot
    ProfileHome = $resolvedProfileHome
    OwnershipMarker = $ownershipMarker
    OwnerToken = $ownerToken
  }
}

function Write-HermesOwnershipMarker([string]$Path, [string]$Token) {
  $markerBytes = [Text.UTF8Encoding]::new($false).GetBytes($Token)
  $markerStream = [IO.File]::Open(
    $Path,
    [IO.FileMode]::CreateNew,
    [IO.FileAccess]::Write,
    [IO.FileShare]::None
  )
  try {
    $markerStream.Write($markerBytes, 0, $markerBytes.Length)
  } finally {
    $markerStream.Dispose()
  }
}

function Remove-OwnedHermesProfile($Lease) {
  if ($null -eq $Lease) { return }
  $profileItem = Get-Item -LiteralPath $Lease.ProfileHome -Force
  $markerItem = Get-Item -LiteralPath $Lease.OwnershipMarker -Force
  $resolvedProfileHome = [IO.Path]::GetFullPath($profileItem.FullName)
  if (-not $profileItem.PSIsContainer -or
      ($profileItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
      $markerItem.PSIsContainer -or
      ($markerItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
      -not [IO.Path]::GetDirectoryName($resolvedProfileHome).Equals(
        [IO.Path]::GetFullPath($Lease.ProfilesRoot),
        [StringComparison]::OrdinalIgnoreCase
      ) -or
      [IO.File]::ReadAllText($markerItem.FullName) -cne $Lease.OwnerToken) {
    throw 'Hermes authenticated profile ownership verification failed'
  }
  $null = & hermes profile delete $Lease.ProfileName -y
  $profileDeleteExitCode = $LASTEXITCODE
  if ((Test-Path -LiteralPath $Lease.ProfileHome) -or $profileDeleteExitCode -ne 0) {
    throw 'Hermes authenticated profile cleanup failed'
  }
}

function Invoke-NativePreflight(
  [string]$FilePath,
  [string[]]$ArgumentList,
  [string]$FailureMessage
) {
  $previousErrorActionPreference = $ErrorActionPreference
  $exitCode = $null
  try {
    $ErrorActionPreference = 'Continue'
    & $FilePath @ArgumentList *> $null
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($exitCode -ne 0) { throw $FailureMessage }
}

function Remove-IsolatedAuthenticationFiles(
  [string[]]$Paths,
  [string]$OwnedRoot
) {
  $errors = [Collections.Generic.List[string]]::new()
  $resolvedOwnedRoot = [IO.Path]::GetFullPath($OwnedRoot).TrimEnd(
    [IO.Path]::DirectorySeparatorChar,
    [IO.Path]::AltDirectorySeparatorChar
  )
  $ownedPrefix = $resolvedOwnedRoot + [IO.Path]::DirectorySeparatorChar
  foreach ($path in $Paths) {
    try {
      $resolvedPath = [IO.Path]::GetFullPath($path)
      if (-not $resolvedPath.StartsWith($ownedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Authentication cleanup path escaped the owned run profile'
      }
      Assert-NoReparsePointInPath -Path $resolvedPath `
        -FailureMessage 'Authentication cleanup path contains a reparse point'
      if (-not (Test-Path -LiteralPath $resolvedPath)) { continue }
      $item = Get-Item -LiteralPath $resolvedPath -Force
      if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'Authentication cleanup target must be a regular file'
      }
      $lastError = $null
      for ($attempt = 0; $attempt -lt 8; $attempt += 1) {
        try {
          [IO.File]::Delete($resolvedPath)
        } catch {
          $lastError = $_
        }
        if (-not (Test-Path -LiteralPath $resolvedPath)) { break }
        Start-Sleep -Milliseconds 125
      }
      if (Test-Path -LiteralPath $resolvedPath) {
        if ($null -ne $lastError) { throw $lastError }
        throw 'Authentication cleanup target survived deletion retries'
      }
    } catch {
      $errors.Add("Failed to remove an isolated authentication copy: $($_.Exception.Message)")
    }
  }
  if ($errors.Count -gt 0) { throw ($errors -join '; ') }
}

function Complete-AuthenticatedIsolationCleanup(
  $HermesLease,
  [object[]]$SourceAuthEvidence,
  [string[]]$ProfileVariables,
  [string[]]$IsolatedAuthPaths,
  [string]$OwnedRoot
) {
  $errors = [Collections.Generic.List[string]]::new()
  try {
    Set-ProcessEnvironment -Name 'WAGGLE_LIVE_EXTERNAL_AGENTS' -Value $null
  } catch {
    $errors.Add("Failed to clear the live-agent flag: $($_.Exception.Message)")
  }
  try {
    Remove-OwnedHermesProfile -Lease $HermesLease
  } catch {
    $errors.Add("Hermes profile cleanup failed: $($_.Exception.Message)")
  }
  foreach ($name in $ProfileVariables) {
    try {
      Restore-ProcessEnvironment -Name $name
    } catch {
      $errors.Add("Failed to restore $name`: $($_.Exception.Message)")
    }
  }
  try {
    Remove-IsolatedAuthenticationFiles -Paths $IsolatedAuthPaths -OwnedRoot $OwnedRoot
  } catch {
    $errors.Add($_.Exception.Message)
  }
  foreach ($evidence in $SourceAuthEvidence) {
    try {
      if ((Get-FileHash -LiteralPath $evidence.Path -Algorithm SHA256).Hash -cne $evidence.Hash) {
        $errors.Add('A real external-agent authentication source changed during the isolated live test')
      }
    } catch {
      $errors.Add("Could not verify source authentication file integrity: $($_.Exception.Message)")
    }
  }
  if ($errors.Count -gt 0) {
    throw "Authenticated isolation cleanup failed: $($errors -join '; ')"
  }
}

function Get-ReceiptStrings($Node) {
  if ($null -eq $Node) { return }
  if ($Node -is [string]) {
    $Node
    return
  }
  if ($Node -is [pscustomobject]) {
    foreach ($property in $Node.PSObject.Properties) {
      Get-ReceiptStrings -Node $property.Value
    }
    return
  }
  if ($Node -is [System.Collections.IEnumerable]) {
    foreach ($item in $Node) {
      Get-ReceiptStrings -Node $item
    }
  }
}

function Test-ReceiptIntegerProperty($Node, [string]$Name) {
  if ($Node -isnot [pscustomobject]) { return $false }
  $property = $Node.PSObject.Properties[$Name]
  if ($null -eq $property) { return $false }
  return $property.Value -is [int] -or $property.Value -is [long]
}

function Test-ReceiptBooleanProperty($Node, [string]$Name) {
  if ($Node -isnot [pscustomobject]) { return $false }
  $property = $Node.PSObject.Properties[$Name]
  return $null -ne $property -and $property.Value -is [bool]
}

function Assert-SafeReceiptContent($Receipt, [string]$ReceiptText) {
  $receiptStrings = @(Get-ReceiptStrings -Node $Receipt)
  $absoluteHostPaths = @($receiptStrings | Where-Object {
    $_ -match '(?i)(?:^|[\s"(=])(?:[A-Z]:[\\/]|\\\\[^\\/\s]+[\\/]|file:///[A-Z]:/)'
  })
  if ($absoluteHostPaths.Count -gt 0) { throw 'Receipt contains absolute host paths' }

  $leakedVariables = @()
  foreach ($name in $secretVariables) {
    $value = $originalEnvironment[$name]
    if ([string]::IsNullOrEmpty($value)) { continue }
    $jsonValue = ConvertTo-Json -InputObject $value -Compress
    $escapedValue = if ($jsonValue.Length -ge 2) {
      $jsonValue.Substring(1, $jsonValue.Length - 2)
    } else { $jsonValue }
    $leaked = $ReceiptText.Contains($value) -or $ReceiptText.Contains($escapedValue)
    foreach ($candidate in $receiptStrings) {
      if ($candidate.Contains($value) -or $candidate.Contains($escapedValue)) { $leaked = $true }
      if ($candidate.Length -ge 8 -and $candidate.Length % 4 -eq 0 -and
          $candidate -match '^[A-Za-z0-9+/]*={0,2}$') {
        try {
          $decoded = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($candidate))
          if ($decoded.Contains($value) -or $decoded.Contains($escapedValue)) { $leaked = $true }
        } catch {
          # Not every base64-shaped reporter string is valid base64.
        }
      }
    }
    if ($leaked) { $leakedVariables += $name }
  }
  if ($leakedVariables.Count -gt 0) {
    throw (
      'Unsafe receipt: captured secret values found for environment variables: ' +
      (@($leakedVariables | Select-Object -Unique) -join ', ')
    )
  }
}

function Publish-SafeReceipt(
  [string]$RawReceiptPath,
  [string]$SafeReceiptPath,
  [ValidateSet('playwright-summary', 'vitest-summary')][string]$ExpectedKind,
  [string]$ExpectedSpec,
  [string]$ReceiptLane,
  [string[]]$ExpectedHostIds,
  [string]$HermesProvider = '',
  [string]$HermesModel = ''
) {
  $tempProjectionPath = $null
  $tempProjectionOwned = $false
  try {
    if (-not (Test-Path -LiteralPath $RawReceiptPath -PathType Leaf)) {
      throw "Expected reporter receipt was not created: $RawReceiptPath"
    }
    $rawPrefix = [IO.Path]::GetFullPath($rawReceiptRoot).TrimEnd(
      [IO.Path]::DirectorySeparatorChar,
      [IO.Path]::AltDirectorySeparatorChar
    ) + [IO.Path]::DirectorySeparatorChar
    $resolvedRaw = [IO.Path]::GetFullPath($RawReceiptPath)
    if (-not $resolvedRaw.StartsWith($rawPrefix, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Raw reporter receipt escaped the owned run tree: $resolvedRaw"
    }
    Assert-NoReparsePointInPath -Path $resolvedRaw `
      -FailureMessage 'Raw reporter receipt path contains a reparse point'
    $safeParent = [IO.Path]::GetFullPath([IO.Path]::GetDirectoryName($SafeReceiptPath))
    if (-not $safeParent.Equals([IO.Path]::GetFullPath($receiptStagingRoot), [StringComparison]::OrdinalIgnoreCase)) {
      throw "Safe receipt escaped the staging directory: $SafeReceiptPath"
    }
    Assert-NoReparsePointInPath -Path $safeParent `
      -FailureMessage 'Safe receipt path contains a reparse point'
    if (Test-Path -LiteralPath $SafeReceiptPath) {
      throw "Safe receipt target already exists: $SafeReceiptPath"
    }

    try { $rawReceipt = Get-Content -Raw -LiteralPath $resolvedRaw | ConvertFrom-Json }
    catch { throw "Invalid reporter receipt JSON: $resolvedRaw" }
    $receiptName = [IO.Path]::GetFileNameWithoutExtension($SafeReceiptPath)
    if ($receiptName -cne "$ReceiptLane-report") {
      throw 'Safe receipt filename did not match its declared lane'
    }
    $normalizedExpectedSpec = $ExpectedSpec.Replace('\', '/')
    $expectedSpecPath = [IO.Path]::GetFullPath((Join-Path $repoRoot $normalizedExpectedSpec))
    if ($ExpectedKind -ceq 'playwright-summary') {
      $configProperty = $rawReceipt.PSObject.Properties['config']
      $suitesProperty = $rawReceipt.PSObject.Properties['suites']
      $rootDirProperty = if ($null -ne $configProperty -and $configProperty.Value -is [pscustomobject]) {
        $configProperty.Value.PSObject.Properties['rootDir']
      } else {
        $null
      }
      $specEvidence = @(
        if ($null -ne $rootDirProperty -and $rootDirProperty.Value -is [string] -and
            -not [string]::IsNullOrWhiteSpace($rootDirProperty.Value) -and
            $null -ne $suitesProperty) {
          $reportRoot = [IO.Path]::GetFullPath($rootDirProperty.Value)
          $reportRootPrefix = $reportRoot.TrimEnd(
            [IO.Path]::DirectorySeparatorChar,
            [IO.Path]::AltDirectorySeparatorChar
          ) + [IO.Path]::DirectorySeparatorChar
          if ($expectedSpecPath.StartsWith($reportRootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
            $reportRelativeSpec = $expectedSpecPath.Substring($reportRootPrefix.Length).Replace('\', '/')
            foreach ($suite in @($suitesProperty.Value)) {
              if ($suite -isnot [pscustomobject]) { continue }
              $fileProperty = $suite.PSObject.Properties['file']
              if ($null -ne $fileProperty -and $fileProperty.Value -is [string] -and
                  $fileProperty.Value.Replace('\', '/').Equals(
                    $reportRelativeSpec,
                    [StringComparison]::OrdinalIgnoreCase
                  )) {
                $fileProperty.Value
              }
            }
          }
        }
      )
    } else {
      $testResultsProperty = $rawReceipt.PSObject.Properties['testResults']
      if ($null -eq $testResultsProperty -or $testResultsProperty.Value -isnot [array]) {
        throw 'Vitest receipt field testResults must be an array'
      }
      $specEvidence = @(
        foreach ($testResult in $testResultsProperty.Value) {
          if ($testResult -isnot [pscustomobject]) {
            throw 'Vitest receipt testResults entries must be objects'
          }
          $nameProperty = $testResult.PSObject.Properties['name']
          if ($null -eq $nameProperty -or $nameProperty.Value -isnot [string] -or
              [string]::IsNullOrWhiteSpace($nameProperty.Value)) {
            throw 'Vitest receipt testResults[].name must be a non-empty string'
          }
          try {
            [IO.Path]::GetFullPath($nameProperty.Value)
          } catch {
            throw 'Vitest receipt testResults[].name must be a valid path'
          }
        }
      )
      if ($specEvidence.Count -ne 1 -or
          -not [string]::Equals(
            $specEvidence[0],
            $expectedSpecPath,
            [StringComparison]::OrdinalIgnoreCase
          )) {
        throw 'Vitest receipt result-file set did not exactly match the expected specification'
      }
    }
    if ($specEvidence.Count -eq 0) {
      throw 'Reporter receipt did not bind the expected test specification'
    }
    $statsProperty = $rawReceipt.PSObject.Properties['stats']
    $successProperty = $rawReceipt.PSObject.Properties['success']
    $suiteCountProperty = $rawReceipt.PSObject.Properties['numTotalTestSuites']
    if ($null -ne $statsProperty) {
      if ($ExpectedKind -cne 'playwright-summary') {
        throw 'Reporter receipt kind did not match the declared lane'
      }
      $stats = $statsProperty.Value
      foreach ($name in @('expected', 'unexpected', 'flaky', 'skipped')) {
        if (-not (Test-ReceiptIntegerProperty $stats $name)) {
          throw "Playwright receipt field $name must be an integer"
        }
      }
      $receipt = [pscustomobject][ordered]@{
        schemaVersion = 1
        kind = 'playwright-summary'
        name = $receiptName
        lane = $ReceiptLane
        spec = $normalizedExpectedSpec
        hostIds = @($ExpectedHostIds)
        success = ([int]$stats.expected -eq 1 -and [int]$stats.unexpected -eq 0 -and
          [int]$stats.flaky -eq 0 -and [int]$stats.skipped -eq 0)
        expected = [int]$stats.expected
        unexpected = [int]$stats.unexpected
        flaky = [int]$stats.flaky
        skipped = [int]$stats.skipped
      }
    } elseif ($null -ne $successProperty -or $null -ne $suiteCountProperty) {
      if ($ExpectedKind -cne 'vitest-summary') {
        throw 'Reporter receipt kind did not match the declared lane'
      }
      if (-not (Test-ReceiptBooleanProperty $rawReceipt 'success')) {
        throw 'Vitest receipt field success must be a boolean'
      }
      foreach ($name in @(
        'numTotalTestSuites', 'numPassedTestSuites', 'numFailedTestSuites', 'numPendingTestSuites',
        'numTotalTests', 'numPassedTests', 'numFailedTests', 'numPendingTests', 'numTodoTests'
      )) {
        if (-not (Test-ReceiptIntegerProperty $rawReceipt $name)) {
          throw "Vitest receipt field $name must be an integer"
        }
      }
      $receipt = [pscustomobject][ordered]@{
        schemaVersion = 1
        kind = 'vitest-summary'
        name = $receiptName
        lane = $ReceiptLane
        spec = $normalizedExpectedSpec
        hostIds = @($ExpectedHostIds)
        hermesProvider = $HermesProvider
        hermesModel = $HermesModel
        success = ($rawReceipt.success -and
          [int]$rawReceipt.numTotalTestSuites -gt 0 -and
          [int]$rawReceipt.numPassedTestSuites -eq [int]$rawReceipt.numTotalTestSuites -and
          [int]$rawReceipt.numFailedTestSuites -eq 0 -and [int]$rawReceipt.numPendingTestSuites -eq 0 -and
          [int]$rawReceipt.numTotalTests -eq 1 -and [int]$rawReceipt.numPassedTests -eq 1 -and
          [int]$rawReceipt.numFailedTests -eq 0 -and [int]$rawReceipt.numPendingTests -eq 0 -and
          [int]$rawReceipt.numTodoTests -eq 0)
        totalTestSuites = [int]$rawReceipt.numTotalTestSuites
        passedTestSuites = [int]$rawReceipt.numPassedTestSuites
        failedTestSuites = [int]$rawReceipt.numFailedTestSuites
        pendingTestSuites = [int]$rawReceipt.numPendingTestSuites
        totalTests = [int]$rawReceipt.numTotalTests
        passedTests = [int]$rawReceipt.numPassedTests
        failedTests = [int]$rawReceipt.numFailedTests
        pendingTests = [int]$rawReceipt.numPendingTests
        todoTests = [int]$rawReceipt.numTodoTests
      }
    } else { throw 'Unknown reporter receipt schema' }
    if (-not $receipt.success) { throw 'Reporter receipt did not prove an exact successful lane' }

    $receiptText = $receipt | ConvertTo-Json -Depth 4
    Assert-SafeReceiptContent -Receipt $receipt -ReceiptText $receiptText
    $tempProjectionPath = "$SafeReceiptPath.partial-$([guid]::NewGuid().ToString('N'))"
    $projectionBytes = [Text.UTF8Encoding]::new($false).GetBytes($receiptText)
    $projectionStream = [IO.File]::Open(
      $tempProjectionPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None
    )
    $tempProjectionOwned = $true
    try { $projectionStream.Write($projectionBytes, 0, $projectionBytes.Length) }
    finally { $projectionStream.Dispose() }
    [IO.File]::Move($tempProjectionPath, $SafeReceiptPath)
    $tempProjectionPath = $null
    $tempProjectionOwned = $false
  } finally {
    if ($tempProjectionOwned -and $tempProjectionPath -and
        (Test-Path -LiteralPath $tempProjectionPath -PathType Leaf)) {
      Remove-Item -LiteralPath $tempProjectionPath -Force
    }
    if (Test-Path -LiteralPath $RawReceiptPath -PathType Leaf) {
      Remove-Item -LiteralPath $RawReceiptPath -Force
    }
  }
}

function Assert-SafeReceiptSet([string]$StagingRoot, [string[]]$ExpectedReceiptNames) {
  Assert-NoReparsePointInPath -Path $StagingRoot `
    -FailureMessage 'Receipt staging path contains a reparse point'
  $stagingItem = Get-Item -LiteralPath $StagingRoot -Force
  if (-not $stagingItem.PSIsContainer -or
      ($stagingItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'Receipt staging root must be an owned regular directory'
  }
  $items = @(Get-ChildItem -LiteralPath $StagingRoot -Force)
  if (@($items | Where-Object { $_.PSIsContainer -or ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) }).Count -gt 0) {
    throw 'Receipt staging contains a directory or reparse point'
  }
  $actualNames = @($items | ForEach-Object Name | Sort-Object)
  $expectedNames = @($ExpectedReceiptNames | Sort-Object)
  if (@(Compare-Object -ReferenceObject $expectedNames -DifferenceObject $actualNames -CaseSensitive).Count -gt 0) {
    throw "Receipt staging did not contain the exact expected set: $($expectedNames -join ', ')"
  }
  foreach ($file in $items) {
    $text = [IO.File]::ReadAllText($file.FullName)
    $receipt = $text | ConvertFrom-Json
    if (-not (Test-ReceiptIntegerProperty $receipt 'schemaVersion') -or [int]$receipt.schemaVersion -ne 1 -or
        -not (Test-ReceiptBooleanProperty $receipt 'success') -or -not $receipt.success) {
      throw "Safe receipt failed final schema validation: $($file.Name)"
    }
    $contract = switch -CaseSensitive ($file.Name) {
      'hooks-report.json' {
        [pscustomobject]@{
          kind = 'playwright-summary'
          lane = 'hooks'
          spec = 'tests/e2e/launcher-real-hook-lifecycle.spec.ts'
          hostIds = @($receiptHostIds)
        }
      }
      'tools-report.json' {
        [pscustomobject]@{
          kind = 'playwright-summary'
          lane = 'tools'
          spec = 'tests/e2e/launcher-real-tool-lifecycle.spec.ts'
          hostIds = @($receiptHostIds)
        }
      }
      'authenticated-tasks-report.json' {
        [pscustomobject]@{
          kind = 'vitest-summary'
          lane = 'authenticated-tasks'
          spec = 'tests/integration/external-agent-collaboration.live.test.ts'
          hostIds = @($authenticatedHostIds)
          hermesProvider = 'openai-codex'
          hermesModel = 'gpt-5.5'
        }
      }
      default { throw "Safe receipt had no release contract: $($file.Name)" }
    }
    foreach ($name in @('kind', 'lane', 'spec')) {
      $property = $receipt.PSObject.Properties[$name]
      if ($null -eq $property -or $property.Value -isnot [string] -or
          $property.Value -cne $contract.$name) {
        throw "Safe receipt identity mismatch for $($file.Name): $name"
      }
    }
    $hostIdsProperty = $receipt.PSObject.Properties['hostIds']
    $actualHostIds = if ($null -eq $hostIdsProperty) { @() } else { @($hostIdsProperty.Value) }
    if ($null -eq $hostIdsProperty -or
        @(Compare-Object -ReferenceObject @($contract.hostIds) -DifferenceObject $actualHostIds -CaseSensitive).Count -gt 0 -or
        $actualHostIds.Count -ne @($contract.hostIds).Count) {
      throw "Safe receipt host roster mismatch for $($file.Name)"
    }
    if ($file.Name -ceq 'authenticated-tasks-report.json') {
      foreach ($name in @('hermesProvider', 'hermesModel')) {
        $property = $receipt.PSObject.Properties[$name]
        if ($null -eq $property -or $property.Value -isnot [string] -or
            $property.Value -cne $contract.$name) {
          throw "Safe receipt Hermes identity mismatch for $($file.Name): $name"
        }
      }
    }
    Assert-SafeReceiptContent -Receipt $receipt -ReceiptText $text
  }
}

function Publish-ReceiptSet(
  [string]$StagingRoot,
  [string]$FinalRoot,
  [string[]]$ExpectedReceiptNames
) {
  if (Test-Path -LiteralPath $FinalRoot) { throw "ReceiptDir became occupied before publication: $FinalRoot" }
  Assert-NoReparsePointInPath -Path $StagingRoot `
    -FailureMessage 'Receipt publication staging path contains a reparse point'
  Assert-NoReparsePointInPath -Path ([IO.Path]::GetDirectoryName($FinalRoot)) `
    -FailureMessage 'Receipt publication destination path contains a reparse point'
  $stagingParent = [IO.Path]::GetFullPath([IO.Path]::GetDirectoryName($StagingRoot))
  $finalParent = [IO.Path]::GetFullPath([IO.Path]::GetDirectoryName($FinalRoot))
  if (-not $stagingParent.Equals($finalParent, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Receipt staging and final directories must be same-volume siblings'
  }
  Assert-SafeReceiptSet -StagingRoot $StagingRoot -ExpectedReceiptNames $ExpectedReceiptNames
  [IO.Directory]::Move($StagingRoot, $FinalRoot)
}

function Remove-VerifiedReceiptStaging([string]$StagingRoot, [string]$FinalRoot, [bool]$Owned) {
  if (-not $Owned -or [string]::IsNullOrWhiteSpace($StagingRoot) -or
      -not (Test-Path -LiteralPath $StagingRoot)) { return }
  $resolvedStaging = [IO.Path]::GetFullPath($StagingRoot)
  $finalParent = [IO.Path]::GetFullPath([IO.Path]::GetDirectoryName($FinalRoot))
  Assert-NoReparsePointInPath -Path $resolvedStaging `
    -FailureMessage 'Receipt cleanup path contains a reparse point'
  Assert-NoReparsePointInPath -Path $finalParent `
    -FailureMessage 'Receipt cleanup destination path contains a reparse point'
  $stagingParent = [IO.Path]::GetFullPath([IO.Path]::GetDirectoryName($resolvedStaging))
  $expectedPrefix = ".$([IO.Path]::GetFileName($FinalRoot)).staging-"
  if (-not $stagingParent.Equals($finalParent, [StringComparison]::OrdinalIgnoreCase) -or
      -not [IO.Path]::GetFileName($resolvedStaging).StartsWith($expectedPrefix, [StringComparison]::Ordinal)) {
    throw "Refusing receipt staging cleanup outside the owned sibling: $resolvedStaging"
  }
  $stagingItem = Get-Item -LiteralPath $resolvedStaging -Force
  if (-not $stagingItem.PSIsContainer -or
      ($stagingItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw "Refusing unsafe receipt staging cleanup: $resolvedStaging"
  }
  Remove-Item -LiteralPath $resolvedStaging -Recurse -Force
}

function Get-FreeLoopbackPort {
  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  try {
    $listener.Start()
    return ([Net.IPEndPoint]$listener.LocalEndpoint).Port
  } finally {
    $listener.Stop()
  }
}

function Remove-VerifiedTempTree([string]$Target) {
  $resolved = [IO.Path]::GetFullPath($Target)
  $tempPrefix = $tempBase.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  if (-not $resolved.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing recursive cleanup outside the OS temp directory: $resolved"
  }
  $extended = if ($resolved.StartsWith('\\')) {
    '\\?\UNC\' + $resolved.Substring(2)
  } else {
    '\\?\' + $resolved
  }
  if (-not [IO.Directory]::Exists($extended)) { return }

  $lastError = $null
  for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
    try {
      $targetItem = Get-Item -LiteralPath $resolved -Force
      if (-not $targetItem.PSIsContainer -or
          ($targetItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw "Refusing unsafe temp-tree cleanup: $resolved"
      }
      [IO.Directory]::Delete($extended, $true)
      return
    } catch {
      if (-not [IO.Directory]::Exists($extended)) { return }
      $lastError = $_
      Start-Sleep -Milliseconds 250
    }
  }
  if (-not [IO.Directory]::Exists($extended)) { return }
  throw $lastError
}

function Invoke-PlaywrightLane([string]$Spec, [string]$DataDir, [string]$ReceiptName) {
  $port = Get-FreeLoopbackPort
  $rawReceiptPath = $null
  $safeReceiptPath = $null
  $playwrightOutput = Join-Path $runRoot "playwright-$ReceiptName"
  Set-ProcessEnvironment -Name 'WAGGLE_E2E_DATA_DIR' -Value $DataDir
  Set-ProcessEnvironment -Name 'WAGGLE_E2E_PORT' -Value ([string]$port)
  Set-ProcessEnvironment -Name 'WAGGLE_E2E_BASE_URL' -Value "http://127.0.0.1:$port"
  Write-Host "Running $Spec on isolated port $port"
  $playwrightArgs = @(
    'test',
    $Spec,
    '--config=playwright.config.ts',
    '--project=chromium',
    '--retries=0',
    '--output',
    $playwrightOutput
  )
  if ($null -ne $receiptStagingRoot) {
    $rawReceiptPath = Join-Path $rawReceiptRoot "$ReceiptName-report.raw.json"
    $safeReceiptPath = Join-Path $receiptStagingRoot "$ReceiptName-report.json"
    Set-ProcessEnvironment -Name 'PLAYWRIGHT_JSON_OUTPUT_FILE' -Value $rawReceiptPath
    $playwrightArgs += @(
      '--reporter=list,json'
    )
  } else {
    Set-ProcessEnvironment -Name 'PLAYWRIGHT_JSON_OUTPUT_FILE' -Value $null
    $playwrightArgs += '--reporter=list'
  }
  try {
    & $script:runnerNodePath $script:playwrightCli @playwrightArgs
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) { throw "$Spec failed with exit code $exitCode" }
    if ($rawReceiptPath) {
      Publish-SafeReceipt -RawReceiptPath $rawReceiptPath -SafeReceiptPath $safeReceiptPath `
        -ExpectedKind 'playwright-summary' -ExpectedSpec $Spec -ReceiptLane $ReceiptName `
        -ExpectedHostIds $receiptHostIds
    }
  } finally {
    if ($rawReceiptPath -and (Test-Path -LiteralPath $rawReceiptPath -PathType Leaf)) {
      Remove-Item -LiteralPath $rawReceiptPath -Force
    }
  }
}

function Invoke-VitestLane(
  [string]$Spec,
  [string]$ReceiptName,
  [string]$HermesProvider,
  [string]$HermesModel
) {
  $rawReceiptPath = $null
  $safeReceiptPath = $null
  $vitestArgs = @(
    'run',
    $Spec,
    '--retry=0',
    '--reporter=verbose'
  )
  if ($null -ne $receiptStagingRoot) {
    $rawReceiptPath = Join-Path $rawReceiptRoot "$ReceiptName-report.raw.json"
    $safeReceiptPath = Join-Path $receiptStagingRoot "$ReceiptName-report.json"
    $vitestArgs += @(
      '--reporter=json',
      "--outputFile=$rawReceiptPath"
    )
  }
  try {
    & $script:runnerNodePath $script:vitestCli @vitestArgs
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) { throw "$Spec failed with exit code $exitCode" }
    if ($rawReceiptPath) {
      Publish-SafeReceipt -RawReceiptPath $rawReceiptPath -SafeReceiptPath $safeReceiptPath `
        -ExpectedKind 'vitest-summary' -ExpectedSpec $Spec -ReceiptLane $ReceiptName `
        -ExpectedHostIds $receiptHostIds -HermesProvider $HermesProvider -HermesModel $HermesModel
    }
  } finally {
    if ($rawReceiptPath -and (Test-Path -LiteralPath $rawReceiptPath -PathType Leaf)) {
      Remove-Item -LiteralPath $rawReceiptPath -Force
    }
  }
}

$publicationCompleted = $false
try {
  try {
    $null = New-Item -ItemType Directory -Path $hookProfile -Force
    $null = New-Item -ItemType Directory -Path $rawReceiptRoot -Force
    if ($null -ne $receiptRoot) {
      if (Test-Path -LiteralPath $receiptRoot) {
        throw "ReceiptDir must be a fresh path owned by this run: $receiptRoot"
      }
      Assert-NoReparsePointInPath -Path $receiptParent `
        -FailureMessage 'ReceiptDir path must not contain a reparse point'
      $null = New-Item -ItemType Directory -Path $receiptParent -Force
      Assert-NoReparsePointInPath -Path $receiptParent `
        -FailureMessage 'ReceiptDir path must not contain a reparse point'
      $null = New-Item -ItemType Directory -Path $receiptStagingRoot
      $receiptStagingOwned = $true
    }
  foreach ($name in $secretVariables) { Set-ProcessEnvironment -Name $name -Value $null }
  Set-ProcessEnvironment -Name 'WAGGLE_E2E_SKIP_LITELLM' -Value '1'
  Set-ProcessEnvironment -Name 'WAGGLE_E2E_REUSE_EXISTING_SERVER' -Value '0'
  Set-ProcessEnvironment -Name 'WAGGLE_E2E_TEMP_ROOT' -Value $runRoot
  Set-ProcessEnvironment -Name 'WAGGLE_E2E_HOST_IDS' -Value $requestedHostIds
  Set-ProcessEnvironment -Name 'PLAYWRIGHT_JSON_OUTPUT_FILE' -Value $null

  Push-Location $repoRoot
  try {
    Set-ProcessEnvironment -Name 'USERPROFILE' -Value $hookProfile
    Set-ProcessEnvironment -Name 'HOME' -Value $hookProfile
    Set-ProcessEnvironment -Name 'HOMEDRIVE' -Value (Split-Path -Qualifier $hookProfile)
    Set-ProcessEnvironment -Name 'HOMEPATH' -Value $hookProfile.Substring((Split-Path -Qualifier $hookProfile).Length)
    Set-ProcessEnvironment -Name 'APPDATA' -Value (Join-Path $hookProfile 'AppData\Roaming')
    Set-ProcessEnvironment -Name 'LOCALAPPDATA' -Value (Join-Path $hookProfile 'AppData\Local')
    Set-ProcessEnvironment -Name 'HERMES_HOME' -Value (Join-Path $hookProfile '.hermes')
    Set-ProcessEnvironment -Name 'HERMES_PROFILE' -Value $null
    Set-ProcessEnvironment -Name 'WAGGLE_E2E_HOOK_HOME' -Value $hookProfile
    Set-ProcessEnvironment -Name 'WAGGLE_E2E_REAL_HOOKS' -Value '1'
    Set-ProcessEnvironment -Name 'WAGGLE_E2E_REAL_TOOLS' -Value $null
    Invoke-PlaywrightLane -Spec 'tests/e2e/launcher-real-hook-lifecycle.spec.ts' -DataDir (Join-Path $runRoot 'hook-data') -ReceiptName 'hooks'

    foreach ($name in $profileVariables) { Restore-ProcessEnvironment -Name $name }
    Set-ProcessEnvironment -Name 'WAGGLE_E2E_HOOK_HOME' -Value $null
    Set-ProcessEnvironment -Name 'WAGGLE_E2E_REAL_HOOKS' -Value $null
    Set-ProcessEnvironment -Name 'WAGGLE_E2E_REAL_TOOLS' -Value '1'
    Invoke-PlaywrightLane -Spec 'tests/e2e/launcher-real-tool-lifecycle.spec.ts' -DataDir (Join-Path $runRoot 'tool-data') -ReceiptName 'tools'
    if ($AuthenticatedTasks) {
      $authenticatedHermesProfile = 'wagglee2e-' + [guid]::NewGuid().ToString('N')
      $authenticatedHermesLease = $null
      $authenticatedProfileRoot = Join-Path $runRoot 'authenticated-profile'
      $authenticatedHermesRoot = Join-Path $authenticatedProfileRoot 'hermes-root'
      $hermesProfilesRoot = Join-Path $authenticatedHermesRoot 'profiles'
      $null = New-Item -ItemType Directory -Path $authenticatedHermesRoot -Force
      Assert-NoReparsePointInPath -Path $authenticatedHermesRoot `
        -FailureMessage 'Hermes authenticated root contains a reparse point'
      $originalUserHome = if (-not [string]::IsNullOrWhiteSpace($originalEnvironment['USERPROFILE'])) {
        $originalEnvironment['USERPROFILE']
      } elseif (-not [string]::IsNullOrWhiteSpace($originalEnvironment['HOME'])) {
        $originalEnvironment['HOME']
      } else {
        [Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile)
      }
      $sourceClaudeConfig = if (-not [string]::IsNullOrWhiteSpace($originalEnvironment['CLAUDE_CONFIG_DIR'])) {
        $originalEnvironment['CLAUDE_CONFIG_DIR']
      } else {
        Join-Path $originalUserHome '.claude'
      }
      $sourceCodexHome = if (-not [string]::IsNullOrWhiteSpace($originalEnvironment['CODEX_HOME'])) {
        $originalEnvironment['CODEX_HOME']
      } else {
        Join-Path $originalUserHome '.codex'
      }
      $sourceHermesHome = if (-not [string]::IsNullOrWhiteSpace($originalEnvironment['HERMES_HOME'])) {
        $originalEnvironment['HERMES_HOME']
      } else {
        Join-Path $originalEnvironment['LOCALAPPDATA'] 'hermes'
      }
      $sourceClaudeCredentials = Join-Path $sourceClaudeConfig '.credentials.json'
      $sourceCodexAuth = Join-Path $sourceCodexHome 'auth.json'
      $sourceHermesAuth = Join-Path $sourceHermesHome 'auth.json'
      $isolatedClaudeCredentials = Join-Path $authenticatedProfileRoot '.claude\.credentials.json'
      $isolatedCodexAuth = Join-Path $authenticatedProfileRoot '.codex\auth.json'
      $isolatedHermesAuth = Join-Path (
        Join-Path $hermesProfilesRoot $authenticatedHermesProfile
      ) 'auth.json'
      $isolatedAuthPaths = @($isolatedClaudeCredentials, $isolatedCodexAuth, $isolatedHermesAuth)
      $sourceAuthEvidence = @(
        [pscustomobject]@{ Path = $sourceClaudeCredentials; Hash = (Get-FileHash -LiteralPath $sourceClaudeCredentials -Algorithm SHA256).Hash },
        [pscustomobject]@{ Path = $sourceCodexAuth; Hash = (Get-FileHash -LiteralPath $sourceCodexAuth -Algorithm SHA256).Hash },
        [pscustomobject]@{ Path = $sourceHermesAuth; Hash = (Get-FileHash -LiteralPath $sourceHermesAuth -Algorithm SHA256).Hash }
      )
      try {
        Set-ProcessEnvironment -Name 'HERMES_HOME' -Value $authenticatedHermesRoot
        Set-ProcessEnvironment -Name 'HERMES_PROFILE' -Value $null
        $authenticatedHermesLease = New-OwnedHermesProfile `
          -ProfilesRoot $hermesProfilesRoot -ProfileName $authenticatedHermesProfile `
          -OwnedRoot $authenticatedProfileRoot
        Copy-IsolatedAuthenticationFile `
          -Source $sourceClaudeCredentials `
          -Destination $isolatedClaudeCredentials `
          -OwnedRoot $authenticatedProfileRoot
        Copy-IsolatedAuthenticationFile `
          -Source $sourceCodexAuth `
          -Destination $isolatedCodexAuth `
          -OwnedRoot $authenticatedProfileRoot
        Copy-IsolatedAuthenticationFile `
          -Source $sourceHermesAuth `
          -Destination $isolatedHermesAuth `
          -OwnedRoot $authenticatedProfileRoot
        $codexShim = New-IsolatedCodexShim `
          -ShimRoot (Join-Path $authenticatedProfileRoot 'bin') `
          -CodexHome (Join-Path $authenticatedProfileRoot '.codex') `
          -OwnedRoot $authenticatedProfileRoot
        $hermesConfig = @'
model:
  default: gpt-5.5
  provider: openai-codex
agent:
  reasoning_effort: xhigh
'@
        [IO.File]::WriteAllText(
          (Join-Path $authenticatedHermesLease.ProfileHome 'config.yaml'),
          $hermesConfig + [Environment]::NewLine,
          [Text.UTF8Encoding]::new($false)
        )
        $authenticatedDrive = Split-Path -Qualifier $authenticatedProfileRoot
        Set-ProcessEnvironment -Name 'USERPROFILE' -Value $authenticatedProfileRoot
        Set-ProcessEnvironment -Name 'HOME' -Value $authenticatedProfileRoot
        Set-ProcessEnvironment -Name 'HOMEDRIVE' -Value $authenticatedDrive
        Set-ProcessEnvironment -Name 'HOMEPATH' -Value $authenticatedProfileRoot.Substring($authenticatedDrive.Length)
        Set-ProcessEnvironment -Name 'APPDATA' -Value (Join-Path $authenticatedProfileRoot 'AppData\Roaming')
        Set-ProcessEnvironment -Name 'LOCALAPPDATA' -Value (Join-Path $authenticatedProfileRoot 'AppData\Local')
        Set-ProcessEnvironment -Name 'CLAUDE_CONFIG_DIR' -Value $null
        Set-ProcessEnvironment -Name 'CODEX_HOME' -Value $null
        Set-ProcessEnvironment -Name 'PATH' -Value (
          $codexShim.Directory + [IO.Path]::PathSeparator + $originalEnvironment['PATH']
        )
        Set-ProcessEnvironment -Name 'WAGGLE_E2E_REAL_TOOLS' -Value $null
        Set-ProcessEnvironment -Name 'WAGGLE_LIVE_EXTERNAL_AGENTS' -Value '1'
        Set-ProcessEnvironment -Name 'WAGGLE_LIVE_HERMES_PROVIDER' -Value $null
        Set-ProcessEnvironment -Name 'WAGGLE_LIVE_HERMES_MODEL' -Value $null
        Set-ProcessEnvironment -Name 'HERMES_HOME' -Value $authenticatedHermesLease.ProfileHome
        Invoke-NativePreflight -FilePath 'claude' -ArgumentList @('auth', 'status') `
          -FailureMessage 'Isolated Claude Code authentication preflight failed'
        Invoke-NativePreflight -FilePath $script:runnerNodePath `
          -ArgumentList @($codexShim.Launcher, 'login', 'status') `
          -FailureMessage 'Isolated Codex authentication preflight failed'
        Invoke-VitestLane -Spec 'tests/integration/external-agent-collaboration.live.test.ts' `
          -ReceiptName 'authenticated-tasks' -HermesProvider 'openai-codex' -HermesModel 'gpt-5.5'
      } finally {
        Complete-AuthenticatedIsolationCleanup `
          -HermesLease $authenticatedHermesLease `
          -SourceAuthEvidence $sourceAuthEvidence `
          -ProfileVariables $profileVariables `
          -IsolatedAuthPaths $isolatedAuthPaths `
          -OwnedRoot $authenticatedProfileRoot
      }
    }
  } finally {
    Pop-Location
  }
  } finally {
    foreach ($name in $environmentToRestore) { Restore-ProcessEnvironment -Name $name }
    Remove-VerifiedTempTree -Target $runRoot
  }
  if ($null -ne $receiptRoot) {
    Publish-ReceiptSet -StagingRoot $receiptStagingRoot -FinalRoot $receiptRoot `
      -ExpectedReceiptNames $expectedReceiptNames
    $receiptStagingOwned = $false
  }
  $publicationCompleted = $true
} finally {
  if (-not $publicationCompleted -and $null -ne $receiptRoot) {
    Remove-VerifiedReceiptStaging -StagingRoot $receiptStagingRoot -FinalRoot $receiptRoot `
      -Owned $receiptStagingOwned
  }
}

$authenticatedMessage = if ($AuthenticatedTasks) { ', authenticated task' } else { '' }
Write-Host "Windows external-agent route, hook$authenticatedMessage lifecycle passed with isolated cleanup."
