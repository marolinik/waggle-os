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

  [string]$CodexModel = 'gpt-5.5',

  [ValidateSet('openai-codex')]
  [string]$HermesProvider = 'openai-codex',

  [string]$HermesModel = 'gpt-5.5',

  [switch]$CodexProofValidatorSelfTest,

  [switch]$StaticPreflightOnly,

  [switch]$Execute,

  [string]$PaidRunAck = ''
)

$ErrorActionPreference = 'Stop'
$executionAcknowledgement = 'I_ACKNOWLEDGE_3_OFFICIAL_AUTH_CALLS'
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
$codexAlternativeAuthNames = @(
  'OPENAI_API_KEY',
  'OPENAI_ACCESS_TOKEN',
  'CODEX_ACCESS_TOKEN',
  'OPENAI_BASE_URL',
  'OPENAI_API_BASE'
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

function Assert-JsonBoolean([object]$Value, [bool]$Expected, [string]$Label) {
  if (-not ($Value -is [bool]) -or $Value -ne $Expected) {
    throw "$Label must be the JSON boolean $($Expected.ToString().ToLowerInvariant())."
  }
}

function Assert-JsonInteger([object]$Value, [long]$Expected, [string]$Label) {
  if ((-not ($Value -is [int])) -and (-not ($Value -is [long]))) {
    throw "$Label must be a JSON integer."
  }
  if ([long]$Value -ne $Expected) { throw "$Label must equal $Expected." }
}

function Assert-Sha256([object]$Value, [string]$Label) {
  if (-not ($Value -is [string]) -or [string]$Value -cnotmatch '^[0-9a-f]{64}$') {
    throw "$Label must be a lowercase SHA-256 value."
  }
}

function Assert-CodexToolDenialProof(
  [object]$Proof,
  [string]$ExpectedExecutableSha256,
  [string]$ExpectedHelperSha256,
  [string]$ExpectedHead,
  [string]$ExpectedHiveMindCliSha256,
  [string]$ExpectedMarkerSha256,
  [string]$ExpectedPowerShellSha256,
  [string]$ExpectedSessionIdSha256
) {
  Assert-JsonInteger -Value $Proof.schemaVersion -Expected 1 -Label 'Codex proof schemaVersion'
  if (-not ($Proof.kind -is [string]) -or [string]$Proof.kind -cne 'codex-tool-denial-and-official-auth') {
    throw 'Codex proof kind is invalid.'
  }
  Assert-JsonBoolean -Value $Proof.pass -Expected $true -Label 'Codex proof pass'
  Assert-JsonInteger -Value $Proof.paidCalls -Expected 1 -Label 'Codex proof paidCalls'
  Assert-JsonBoolean -Value $Proof.proof.pass -Expected $true -Label 'Codex proof-only pass'
  Assert-JsonInteger -Value $Proof.proof.paidCalls -Expected 0 -Label 'Codex proof-only paidCalls'

  if (-not ($Proof.source.expectedHead -is [string]) -or [string]$Proof.source.expectedHead -cne $ExpectedHead) {
    throw 'Codex proof expected HEAD did not match the outer harness.'
  }
  if (-not ($Proof.source.observedHead -is [string]) -or [string]$Proof.source.observedHead -cne $ExpectedHead) {
    throw 'Codex proof observed HEAD did not match the outer harness.'
  }
  foreach ($entry in @(
    [pscustomobject]@{ Value = $Proof.source.tree; Label = 'Codex proof source tree' }
    [pscustomobject]@{ Value = $Proof.source.scriptBlob; Label = 'Codex proof helper blob' }
  )) {
    if (-not ($entry.Value -is [string]) -or [string]$entry.Value -cnotmatch '^[0-9a-f]{40}$') {
      throw "$($entry.Label) must be a lowercase 40-character Git object id."
    }
  }
  Assert-JsonBoolean -Value $Proof.source.trackedClean -Expected $true -Label 'Codex proof trackedClean'
  Assert-JsonBoolean -Value $Proof.source.unchanged -Expected $true -Label 'Codex proof source unchanged'

  Assert-Sha256 -Value $Proof.executable.sha256 -Label 'Codex executable hash'
  if ([string]$Proof.executable.sha256 -cne $ExpectedExecutableSha256) {
    throw 'Codex executable did not match tool-denial proof.'
  }
  Assert-JsonBoolean -Value $Proof.executable.unchanged -Expected $true -Label 'Codex executable unchanged'

  foreach ($entry in @(
    [pscustomobject]@{ Value = $Proof.modelCatalog.sealedSha256; Label = 'Codex sealed model catalog hash' }
    [pscustomobject]@{ Value = $Proof.modelCatalog.controlSha256; Label = 'Codex control model catalog hash' }
    [pscustomobject]@{ Value = $Proof.invocation.argumentsSha256; Label = 'Codex invocation arguments hash' }
    [pscustomobject]@{ Value = $Proof.invocation.configSha256; Label = 'Codex invocation config hash' }
    [pscustomobject]@{ Value = $Proof.invocation.threadParamsSha256; Label = 'Codex thread parameters hash' }
    [pscustomobject]@{ Value = $Proof.invocation.turnParamsSha256; Label = 'Codex turn parameters hash' }
    [pscustomobject]@{ Value = $Proof.invocation.mcpServerNamesSha256; Label = 'Codex MCP server-name inventory hash' }
    [pscustomobject]@{ Value = $Proof.hooks.graphSha256; Label = 'Codex hook graph hash' }
    [pscustomobject]@{ Value = $Proof.hooks.denyHookSha256; Label = 'Codex deny-hook hash' }
    [pscustomobject]@{ Value = $Proof.hooks.artifactsSha256; Label = 'Codex packaged hook artifact hash' }
    [pscustomobject]@{ Value = $Proof.hooks.cliSha256; Label = 'Codex hive-mind CLI hash' }
    [pscustomobject]@{ Value = $Proof.green.denialReasonSha256; Label = 'Codex denial reason hash' }
    [pscustomobject]@{ Value = $Proof.paidInvocation.argumentsSha256; Label = 'Codex paid invocation hash' }
    [pscustomobject]@{ Value = $Proof.paidInvocation.modelCatalogSha256; Label = 'Codex paid model catalog hash' }
    [pscustomobject]@{ Value = $Proof.paidInvocation.hookGraphSha256; Label = 'Codex paid hook graph hash' }
    [pscustomobject]@{ Value = $Proof.paidInvocation.markerSha256; Label = 'Codex paid marker hash' }
    [pscustomobject]@{ Value = $Proof.paidInvocation.sessionIdSha256; Label = 'Codex paid session hash' }
    [pscustomobject]@{ Value = $Proof.paidInvocation.threadParamsSha256; Label = 'Codex paid thread parameters hash' }
    [pscustomobject]@{ Value = $Proof.paidInvocation.turnParamsSha256; Label = 'Codex paid turn parameters hash' }
    [pscustomobject]@{ Value = $Proof.mcpBoundary.namesSha256; Label = 'Codex MCP boundary server-name hash' }
    [pscustomobject]@{ Value = $Proof.mcpBoundary.initialSha256; Label = 'Codex initial MCP boundary hash' }
    [pscustomobject]@{ Value = $Proof.mcpBoundary.prePaidSha256; Label = 'Codex pre-paid MCP boundary hash' }
    [pscustomobject]@{ Value = $Proof.mcpBoundary.postPaidSha256; Label = 'Codex post-paid MCP boundary hash' }
    [pscustomobject]@{ Value = $Proof.mcpBoundary.initialConfigSha256; Label = 'Codex initial config hash' }
    [pscustomobject]@{ Value = $Proof.mcpBoundary.prePaidConfigSha256; Label = 'Codex pre-paid config hash' }
    [pscustomobject]@{ Value = $Proof.mcpBoundary.postPaidConfigSha256; Label = 'Codex post-paid config hash' }
    [pscustomobject]@{ Value = $Proof.artifacts.scriptSha256; Label = 'Codex helper script hash' }
    [pscustomobject]@{ Value = $Proof.artifacts.windowsPowerShellSha256; Label = 'Codex Windows PowerShell hash' }
    [pscustomobject]@{ Value = $Proof.artifacts.windowsSystemDirectorySha256; Label = 'Codex Windows system-directory hash' }
  )) {
    Assert-Sha256 -Value $entry.Value -Label ([string]$entry.Label)
  }
  if ((-not ($Proof.invocation.mcpServerCount -is [int])) -and (-not ($Proof.invocation.mcpServerCount -is [long]))) {
    throw 'Codex MCP server count must be a JSON integer.'
  }
  if ([long]$Proof.invocation.mcpServerCount -lt 0) {
    throw 'Codex MCP server count must not be negative.'
  }
  if ((-not ($Proof.mcpBoundary.count -is [int])) -and (-not ($Proof.mcpBoundary.count -is [long]))) {
    throw 'Codex MCP boundary count must be a JSON integer.'
  }
  if ([long]$Proof.mcpBoundary.count -ne [long]$Proof.invocation.mcpServerCount -or
    [string]$Proof.mcpBoundary.namesSha256 -cne [string]$Proof.invocation.mcpServerNamesSha256) {
    throw 'Codex MCP boundary inventory did not match the invocation inventory.'
  }
  if ([string]$Proof.mcpBoundary.prePaidSha256 -cne [string]$Proof.mcpBoundary.initialSha256 -or
    [string]$Proof.mcpBoundary.postPaidSha256 -cne [string]$Proof.mcpBoundary.initialSha256 -or
    [string]$Proof.mcpBoundary.prePaidConfigSha256 -cne [string]$Proof.mcpBoundary.initialConfigSha256 -or
    [string]$Proof.mcpBoundary.postPaidConfigSha256 -cne [string]$Proof.mcpBoundary.initialConfigSha256) {
    throw 'Codex MCP/config boundary changed around the paid turn.'
  }
  Assert-JsonBoolean -Value $Proof.mcpBoundary.unchanged -Expected $true -Label 'Codex MCP boundary unchanged'

  Assert-JsonInteger -Value $Proof.hooks.expectedCount -Expected 5 -Label 'Codex hook expectedCount'
  Assert-JsonInteger -Value $Proof.hooks.extraCount -Expected 0 -Label 'Codex hook extraCount'
  Assert-JsonInteger -Value $Proof.hooks.warnings -Expected 0 -Label 'Codex hook warnings'
  Assert-JsonInteger -Value $Proof.hooks.errors -Expected 0 -Label 'Codex hook errors'
  Assert-JsonBoolean -Value $Proof.hooks.allTrusted -Expected $true -Label 'Codex hooks allTrusted'
  Assert-JsonBoolean -Value $Proof.hooks.unchangedAfterPin -Expected $true -Label 'Codex hooks unchangedAfterPin'
  Assert-JsonBoolean -Value $Proof.hooks.artifactsUnchanged -Expected $true -Label 'Codex hook artifacts unchanged'
  Assert-JsonBoolean -Value $Proof.artifacts.scriptUnchanged -Expected $true -Label 'Codex helper script unchanged'
  if ([string]$Proof.artifacts.scriptSha256 -cne $ExpectedHelperSha256) {
    throw 'Codex tool-denial helper did not match the outer harness artifact.'
  }
  if ([string]$Proof.hooks.cliSha256 -cne $ExpectedHiveMindCliSha256) {
    throw 'Codex hive-mind CLI did not match the packaged artifact.'
  }
  if ([string]$Proof.artifacts.windowsPowerShellSha256 -cne $ExpectedPowerShellSha256) {
    throw 'Codex deny-hook PowerShell did not match the OS executable.'
  }

  Assert-JsonInteger -Value $Proof.sealed.topLevelToolCount -Expected 0 -Label 'Codex sealed topLevelToolCount'
  Assert-JsonInteger -Value $Proof.sealed.additionalToolCount -Expected 0 -Label 'Codex sealed additionalToolCount'
  Assert-JsonBoolean -Value $Proof.sealed.emptySchema -Expected $true -Label 'Codex sealed emptySchema'
  Assert-JsonBoolean -Value $Proof.sealed.normalTextCompleted -Expected $true -Label 'Codex sealed normalTextCompleted'

  $redTools = @($Proof.red.toolNames)
  if ($redTools.Count -ne 1 -or -not ($redTools[0] -is [string]) -or [string]$redTools[0] -cne 'view_image') {
    throw 'Codex RED control did not expose exactly view_image.'
  }
  Assert-JsonBoolean -Value $Proof.red.readObserved -Expected $true -Label 'Codex RED readObserved'
  Assert-JsonBoolean -Value $Proof.red.sensitiveDataObserved -Expected $true -Label 'Codex RED sensitiveDataObserved'
  Assert-JsonBoolean -Value $Proof.green.deniedBeforeRead -Expected $true -Label 'Codex GREEN deniedBeforeRead'
  Assert-JsonBoolean -Value $Proof.green.sensitiveDataObserved -Expected $false -Label 'Codex GREEN sensitiveDataObserved'
  Assert-JsonBoolean -Value $Proof.green.normalTextCompleted -Expected $true -Label 'Codex GREEN normalTextCompleted'

  Assert-JsonBoolean -Value $Proof.paidInvocation.attempted -Expected $true -Label 'Codex paid attempted'
  Assert-JsonBoolean -Value $Proof.paidInvocation.executed -Expected $true -Label 'Codex paid executed'
  Assert-JsonBoolean -Value $Proof.paidInvocation.normalTextCompleted -Expected $true -Label 'Codex paid normalTextCompleted'
  Assert-JsonInteger -Value $Proof.paidInvocation.toolEventsObserved -Expected 0 -Label 'Codex paid toolEventsObserved'
  Assert-JsonInteger -Value $Proof.paidInvocation.unknownEventsObserved -Expected 0 -Label 'Codex paid unknownEventsObserved'
  if ([string]$Proof.paidInvocation.hookGraphSha256 -cne [string]$Proof.hooks.graphSha256) {
    throw 'Codex paid hook graph did not match the pinned proof.'
  }
  if ([string]$Proof.paidInvocation.modelCatalogSha256 -cne [string]$Proof.modelCatalog.sealedSha256) {
    throw 'Codex paid model catalog did not match the sealed proof.'
  }
  if ([string]$Proof.paidInvocation.threadParamsSha256 -cne [string]$Proof.invocation.threadParamsSha256 -or
    [string]$Proof.paidInvocation.turnParamsSha256 -cne [string]$Proof.invocation.turnParamsSha256) {
    throw 'Codex paid turn parameters did not match the sealed proof.'
  }
  if ([string]$Proof.paidInvocation.markerSha256 -cne $ExpectedMarkerSha256) {
    throw 'Codex paid marker hash did not match.'
  }
  if ([string]$Proof.paidInvocation.sessionIdSha256 -cne $ExpectedSessionIdSha256) {
    throw 'Codex paid session identifier hash did not match.'
  }
}

function Invoke-CodexProofValidatorSelfTest {
  $executableHash = 'a' * 64
  $cliHash = 'b' * 64
  $powerShellHash = 'c' * 64
  $markerHash = 'd' * 64
  $sessionHash = 'e' * 64
  $graphHash = 'f' * 64
  $catalogHash = '1' * 64
  $otherHash = '2' * 64
  $helperHash = '3' * 64
  $expectedHead = '0' * 40
  $gitObject = 'a' * 40
  $validValue = [ordered]@{
    schemaVersion = 1
    kind = 'codex-tool-denial-and-official-auth'
    pass = $true
    paidCalls = 1
    proof = [ordered]@{ pass = $true; paidCalls = 0 }
    source = [ordered]@{
      expectedHead = $expectedHead
      observedHead = $expectedHead
      tree = $gitObject
      scriptBlob = $gitObject
      trackedClean = $true
      unchanged = $true
    }
    executable = [ordered]@{ sha256 = $executableHash; unchanged = $true }
    modelCatalog = [ordered]@{ sealedSha256 = $catalogHash; controlSha256 = $otherHash }
    invocation = [ordered]@{
      argumentsSha256 = $otherHash
      configSha256 = $otherHash
      threadParamsSha256 = $otherHash
      turnParamsSha256 = $otherHash
      mcpServerCount = 4
      mcpServerNamesSha256 = $otherHash
    }
    hooks = [ordered]@{
      expectedCount = 5
      extraCount = 0
      warnings = 0
      errors = 0
      allTrusted = $true
      unchangedAfterPin = $true
      artifactsUnchanged = $true
      graphSha256 = $graphHash
      denyHookSha256 = $otherHash
      artifactsSha256 = $otherHash
      cliSha256 = $cliHash
    }
    mcpBoundary = [ordered]@{
      count = 4
      namesSha256 = $otherHash
      initialSha256 = $otherHash
      prePaidSha256 = $otherHash
      postPaidSha256 = $otherHash
      initialConfigSha256 = $otherHash
      prePaidConfigSha256 = $otherHash
      postPaidConfigSha256 = $otherHash
      unchanged = $true
    }
    sealed = [ordered]@{
      topLevelToolCount = 0
      additionalToolCount = 0
      emptySchema = $true
      normalTextCompleted = $true
    }
    red = [ordered]@{
      toolNames = @('view_image')
      readObserved = $true
      sensitiveDataObserved = $true
    }
    green = [ordered]@{
      deniedBeforeRead = $true
      sensitiveDataObserved = $false
      normalTextCompleted = $true
      denialReasonSha256 = $otherHash
    }
    paidInvocation = [ordered]@{
      attempted = $true
      executed = $true
      normalTextCompleted = $true
      toolEventsObserved = 0
      unknownEventsObserved = 0
      argumentsSha256 = $otherHash
      modelCatalogSha256 = $catalogHash
      hookGraphSha256 = $graphHash
      markerSha256 = $markerHash
      sessionIdSha256 = $sessionHash
      threadParamsSha256 = $otherHash
      turnParamsSha256 = $otherHash
    }
    artifacts = [ordered]@{
      scriptSha256 = $helperHash
      scriptUnchanged = $true
      windowsPowerShellSha256 = $powerShellHash
      windowsSystemDirectorySha256 = $otherHash
    }
  }
  $copy = {
    param($Value)
    return ($Value | ConvertTo-Json -Depth 50 | ConvertFrom-Json -Depth 50)
  }
  $validate = {
    param($Value)
    Assert-CodexToolDenialProof -Proof $Value `
      -ExpectedExecutableSha256 $executableHash `
      -ExpectedHelperSha256 $helperHash `
      -ExpectedHead $expectedHead `
      -ExpectedHiveMindCliSha256 $cliHash `
      -ExpectedMarkerSha256 $markerHash `
      -ExpectedPowerShellSha256 $powerShellHash `
      -ExpectedSessionIdSha256 $sessionHash
  }
  $valid = & $copy $validValue
  & $validate $valid
  $cases = 1
  $reject = {
    param($Fixture, [string]$Label)
    $accepted = $true
    try { & $validate $Fixture } catch { $accepted = $false }
    if ($accepted) { throw "Codex proof validator accepted invalid fixture: $Label" }
    $script:codexProofSelfTestCases += 1
  }
  $script:codexProofSelfTestCases = $cases

  $fixture = & $copy $validValue; $fixture.kind = 'wrong'; & $reject $fixture 'kind'
  $fixture = & $copy $validValue; $fixture.schemaVersion = '1'; & $reject $fixture 'string schemaVersion'
  $fixture = & $copy $validValue; $fixture.pass = 1; & $reject $fixture 'numeric pass'
  $fixture = & $copy $validValue; $fixture.paidCalls = '1'; & $reject $fixture 'string paidCalls'
  $fixture = & $copy $validValue; $fixture.invocation.mcpServerCount = '4'; & $reject $fixture 'string MCP server count'
  $fixture = & $copy $validValue; $fixture.invocation.mcpServerNamesSha256 = 'bad'; & $reject $fixture 'MCP server inventory hash'
  $fixture = & $copy $validValue; $fixture.hooks.extraCount = 1; & $reject $fixture 'extra hook'
  $fixture = & $copy $validValue; $fixture.hooks.warnings = 1; & $reject $fixture 'hook warning'
  $fixture = & $copy $validValue; $fixture.hooks.allTrusted = 1; & $reject $fixture 'numeric hook trust'
  $fixture = & $copy $validValue; $fixture.sealed.topLevelToolCount = 1; & $reject $fixture 'non-empty tools'
  $fixture = & $copy $validValue; $fixture.green.sensitiveDataObserved = $true; & $reject $fixture 'GREEN data leak'
  $fixture = & $copy $validValue; $fixture.paidInvocation.toolEventsObserved = 1; & $reject $fixture 'paid tool event'
  $fixture = & $copy $validValue; $fixture.paidInvocation.unknownEventsObserved = 1; & $reject $fixture 'unknown event'
  $fixture = & $copy $validValue; $fixture.executable.sha256 = $otherHash; & $reject $fixture 'executable mismatch'
  $fixture = & $copy $validValue; $fixture.hooks.cliSha256 = $otherHash; & $reject $fixture 'CLI mismatch'
  $fixture = & $copy $validValue; $fixture.artifacts.windowsPowerShellSha256 = $otherHash; & $reject $fixture 'PowerShell mismatch'
  $fixture = & $copy $validValue; $fixture.paidInvocation.modelCatalogSha256 = $otherHash; & $reject $fixture 'catalog mismatch'
  $fixture = & $copy $validValue; $fixture.paidInvocation.hookGraphSha256 = $otherHash; & $reject $fixture 'graph mismatch'
  $fixture = & $copy $validValue; $fixture.paidInvocation.markerSha256 = $otherHash; & $reject $fixture 'marker mismatch'
  $fixture = & $copy $validValue; $fixture.paidInvocation.sessionIdSha256 = $otherHash; & $reject $fixture 'session mismatch'
  $fixture = & $copy $validValue; $fixture.source.expectedHead = 'f' * 40; & $reject $fixture 'source HEAD mismatch'
  $fixture = & $copy $validValue; $fixture.artifacts.scriptSha256 = $otherHash; & $reject $fixture 'helper hash mismatch'
  $fixture = & $copy $validValue; $fixture.hooks.artifactsUnchanged = $false; & $reject $fixture 'hook artifact drift'
  $fixture = & $copy $validValue; $fixture.paidInvocation.threadParamsSha256 = $graphHash; & $reject $fixture 'paid thread mismatch'
  $fixture = & $copy $validValue; $fixture.mcpBoundary.prePaidSha256 = $graphHash; & $reject $fixture 'pre-paid MCP drift'

  return [pscustomobject]@{
    pass = $true
    paidCalls = 0
    cases = $script:codexProofSelfTestCases
  }
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
if ($CodexProofValidatorSelfTest) {
  Invoke-CodexProofValidatorSelfTest | ConvertTo-Json -Compress
  return
}
if ([bool]$StaticPreflightOnly -eq [bool]$Execute) {
  throw 'Choose exactly one mode: -StaticPreflightOnly or -Execute.'
}
if ($Execute -and $PaidRunAck -cne $executionAcknowledgement) {
  throw "-Execute requires -PaidRunAck $executionAcknowledgement."
}
Assert-PlainIdentifier -Value $ClaudeModel -Name 'ClaudeModel'
Assert-PlainIdentifier -Value $CodexModel -Name 'CodexModel'
Assert-PlainIdentifier -Value $HermesProvider -Name 'HermesProvider'
Assert-PlainIdentifier -Value $HermesModel -Name 'HermesModel'

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$receiptLayout = Resolve-ReceiptLayout -RequestedPath $ReceiptDir
$initialGit = Get-GitState -RepositoryRoot $repoRoot
Assert-ExpectedGitState -State $initialGit
$scriptProvenance = Get-ScriptProvenance -RepositoryRoot $repoRoot -ScriptPath $PSCommandPath
$claudeExe = Resolve-Application -Name 'claude'
$codexExe = Resolve-Application -Name 'codex.exe'
$hermesExe = Resolve-Application -Name 'hermes'
$nodeExe = Resolve-Application -Name 'node'
$windowsPowerShell = Join-Path ([Environment]::SystemDirectory) 'WindowsPowerShell\v1.0\powershell.exe'
$null = Get-RegularFileHash -Path $windowsPowerShell -Label 'OS Windows PowerShell'
$scriptSha256 = Get-RegularFileHash -Path $PSCommandPath -Label 'official-auth canary script'
$codexExecutableSha256 = Get-RegularFileHash -Path $codexExe -Label 'Codex executable'
$artifactPaths = [ordered]@{
  claudeInstaller = Join-Path $repoRoot 'packages\hive-mind-hooks-claude-code\dist\bin\claude-code-hooks-cli.js'
  claudeSessionStart = Join-Path $repoRoot 'packages\hive-mind-hooks-claude-code\dist\hooks\session-start.js'
  claudeUserPromptSubmit = Join-Path $repoRoot 'packages\hive-mind-hooks-claude-code\dist\hooks\user-prompt-submit.js'
  claudeStop = Join-Path $repoRoot 'packages\hive-mind-hooks-claude-code\dist\hooks\stop.js'
  codexInstaller = Join-Path $repoRoot 'packages\hive-mind-hooks-codex\dist\bin\codex-hooks.js'
  codexSessionStart = Join-Path $repoRoot 'packages\hive-mind-hooks-codex\dist\hooks\session-start.js'
  codexUserPromptSubmit = Join-Path $repoRoot 'packages\hive-mind-hooks-codex\dist\hooks\user-prompt-submit.js'
  codexStop = Join-Path $repoRoot 'packages\hive-mind-hooks-codex\dist\hooks\stop.js'
  codexPreCompact = Join-Path $repoRoot 'packages\hive-mind-hooks-codex\dist\hooks\pre-compact.js'
  codexToolDenial = Join-Path $repoRoot 'scripts\verify-codex-tool-denial.mjs'
  hiveMindCli = Join-Path $repoRoot 'packages\hive-mind-cli\dist\index.js'
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
$codexHelperProvenance = Get-ScriptProvenance -RepositoryRoot $repoRoot -ScriptPath $artifactPaths.codexToolDenial

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
      codexHelperSha256 = $artifactHashes.codexToolDenial
      codexHelperBlob = $codexHelperProvenance.Blob
    }
    receipt = [ordered]@{ freshAllowedPath = $true; created = $false }
    clients = [ordered]@{
      claudeResolved = $true
      codexResolved = $true
      hermesResolved = $true
      nodeResolved = $true
      claudeExecutableSha256 = Get-RegularFileHash -Path $claudeExe -Label 'Claude executable'
      codexExecutableSha256 = $codexExecutableSha256
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
  $codexWorkspace = Join-Path $tempRoot 'codex-workspace'
  $hermesWorkspace = Join-Path $tempRoot 'hermes-workspace'
  $mindRoot = Join-Path $tempRoot 'mind'
  $processTemp = Join-Path $tempRoot 'process-temp'
  $null = [IO.Directory]::CreateDirectory($claudeWorkspace)
  $null = [IO.Directory]::CreateDirectory($codexWorkspace)
  $null = [IO.Directory]::CreateDirectory($hermesWorkspace)
  $null = [IO.Directory]::CreateDirectory($mindRoot)
  $null = [IO.Directory]::CreateDirectory($processTemp)
  $claudeWorkspaceId = "official-auth-claude-$([guid]::NewGuid().ToString('N'))"
  $codexWorkspaceId = "official-auth-codex-$([guid]::NewGuid().ToString('N'))"
  $hermesWorkspaceId = "official-auth-hermes-$([guid]::NewGuid().ToString('N'))"
  $claudeMindPath = Initialize-IsolatedMindWorkspace -MindRoot $mindRoot -WorkspaceId $claudeWorkspaceId
  $codexMindPath = Initialize-IsolatedMindWorkspace -MindRoot $mindRoot -WorkspaceId $codexWorkspaceId
  $hermesMindPath = Initialize-IsolatedMindWorkspace -MindRoot $mindRoot -WorkspaceId $hermesWorkspaceId
  $commonEnvironment = @{
    HIVE_MIND_DATA_DIR = $mindRoot
    HIVE_MIND_SCOPES = 'memory:read,memory:write'
    HIVE_MIND_SHIM_LOG_LEVEL = 'error'
    WAGGLE_SIGNAL_EMIT = '0'
    NO_COLOR = '1'
    TEMP = $processTemp
    TMP = $processTemp
  }
  $claudeEnvironment = $commonEnvironment.Clone()
  $claudeEnvironment.WAGGLE_WORKSPACE_ID = $claudeWorkspaceId
  $codexEnvironment = $commonEnvironment.Clone()
  $codexEnvironment.WAGGLE_WORKSPACE_ID = $codexWorkspaceId
  $hermesEnvironment = $commonEnvironment.Clone()
  $hermesEnvironment.WAGGLE_WORKSPACE_ID = $hermesWorkspaceId

  $claudeVersionRaw = Invoke-CapturedProcess -FilePath $claudeExe -ArgumentList @('--version') `
    -WorkingDirectory $claudeWorkspace -EnvironmentOverrides $claudeEnvironment `
    -BlankEnvironmentNames $claudeAlternativeAuthNames -TimeoutSeconds 30
  Assert-ProcessPassed -Result $claudeVersionRaw -Label 'Claude version preflight'
  $claudeVersion = ($claudeVersionRaw.Stdout -split '\r?\n' | Where-Object { $_.Trim() } | Select-Object -First 1).Trim()
  if ($claudeVersion -notmatch '^2\.') { throw 'Claude version preflight returned an unexpected version.' }

  $codexVersionRaw = Invoke-CapturedProcess -FilePath $codexExe -ArgumentList @('--version') `
    -WorkingDirectory $codexWorkspace -EnvironmentOverrides $codexEnvironment `
    -BlankEnvironmentNames $codexAlternativeAuthNames -TimeoutSeconds 30
  Assert-ProcessPassed -Result $codexVersionRaw -Label 'Codex version preflight'
  $codexVersion = (($codexVersionRaw.Stdout + "`n" + $codexVersionRaw.Stderr) -split '\r?\n' |
    Where-Object { $_.Trim() } | Select-Object -First 1).Trim()
  if ($codexVersion -notmatch '^codex(?:-cli)?\s') {
    throw 'Codex version preflight returned an unexpected version.'
  }

  $hermesVersionRaw = Invoke-CapturedProcess -FilePath $hermesExe -ArgumentList @('--version') `
    -WorkingDirectory $hermesWorkspace -EnvironmentOverrides $hermesEnvironment `
    -BlankEnvironmentNames $hermesAlternativeAuthNames -TimeoutSeconds 30
  Assert-ProcessPassed -Result $hermesVersionRaw -Label 'Hermes version preflight'
  $hermesVersion = ($hermesVersionRaw.Stdout -split '\r?\n' | Where-Object { $_ -match '^Hermes Agent v' } | Select-Object -First 1).Trim()
  if ([string]::IsNullOrWhiteSpace($hermesVersion)) { throw 'Hermes version preflight returned an unexpected version.' }

  $hookBlankNames = @(
    $claudeAlternativeAuthNames + $codexAlternativeAuthNames + $hermesAlternativeAuthNames |
    Select-Object -Unique
  )
  $claudeHookVerify = Invoke-CapturedProcess -FilePath $nodeExe `
    -ArgumentList @($artifactPaths.claudeInstaller, 'verify') -WorkingDirectory $repoRoot `
    -EnvironmentOverrides $commonEnvironment -BlankEnvironmentNames $hookBlankNames -TimeoutSeconds 60
  Assert-ProcessPassed -Result $claudeHookVerify -Label 'Claude hook verification'
  $claudeHookPasses = [regex]::Matches($claudeHookVerify.Stdout, '(?m)^\s*\[PASS\]').Count
  if ($claudeHookPasses -lt 11 -or $claudeHookVerify.Stdout -notmatch 'All checks passed\.') {
    throw 'Claude hook verification did not satisfy the 11-check contract.'
  }

  $codexHookVerify = Invoke-CapturedProcess -FilePath $nodeExe `
    -ArgumentList @($artifactPaths.codexInstaller, 'verify') -WorkingDirectory $repoRoot `
    -EnvironmentOverrides $commonEnvironment -BlankEnvironmentNames $hookBlankNames -TimeoutSeconds 60
  Assert-ProcessPassed -Result $codexHookVerify -Label 'Codex hook verification'
  $codexHookPasses = [regex]::Matches($codexHookVerify.Stdout, '(?m)^\s*\[PASS\]').Count
  if ($codexHookPasses -lt 9 -or $codexHookVerify.Stdout -notmatch 'All checks passed\.') {
    throw 'Codex hook verification did not satisfy the 9-check contract.'
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

  $codexAuthRaw = Invoke-CapturedProcess -FilePath $codexExe -ArgumentList @('login', 'status') `
    -WorkingDirectory $codexWorkspace -EnvironmentOverrides $codexEnvironment `
    -BlankEnvironmentNames $codexAlternativeAuthNames -TimeoutSeconds 30
  Assert-ProcessPassed -Result $codexAuthRaw -Label 'Codex official-auth preflight'
  $codexAuthText = "$($codexAuthRaw.Stdout)`n$($codexAuthRaw.Stderr)"
  if ($codexAuthText -notmatch '(?m)^\s*Logged in using ChatGPT\s*$') {
    throw 'Codex is not authenticated through the required first-party ChatGPT client session.'
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

  $codexMarker = "WAGGLE_CODEX_OFFICIAL_AUTH_$([Security.Cryptography.RandomNumberGenerator]::GetHexString(24).ToLowerInvariant())"
  $codexProofDir = Join-Path $tempRoot 'codex-tool-denial'
  $codexRaw = Invoke-CapturedProcess -FilePath $nodeExe -ArgumentList @(
    $artifactPaths.codexToolDenial,
    '--codex-exe', $codexExe,
    '--hive-mind-cli', $artifactPaths.hiveMindCli,
    '--receipt-dir', $codexProofDir,
    '--expected-head', $ExpectedHead,
    '--model', $CodexModel,
    '--windows-powershell', $windowsPowerShell,
    '--workspace', $codexWorkspace,
    '--execute-paid',
    '--marker', $codexMarker,
    '--ack', 'I_ACKNOWLEDGE_1_CODEX_OFFICIAL_AUTH_CALL'
  ) -WorkingDirectory $codexWorkspace -EnvironmentOverrides $codexEnvironment `
    -BlankEnvironmentNames $codexAlternativeAuthNames -TimeoutSeconds 300
  Assert-ProcessPassed -Result $codexRaw -Label 'Codex zero-cost tool-denial proof and official-auth canary'
  try { $codexSummary = $codexRaw.Stdout | ConvertFrom-Json -Depth 30 } catch {
    throw 'Codex zero-cost tool-denial proof did not return valid JSON.'
  }
  Assert-JsonBoolean -Value $codexSummary.pass -Expected $true -Label 'Codex summary pass'
  Assert-JsonInteger -Value $codexSummary.paidCalls -Expected 1 -Label 'Codex summary paidCalls'
  Assert-JsonBoolean -Value $codexSummary.markerMatched -Expected $true -Label 'Codex summary markerMatched'
  Assert-Sha256 -Value $codexSummary.reportSha256 -Label 'Codex summary report hash'
  if (-not ($codexSummary.reportPath -is [string])) { throw 'Codex summary reportPath must be a string.' }
  if (-not ($codexSummary.sessionId -is [string])) { throw 'Codex summary sessionId must be a string.' }
  $codexSessionId = [string]$codexSummary.sessionId
  Assert-PlainIdentifier -Value $codexSessionId -Name 'Codex sessionId'
  $expectedCodexReportPath = [IO.Path]::GetFullPath((Join-Path $codexProofDir 'report.json'))
  $codexReportPath = [IO.Path]::GetFullPath([string]$codexSummary.reportPath)
  if ($codexReportPath -cne $expectedCodexReportPath -or
    -not (Test-Path -LiteralPath $codexReportPath -PathType Leaf)) {
    throw 'Codex proof report path was missing or escaped the owned directory.'
  }
  $codexReportSha256 = Get-RegularFileHash -Path $codexReportPath -Label 'Codex tool-denial proof report'
  if ($codexReportSha256 -cne [string]$codexSummary.reportSha256) {
    throw 'Codex proof report hash did not match the process summary.'
  }
  $codexReportBytes = [IO.File]::ReadAllBytes($codexReportPath)
  try { $codexDenialProof = [Text.Encoding]::UTF8.GetString($codexReportBytes) | ConvertFrom-Json -Depth 50 } catch {
    throw 'Codex tool-denial proof report was not valid JSON.'
  }
  Assert-CodexToolDenialProof -Proof $codexDenialProof `
    -ExpectedExecutableSha256 $codexExecutableSha256 `
    -ExpectedHelperSha256 $artifactHashes.codexToolDenial `
    -ExpectedHead $ExpectedHead `
    -ExpectedHiveMindCliSha256 $artifactHashes.hiveMindCli `
    -ExpectedMarkerSha256 (Get-Sha256Text $codexMarker) `
    -ExpectedPowerShellSha256 (Get-RegularFileHash -Path $windowsPowerShell -Label 'OS Windows PowerShell') `
    -ExpectedSessionIdSha256 (Get-Sha256Text $codexSessionId)
  $codexCapture = Get-MarkerCaptureEvidence -NodeExe $nodeExe `
    -BetterSqliteEntry $artifactPaths.betterSqlite3Entry -MindPath $codexMindPath `
    -Marker $codexMarker -Source 'codex' -SessionId $codexSessionId `
    -WorkingDirectory $repoRoot -EnvironmentOverrides $codexEnvironment `
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
  $finalCodexHelperProvenance = Get-ScriptProvenance -RepositoryRoot $repoRoot -ScriptPath $artifactPaths.codexToolDenial
  if ($finalCodexHelperProvenance.Blob -cne $codexHelperProvenance.Blob) {
    throw 'Codex tool-denial helper provenance changed during execution.'
  }
  foreach ($entry in $artifactPaths.GetEnumerator()) {
    $finalArtifactHash = Get-RegularFileHash -Path $entry.Value -Label $entry.Key
    if ($finalArtifactHash -cne [string]$artifactHashes[$entry.Key]) {
      throw "$($entry.Key) changed during official-auth canaries."
    }
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
      codexHelperSha256 = $artifactHashes.codexToolDenial
      codexHelperBlob = $codexHelperProvenance.Blob
    }
    execution = [ordered]@{
      serialLanes = $true
      modelCalls = 3
      authStatusCalls = 3
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
      codexAlternativeEnvironmentNamesBlanked = @($codexAlternativeAuthNames)
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
      codex = [ordered]@{
        version = $codexVersion
        executableSha256 = $codexExecutableSha256
        auth = [ordered]@{
          loggedIn = $true
          method = 'chatgpt'
          stdoutBytes = $codexAuthRaw.StdoutBytes
          stdoutSha256 = $codexAuthRaw.StdoutSha256
          stderrBytes = $codexAuthRaw.StderrBytes
          stderrSha256 = $codexAuthRaw.StderrSha256
        }
        model = $CodexModel
        exitCode = $codexRaw.ExitCode
        durationMs = $codexRaw.DurationMs
        markerSha256 = Get-Sha256Text $codexMarker
        markerMatched = $true
        sessionIdSha256 = Get-Sha256Text $codexSessionId
        containment = [ordered]@{
          oneShot = $true
          timeoutSeconds = 300
          exactMarkerRequired = $true
          harnessProcessInvocationsRequired = 1
          paidModelCallsRequired = 1
          usageReceiptRequired = $false
          preCallCostCapAvailable = $false
          emptyToolSchemaRequired = $true
          wildcardPreToolUseBackstopRequired = $true
          threadEnvironmentsEmpty = $true
          turnEnvironmentsEmpty = $true
          dynamicToolsEmpty = $true
          selectedCapabilityRootsEmpty = $true
        }
        toolDenialProof = [ordered]@{
          schemaVersion = [int]$codexDenialProof.schemaVersion
          proofPaidCalls = [int]$codexDenialProof.proof.paidCalls
          reportSha256 = $codexReportSha256
          executableSha256 = [string]$codexDenialProof.executable.sha256
          modelCatalogSha256 = [string]$codexDenialProof.paidInvocation.modelCatalogSha256
          invocationArgumentsSha256 = [string]$codexDenialProof.invocation.argumentsSha256
          configSha256 = [string]$codexDenialProof.invocation.configSha256
          threadParamsSha256 = [string]$codexDenialProof.invocation.threadParamsSha256
          turnParamsSha256 = [string]$codexDenialProof.invocation.turnParamsSha256
          paidThreadParamsSha256 = [string]$codexDenialProof.paidInvocation.threadParamsSha256
          paidTurnParamsSha256 = [string]$codexDenialProof.paidInvocation.turnParamsSha256
          mcpServerCount = [int]$codexDenialProof.invocation.mcpServerCount
          mcpServerNamesSha256 = [string]$codexDenialProof.invocation.mcpServerNamesSha256
          mcpBoundarySha256 = [string]$codexDenialProof.mcpBoundary.postPaidSha256
          mcpConfigSha256 = [string]$codexDenialProof.mcpBoundary.postPaidConfigSha256
          hookGraphSha256 = [string]$codexDenialProof.hooks.graphSha256
          denyHookSha256 = [string]$codexDenialProof.hooks.denyHookSha256
          packagedHookArtifactsSha256 = [string]$codexDenialProof.hooks.artifactsSha256
          hiveMindCliSha256 = [string]$codexDenialProof.hooks.cliSha256
          windowsPowerShellSha256 = [string]$codexDenialProof.artifacts.windowsPowerShellSha256
          windowsSystemDirectorySha256 = [string]$codexDenialProof.artifacts.windowsSystemDirectorySha256
          exactHookCount = [int]$codexDenialProof.hooks.expectedCount
          extraHookCount = [int]$codexDenialProof.hooks.extraCount
          allHooksTrusted = [bool]$codexDenialProof.hooks.allTrusted
          hookGraphUnchanged = [bool]$codexDenialProof.hooks.unchangedAfterPin
          packagedArtifactsUnchanged = [bool]$codexDenialProof.hooks.artifactsUnchanged
          helperScriptSha256 = [string]$codexDenialProof.artifacts.scriptSha256
          helperScriptBlob = [string]$codexDenialProof.source.scriptBlob
          helperScriptUnchanged = [bool]$codexDenialProof.artifacts.scriptUnchanged
          emptySchema = [bool]$codexDenialProof.sealed.emptySchema
          guardedToolDeniedBeforeExecution = [bool]$codexDenialProof.green.deniedBeforeRead
          sensitiveDataObservedAfterDenial = [bool]$codexDenialProof.green.sensitiveDataObserved
          normalTextSucceeded = [bool]$codexDenialProof.green.normalTextCompleted
          toolEventsObserved = [int]$codexDenialProof.paidInvocation.toolEventsObserved
          unknownEventsObserved = [int]$codexDenialProof.paidInvocation.unknownEventsObserved
        }
        capture = [ordered]@{
          markerFrames = $codexCapture.MarkerFrames
          promptFrames = $codexCapture.PromptFrames
          responseFrames = $codexCapture.ResponseFrames
          promptContentSha256 = $codexCapture.PromptContentSha256
          responseContentSha256 = $codexCapture.ResponseContentSha256
          mindSha256 = $codexCapture.MindSha256
        }
        stdoutBytes = $codexRaw.StdoutBytes
        stdoutSha256 = $codexRaw.StdoutSha256
        stderrBytes = $codexRaw.StderrBytes
        stderrSha256 = $codexRaw.StderrSha256
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
      codex = [ordered]@{
        passedChecks = $codexHookPasses
        minimumChecks = 9
        stdoutSha256 = $codexHookVerify.StdoutSha256
        stderrSha256 = $codexHookVerify.StderrSha256
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
