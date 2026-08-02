[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-f]{40}$')]
  [string]$ExpectedHead,

  [Parameter(Mandatory = $true)]
  [string]$ReceiptDir,

  [string]$ClaudeModel = 'claude-haiku-4-5-20251001',

  [ValidateRange(0.01, 1.00)]
  [decimal]$ClaudeMaxUsd = [decimal]0.05,

  [ValidateSet('openai-codex')]
  [string]$HermesProvider = 'openai-codex',

  [string]$HermesModel = 'gpt-5.5',

  [switch]$StaticPreflightOnly,

  [switch]$Execute,

  [string]$PaidRunAck = ''
)

$ErrorActionPreference = 'Stop'
$executionAcknowledgement = 'I_ACKNOWLEDGE_2_OFFICIAL_AUTH_CALLS'
$evidenceRoot = [IO.Path]::GetFullPath('C:\tmp\waggle-readiness-evidence')
$profileEnvironmentNames = @(
  'USERPROFILE',
  'HOME',
  'HOMEDRIVE',
  'HOMEPATH',
  'APPDATA',
  'LOCALAPPDATA',
  'CLAUDE_CONFIG_DIR',
  'CODEX_HOME',
  'HERMES_HOME',
  'HERMES_PROFILE'
)
$claudeAlternativeAuthNames = @(
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_PROFILE',
  'AWS_CONFIG_FILE',
  'AWS_SHARED_CREDENTIALS_FILE',
  'GOOGLE_API_KEY',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'CLOUDSDK_CONFIG'
)
$hermesAlternativeAuthNames = @(
  'OPENAI_API_KEY',
  'OPENAI_ACCESS_TOKEN',
  'CODEX_ACCESS_TOKEN',
  'OPENAI_BASE_URL',
  'OPENAI_API_BASE',
  'OPENROUTER_API_KEY',
  'OPENROUTER_BASE_URL',
  'HERMES_API_KEY',
  'LLM_API_KEY'
)

function Assert-PlainIdentifier([string]$Value, [string]$Name) {
  if ([string]::IsNullOrWhiteSpace($Value) -or $Value.Length -gt 128 -or $Value -match '[\x00-\x1f\x7f]') {
    throw "$Name must be a non-empty, single-line identifier of at most 128 characters."
  }
}

function Assert-NoExistingReparsePoint([string]$Path, [string]$FailureMessage) {
  $cursor = [IO.Path]::GetFullPath($Path)
  while (-not [string]::IsNullOrWhiteSpace($cursor)) {
    if (Test-Path -LiteralPath $cursor) {
      $item = Get-Item -LiteralPath $cursor -Force
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "$FailureMessage`: $cursor"
      }
    }
    $parent = [IO.Path]::GetDirectoryName($cursor)
    if ([string]::IsNullOrWhiteSpace($parent) -or $parent -eq $cursor) { break }
    $cursor = $parent
  }
}

function Resolve-ReceiptLayout([string]$RequestedPath) {
  $rootPrefix = $evidenceRoot.TrimEnd(
    [IO.Path]::DirectorySeparatorChar,
    [IO.Path]::AltDirectorySeparatorChar
  ) + [IO.Path]::DirectorySeparatorChar
  $fullPath = [IO.Path]::GetFullPath($RequestedPath).TrimEnd(
    [IO.Path]::DirectorySeparatorChar,
    [IO.Path]::AltDirectorySeparatorChar
  )
  if (-not $fullPath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "ReceiptDir must be a child of $evidenceRoot."
  }
  if (Test-Path -LiteralPath $fullPath) {
    throw 'ReceiptDir must be a fresh path owned by this run.'
  }
  Assert-NoExistingReparsePoint -Path ([IO.Path]::GetDirectoryName($fullPath)) `
    -FailureMessage 'ReceiptDir ancestor is a reparse point'
  $leaf = [IO.Path]::GetFileName($fullPath)
  if ([string]::IsNullOrWhiteSpace($leaf)) { throw 'ReceiptDir must have a final directory name.' }
  return [pscustomobject]@{
    Root = $fullPath
    Staging = Join-Path ([IO.Path]::GetDirectoryName($fullPath)) ".$leaf.staging-$([guid]::NewGuid().ToString('N'))"
  }
}

function Get-Sha256Text([string]$Value) {
  $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
  return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
}

function Get-Utf8ByteCount([string]$Value) {
  return [Text.Encoding]::UTF8.GetByteCount($Value)
}

function Get-RegularFileHash([string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "$Label is missing." }
  $item = Get-Item -LiteralPath $Path -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "$Label must be a regular file, not a reparse point."
  }
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Resolve-Application([string]$Name) {
  $command = Get-Command -Name $Name -CommandType Application -ErrorAction Stop | Select-Object -First 1
  $null = Get-RegularFileHash -Path $command.Source -Label "$Name executable"
  return $command.Source
}

function Get-GitState([string]$RepositoryRoot) {
  $head = (& git.exe -C $RepositoryRoot rev-parse HEAD 2>$null).Trim()
  if ($LASTEXITCODE -ne 0) { throw 'Could not read repository HEAD.' }
  $tree = (& git.exe -C $RepositoryRoot rev-parse 'HEAD^{tree}' 2>$null).Trim()
  if ($LASTEXITCODE -ne 0) { throw 'Could not read repository tree.' }
  $status = [string]::Join("`n", @(& git.exe -C $RepositoryRoot status --porcelain=v1 --untracked-files=no 2>$null)).Trim()
  if ($LASTEXITCODE -ne 0) { throw 'Could not read tracked repository status.' }
  return [pscustomobject]@{ Head = $head; Tree = $tree; TrackedClean = $status.Length -eq 0 }
}

function Get-ScriptProvenance([string]$RepositoryRoot, [string]$ScriptPath) {
  $relativePath = [IO.Path]::GetRelativePath($RepositoryRoot, $ScriptPath).Replace('\', '/')
  if ($relativePath.StartsWith('../', [StringComparison]::Ordinal) -or
    [IO.Path]::IsPathRooted($relativePath)) {
    throw 'Official-auth canary script must be inside the repository.'
  }
  $trackedPath = [string]::Join("`n", @(
    & git.exe -C $RepositoryRoot ls-files --error-unmatch -- $relativePath 2>$null
  )).Trim()
  if ($LASTEXITCODE -ne 0 -or $trackedPath -cne $relativePath) {
    throw 'Official-auth canary script must be tracked at ExpectedHead.'
  }
  $expectedBlob = (& git.exe -C $RepositoryRoot rev-parse "$ExpectedHead`:$relativePath" 2>$null).Trim()
  if ($LASTEXITCODE -ne 0 -or $expectedBlob -notmatch '^[0-9a-f]{40}$') {
    throw 'Could not resolve the official-auth canary script blob at ExpectedHead.'
  }
  $workingBlob = (& git.exe -C $RepositoryRoot hash-object "--path=$relativePath" -- $ScriptPath 2>$null).Trim()
  if ($LASTEXITCODE -ne 0 -or $workingBlob -notmatch '^[0-9a-f]{40}$') {
    throw 'Could not hash the filtered official-auth canary script working file.'
  }
  if ($workingBlob -cne $expectedBlob) {
    throw 'Official-auth canary script working blob does not match ExpectedHead.'
  }
  return [pscustomobject]@{
    RelativePath = $relativePath
    Blob = $expectedBlob
  }
}

function Assert-ExpectedGitState($State) {
  if ($State.Head -cne $ExpectedHead) {
    throw "Expected HEAD $ExpectedHead but observed $($State.Head)."
  }
  if (-not $State.TrackedClean) { throw 'Tracked repository state must be clean.' }
}

function Invoke-CapturedProcess(
  [string]$FilePath,
  [string[]]$ArgumentList,
  [string]$WorkingDirectory,
  [hashtable]$EnvironmentOverrides,
  [string[]]$BlankEnvironmentNames,
  [int]$TimeoutSeconds
) {
  $start = [Diagnostics.ProcessStartInfo]::new()
  $start.FileName = $FilePath
  $start.WorkingDirectory = $WorkingDirectory
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  foreach ($argument in $ArgumentList) { $null = $start.ArgumentList.Add($argument) }
  foreach ($entry in $EnvironmentOverrides.GetEnumerator()) {
    $start.Environment[[string]$entry.Key] = [string]$entry.Value
  }
  foreach ($name in @($start.Environment.Keys)) {
    if ([string]$name -match '(?i)(?:API_KEY|AUTH_TOKEN|ACCESS_TOKEN|_TOKEN)$') {
      $start.Environment[[string]$name] = ''
    }
  }
  foreach ($name in $BlankEnvironmentNames) { $start.Environment[$name] = '' }

  $profilePreserved = $true
  foreach ($name in $profileEnvironmentNames) {
    $parentHas = [Environment]::GetEnvironmentVariables().Contains($name)
    $childHas = $start.Environment.ContainsKey($name)
    if ($parentHas -ne $childHas) { $profilePreserved = $false; continue }
    if ($parentHas -and $start.Environment[$name] -cne [Environment]::GetEnvironmentVariable($name)) {
      $profilePreserved = $false
    }
  }
  if (-not $profilePreserved) { throw 'A child process would override a user profile environment variable.' }

  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $start
  $startedAt = [DateTimeOffset]::UtcNow
  try {
    if (-not $process.Start()) { throw 'Process did not start.' }
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $timedOut = -not $process.WaitForExit($TimeoutSeconds * 1000)
    if ($timedOut) {
      try { $process.Kill($true) } catch { }
      $process.WaitForExit()
    }
    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()
    return [pscustomobject]@{
      ExitCode = if ($timedOut) { $null } else { $process.ExitCode }
      TimedOut = $timedOut
      DurationMs = [int]([DateTimeOffset]::UtcNow - $startedAt).TotalMilliseconds
      Stdout = $stdout
      Stderr = $stderr
      StdoutBytes = Get-Utf8ByteCount $stdout
      StderrBytes = Get-Utf8ByteCount $stderr
      StdoutSha256 = Get-Sha256Text $stdout
      StderrSha256 = Get-Sha256Text $stderr
      ProfileEnvironmentPreserved = $profilePreserved
    }
  } finally {
    $process.Dispose()
  }
}

function Assert-ProcessPassed($Result, [string]$Label) {
  if ($Result.TimedOut) { throw "$Label timed out." }
  if ($Result.ExitCode -ne 0) { throw "$Label exited non-zero ($($Result.ExitCode))." }
}

function Remove-OwnedFile([string]$Path, [string]$OwnedRoot) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $resolved = [IO.Path]::GetFullPath($Path)
  $prefix = [IO.Path]::GetFullPath($OwnedRoot).TrimEnd(
    [IO.Path]::DirectorySeparatorChar,
    [IO.Path]::AltDirectorySeparatorChar
  ) + [IO.Path]::DirectorySeparatorChar
  if (-not $resolved.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Refusing to remove a file outside the run-owned root.'
  }
  $item = Get-Item -LiteralPath $resolved -Force
  if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'Refusing to remove a non-regular run artifact.'
  }
  [IO.File]::Delete($resolved)
}

function Remove-OwnedDirectory([string]$Path, [string]$RequiredParent) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $resolved = [IO.Path]::GetFullPath($Path)
  $prefix = [IO.Path]::GetFullPath($RequiredParent).TrimEnd(
    [IO.Path]::DirectorySeparatorChar,
    [IO.Path]::AltDirectorySeparatorChar
  ) + [IO.Path]::DirectorySeparatorChar
  if (-not $resolved.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Refusing to remove a directory outside the run-owned parent.'
  }
  $item = Get-Item -LiteralPath $resolved -Force
  if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'Refusing to remove an unsafe run directory.'
  }
  $reparse = Get-ChildItem -LiteralPath $resolved -Force -Recurse -Attributes ReparsePoint -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($null -ne $reparse) { throw 'Refusing cleanup because the run directory contains a reparse point.' }
  $lastError = $null
  for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    try {
      [IO.Directory]::Delete($resolved, $true)
      return
    } catch {
      $lastError = $_
      Start-Sleep -Milliseconds 250
    }
  }
  throw $lastError
}

function Write-JsonCreateNew([string]$Path, $Value) {
  $json = ConvertTo-Json -InputObject $Value -Depth 20
  $stream = [IO.File]::Open($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try {
    $writer = [IO.StreamWriter]::new($stream, [Text.UTF8Encoding]::new($false))
    try { $writer.Write($json); $writer.Write("`n"); $writer.Flush(); $stream.Flush($true) } finally { $writer.Dispose() }
  } finally {
    $stream.Dispose()
  }
}

function Initialize-IsolatedMindWorkspace([string]$MindRoot, [string]$WorkspaceId) {
  $workspaceDir = Join-Path (Join-Path $MindRoot 'workspaces') $WorkspaceId
  $null = [IO.Directory]::CreateDirectory($workspaceDir)
  Write-JsonCreateNew -Path (Join-Path $workspaceDir 'workspace.json') -Value ([ordered]@{ id = $WorkspaceId })
  return Join-Path $workspaceDir 'workspace.mind'
}

function Get-MarkerCaptureEvidence(
  [string]$NodeExe,
  [string]$BetterSqliteEntry,
  [string]$MindPath,
  [string]$Marker,
  [string]$Source,
  [string]$SessionId,
  [string]$WorkingDirectory,
  [hashtable]$EnvironmentOverrides,
  [string[]]$BlankEnvironmentNames
) {
  $mindSha256 = Get-RegularFileHash -Path $MindPath -Label "$Source isolated workspace mind"
  $inspectionSource = @'
const crypto = require('node:crypto');
const [modulePath, mindPath, marker, source, sessionId] = process.argv.slice(1);
const Database = require(modulePath);
const db = new Database(mindPath, { readonly: true, fileMustExist: true });
try {
  db.pragma('query_only = ON');
  const rows = db.prepare(
    'SELECT content, importance, source FROM memory_frames WHERE instr(content, ?) > 0 ORDER BY id'
  ).all(marker);
  const belongsToSession = (content) =>
    content.startsWith(`[hm session:${sessionId} `) && content.includes(` src:${source} event:`);
  const matchingSession = rows.filter((row) => belongsToSession(row.content));
  const prompts = rows.filter((row) =>
    belongsToSession(row.content)
    && row.content.includes(` src:${source} event:user-prompt-submit] `)
    && row.importance === 'temporary'
    && row.source === 'system'
  );
  const responses = rows.filter((row) =>
    belongsToSession(row.content)
    && row.content.includes(` src:${source} event:stop] `)
    && (row.importance === 'important' || row.importance === 'critical')
    && row.source === 'system'
  );
  const hash = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
  process.stdout.write(JSON.stringify({
    markerFrames: rows.length,
    matchingSessionFrames: matchingSession.length,
    promptFrames: prompts.length,
    responseFrames: responses.length,
    systemSourceFrames: rows.filter((row) => row.source === 'system').length,
    temporaryFrames: rows.filter((row) => row.importance === 'temporary').length,
    importantOrCriticalFrames: rows.filter((row) =>
      row.importance === 'important' || row.importance === 'critical'
    ).length,
    promptContentSha256: prompts[0] ? hash(prompts[0].content) : null,
    responseContentSha256: responses[0] ? hash(responses[0].content) : null,
  }));
  if (rows.length !== 2 || matchingSession.length !== 2 ||
      prompts.length !== 1 || responses.length !== 1) process.exitCode = 2;
} finally {
  db.close();
}
'@
  $inspection = Invoke-CapturedProcess -FilePath $NodeExe -ArgumentList @(
    '-e', $inspectionSource, '--', $BetterSqliteEntry, $MindPath, $Marker, $Source, $SessionId
  ) -WorkingDirectory $WorkingDirectory -EnvironmentOverrides $EnvironmentOverrides `
    -BlankEnvironmentNames $BlankEnvironmentNames -TimeoutSeconds 30
  try { $evidence = $inspection.Stdout | ConvertFrom-Json -Depth 10 } catch {
    throw "$Source marker capture inspection did not return valid JSON."
  }
  if ($inspection.TimedOut -or $inspection.ExitCode -ne 0 -or
    [int]$evidence.markerFrames -ne 2 -or [int]$evidence.matchingSessionFrames -ne 2 -or
    [int]$evidence.promptFrames -ne 1 -or
    [int]$evidence.responseFrames -ne 1 -or
    [string]$evidence.promptContentSha256 -notmatch '^[0-9a-f]{64}$' -or
    [string]$evidence.responseContentSha256 -notmatch '^[0-9a-f]{64}$') {
    throw "$Source marker capture evidence did not satisfy the two-frame contract " +
      "(exit=$($inspection.ExitCode), timeout=$($inspection.TimedOut), marker=$($evidence.markerFrames), " +
      "session=$($evidence.matchingSessionFrames), prompt=$($evidence.promptFrames), " +
      "response=$($evidence.responseFrames), system=$($evidence.systemSourceFrames), " +
      "temporary=$($evidence.temporaryFrames), important=$($evidence.importantOrCriticalFrames))."
  }
  return [pscustomobject]@{
    MindSha256 = $mindSha256
    MarkerFrames = [int]$evidence.markerFrames
    PromptFrames = [int]$evidence.promptFrames
    ResponseFrames = [int]$evidence.responseFrames
    PromptContentSha256 = [string]$evidence.promptContentSha256
    ResponseContentSha256 = [string]$evidence.responseContentSha256
  }
}

if ($env:OS -ne 'Windows_NT') { throw 'Official-auth canaries are Windows-only.' }
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'Official-auth canaries require PowerShell 7 or newer.' }
if ([bool]$StaticPreflightOnly -eq [bool]$Execute) {
  throw 'Choose exactly one mode: -StaticPreflightOnly or -Execute.'
}
if ($Execute -and $PaidRunAck -cne $executionAcknowledgement) {
  throw "-Execute requires -PaidRunAck $executionAcknowledgement."
}
Assert-PlainIdentifier -Value $ClaudeModel -Name 'ClaudeModel'
Assert-PlainIdentifier -Value $HermesProvider -Name 'HermesProvider'
Assert-PlainIdentifier -Value $HermesModel -Name 'HermesModel'

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$receiptLayout = Resolve-ReceiptLayout -RequestedPath $ReceiptDir
$initialGit = Get-GitState -RepositoryRoot $repoRoot
Assert-ExpectedGitState -State $initialGit
$scriptProvenance = Get-ScriptProvenance -RepositoryRoot $repoRoot -ScriptPath $PSCommandPath
$claudeExe = Resolve-Application -Name 'claude'
$hermesExe = Resolve-Application -Name 'hermes'
$nodeExe = Resolve-Application -Name 'node'
$scriptSha256 = Get-RegularFileHash -Path $PSCommandPath -Label 'official-auth canary script'
$artifactPaths = [ordered]@{
  claudeInstaller = Join-Path $repoRoot 'packages\hive-mind-hooks-claude-code\dist\bin\claude-code-hooks-cli.js'
  claudeSessionStart = Join-Path $repoRoot 'packages\hive-mind-hooks-claude-code\dist\hooks\session-start.js'
  claudeUserPromptSubmit = Join-Path $repoRoot 'packages\hive-mind-hooks-claude-code\dist\hooks\user-prompt-submit.js'
  claudeStop = Join-Path $repoRoot 'packages\hive-mind-hooks-claude-code\dist\hooks\stop.js'
  hermesInstaller = Join-Path $repoRoot 'packages\hive-mind-hooks-hermes\dist\bin\hermes-hooks.js'
  hermesSessionStart = Join-Path $repoRoot 'packages\hive-mind-hooks-hermes\dist\hooks\session-start.js'
  hermesUserPromptSubmit = Join-Path $repoRoot 'packages\hive-mind-hooks-hermes\dist\hooks\user-prompt-submit.js'
  hermesStop = Join-Path $repoRoot 'packages\hive-mind-hooks-hermes\dist\hooks\stop.js'
  betterSqlite3Entry = Join-Path $repoRoot 'node_modules\better-sqlite3\lib\index.js'
}
$artifactHashes = [ordered]@{}
foreach ($entry in $artifactPaths.GetEnumerator()) {
  $artifactHashes[$entry.Key] = Get-RegularFileHash -Path $entry.Value -Label $entry.Key
}

if ($StaticPreflightOnly) {
  [pscustomobject]@{
    schemaVersion = 1
    mode = 'static-preflight'
    source = [ordered]@{
      head = $initialGit.Head
      tree = $initialGit.Tree
      trackedClean = $initialGit.TrackedClean
      scriptSha256 = $scriptSha256
      scriptBlob = $scriptProvenance.Blob
    }
    receipt = [ordered]@{ freshAllowedPath = $true; created = $false }
    clients = [ordered]@{
      claudeResolved = $true
      hermesResolved = $true
      nodeResolved = $true
      claudeExecutableSha256 = Get-RegularFileHash -Path $claudeExe -Label 'Claude executable'
      hermesExecutableSha256 = Get-RegularFileHash -Path $hermesExe -Label 'Hermes executable'
    }
    artifacts = $artifactHashes
    authCalls = 0
    modelCalls = 0
  } | ConvertTo-Json -Depth 10
  return
}

$tempParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
Assert-NoExistingReparsePoint -Path $tempParent -FailureMessage 'Temporary parent is a reparse point'
$tempRoot = Join-Path $tempParent "waggle-official-auth-$([guid]::NewGuid().ToString('N'))"
$stagingOwned = $false
$tempOwned = $false
$published = $false
$hermesUsageRemoved = $false

try {
  $null = [IO.Directory]::CreateDirectory($tempRoot)
  $tempOwned = $true
  $claudeWorkspace = Join-Path $tempRoot 'claude-workspace'
  $hermesWorkspace = Join-Path $tempRoot 'hermes-workspace'
  $mindRoot = Join-Path $tempRoot 'mind'
  $processTemp = Join-Path $tempRoot 'process-temp'
  $null = [IO.Directory]::CreateDirectory($claudeWorkspace)
  $null = [IO.Directory]::CreateDirectory($hermesWorkspace)
  $null = [IO.Directory]::CreateDirectory($mindRoot)
  $null = [IO.Directory]::CreateDirectory($processTemp)
  $claudeWorkspaceId = "official-auth-claude-$([guid]::NewGuid().ToString('N'))"
  $hermesWorkspaceId = "official-auth-hermes-$([guid]::NewGuid().ToString('N'))"
  $claudeMindPath = Initialize-IsolatedMindWorkspace -MindRoot $mindRoot -WorkspaceId $claudeWorkspaceId
  $hermesMindPath = Initialize-IsolatedMindWorkspace -MindRoot $mindRoot -WorkspaceId $hermesWorkspaceId
  $commonEnvironment = @{
    HIVE_MIND_DATA_DIR = $mindRoot
    HIVE_MIND_SCOPES = 'personal,workspace'
    HIVE_MIND_SHIM_LOG_LEVEL = 'error'
    WAGGLE_SIGNAL_EMIT = '0'
    NO_COLOR = '1'
    TEMP = $processTemp
    TMP = $processTemp
  }
  $claudeEnvironment = $commonEnvironment.Clone()
  $claudeEnvironment.WAGGLE_WORKSPACE_ID = $claudeWorkspaceId
  $hermesEnvironment = $commonEnvironment.Clone()
  $hermesEnvironment.WAGGLE_WORKSPACE_ID = $hermesWorkspaceId

  $claudeVersionRaw = Invoke-CapturedProcess -FilePath $claudeExe -ArgumentList @('--version') `
    -WorkingDirectory $claudeWorkspace -EnvironmentOverrides $claudeEnvironment `
    -BlankEnvironmentNames $claudeAlternativeAuthNames -TimeoutSeconds 30
  Assert-ProcessPassed -Result $claudeVersionRaw -Label 'Claude version preflight'
  $claudeVersion = ($claudeVersionRaw.Stdout -split '\r?\n' | Where-Object { $_.Trim() } | Select-Object -First 1).Trim()
  if ($claudeVersion -notmatch '^2\.') { throw 'Claude version preflight returned an unexpected version.' }

  $hermesVersionRaw = Invoke-CapturedProcess -FilePath $hermesExe -ArgumentList @('--version') `
    -WorkingDirectory $hermesWorkspace -EnvironmentOverrides $hermesEnvironment `
    -BlankEnvironmentNames $hermesAlternativeAuthNames -TimeoutSeconds 30
  Assert-ProcessPassed -Result $hermesVersionRaw -Label 'Hermes version preflight'
  $hermesVersion = ($hermesVersionRaw.Stdout -split '\r?\n' | Where-Object { $_ -match '^Hermes Agent v' } | Select-Object -First 1).Trim()
  if ([string]::IsNullOrWhiteSpace($hermesVersion)) { throw 'Hermes version preflight returned an unexpected version.' }

  $hookBlankNames = @($claudeAlternativeAuthNames + $hermesAlternativeAuthNames | Select-Object -Unique)
  $claudeHookVerify = Invoke-CapturedProcess -FilePath $nodeExe `
    -ArgumentList @($artifactPaths.claudeInstaller, 'verify') -WorkingDirectory $repoRoot `
    -EnvironmentOverrides $commonEnvironment -BlankEnvironmentNames $hookBlankNames -TimeoutSeconds 60
  Assert-ProcessPassed -Result $claudeHookVerify -Label 'Claude hook verification'
  $claudeHookPasses = [regex]::Matches($claudeHookVerify.Stdout, '(?m)^\s*\[PASS\]').Count
  if ($claudeHookPasses -lt 11 -or $claudeHookVerify.Stdout -notmatch 'All checks passed\.') {
    throw 'Claude hook verification did not satisfy the 11-check contract.'
  }

  $hermesHookVerify = Invoke-CapturedProcess -FilePath $nodeExe `
    -ArgumentList @($artifactPaths.hermesInstaller, 'verify') -WorkingDirectory $repoRoot `
    -EnvironmentOverrides $commonEnvironment -BlankEnvironmentNames $hookBlankNames -TimeoutSeconds 60
  Assert-ProcessPassed -Result $hermesHookVerify -Label 'Hermes hook verification'
  $hermesHookPasses = [regex]::Matches($hermesHookVerify.Stdout, '(?m)^\s*\[PASS\]').Count
  if ($hermesHookPasses -lt 8 -or $hermesHookVerify.Stdout -notmatch 'All checks passed\.') {
    throw 'Hermes hook verification did not satisfy the 8-check contract.'
  }

  $claudeAuthRaw = Invoke-CapturedProcess -FilePath $claudeExe -ArgumentList @('auth', 'status', '--json') `
    -WorkingDirectory $claudeWorkspace -EnvironmentOverrides $claudeEnvironment `
    -BlankEnvironmentNames $claudeAlternativeAuthNames -TimeoutSeconds 30
  Assert-ProcessPassed -Result $claudeAuthRaw -Label 'Claude official-auth preflight'
  try { $claudeAuthJson = $claudeAuthRaw.Stdout | ConvertFrom-Json -Depth 20 } catch {
    throw 'Claude official-auth preflight did not return valid JSON.'
  }
  if ($claudeAuthJson.loggedIn -ne $true -or $claudeAuthJson.authMethod -cne 'claude.ai' -or
    $claudeAuthJson.apiProvider -cne 'firstParty') {
    throw 'Claude is not authenticated through the required first-party claude.ai client session.'
  }

  $hermesAuthRaw = Invoke-CapturedProcess -FilePath $hermesExe `
    -ArgumentList @('auth', 'status', $HermesProvider) -WorkingDirectory $hermesWorkspace `
    -EnvironmentOverrides $hermesEnvironment -BlankEnvironmentNames $hermesAlternativeAuthNames -TimeoutSeconds 30
  Assert-ProcessPassed -Result $hermesAuthRaw -Label 'Hermes official-auth preflight'
  $escapedHermesProvider = [regex]::Escape($HermesProvider)
  if ($hermesAuthRaw.Stdout -notmatch "(?m)^$escapedHermesProvider`:\s+logged in\s*$") {
    throw 'Hermes is not logged in to the required provider.'
  }

  $claudeMarker = "WAGGLE_CLAUDE_OFFICIAL_AUTH_$([Security.Cryptography.RandomNumberGenerator]::GetHexString(24).ToLowerInvariant())"
  $claudePrompt = "Return exactly $claudeMarker and nothing else. Do not call tools."
  $claudeBudget = $ClaudeMaxUsd.ToString('0.00', [Globalization.CultureInfo]::InvariantCulture)
  $claudeRaw = Invoke-CapturedProcess -FilePath $claudeExe -ArgumentList @(
    '-p', $claudePrompt,
    '--model', $ClaudeModel,
    '--max-budget-usd', $claudeBudget,
    '--output-format', 'stream-json',
    '--include-hook-events',
    '--verbose',
    '--permission-mode', 'plan',
    '--disable-slash-commands',
    '--tools', '',
    '--no-session-persistence',
    '--setting-sources', 'user',
    '--no-chrome'
  ) -WorkingDirectory $claudeWorkspace -EnvironmentOverrides $claudeEnvironment `
    -BlankEnvironmentNames $claudeAlternativeAuthNames -TimeoutSeconds 180
  Assert-ProcessPassed -Result $claudeRaw -Label 'Claude official-auth canary'

  $claudeEvents = [Collections.Generic.List[object]]::new()
  $invalidClaudeLines = 0
  foreach ($line in ($claudeRaw.Stdout -split '\r?\n')) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    try { $claudeEvents.Add(($line | ConvertFrom-Json -Depth 100)) } catch { $invalidClaudeLines += 1 }
  }
  if ($invalidClaudeLines -ne 0) { throw 'Claude emitted malformed stream JSON.' }
  $claudeResult = @($claudeEvents | Where-Object { $_.type -eq 'result' }) | Select-Object -Last 1
  if ($null -eq $claudeResult -or $claudeResult.is_error -ne $false -or
    ([string]$claudeResult.result).Trim() -cne $claudeMarker) {
    throw 'Claude official-auth canary did not return the exact marker.'
  }
  $claudeCost = [decimal]$claudeResult.total_cost_usd
  if ($claudeCost -lt 0 -or $claudeCost -gt $ClaudeMaxUsd) { throw 'Claude exceeded the declared cost cap.' }
  if ([int]$claudeResult.num_turns -ne 1) { throw 'Claude official-auth canary was not exactly one turn.' }
  $claudeHookEvents = @($claudeEvents | Where-Object {
    $_.type -eq 'system' -and $_.subtype -in @('hook_started', 'hook_response')
  } | ForEach-Object { [string]$_.hook_event } | Where-Object { $_ } | Sort-Object -Unique)
  foreach ($requiredHook in @('SessionStart', 'UserPromptSubmit', 'Stop')) {
    if ($claudeHookEvents -notcontains $requiredHook) { throw "Claude did not report $requiredHook hook execution." }
  }
  $claudeSessionId = [string]$claudeResult.session_id
  if ([string]::IsNullOrWhiteSpace($claudeSessionId)) {
    $claudeSessionId = [string](@($claudeEvents | Where-Object { $_.session_id } | Select-Object -First 1).session_id)
  }
  if ([string]::IsNullOrWhiteSpace($claudeSessionId)) { throw 'Claude omitted the session identifier.' }
  $claudeCapture = Get-MarkerCaptureEvidence -NodeExe $nodeExe `
    -BetterSqliteEntry $artifactPaths.betterSqlite3Entry -MindPath $claudeMindPath `
    -Marker $claudeMarker -Source 'claude-code' -SessionId $claudeSessionId `
    -WorkingDirectory $repoRoot -EnvironmentOverrides $claudeEnvironment `
    -BlankEnvironmentNames $hookBlankNames

  $hermesMarker = "WAGGLE_HERMES_OFFICIAL_AUTH_$([Security.Cryptography.RandomNumberGenerator]::GetHexString(24).ToLowerInvariant())"
  $hermesPrompt = "Return exactly $hermesMarker and nothing else. Do not call tools."
  $hermesUsagePath = Join-Path $tempRoot 'hermes-usage.json'
  $hermesRaw = Invoke-CapturedProcess -FilePath $hermesExe -ArgumentList @(
    '-z', $hermesPrompt,
    '--usage-file', $hermesUsagePath,
    '--provider', $HermesProvider,
    '-m', $HermesModel,
    '--ignore-rules'
  ) -WorkingDirectory $hermesWorkspace -EnvironmentOverrides $hermesEnvironment `
    -BlankEnvironmentNames $hermesAlternativeAuthNames -TimeoutSeconds 180
  Assert-ProcessPassed -Result $hermesRaw -Label 'Hermes official-auth canary'
  if ($hermesRaw.Stdout.Trim() -cne $hermesMarker) { throw 'Hermes official-auth canary did not return the exact marker.' }
  if (-not (Test-Path -LiteralPath $hermesUsagePath -PathType Leaf)) { throw 'Hermes did not write its usage receipt.' }
  $hermesUsageBytes = [IO.File]::ReadAllBytes($hermesUsagePath)
  $hermesUsageSha256 = [Convert]::ToHexString(
    [Security.Cryptography.SHA256]::HashData($hermesUsageBytes)
  ).ToLowerInvariant()
  try { $hermesUsage = [Text.Encoding]::UTF8.GetString($hermesUsageBytes) | ConvertFrom-Json -Depth 20 } catch {
    throw 'Hermes usage receipt was not valid JSON.'
  }
  if ($hermesUsage.completed -ne $true -or $hermesUsage.failed -eq $true -or [int]$hermesUsage.api_calls -ne 1) {
    throw 'Hermes usage receipt did not prove exactly one completed API call.'
  }
  if ([string]$hermesUsage.provider -cne $HermesProvider -or [string]$hermesUsage.model -cne $HermesModel) {
    throw 'Hermes usage receipt did not match the requested provider and model.'
  }
  $hermesSessionId = [string]$hermesUsage.session_id
  if ([string]::IsNullOrWhiteSpace($hermesSessionId)) { throw 'Hermes usage receipt omitted the session identifier.' }
  $hermesCapture = Get-MarkerCaptureEvidence -NodeExe $nodeExe `
    -BetterSqliteEntry $artifactPaths.betterSqlite3Entry -MindPath $hermesMindPath `
    -Marker $hermesMarker -Source 'hermes' -SessionId $hermesSessionId `
    -WorkingDirectory $repoRoot -EnvironmentOverrides $hermesEnvironment `
    -BlankEnvironmentNames $hookBlankNames
  Remove-OwnedFile -Path $hermesUsagePath -OwnedRoot $tempRoot
  $hermesUsageRemoved = -not (Test-Path -LiteralPath $hermesUsagePath)
  if (-not $hermesUsageRemoved) { throw 'Hermes raw usage receipt survived cleanup.' }

  $finalGit = Get-GitState -RepositoryRoot $repoRoot
  Assert-ExpectedGitState -State $finalGit
  if ($finalGit.Tree -cne $initialGit.Tree) { throw 'Repository tree changed during official-auth canaries.' }
  $finalScriptProvenance = Get-ScriptProvenance -RepositoryRoot $repoRoot -ScriptPath $PSCommandPath
  if ($finalScriptProvenance.Blob -cne $scriptProvenance.Blob) {
    throw 'Official-auth canary script provenance changed during execution.'
  }

  Remove-OwnedDirectory -Path $tempRoot -RequiredParent $tempParent
  $tempOwned = $false
  if (Test-Path -LiteralPath $tempRoot) { throw 'Official-auth temporary root survived cleanup.' }

  $null = [IO.Directory]::CreateDirectory($evidenceRoot)
  Assert-NoExistingReparsePoint -Path $evidenceRoot -FailureMessage 'Evidence root is a reparse point'
  $null = [IO.Directory]::CreateDirectory($receiptLayout.Staging)
  $stagingOwned = $true
  $receipt = [ordered]@{
    schemaVersion = 1
    kind = 'windows-official-auth-canaries'
    pass = $true
    source = [ordered]@{
      expectedHead = $ExpectedHead
      observedHead = $finalGit.Head
      tree = $finalGit.Tree
      trackedCleanBefore = $initialGit.TrackedClean
      trackedCleanAfter = $finalGit.TrackedClean
      unchangedDuringRun = $finalGit.Head -ceq $initialGit.Head -and $finalGit.Tree -ceq $initialGit.Tree
      scriptSha256 = $scriptSha256
      scriptBlob = $scriptProvenance.Blob
    }
    execution = [ordered]@{
      serialLanes = $true
      modelCalls = 2
      authStatusCalls = 2
      freshTemporaryWorkspace = $true
      distinctIsolatedMindWorkspaces = $true
      captureInspectionReadOnly = $true
      rawStdoutPersisted = $false
      rawStderrPersisted = $false
      rawUsagePersisted = $false
    }
    credentials = [ordered]@{
      mode = 'user-auth-in-place'
      authFilesReadByHarness = 0
      authFilesCopied = 0
      authContentsSerialized = $false
      profileEnvironmentOverrides = 0
      profileEnvironmentPreserved = $true
      ambientApiTokenEnvironmentNamesBlankedByPattern = $true
      claudeAlternativeEnvironmentNamesBlanked = @($claudeAlternativeAuthNames)
      hermesAlternativeEnvironmentNamesBlanked = @($hermesAlternativeAuthNames)
    }
    clients = [ordered]@{
      claude = [ordered]@{
        version = $claudeVersion
        executableSha256 = Get-RegularFileHash -Path $claudeExe -Label 'Claude executable'
        auth = [ordered]@{
          loggedIn = $true
          authMethod = [string]$claudeAuthJson.authMethod
          apiProvider = [string]$claudeAuthJson.apiProvider
          subscriptionType = [string]$claudeAuthJson.subscriptionType
          outputBytes = $claudeAuthRaw.StdoutBytes
          outputSha256 = $claudeAuthRaw.StdoutSha256
        }
        model = $ClaudeModel
        maxBudgetUsd = $ClaudeMaxUsd
        reportedCostUsd = $claudeCost
        exitCode = $claudeRaw.ExitCode
        durationMs = $claudeRaw.DurationMs
        markerSha256 = Get-Sha256Text $claudeMarker
        markerMatched = $true
        numTurns = [int]$claudeResult.num_turns
        sessionIdSha256 = Get-Sha256Text $claudeSessionId
        hookEvents = $claudeHookEvents
        capture = [ordered]@{
          markerFrames = $claudeCapture.MarkerFrames
          promptFrames = $claudeCapture.PromptFrames
          responseFrames = $claudeCapture.ResponseFrames
          promptContentSha256 = $claudeCapture.PromptContentSha256
          responseContentSha256 = $claudeCapture.ResponseContentSha256
          mindSha256 = $claudeCapture.MindSha256
        }
        stdoutBytes = $claudeRaw.StdoutBytes
        stdoutSha256 = $claudeRaw.StdoutSha256
        stderrBytes = $claudeRaw.StderrBytes
        stderrSha256 = $claudeRaw.StderrSha256
      }
      hermes = [ordered]@{
        version = $hermesVersion
        executableSha256 = Get-RegularFileHash -Path $hermesExe -Label 'Hermes executable'
        auth = [ordered]@{
          provider = $HermesProvider
          loggedIn = $true
          outputBytes = $hermesAuthRaw.StdoutBytes
          outputSha256 = $hermesAuthRaw.StdoutSha256
        }
        provider = $HermesProvider
        model = $HermesModel
        exitCode = $hermesRaw.ExitCode
        durationMs = $hermesRaw.DurationMs
        markerSha256 = Get-Sha256Text $hermesMarker
        markerMatched = $true
        sessionIdSha256 = Get-Sha256Text $hermesSessionId
        containment = [ordered]@{
          oneShot = $true
          timeoutSeconds = 180
          exactMarkerRequired = $true
          apiCallsRequired = 1
          usageReceiptRequired = $true
          preCallCostCapAvailable = $false
        }
        capture = [ordered]@{
          markerFrames = $hermesCapture.MarkerFrames
          promptFrames = $hermesCapture.PromptFrames
          responseFrames = $hermesCapture.ResponseFrames
          promptContentSha256 = $hermesCapture.PromptContentSha256
          responseContentSha256 = $hermesCapture.ResponseContentSha256
          mindSha256 = $hermesCapture.MindSha256
        }
        usage = [ordered]@{
          apiCalls = [int]$hermesUsage.api_calls
          inputTokens = $hermesUsage.input_tokens
          outputTokens = $hermesUsage.output_tokens
          reasoningTokens = $hermesUsage.reasoning_tokens
          totalTokens = $hermesUsage.total_tokens
          estimatedCostUsd = $hermesUsage.estimated_cost_usd
          costStatus = $hermesUsage.cost_status
          costSource = $hermesUsage.cost_source
          serviceTier = $hermesUsage.service_tier
          rawBytes = $hermesUsageBytes.Length
          rawSha256 = $hermesUsageSha256
        }
        stdoutBytes = $hermesRaw.StdoutBytes
        stdoutSha256 = $hermesRaw.StdoutSha256
        stderrBytes = $hermesRaw.StderrBytes
        stderrSha256 = $hermesRaw.StderrSha256
      }
    }
    hooks = [ordered]@{
      claude = [ordered]@{
        passedChecks = $claudeHookPasses
        minimumChecks = 11
        stdoutSha256 = $claudeHookVerify.StdoutSha256
        stderrSha256 = $claudeHookVerify.StderrSha256
      }
      hermes = [ordered]@{
        passedChecks = $hermesHookPasses
        minimumChecks = 8
        stdoutSha256 = $hermesHookVerify.StdoutSha256
        stderrSha256 = $hermesHookVerify.StderrSha256
      }
      artifacts = $artifactHashes
    }
    cleanup = [ordered]@{
      temporaryRootRemoved = $true
      hermesRawUsageRemoved = $hermesUsageRemoved
      rawOutputsPersisted = $false
    }
  }
  $receiptPath = Join-Path $receiptLayout.Staging 'official-auth-receipt.json'
  Write-JsonCreateNew -Path $receiptPath -Value $receipt
  $receiptText = [IO.File]::ReadAllText($receiptPath)
  if ($receiptText -match '(?i)(?:[A-Z]:[\\/]|file:///|\\\\[^\\/\s]+[\\/])') {
    throw 'Whitelisted receipt unexpectedly contained an absolute path.'
  }
  if (Test-Path -LiteralPath $receiptLayout.Root) { throw 'Receipt destination became occupied.' }
  [IO.Directory]::Move($receiptLayout.Staging, $receiptLayout.Root)
  $stagingOwned = $false
  $published = $true
  Write-Host "Official-auth canaries passed. Receipt: $($receiptLayout.Root)"
} finally {
  if ($tempOwned -and (Test-Path -LiteralPath $tempRoot)) {
    Remove-OwnedDirectory -Path $tempRoot -RequiredParent $tempParent
  }
  if ($stagingOwned -and (Test-Path -LiteralPath $receiptLayout.Staging)) {
    Remove-OwnedDirectory -Path $receiptLayout.Staging -RequiredParent $evidenceRoot
  }
  if (-not $published -and (Test-Path -LiteralPath $receiptLayout.Root)) {
    throw 'A failed run must not leave a final receipt directory.'
  }
}
