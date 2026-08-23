#Requires -Version 7.0

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$wrapperPath = Join-Path $PSScriptRoot 'sign-windows-artifact.ps1'
. $wrapperPath -ArtifactPath 'C:\unused.exe'

$passed = 0

function Assert-Equal {
  param($Actual, $Expected, [string]$Label)
  if ($Actual -cne $Expected) { throw "$Label expected '$Expected', got '$Actual'." }
  $script:passed++
}

function Assert-Throws {
  param([scriptblock]$Action, [string]$Pattern, [string]$Label)
  try {
    & $Action
  } catch {
    if ($_.Exception.Message -notmatch $Pattern) {
      throw "$Label threw the wrong error: $($_.Exception.Message)"
    }
    $script:passed++
    return
  }
  throw "$Label did not throw."
}

function Write-JsonNoBom {
  param([string]$Path, [object]$Value)
  [IO.File]::WriteAllText(
    $Path,
    ($Value | ConvertTo-Json -Depth 32 -Compress),
    [Text.UTF8Encoding]::new($false)
  )
}

function New-SyntheticPe {
  param([string]$Path, [byte]$Marker = 0)
  [IO.Directory]::CreateDirectory((Split-Path $Path -Parent)) | Out-Null
  $bytes = [byte[]]::new(128)
  $bytes[0] = 0x4D
  $bytes[1] = 0x5A
  [BitConverter]::GetBytes([uint32]0x40).CopyTo($bytes, 0x3C)
  $bytes[0x40] = 0x50
  $bytes[0x41] = 0x45
  $bytes[0x42] = 0
  $bytes[0x43] = 0
  $bytes[127] = $Marker
  [IO.File]::WriteAllBytes($Path, $bytes)
}

function New-SyntheticPatchablePe {
  param([string]$Path)
  [IO.Directory]::CreateDirectory((Split-Path $Path -Parent)) | Out-Null
  $bytes = [byte[]]::new(256)
  $bytes[0] = 0x4D
  $bytes[1] = 0x5A
  [BitConverter]::GetBytes([uint32]0x40).CopyTo($bytes, 0x3C)
  $bytes[0x40] = 0x50
  $bytes[0x41] = 0x45
  $token = [Text.Encoding]::ASCII.GetBytes('__TAURI_BUNDLE_TYPE_VAR_UNK')
  [Array]::Copy($token, 0, $bytes, 160, $token.Length)
  [IO.File]::WriteAllBytes($Path, $bytes)
}

function Get-Sha256 {
  param([string]$Path)
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
}

function Get-RealSha256 {
  param([string]$Path)
  $stream = [IO.File]::Open(
    $Path,
    [IO.FileMode]::Open,
    [IO.FileAccess]::Read,
    [IO.FileShare]::Read
  )
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try {
    return ([BitConverter]::ToString($algorithm.ComputeHash($stream)) -replace '-', '')
  } finally {
    $algorithm.Dispose()
    $stream.Dispose()
  }
}

function New-PendingLedger {
  param([string]$SessionId, [string]$ManifestSha256, [object[]]$Slots)
  return [pscustomobject][ordered]@{
    schemaVersion = 3
    sessionId = $SessionId
    manifestSha256 = $ManifestSha256
    state = 'open'
    terminalAtUtc = $null
    terminalReceiptSha256 = $null
    entries = @($Slots | ForEach-Object {
      [pscustomobject][ordered]@{
        slotId = [string]$_.id
        order = [int]$_.order
        kind = [string]$_.kind
        status = 'pending'
        attempts = 0
        reservationId = $null
        path = $null
        preSignSha256 = $null
        reservedAtUtc = $null
        completedAtUtc = $null
        postSignSha256 = $null
        signerSubject = $null
      }
    })
  }
}

function Close-PrebuiltTreeLease {
  param([AllowNull()] [object]$Lease)
  if ($null -eq $Lease) { return }
  $locksProperty = $Lease.PSObject.Properties['Locks']
  $locks = if ($null -eq $locksProperty) { @($Lease) } else { @($locksProperty.Value) }
  foreach ($lock in $locks) {
    if ($null -ne $lock) { $lock.Dispose() }
  }
}

function Assert-FreshProcessModuleIsolation {
  param(
    [Parameter(Mandatory = $true)] [string]$HostPath,
    [Parameter(Mandatory = $true)] [string]$Label,
    [Parameter(Mandatory = $true)] [string]$Root
  )

  $hostRoot = Join-Path $Root ([IO.Path]::GetFileNameWithoutExtension($HostPath))
  $hostileModuleRoot = Join-Path $hostRoot 'hostile-modules'
  $markerPath = Join-Path $hostRoot 'hostile-module-loaded.txt'
  $childPath = Join-Path $hostRoot 'module-isolation-child.ps1'
  [IO.Directory]::CreateDirectory($hostileModuleRoot) | Out-Null
  foreach ($moduleName in @(
      'Microsoft.PowerShell.Security',
      'Microsoft.PowerShell.Management',
      'Microsoft.PowerShell.Utility'
    )) {
    $moduleRoot = Join-Path $hostileModuleRoot $moduleName
    [IO.Directory]::CreateDirectory($moduleRoot) | Out-Null
    $modulePath = Join-Path $moduleRoot "$moduleName.psm1"
    $manifestPath = Join-Path $moduleRoot "$moduleName.psd1"
    [IO.File]::WriteAllText(
      $modulePath,
      "[IO.File]::AppendAllText('$($markerPath.Replace("'", "''"))', '$moduleName')`n" +
      "function Get-AuthenticodeSignature { throw 'hostile command' }`n" +
      "function Get-Acl { throw 'hostile command' }`n" +
      "function Set-Acl { throw 'hostile command' }`n" +
      "function Get-FileHash { throw 'hostile command' }`n" +
      'Export-ModuleMember -Function *',
      [Text.UTF8Encoding]::new($false)
    )
    New-ModuleManifest -Path $manifestPath -RootModule "$moduleName.psm1" `
      -ModuleVersion '99.0.0' -FunctionsToExport '*' | Out-Null
  }
  $childSource = @'
param([string]$WrapperPath, [string]$HostileModuleRoot, [string]$MarkerPath)
$ErrorActionPreference = 'Stop'
[Environment]::SetEnvironmentVariable('PSModulePath', $HostileModuleRoot, 'Process')
$global:PSModuleAutoLoadingPreference = 'All'
. $WrapperPath -ArtifactPath 'C:\unused.exe'
$trustedRoot = [IO.Path]::GetFullPath([IO.Path]::Combine($PSHOME, 'Modules'))
$expected = @{
  'Get-AuthenticodeSignature' = 'Microsoft.PowerShell.Security'
  'Get-Acl' = 'Microsoft.PowerShell.Security'
  'Set-Acl' = 'Microsoft.PowerShell.Security'
}
if ($PSVersionTable.PSEdition -ceq 'Core') {
  $expected['Get-FileHash'] = 'Microsoft.PowerShell.Utility'
}
foreach ($entry in $expected.GetEnumerator()) {
  $command = Get-Command $entry.Key -CommandType Cmdlet -ErrorAction Stop
  $expectedPath = [IO.Path]::Combine($trustedRoot, $entry.Value, "$($entry.Value).psd1")
  if (-not [string]::Equals(
      [IO.Path]::GetFullPath([string]$command.Module.Path),
      [IO.Path]::GetFullPath($expectedPath),
      [StringComparison]::OrdinalIgnoreCase
    )) {
    throw "Command '$($entry.Key)' resolved outside the trusted module root."
  }
}
if ([IO.File]::Exists($MarkerPath)) { throw 'A hostile PowerShell module was loaded.' }
'module-isolation-ok'
'@
  [IO.File]::WriteAllText($childPath, $childSource, [Text.UTF8Encoding]::new($false))
  $output = & $HostPath -NoLogo -NoProfile -NonInteractive `
    -ExecutionPolicy Bypass -File $childPath `
    -WrapperPath $wrapperPath -HostileModuleRoot $hostileModuleRoot `
    -MarkerPath $markerPath 2>&1
  if ($LASTEXITCODE -ne 0 -or @($output | Where-Object { $_ -ceq 'module-isolation-ok' }).Count -ne 1) {
    throw "$Label hostile PSModulePath isolation failed: $($output -join ' | ')"
  }
  if (Test-Path -LiteralPath $markerPath) {
    throw "$Label imported a hostile PowerShell module."
  }
  $script:passed++
}

function Start-SynchronizedChild {
  param(
    [Parameter(Mandatory = $true)] [string]$PowerShellPath,
    [Parameter(Mandatory = $true)] [string]$ScriptPath,
    [Parameter(Mandatory = $true)] [hashtable]$Arguments
  )
  $argumentList = [Collections.Generic.List[string]]::new()
  foreach ($argument in @(
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', ('"' + $ScriptPath + '"')
    )) {
    $argumentList.Add($argument)
  }
  foreach ($entry in $Arguments.GetEnumerator()) {
    $argumentList.Add("-$($entry.Key)")
    $argumentList.Add('"' + ([string]$entry.Value).Replace('"', '\"') + '"')
  }
  return Start-Process -FilePath $PowerShellPath -ArgumentList @($argumentList) `
    -WindowStyle Hidden -PassThru
}

function Wait-ForChildBarriers {
  param([string[]]$Paths, [string]$Label)
  $deadline = [DateTimeOffset]::UtcNow.AddSeconds(30)
  while (@($Paths | Where-Object { -not (Test-Path -LiteralPath $_ -PathType Leaf) }).Count -ne 0) {
    if ([DateTimeOffset]::UtcNow -gt $deadline) {
      throw "Timed out waiting for $Label child barriers."
    }
    Start-Sleep -Milliseconds 20
  }
}

$releaseRoot = 'D:\repo\app\src-tauri\target\x86_64-pc-windows-msvc\release'
$resourcesRoot = 'D:\repo\app\src-tauri\resources'
$tempRoot = 'D:\repo\app\src-tauri\target\.signing-temp\run-123456'
$version = '0.2.0'

$installedTauriRoot = Join-Path `
  (Split-Path $PSScriptRoot -Parent) 'node_modules\@tauri-apps\cli'
$installedNativeRoot = Join-Path `
  (Split-Path $PSScriptRoot -Parent) 'node_modules\@tauri-apps\cli-win32-x64-msvc'
foreach ($binding in @(
    @((Join-Path $installedTauriRoot 'tauri.js'), $TauriCliSha256, 'installed Tauri entry'),
    @((Join-Path $installedTauriRoot 'main.js'), $TauriCliMainSha256, 'installed Tauri main'),
    @((Join-Path $installedTauriRoot 'index.js'), $TauriCliIndexSha256, 'installed Tauri loader'),
    @((Join-Path $installedNativeRoot 'package.json'), $TauriNativePackageSha256, 'installed Tauri native package'),
    @((Join-Path $installedNativeRoot 'cli.win32-x64-msvc.node'), $TauriNativeBinarySha256, 'installed Tauri native binary')
  )) {
  Assert-Equal (Get-Sha256 $binding[0]) $binding[1] $binding[2]
}
$wrapperSource = Get-Content -Raw -LiteralPath $wrapperPath
if ($wrapperSource -match "ValidateSet\('Callback',\s*'Build'\)" -or
    $wrapperSource -match 'function\s+Invoke-WaggleSigningBuild' -or
    $wrapperSource -match 'function\s+Assert-WaggleSigningBuildComplete' -or
    $wrapperSource -match "Mode\s+-ceq\s+'Build'") {
  throw 'Production Artifact Signing still exposes the rejected local Build issuer.'
}
if ($wrapperSource -notmatch "ValidateSet\('Callback',\s*'Package'\)" -or
    $wrapperSource -notmatch 'function\s+Invoke-WaggleSigningPackage' -or
    $wrapperSource -notmatch 'function\s+Assert-WaggleSigningPackageComplete') {
  throw 'Production Artifact Signing lacks the hosted-only Package issuer.'
}
foreach ($portableParameter in @(
    'PortableToolchainRoot', 'PortableNodePath',
    'PortableGitPath', 'PortableSevenZipPath'
  )) {
  if ($wrapperSource -notmatch "\[string\]\`$$portableParameter") {
    throw "Hosted Package mode lacks the explicit $portableParameter input."
  }
  $passed++
}
$portableEnvironmentNames = @(
  'WAGGLE_SIGNING_PORTABLE_TOOLCHAIN_ROOT',
  'WAGGLE_SIGNING_PORTABLE_NODE_PATH',
  'WAGGLE_SIGNING_PORTABLE_GIT_PATH',
  'WAGGLE_SIGNING_PORTABLE_SEVEN_ZIP_PATH'
)
foreach ($portableEnvironmentName in $portableEnvironmentNames) {
  if ($wrapperSource -notmatch [Regex]::Escape($portableEnvironmentName)) {
    throw "Signing callbacks do not receive $portableEnvironmentName."
  }
  $passed++
}
if ($wrapperSource -notmatch 'function\s+Get-WagglePortableToolchain' -or
    $wrapperSource -notmatch 'portableToolchainRoot' -or
    $wrapperSource -notmatch 'sevenZipDllPath' -or
    $wrapperSource -notmatch 'sevenZipDllSha256') {
  throw 'Portable signing tools are not path-, manifest-, and closure-bound.'
}
$passed++
if ($wrapperSource -notmatch [Regex]::Escape(
      'CN=.NET, O=Microsoft Corporation, L=Redmond, S=Washington, C=US'
    ) -or
    $wrapperSource -notmatch
      'Assert-MicrosoftAuthenticodeFile\s+\$dotnet\s+''\.NET host''\s+\$null\s+\$DotNetPublisher') {
  throw '.NET 8 validation is not bound to the exact repository-pinned .NET signer.'
}
$passed++
if ($wrapperSource -notmatch 'Restore-WaggleReplacedArtifact\s+`?\s*-ArtifactPath') {
  throw 'Production signing callback does not use the verified rollback path.'
}
$passed++
foreach ($hostBoundaryName in @(
    'GITHUB_ACTIONS', 'GITHUB_EVENT_NAME', 'RUNNER_ENVIRONMENT',
    'GITHUB_REPOSITORY', 'GITHUB_SHA', 'GITHUB_REF',
    'GITHUB_REF_TYPE', 'GITHUB_REF_NAME', 'GITHUB_WORKFLOW_REF',
    'GITHUB_WORKFLOW_SHA'
  )) {
  if ($wrapperSource -notmatch [Regex]::Escape($hostBoundaryName)) {
    throw "Hosted Package mode does not bind $hostBoundaryName."
  }
  $passed++
}
foreach ($hostBoundaryPattern in @(
    "GITHUB_EVENT_NAME\s*=\s*'push'",
    'GITHUB_REF\s*=\s*\$expectedRef',
    'GITHUB_WORKFLOW_REF\s*=\s*\$expectedWorkflowRef',
    'GITHUB_WORKFLOW_SHA\s*=\s*\$ExpectedRevision'
  )) {
  if ($wrapperSource -notmatch $hostBoundaryPattern) {
    throw "Hosted Package mode lacks exact boundary binding: $hostBoundaryPattern"
  }
  $passed++
}
$validBoundaryRevision = '0123456789abcdef0123456789abcdef01234567'
$validBoundaryVersion = '0.2.0'
$validHostedBoundary = [ordered]@{
  GITHUB_ACTIONS = 'true'
  GITHUB_EVENT_NAME = 'push'
  RUNNER_ENVIRONMENT = 'github-hosted'
  GITHUB_REPOSITORY = 'marolinik/waggle-os'
  GITHUB_SHA = $validBoundaryRevision
  GITHUB_REF = 'refs/tags/v0.2.0'
  GITHUB_REF_TYPE = 'tag'
  GITHUB_REF_NAME = 'v0.2.0'
  GITHUB_WORKFLOW_REF = 'marolinik/waggle-os/.github/workflows/release.yml@refs/tags/v0.2.0'
  GITHUB_WORKFLOW_SHA = $validBoundaryRevision
}
$savedHostedBoundary = @{}
foreach ($name in $validHostedBoundary.Keys) {
  $savedHostedBoundary[$name] = [Environment]::GetEnvironmentVariable($name)
}
try {
  foreach ($name in $validHostedBoundary.Keys) {
    [Environment]::SetEnvironmentVariable($name, $validHostedBoundary[$name])
  }
  Assert-WaggleHostedSigningBoundary `
    -ExpectedRevision $validBoundaryRevision `
    -ExpectedVersion $validBoundaryVersion
  $passed++
  foreach ($name in $validHostedBoundary.Keys) {
    [Environment]::SetEnvironmentVariable($name, "invalid-$name")
    Assert-Throws {
      Assert-WaggleHostedSigningBoundary `
        -ExpectedRevision $validBoundaryRevision `
        -ExpectedVersion $validBoundaryVersion
    } "exact $([Regex]::Escape($name)) boundary evidence" `
      "hosted signing rejects mutated $name"
    [Environment]::SetEnvironmentVariable($name, $validHostedBoundary[$name])
  }
} finally {
  foreach ($name in $validHostedBoundary.Keys) {
    [Environment]::SetEnvironmentVariable($name, $savedHostedBoundary[$name])
  }
}
$wrapperTokens = $null
$wrapperParseErrors = $null
$wrapperAst = [Management.Automation.Language.Parser]::ParseFile(
  $wrapperPath, [ref]$wrapperTokens, [ref]$wrapperParseErrors
)
if (@($wrapperParseErrors).Count -ne 0) {
  throw "Signing wrapper does not parse: $($wrapperParseErrors[0].Message)"
}
$packageFunctions = @($wrapperAst.FindAll({
  param($node)
  $node -is [Management.Automation.Language.FunctionDefinitionAst] -and
    $node.Name -ceq 'Invoke-WaggleSigningPackage'
}, $true))
if ($packageFunctions.Count -ne 1 -or
    $packageFunctions[0].Extent.Text -match
      'BuildScriptPaths|ViteCliPath|bundleNode|buildSidecar|bundleNativeDeps|stageSidecarDeps|tauri:build') {
  throw 'Hosted Package mode still contains the rejected local source-build closure.'
}
$passed++
$packageSource = $packageFunctions[0].Extent.Text
if ([regex]::Matches($packageSource, 'New-WagglePrebuiltWorkCopy').Count -ne 2 -or
    [regex]::Matches($packageSource, 'Clear-WaggleRegeneratedRoots').Count -ne 2 -or
    $packageSource -notmatch "SetEnvironmentVariable\('CARGO_TARGET_DIR',\s*\`$unsignedWorkRoot\)" -or
    $packageSource -notmatch "SetEnvironmentVariable\('CARGO_TARGET_DIR',\s*\`$signingWorkRoot\)" -or
    $packageSource -match "SetEnvironmentVariable\('CARGO_TARGET_DIR',\s*\`$(?:unsigned|signing)SourceRoot\)" -or
    $packageSource -notmatch '(?s)New-WaggleSigningManifest.*?\$preflightEvidenceRoot.*?\$receipt' -or
    $packageSource -notmatch '(?s)Unsigned hosted prebuilt input.*?Remove-Item\s+-LiteralPath\s+\$unsignedWorkRoot.*?Signing hosted prebuilt input' -or
    $packageSource -notmatch '(?s)Unsigned private work tree.*?Clear-WaggleRegeneratedRoots.*?Unsigned immutable NSIS preflight package' -or
    $packageSource -notmatch '(?s)Signing private work tree.*?Clear-WaggleRegeneratedRoots.*?Signed NSIS bundle' -or
    [regex]::Matches($packageSource, 'Assert-WaggleHostedDiskCapacity').Count -ne 2) {
  throw 'Hosted Package mode does not isolate immutable receipt inputs in private work copies.'
}
$passed++
if ($packageSource -notmatch '(?s)Open-ReadLock\s+\$overridePath.*?Unsigned immutable NSIS preflight package' -or
    $wrapperSource -notmatch '(?s)function\s+Open-WagglePackageToolchainLocks.*?app/src-tauri/icons/icon\.ico.*?status\s+--porcelain=v1.*?Assert-WaggleHostedSigningBoundary') {
  throw 'Hosted Package mode does not lock exact-HEAD packaging inputs and its unsigned override.'
}
$passed++
if ($wrapperSource -notmatch "(?s)if\s*\(\`$replaced\)\s*\{.*?Rollback backup is missing") {
  throw 'Signing callback does not report a missing required rollback backup as a rollback failure.'
}
$passed++
if ($wrapperSource -notmatch "PSModuleAutoLoadingPreference\s*=\s*'None'" -or
    $wrapperSource -notmatch "SetEnvironmentVariable\(\s*'PSModulePath'") {
  throw 'Production Artifact Signing does not harden PowerShell module resolution before trust checks.'
}
$passed++
if ($wrapperSource -match 'NpmCliPath\s+run|npm\s+run\s+tauri:build') {
  throw 'Production signing build still invokes the PATH-dependent npm build script.'
}
$passed++
foreach ($environmentName in @(
    'NODE_OPTIONS', 'NODE_PATH', 'NAPI_RS_NATIVE_LIBRARY_PATH',
    'NAPI_RS_FORCE_WASI', 'npm_config_node_options'
  )) {
  if ($wrapperSource -notmatch "SetEnvironmentVariable\('$environmentName', \`$null\)") {
    throw "Production signing build does not sanitize $environmentName."
  }
  $passed++
}
if ($packageSource -notmatch '(?s)foreach\s*\(\$name\s+in\s+\$environmentNames\).*?\$savedEnvironment\[\$name\].*?finally\s*\{.*?SetEnvironmentVariable\(\$name,\s*\$savedEnvironment\[\$name\]\)' -or
    $wrapperSource -notmatch "@\('-PortableToolchainRoot',\s*\`$ToolchainRoot\)" -or
    $wrapperSource -notmatch "@\('-PortableNodePath',\s*\`$Node\)" -or
    $wrapperSource -notmatch "@\('-PortableGitPath',\s*\`$Git\)" -or
    $wrapperSource -notmatch "@\('-PortableSevenZipPath',\s*\`$SevenZip\)") {
  throw 'Portable toolchain inputs are not forwarded and transactionally restored.'
}
$passed++

& {
  $handoffPath = Join-Path $PSScriptRoot 'new-windows-signing-handoff.ps1'
  . $handoffPath -SourceTargetRoot 'C:\unused' -DestinationRoot 'C:\unused'

  Assert-Equal $MaxTargetFileCount 18000 'handoff target file-count production bound'
  Assert-Equal $MaxTargetBytes ([long]768MB) 'handoff target byte production bound'
  Assert-Equal $MaxResourceFileCount 17500 'handoff resource file-count production bound'
  Assert-Equal $MaxResourceBytes ([long]600MB) 'handoff resource byte production bound'

  $handoffFixtureRoot = Join-Path `
    ([IO.Path]::GetTempPath()) `
    "waggle-handoff-test-$([Guid]::NewGuid().ToString('N'))"
  [IO.Directory]::CreateDirectory($handoffFixtureRoot) | Out-Null
  $handoffReparsePath = $null
  try {
    $sourceRoot = Join-Path $handoffFixtureRoot 'source'
    $sourceDependency = Join-Path $sourceRoot 'release\deps\waggle.exe'
    $sourceMain = Join-Path $sourceRoot 'release\waggle.exe'
    $sourceResource = Join-Path $sourceRoot 'resources\service.js'
    $sourceResourceTwo = Join-Path $sourceRoot 'resources\model.json'
    $sourceNsis = Join-Path $sourceRoot 'nsis\makensis.exe'
    $sourceNsisDll = Join-Path $sourceRoot 'nsis\plugin.dll'
    [IO.Directory]::CreateDirectory((Split-Path $sourceDependency -Parent)) | Out-Null
    [IO.Directory]::CreateDirectory((Split-Path $sourceResource -Parent)) | Out-Null
    [IO.Directory]::CreateDirectory((Split-Path $sourceNsis -Parent)) | Out-Null
    New-SyntheticPe $sourceDependency 211
    New-Item -ItemType HardLink -Path $sourceMain -Target $sourceDependency | Out-Null
    [IO.File]::WriteAllText($sourceResource, 'receipt-bound-service')
    [IO.File]::WriteAllText($sourceResourceTwo, '{"model":"fixture"}')
    [IO.File]::WriteAllText($sourceNsis, 'fixture-makensis')
    [IO.File]::WriteAllText($sourceNsisDll, 'fixture-plugin')

    $targetMappings = @(
      [pscustomobject]@{
        Source = $sourceMain
        Path = "$TargetTriple\release\waggle.exe"
      },
      [pscustomobject]@{
        Source = $sourceDependency
        Path = "$TargetTriple\release\deps\waggle.exe"
      },
      [pscustomobject]@{ Source = $sourceResource; Path = 'resources\service.js' },
      [pscustomobject]@{ Source = $sourceResourceTwo; Path = 'resources\model.json' }
    )
    $resourceMappings = @(
      [pscustomobject]@{ Source = $sourceResource; Path = 'service.js' },
      [pscustomobject]@{ Source = $sourceResourceTwo; Path = 'model.json' }
    )
    $nsisMappings = @(
      [pscustomobject]@{ Source = $sourceNsis; Path = 'makensis.exe' },
      [pscustomobject]@{ Source = $sourceNsisDll; Path = 'plugins\plugin.dll' }
    )
    $expectedTarget = New-HandoffInventory $targetMappings 'Fixture target'
    $expectedResources = New-HandoffInventory $resourceMappings 'Fixture resources'
    $expectedNsis = New-HandoffInventory $nsisMappings 'Fixture NSIS'
    $sourceRevision = 'a' * 40
    $checkerSha256 = 'B' * 64
    $transactionArguments = @{
      DestinationParentRoot = $handoffFixtureRoot
      TargetMappings = $targetMappings
      ResourceMappings = $resourceMappings
      NsisMappings = $nsisMappings
      ExpectedTargetInventory = $expectedTarget
      ExpectedResourcesInventory = $expectedResources
      ExpectedNsisInventory = $expectedNsis
      SourceRevision = $sourceRevision
      CheckerSha256 = $checkerSha256
      TargetFileCountLimit = 8
      TargetByteLimit = 1MB
      ResourceFileCountLimit = 4
      ResourceByteLimit = 1MB
      NsisFileCountLimit = 4
      NsisByteLimit = 1MB
    }

    $acceptedDestination = Join-Path $handoffFixtureRoot 'accepted'
    $accepted = Invoke-HandoffDestinationTransaction `
      -DestinationRoot $acceptedDestination @transactionArguments
    Assert-Equal `
      (Test-Path -LiteralPath $accepted.ReceiptPath -PathType Leaf) $true `
      'handoff transaction publishes a receipt'
    Assert-Equal `
      (Get-HandoffFileSha256 $accepted.ReceiptPath) $accepted.ReceiptSha256 `
      'handoff receipt digest binds exact bytes'
    $acceptedReceipt = Get-Content -Raw -LiteralPath $accepted.ReceiptPath |
      ConvertFrom-Json -Depth 32 -DateKind String
    Assert-Equal $acceptedReceipt.schemaVersion 1 'handoff receipt schema'
    Assert-Equal $acceptedReceipt.repository $ApprovedRepository 'handoff receipt repository'
    Assert-Equal $acceptedReceipt.sourceRevision $sourceRevision `
      'handoff receipt source revision'
    Assert-Equal $acceptedReceipt.targetInventory.sha256 $expectedTarget.sha256 `
      'handoff receipt target inventory'
    Assert-Equal $acceptedReceipt.resourcesInventory.sha256 $expectedResources.sha256 `
      'handoff receipt resource inventory'
    Assert-Equal $acceptedReceipt.nsisInventory.sha256 $expectedNsis.sha256 `
      'handoff receipt NSIS inventory'
    $acceptedRelease = Join-Path `
      $accepted.PrebuiltRoot "$TargetTriple\release"
    Assert-HandoffCargoPair $acceptedRelease 'Accepted staged Cargo output'
    $passed++

    foreach ($boundProbe in @(
        [pscustomobject]@{ Name = 'target-count'; Overrides = @{ TargetFileCountLimit = 3 } },
        [pscustomobject]@{
          Name = 'target-bytes'
          Overrides = @{
            TargetByteLimit = ([long](Assert-HandoffMappingBounds `
              $targetMappings 8 1MB 'Fixture target bytes')) - 1
          }
        },
        [pscustomobject]@{ Name = 'resource-count'; Overrides = @{ ResourceFileCountLimit = 1 } },
        [pscustomobject]@{ Name = 'nsis-count'; Overrides = @{ NsisFileCountLimit = 1 } }
      )) {
      $probeDestination = Join-Path $handoffFixtureRoot ([string]$boundProbe.Name)
      $probeArguments = @{} + $transactionArguments
      foreach ($override in $boundProbe.Overrides.GetEnumerator()) {
        $probeArguments[$override.Key] = $override.Value
      }
      Assert-Throws {
        Invoke-HandoffDestinationTransaction `
          -DestinationRoot $probeDestination @probeArguments | Out-Null
      } 'deterministic file-count or byte bound' `
        "handoff $($boundProbe.Name) rejection"
      Assert-Equal (Test-Path -LiteralPath $probeDestination) $false `
        "handoff $($boundProbe.Name) leaves no destination"
    }

    $tamperedDestination = Join-Path $handoffFixtureRoot 'tampered-stage'
    Assert-Throws {
      Invoke-HandoffDestinationTransaction `
        -DestinationRoot $tamperedDestination @transactionArguments `
        -FinalSourceAssertion {
          param([string]$StagedRoot)
          [IO.File]::WriteAllText(
            (Join-Path $StagedRoot 'resources\service.js'),
            'tampered-after-copy'
          )
        } | Out-Null
    } 'inventory changed during handoff staging' `
      'handoff tampered staged inventory rejection'
    Assert-Equal (Test-Path -LiteralPath $tamperedDestination) $false `
      'handoff tamper rollback removes the entire destination'

    $collisionMappings = @($resourceMappings) + @(
      [pscustomobject]@{ Source = $sourceResource; Path = 'SERVICE.JS' }
    )
    Assert-Throws {
      New-HandoffInventory $collisionMappings 'Fixture collision' | Out-Null
    } 'duplicate path or case-insensitive collision' `
      'handoff case-insensitive collision rejection'
    Assert-Throws {
      Invoke-HandoffDestinationTransaction `
        -DestinationRoot (Join-Path $handoffFixtureRoot '..\escape') `
        @transactionArguments | Out-Null
    } 'safe, fully qualified local Windows path|absent direct child' `
      'handoff unsafe destination rejection'

    $adsRoot = Join-Path $handoffFixtureRoot 'ads-tree'
    [IO.Directory]::CreateDirectory($adsRoot) | Out-Null
    $adsFile = Join-Path $adsRoot 'payload.bin'
    [IO.File]::WriteAllText($adsFile, 'visible')
    [IO.File]::WriteAllText("${adsFile}:hidden", 'hidden')
    Assert-Throws {
      Get-HandoffTreeFiles $adsRoot 'Fixture ADS tree' | Out-Null
    } 'alternate data stream' 'handoff ADS rejection'

    $reparseTarget = Join-Path $handoffFixtureRoot 'reparse-target'
    $reparseRoot = Join-Path $handoffFixtureRoot 'reparse-tree'
    [IO.Directory]::CreateDirectory($reparseTarget) | Out-Null
    [IO.Directory]::CreateDirectory($reparseRoot) | Out-Null
    [IO.File]::WriteAllText((Join-Path $reparseTarget 'payload.bin'), 'outside')
    $handoffReparsePath = Join-Path $reparseRoot 'linked'
    New-Item -ItemType Junction -Path $handoffReparsePath `
      -Target $reparseTarget | Out-Null
    Assert-Throws {
      Get-HandoffTreeFiles $reparseRoot 'Fixture reparse tree' | Out-Null
    } 'reparse point|linked directory' 'handoff reparse rejection'

    $git = [string](
      Get-Command git.exe -CommandType Application -ErrorAction Stop |
        Select-Object -First 1 -ExpandProperty Source
    )
    $repoFixture = Join-Path $handoffFixtureRoot 'repo'
    [IO.Directory]::CreateDirectory($repoFixture) | Out-Null
    & $git -C $repoFixture init --quiet
    & $git -C $repoFixture config user.email 'handoff-test@invalid.example'
    & $git -C $repoFixture config user.name 'Waggle Handoff Test'
    for ($index = 0; $index -lt 101; $index++) {
      [IO.File]::WriteAllText(
        (Join-Path $repoFixture ("input-{0:D3}.txt" -f $index)),
        "canonical-$index",
        [Text.UTF8Encoding]::new($false)
      )
    }
    & $git -C $repoFixture add -- .
    & $git -C $repoFixture commit --quiet -m 'fixture'
    & $git -C $repoFixture tag v1.0.0
    $fixtureRevision = [string](& $git -C $repoFixture rev-parse HEAD)
    $trackedFixture = @('input-000.txt')
    Assert-HandoffRepositoryState `
      $git $repoFixture $fixtureRevision '1.0.0' $trackedFixture
    $passed++
    [IO.File]::AppendAllText((Join-Path $repoFixture 'input-000.txt'), 'dirty')
    Assert-Throws {
      Assert-HandoffRepositoryState `
        $git $repoFixture $fixtureRevision '1.0.0' $trackedFixture
    } 'clean exact tagged' 'handoff dirty repository rejection'
    & $git -C $repoFixture checkout --quiet -- input-000.txt
    & $git -C $repoFixture tag -d v1.0.0 | Out-Null
    Assert-Throws {
      Assert-HandoffRepositoryState `
        $git $repoFixture $fixtureRevision '1.0.0' $trackedFixture 2>$null
    } 'clean exact tagged' 'handoff missing release tag rejection'
    & $git -C $repoFixture tag v1.0.0
    & $git -C $repoFixture update-index --skip-worktree input-000.txt
    Assert-Throws {
      Assert-HandoffRepositoryState `
        $git $repoFixture $fixtureRevision '1.0.0' $trackedFixture
    } 'non-default tracked state' 'handoff skip-worktree index rejection'
    & $git -C $repoFixture update-index --no-skip-worktree input-000.txt
  } finally {
    if ($null -ne $handoffReparsePath -and
        (Test-Path -LiteralPath $handoffReparsePath)) {
      [IO.Directory]::Delete($handoffReparsePath)
    }
    if (Test-Path -LiteralPath $handoffFixtureRoot) {
      foreach ($fixtureItem in @(Get-ChildItem `
          -LiteralPath $handoffFixtureRoot -Force -Recurse)) {
        if (($fixtureItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) {
          $fixtureItem.Attributes = [IO.FileAttributes]::Normal
        }
      }
      [IO.Directory]::Delete($handoffFixtureRoot, $true)
    }
  }
}

& {
  $portableFixtureParent = Join-Path `
    ([IO.Path]::GetTempPath()) `
    "waggle-portable-tools-$([Guid]::NewGuid().ToString('N'))"
  [IO.Directory]::CreateDirectory($portableFixtureParent) | Out-Null
  $portableRoot = New-PrivateDirectory (Join-Path $portableFixtureParent 'private')
  $node = Join-Path $portableRoot 'node\node.exe'
  $git = Join-Path $portableRoot 'git\cmd\git.exe'
  $gitRuntime = Join-Path $portableRoot 'git\mingw64\bin\git.exe'
  $gitDependency = Join-Path $portableRoot 'git\mingw64\bin\libcrypto-3-x64.dll'
  $sevenZip = Join-Path $portableRoot 'sevenzip\7z.exe'
  $sevenZipDll = Join-Path $portableRoot 'sevenzip\7z.dll'
  $outsideNode = Join-Path $portableFixtureParent 'outside-node.exe'
  foreach ($path in @(
      $node, $git, $gitRuntime, $gitDependency,
      $sevenZip, $sevenZipDll, $outsideNode
    )) {
    [IO.Directory]::CreateDirectory((Split-Path $path -Parent)) | Out-Null
    [IO.File]::WriteAllText($path, "fixture:$([IO.Path]::GetFileName($path))")
  }

  function Get-FileHash {
    param([string]$LiteralPath, [string]$Algorithm)
    if ($null -ne (Get-Variable receiptPath -ErrorAction SilentlyContinue) -and
        [string]::Equals(
          [IO.Path]::GetFullPath($LiteralPath),
          [IO.Path]::GetFullPath($receiptPath),
          [StringComparison]::OrdinalIgnoreCase
        )) {
      return [pscustomobject]@{ Hash = Get-RealSha256 $LiteralPath }
    }
    $content = [IO.File]::ReadAllText($LiteralPath)
    $hash = if ($content -match 'tampered') {
      '0' * 64
    } else {
      switch ([IO.Path]::GetFileName($LiteralPath)) {
        'node.exe' { $NodeSha256 }
        'git.exe' {
          if ($LiteralPath -match 'mingw64') { $GitRuntimeSha256 } else { $GitSha256 }
        }
        '7z.exe' { $SevenZipSha256 }
        '7z.dll' { $SevenZipDllSha256 }
        'node.zip' { $NodeArchiveSha256 }
        'mingit.zip' { $GitArchiveSha256 }
        'sevenzip.exe' { $SevenZipArchiveSha256 }
        default { 'F' * 64 }
      }
    }
    return [pscustomobject]@{ Hash = $hash }
  }

  $archiveRoot = Join-Path $portableFixtureParent 'downloads'
  [IO.Directory]::CreateDirectory($archiveRoot) | Out-Null
  $nodeArchive = Join-Path $archiveRoot 'node.zip'
  $gitArchive = Join-Path $archiveRoot 'mingit.zip'
  $sevenZipArchive = Join-Path $archiveRoot 'sevenzip.exe'
  foreach ($archive in @($nodeArchive, $gitArchive, $sevenZipArchive)) {
    [IO.File]::WriteAllText($archive, 'fixture:vendor-archive')
  }
  $portableInventory = New-WagglePrebuiltInventory -Root $portableRoot
  $receiptPath = Join-Path $portableFixtureParent 'portable-receipt.json'
  Write-WaggleJsonNoBom $receiptPath ([ordered]@{
    schemaVersion = 1
    portableToolchainRoot = $portableRoot
    archives = [ordered]@{
      node = [ordered]@{ path = $nodeArchive; sha256 = $NodeArchiveSha256 }
      git = [ordered]@{ path = $gitArchive; sha256 = $GitArchiveSha256 }
      sevenZip = [ordered]@{ path = $sevenZipArchive; sha256 = $SevenZipArchiveSha256 }
    }
    inventory = $portableInventory
  })
  $portableReceiptJson = [IO.File]::ReadAllText($receiptPath)
  $receiptSha256 = Get-RealSha256 $receiptPath
  $savedPortableFileCount = $PortableToolchainFileCount
  $savedPortableInventorySha256 = $PortableToolchainInventorySha256
  $PortableToolchainFileCount = @($portableInventory.entries).Count
  $PortableToolchainInventorySha256 = $portableInventory.sha256

  function Get-AuthenticodeSignature {
    param([string]$LiteralPath)
    $content = [IO.File]::ReadAllText($LiteralPath)
    $subject = switch ([IO.Path]::GetFileName($LiteralPath)) {
      'node.exe' { $NodePublisher }
      'git.exe' {
        if ($content -match 'wrong-publisher') { $MicrosoftPublisher } else { $GitPublisher }
      }
      'dotnet.exe' {
        if ($content -match 'wrong-publisher') { $MicrosoftPublisher } else { $DotNetPublisher }
      }
      default { $MicrosoftPublisher }
    }
    $oids = [Security.Cryptography.OidCollection]::new()
    [void]$oids.Add([Security.Cryptography.Oid]::new($CodeSigningOid))
    $eku = [Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new(
      $oids,
      $false
    )
    return [pscustomobject]@{
      Status = [Management.Automation.SignatureStatus]::Valid
      SignatureType = 'Authenticode'
      SignerCertificate = [pscustomobject]@{
        Subject = $subject
        Extensions = @($eku)
      }
    }
  }

  $portableEnvironmentNames = @(
    'WAGGLE_SIGNING_PORTABLE_TOOLCHAIN_ROOT',
    'WAGGLE_SIGNING_PORTABLE_NODE_PATH',
    'WAGGLE_SIGNING_PORTABLE_GIT_PATH',
    'WAGGLE_SIGNING_PORTABLE_SEVEN_ZIP_PATH',
    'WAGGLE_SIGNING_PORTABLE_RECEIPT_PATH',
    'WAGGLE_SIGNING_PORTABLE_RECEIPT_SHA256',
    'WAGGLE_SIGNING_MANIFEST_PATH',
    'WAGGLE_SIGNING_MANIFEST_SHA256'
  )
  $savedPortableEnvironment = @{}
  foreach ($name in $portableEnvironmentNames) {
    $savedPortableEnvironment[$name] = [Environment]::GetEnvironmentVariable($name)
  }
  try {
    $portable = Get-WagglePortableToolchain `
      $portableRoot $node $git $sevenZip $receiptPath $receiptSha256
    Assert-Equal $portable.NodePath $node 'portable Node path validation'
    Assert-Equal $portable.GitPath $git 'portable Git path validation'
    Assert-Equal $portable.GitRuntimePath $gitRuntime `
      'portable Git runtime closure validation'
    Assert-Equal $portable.SevenZipDllPath $sevenZipDll `
      'portable 7-Zip closure validation'
    foreach ($lock in $portable.Locks) { $lock.Dispose() }

    [IO.File]::AppendAllText(
      $receiptPath, ' ', [Text.UTF8Encoding]::new($false)
    )
    Assert-Throws {
      Get-WagglePortableToolchain `
        $portableRoot $node $git $sevenZip $receiptPath $receiptSha256
    } 'does not match its handoff SHA-256' `
      'portable raw receipt byte tamper with stale digest rejection'
    [IO.File]::WriteAllText(
      $receiptPath, $portableReceiptJson, [Text.UTF8Encoding]::new($false)
    )

    Assert-Throws {
      Get-WagglePortableToolchain `
        $portableRoot $node $git $sevenZip $receiptPath ('E' * 64)
    } 'does not match its handoff SHA-256' 'portable receipt handoff digest rejection'

    $mutatedReceipt = $portableReceiptJson | ConvertFrom-Json -Depth 32
    $mutatedReceipt.schemaVersion = 2
    Write-WaggleJsonNoBom $receiptPath $mutatedReceipt
    Assert-Throws {
      Get-WagglePortableToolchain `
        $portableRoot $node $git $sevenZip $receiptPath `
        (Get-RealSha256 $receiptPath)
    } 'schemaVersion must be 1' 'portable receipt schema rejection'
    [IO.File]::WriteAllText(
      $receiptPath, $portableReceiptJson, [Text.UTF8Encoding]::new($false)
    )

    $mutatedReceipt = $portableReceiptJson | ConvertFrom-Json -Depth 32
    $mutatedReceipt.portableToolchainRoot = $portableFixtureParent
    Write-WaggleJsonNoBom $receiptPath $mutatedReceipt
    Assert-Throws {
      Get-WagglePortableToolchain `
        $portableRoot $node $git $sevenZip $receiptPath `
        (Get-RealSha256 $receiptPath)
    } 'receipt root' 'portable receipt root substitution rejection'
    [IO.File]::WriteAllText(
      $receiptPath, $portableReceiptJson, [Text.UTF8Encoding]::new($false)
    )

    $mutatedReceipt = $portableReceiptJson | ConvertFrom-Json -Depth 32
    $mutatedReceipt.archives.node.sha256 = '0' * 64
    Write-WaggleJsonNoBom $receiptPath $mutatedReceipt
    Assert-Throws {
      Get-WagglePortableToolchain `
        $portableRoot $node $git $sevenZip $receiptPath `
        (Get-RealSha256 $receiptPath)
    } 'exact distinct repository-pinned handoff' `
      'portable receipt recomputed archive hash rejection'
    [IO.File]::WriteAllText(
      $receiptPath, $portableReceiptJson, [Text.UTF8Encoding]::new($false)
    )

    $mutatedReceipt = $portableReceiptJson | ConvertFrom-Json -Depth 32
    $mutatedReceipt.archives.node.path = $gitArchive
    Write-WaggleJsonNoBom $receiptPath $mutatedReceipt
    Assert-Throws {
      Get-WagglePortableToolchain `
        $portableRoot $node $git $sevenZip $receiptPath `
        (Get-RealSha256 $receiptPath)
    } 'exact distinct repository-pinned handoff|does not match its pinned SHA-256' `
      'portable receipt recomputed archive path rejection'
    [IO.File]::WriteAllText(
      $receiptPath, $portableReceiptJson, [Text.UTF8Encoding]::new($false)
    )

    $mutatedReceipt = $portableReceiptJson | ConvertFrom-Json -Depth 32
    $mutatedReceipt.inventory.sha256 = '0' * 64
    Write-WaggleJsonNoBom $receiptPath $mutatedReceipt
    Assert-Throws {
      Get-WagglePortableToolchain `
        $portableRoot $node $git $sevenZip $receiptPath `
        (Get-RealSha256 $receiptPath)
    } 'repository-pinned full closure' `
      'portable receipt recomputed inventory aggregate rejection'
    [IO.File]::WriteAllText(
      $receiptPath, $portableReceiptJson, [Text.UTF8Encoding]::new($false)
    )

    $mutatedReceipt = $portableReceiptJson | ConvertFrom-Json -Depth 32
    $mutatedReceipt.inventory.entries[0].sha256 = '0' * 64
    Write-WaggleJsonNoBom $receiptPath $mutatedReceipt
    Assert-Throws {
      Get-WagglePortableToolchain `
        $portableRoot $node $git $sevenZip $receiptPath `
        (Get-RealSha256 $receiptPath)
    } 'inventory aggregate SHA-256 digest is invalid' `
      'portable receipt recomputed inventory entry rejection'
    [IO.File]::WriteAllText(
      $receiptPath, $portableReceiptJson, [Text.UTF8Encoding]::new($false)
    )

    $mutatedReceipt = $portableReceiptJson | ConvertFrom-Json -Depth 32
    $mutatedReceipt.inventory.entries = @($mutatedReceipt.inventory.entries)[1..(
      @($mutatedReceipt.inventory.entries).Count - 1
    )]
    Write-WaggleJsonNoBom $receiptPath $mutatedReceipt
    Assert-Throws {
      Get-WagglePortableToolchain `
        $portableRoot $node $git $sevenZip $receiptPath `
        (Get-RealSha256 $receiptPath)
    } 'repository-pinned full closure' `
      'portable receipt recomputed inventory full-count rejection'
    [IO.File]::WriteAllText(
      $receiptPath, $portableReceiptJson, [Text.UTF8Encoding]::new($false)
    )

    $unexpectedDependency = Join-Path $portableRoot 'git\mingw64\bin\injected.dll'
    [IO.File]::WriteAllText($unexpectedDependency, 'unexpected')
    Assert-Throws {
      Get-WagglePortableToolchain `
        $portableRoot $node $git $sevenZip $receiptPath $receiptSha256
    } 'missing, extra, or unexpected files' `
      'portable unexpected adjacent dependency rejection'
    [IO.File]::Delete($unexpectedDependency)

    [IO.File]::WriteAllText($gitDependency, 'tampered adjacent dependency')
    Assert-Throws {
      Get-WagglePortableToolchain `
        $portableRoot $node $git $sevenZip $receiptPath $receiptSha256
    } 'inventory SHA-256 digest and size' `
      'portable mutated adjacent dependency rejection'
    [IO.File]::WriteAllText($gitDependency, 'fixture:libcrypto-3-x64.dll')

    [IO.File]::Delete($gitDependency)
    Assert-Throws {
      Get-WagglePortableToolchain `
        $portableRoot $node $git $sevenZip $receiptPath $receiptSha256
    } 'missing, extra, or unexpected files' `
      'portable missing adjacent dependency rejection'
    [IO.File]::WriteAllText($gitDependency, 'fixture:libcrypto-3-x64.dll')

    [IO.File]::WriteAllText($node, 'tampered')
    Assert-Throws {
      Get-WagglePortableToolchain `
        $portableRoot $node $git $sevenZip $receiptPath $receiptSha256
    } 'inventory SHA-256 digest and size' 'portable Node tamper rejection'
    [IO.File]::WriteAllText($node, 'fixture:node.exe')

    [IO.File]::WriteAllText($git, 'wrong-publisher')
    Assert-Throws {
      Get-WagglePortableToolchain `
        $portableRoot $node $git $sevenZip $receiptPath $receiptSha256
    } 'Git executable.*approved publisher' 'portable Git publisher rejection'
    [IO.File]::WriteAllText($git, 'fixture:git.exe')

    Assert-Throws {
      Get-WagglePortableToolchain `
        $portableRoot $outsideNode $git $sevenZip $receiptPath $receiptSha256
    } 'contained by the private portable toolchain root' `
      'portable tool path containment rejection'
    Assert-Throws {
      Get-WagglePortableToolchain `
        $portableRoot $node $git $sevenZip $receiptPath $receiptSha256 `
        -DisallowedRoots @($portableFixtureParent)
    } 'overlaps.*boundary' 'portable root overlap rejection'

    [Environment]::SetEnvironmentVariable(
      'WAGGLE_SIGNING_PORTABLE_TOOLCHAIN_ROOT', $portableRoot
    )
    [Environment]::SetEnvironmentVariable('WAGGLE_SIGNING_PORTABLE_NODE_PATH', $node)
    [Environment]::SetEnvironmentVariable('WAGGLE_SIGNING_PORTABLE_GIT_PATH', $git)
    [Environment]::SetEnvironmentVariable('WAGGLE_SIGNING_PORTABLE_SEVEN_ZIP_PATH', $sevenZip)
    [Environment]::SetEnvironmentVariable('WAGGLE_SIGNING_PORTABLE_RECEIPT_PATH', $receiptPath)
    [Environment]::SetEnvironmentVariable('WAGGLE_SIGNING_PORTABLE_RECEIPT_SHA256', $receiptSha256)
    [Environment]::SetEnvironmentVariable('WAGGLE_SIGNING_MANIFEST_PATH', $null)
    [Environment]::SetEnvironmentVariable('WAGGLE_SIGNING_MANIFEST_SHA256', $null)
    Assert-Throws {
      Get-WaggleSigningToolchain
    } 'active receipt-bound signing session' `
      'portable callback outside receipt-bound session rejection'
    $resolvedPortable = Get-WaggleSigningToolchain -AllowPortableBeforeManifest
    Assert-Equal $resolvedPortable.PortableToolchainRoot $portableRoot `
      'Package setup resolves exact portable root'
    foreach ($lock in $resolvedPortable.Locks) { $lock.Dispose() }
    [Environment]::SetEnvironmentVariable('WAGGLE_SIGNING_PORTABLE_NODE_PATH', $null)
    Assert-Throws {
      Get-WaggleSigningToolchain -AllowPortableBeforeManifest
    } 'must provide the exact root, Node, Git, 7-Zip, receipt path, and receipt SHA-256' `
      'partial portable environment rejection'

    $dotnetFixture = Join-Path $portableRoot 'dotnet.exe'
    [IO.File]::WriteAllText($dotnetFixture, 'wrong-publisher')
    Assert-Throws {
      Assert-MicrosoftAuthenticodeFile `
        $dotnetFixture '.NET host' $null $DotNetPublisher
    } 'approved publisher' 'generic Microsoft signer rejected for .NET host'
    [IO.File]::WriteAllText($dotnetFixture, 'exact-dotnet-publisher')
    Assert-MicrosoftAuthenticodeFile `
      $dotnetFixture '.NET host' $null $DotNetPublisher
    $script:passed++
  } finally {
    $PortableToolchainFileCount = $savedPortableFileCount
    $PortableToolchainInventorySha256 = $savedPortableInventorySha256
    foreach ($name in $portableEnvironmentNames) {
      [Environment]::SetEnvironmentVariable($name, $savedPortableEnvironment[$name])
    }
    [IO.Directory]::Delete($portableFixtureParent, $true)
  }
}

Assert-Equal `
  (Get-ArtifactPolicyKind 'D:\repo\app\src-tauri\target\x86_64-pc-windows-msvc\release\waggle.exe' $releaseRoot $resourcesRoot $tempRoot $version) `
  'PE' 'main executable policy'
Assert-Equal `
  (Get-ArtifactPolicyKind 'D:\repo\app\src-tauri\target\x86_64-pc-windows-msvc\release\bundle\nsis\Waggle_0.2.0_x64-setup.exe' $releaseRoot $resourcesRoot $tempRoot $version) `
  'PE' 'NSIS installer policy'
Assert-Throws {
  Get-ArtifactPolicyKind 'D:\repo\app\src-tauri\target\x86_64-pc-windows-msvc\release\bundle\msi\Waggle_0.2.0_x64_en-US.msi' $releaseRoot $resourcesRoot $tempRoot $version
} 'approved Tauri release manifest' 'MSI rejection for NSIS-only production signing'
Assert-Throws {
  Get-ArtifactPolicyKind 'D:\repo\app\src-tauri\target\x86_64-pc-windows-msvc\release\wix\x64\wix\WixUIExtension.dll' $releaseRoot $resourcesRoot $tempRoot $version
} 'approved Tauri release manifest' 'WiX rejection for NSIS-only production signing'
Assert-Equal `
  (Get-ArtifactPolicyKind 'D:\repo\app\src-tauri\resources\native\vec0.dll' $releaseRoot $resourcesRoot $tempRoot $version) `
  'PE' 'resource policy'
Assert-Equal `
  (Get-ArtifactPolicyKind 'D:\repo\app\src-tauri\target\.signing-temp\run-123456\nst9DA7.tmp' $releaseRoot $resourcesRoot $tempRoot $version) `
  'PE' 'NSIS uninstaller policy'

Assert-Throws {
  Get-ArtifactPolicyKind 'D:\outside\malware.exe' $releaseRoot $resourcesRoot $tempRoot $version
} 'outside every approved' 'outside-root rejection'
Assert-Throws {
  Get-ArtifactPolicyKind 'D:\repo\app\src-tauri\target\x86_64-pc-windows-msvc\release-evil\waggle.exe' $releaseRoot $resourcesRoot $tempRoot $version
} 'outside every approved' 'prefix-collision rejection'
Assert-Throws {
  Get-ArtifactPolicyKind 'D:\repo\app\src-tauri\target\.signing-temp\run-123456\evil.tmp' $releaseRoot $resourcesRoot $tempRoot $version
} 'outside every approved' 'wrong temp name rejection'
Assert-Throws {
  Get-ArtifactPolicyKind 'D:\repo\app\src-tauri\resources\node.exe' $releaseRoot $resourcesRoot $tempRoot $version
} 'resource manifest' 'vendor binary rejection'
Assert-Throws {
  Get-TrustedPath 'D:\safe\..\outside.exe' 'Traversal probe'
} 'safe, fully qualified' 'traversal rejection'
Assert-Throws {
  Get-TrustedPath '\\server\share\outside.exe' 'UNC probe'
} 'safe, fully qualified' 'UNC rejection'
Assert-Throws {
  Get-TrustedPath '\\?\C:\outside.exe' 'Device probe'
} 'safe, fully qualified' 'device path rejection'
Assert-Throws {
  Get-TrustedPath 'D:\outside.exe:stream' 'ADS probe'
} 'safe, fully qualified' 'ADS rejection'

$probeRoot = Join-Path ([IO.Path]::GetTempPath()) "waggle-signing-policy-$([Guid]::NewGuid().ToString('N'))"
$targetDirectory = Join-Path $probeRoot 'target'
$junctionPath = Join-Path $probeRoot 'junction'
$fakeToolDirectory = Join-Path $probeRoot 'x64'
$hardLinkReleaseRoot = Join-Path $probeRoot 'release'
try {
  [IO.Directory]::CreateDirectory($targetDirectory) | Out-Null
  [IO.File]::WriteAllText((Join-Path $targetDirectory 'payload.exe'), 'not a PE')
  New-Item -ItemType Junction -Path $junctionPath -Target $targetDirectory | Out-Null
  Assert-Throws {
    Get-TrustedPath (Join-Path $junctionPath 'payload.exe') 'Junction probe'
  } 'reparse point|linked filesystem' 'junction rejection'

  [IO.Directory]::CreateDirectory($fakeToolDirectory) | Out-Null
  $patchableMain = Join-Path $probeRoot 'patchable-waggle.exe'
  New-SyntheticPatchablePe $patchableMain
  $expectedPatchedBytes = [IO.File]::ReadAllBytes($patchableMain)
  $expectedToken = [Text.Encoding]::ASCII.GetBytes('__TAURI_BUNDLE_TYPE_VAR_NSS')
  [Array]::Copy($expectedToken, 0, $expectedPatchedBytes, 160, $expectedToken.Length)
  $expectedPatchedHash = [Convert]::ToHexString(
    [Security.Cryptography.SHA256]::HashData($expectedPatchedBytes)
  )
  Assert-Equal `
    (Get-NsisPatchedMainSha256 $patchableMain) `
    $expectedPatchedHash `
    'Tauri NSIS main patch pre-authorization hash'
  $missingPatchToken = Join-Path $probeRoot 'missing-patch-token.exe'
  New-SyntheticPe $missingPatchToken
  Assert-Throws {
    Get-NsisPatchedMainSha256 $missingPatchToken
  } 'exactly one unpatched' 'missing Tauri bundle token rejection'
  $duplicatePatchToken = Join-Path $probeRoot 'duplicate-patch-token.exe'
  $duplicateBytes = [byte[]]::new(320)
  $sourceBytes = [IO.File]::ReadAllBytes($patchableMain)
  [Array]::Copy($sourceBytes, $duplicateBytes, $sourceBytes.Length)
  $unknownToken = [Text.Encoding]::ASCII.GetBytes('__TAURI_BUNDLE_TYPE_VAR_UNK')
  [Array]::Copy($unknownToken, 0, $duplicateBytes, 270, $unknownToken.Length)
  [IO.File]::WriteAllBytes($duplicatePatchToken, $duplicateBytes)
  Assert-Throws {
    Get-NsisPatchedMainSha256 $duplicatePatchToken
  } 'exactly one unpatched' 'duplicate Tauri bundle token rejection'
  $fakeSignTool = Join-Path $fakeToolDirectory 'signtool.exe'
  $fakeDlib = Join-Path $fakeToolDirectory 'Azure.CodeSigning.Dlib.dll'
  [IO.File]::WriteAllText($fakeSignTool, 'impostor')
  [IO.File]::WriteAllText($fakeDlib, 'impostor')
  Assert-Throws {
    Assert-MicrosoftAuthenticodeFile `
      (Get-TrustedPath $fakeSignTool 'Fake SignTool') 'Fake SignTool' $null
  } 'not validly Authenticode-signed by the approved publisher' 'fake SignTool rejection'
  Assert-Throws {
    Assert-MicrosoftAuthenticodeFile `
      (Get-TrustedPath $fakeDlib 'Fake dlib') 'Fake dlib' $ArtifactSigningDlibSha256
  } 'not validly Authenticode-signed by the approved publisher' 'fake dlib rejection'

  $currentPowerShell = Get-TrustedPath (Get-Process -Id $PID).Path 'Current PowerShell'
  Assert-MicrosoftAuthenticodeFile $currentPowerShell 'Current PowerShell' $null
  $passed++
  $approvedPowerShell = Get-ApprovedPowerShell7Path
  Assert-ApprovedPowerShell7Path $approvedPowerShell
  $passed++
  Assert-FreshProcessModuleIsolation `
    $approvedPowerShell 'PowerShell 7' $probeRoot
  if (Test-Path -LiteralPath $SystemPowerShellPath -PathType Leaf) {
    Assert-FreshProcessModuleIsolation `
      $SystemPowerShellPath 'Windows PowerShell' $probeRoot
  }

  $privateDirectory = New-PrivateDirectory (Join-Path $probeRoot 'private')
  if (-not (Get-Acl -LiteralPath $privateDirectory).AreAccessRulesProtected) {
    throw 'Private signing directory test still inherits permissions.'
  }
  $passed++
  if ((New-PrivateDirectory $privateDirectory) -cne $privateDirectory) {
    throw 'Private signing directory hardening is not idempotent.'
  }
  $passed++

  $readLock = Open-ReadLock $fakeSignTool
  try {
    Assert-Throws {
      $writeProbe = [IO.File]::Open(
        $fakeSignTool,
        [IO.FileMode]::Open,
        [IO.FileAccess]::Write,
        [IO.FileShare]::None
      )
      $writeProbe.Dispose()
    } 'used by another process|cannot access' 'read-lock write rejection'
  } finally {
    $readLock.Dispose()
  }

  $hardLinkDeps = Join-Path $hardLinkReleaseRoot 'deps'
  [IO.Directory]::CreateDirectory($hardLinkDeps) | Out-Null
  $hardLinkDependency = Join-Path $hardLinkDeps 'waggle.exe'
  $hardLinkMain = Join-Path $hardLinkReleaseRoot 'waggle.exe'
  [IO.File]::WriteAllText($hardLinkDependency, 'cargo executable probe')
  New-Item -ItemType HardLink -Path $hardLinkMain -Target $hardLinkDependency | Out-Null
  $originalSystemRoot = $env:SystemRoot
  try {
    $env:SystemRoot = $probeRoot
    Assert-Equal `
      (Get-SystemFsutilPath) `
      'C:\Windows\System32\fsutil.exe' `
      'fixed fsutil path ignores environment'
  } finally {
    $env:SystemRoot = $originalSystemRoot
  }
  Assert-ApprovedHardLinkTopology $hardLinkMain $hardLinkReleaseRoot
  $passed++
  $detachedReleaseRoot = Join-Path $probeRoot 'detached-release'
  [IO.Directory]::CreateDirectory($detachedReleaseRoot) | Out-Null
  $detachedMain = Join-Path $detachedReleaseRoot 'waggle.exe'
  [IO.File]::WriteAllText($detachedMain, 'detached executable probe')
  Assert-Throws {
    Assert-ApprovedHardLinkTopology $detachedMain $detachedReleaseRoot
  } 'must have.*hard-link topology' 'detached Cargo main rejection'
  Assert-ApprovedHardLinkTopology $detachedMain $detachedReleaseRoot -AllowDetachedMain
  $passed++
  $rogueHardLink = Join-Path $probeRoot 'rogue.exe'
  New-Item -ItemType HardLink -Path $rogueHardLink -Target $hardLinkDependency | Out-Null
  Assert-Throws {
    Assert-ApprovedHardLinkTopology $hardLinkMain $hardLinkReleaseRoot
  } 'unexpected hard-link sibling' 'rogue hard-link rejection'
} finally {
  if (Test-Path -LiteralPath $junctionPath) { [IO.Directory]::Delete($junctionPath) }
  if (Test-Path -LiteralPath $probeRoot) { [IO.Directory]::Delete($probeRoot, $true) }
}

$prebuiltFixtureRoot = Join-Path `
  ([IO.Path]::GetTempPath()) `
  "waggle-prebuilt-tree-$([Guid]::NewGuid().ToString('N'))"
$reparseDirectory = $null
try {
  $seedRoot = Join-Path $prebuiltFixtureRoot 'seed'
  [IO.Directory]::CreateDirectory((Join-Path $seedRoot 'Bin')) | Out-Null
  [IO.Directory]::CreateDirectory((Join-Path $seedRoot 'resources')) | Out-Null
  [IO.File]::WriteAllBytes(
    (Join-Path $seedRoot 'Bin\Payload.bin'),
    [Text.Encoding]::UTF8.GetBytes('immutable-payload-one')
  )
  [IO.File]::WriteAllBytes(
    (Join-Path $seedRoot 'resources\data.bin'),
    [Text.Encoding]::UTF8.GetBytes('immutable-payload-two')
  )
  $expectedInventory = New-WagglePrebuiltInventory -Root $seedRoot
  if (@($expectedInventory.entries).Count -ne 2 -or
      [string]$expectedInventory.sha256 -notmatch '^[0-9A-Fa-f]{64}$') {
    throw 'Prebuilt inventory lacks its exact canonical entries and aggregate digest.'
  }
  $passed++

  $treeLease = Open-WaggleValidatedPrebuiltTree `
    -Root $seedRoot -ExpectedInventory $expectedInventory -Label 'Pristine prebuilt tree'
  try {
    foreach ($entry in @($expectedInventory.entries)) {
      $lockedPath = Join-Path $seedRoot ([string]$entry.path)
      Assert-Throws {
        $writeProbe = [IO.File]::Open(
          $lockedPath,
          [IO.FileMode]::Open,
          [IO.FileAccess]::Write,
          [IO.FileShare]::None
        )
        $writeProbe.Dispose()
      } 'used by another process|cannot access' 'validated prebuilt tree holds every file read-locked'
    }
  } finally {
    Close-PrebuiltTreeLease $treeLease
  }

  $mutablePath = Join-Path $seedRoot 'Bin\Payload.bin'
  $immutablePath = Join-Path $seedRoot 'resources\data.bin'
  $mutableLease = Open-WaggleValidatedPrebuiltTree `
    -Root $seedRoot -ExpectedInventory $expectedInventory `
    -Label 'Signing-mutable prebuilt tree' -MutablePaths @($mutablePath)
  try {
    $mutableWriteProbe = [IO.File]::Open(
      $mutablePath,
      [IO.FileMode]::Open,
      [IO.FileAccess]::Write,
      [IO.FileShare]::None
    )
    $mutableWriteProbe.Dispose()
    $passed++
    Assert-Throws {
      $immutableWriteProbe = [IO.File]::Open(
        $immutablePath,
        [IO.FileMode]::Open,
        [IO.FileAccess]::Write,
        [IO.FileShare]::None
      )
      $immutableWriteProbe.Dispose()
    } 'used by another process|cannot access' 'mutable tree keeps immutable files read-locked'
  } finally {
    Close-PrebuiltTreeLease $mutableLease
  }

  foreach ($passName in @('unsigned-generated-roots', 'signing-generated-roots')) {
    $generatedTreeRoot = Join-Path $prebuiltFixtureRoot $passName
    $generatedReleaseRoot = Join-Path `
      $generatedTreeRoot 'x86_64-pc-windows-msvc\release'
    $generatedNsisRoot = Join-Path $generatedReleaseRoot 'nsis'
    $generatedBundleNsisRoot = Join-Path $generatedReleaseRoot 'bundle\nsis'
    $generatedNsisSiblingRoot = Join-Path $generatedReleaseRoot 'nsis-evil'
    $generatedBundleSiblingRoot = Join-Path $generatedReleaseRoot 'bundle\nsis-old'
    $generatedResourceRoot = Join-Path $generatedTreeRoot 'resources'
    foreach ($directory in @(
        $generatedNsisRoot, $generatedBundleNsisRoot,
        $generatedNsisSiblingRoot, $generatedBundleSiblingRoot,
        $generatedResourceRoot
      )) {
      [IO.Directory]::CreateDirectory($directory) | Out-Null
    }
    $generatedFiles = @(
      [pscustomobject]@{
        Path = Join-Path $generatedNsisRoot 'x64\Plugins\fixture.dll'
        Content = 'tauri-nsis-output'
      }
      [pscustomobject]@{
        Path = Join-Path $generatedBundleNsisRoot 'Waggle_fixture_x64-setup.exe'
        Content = 'tauri-installer-output'
      }
      [pscustomobject]@{
        Path = Join-Path $generatedNsisSiblingRoot 'sibling.dll'
        Content = 'locked-nsis-sibling'
      }
      [pscustomobject]@{
        Path = Join-Path $generatedBundleSiblingRoot 'sibling.exe'
        Content = 'locked-bundle-sibling'
      }
      [pscustomobject]@{
        Path = Join-Path $generatedResourceRoot 'data.bin'
        Content = 'locked-resource'
      }
    )
    foreach ($file in $generatedFiles) {
      [IO.Directory]::CreateDirectory((Split-Path ([string]$file.Path) -Parent)) | Out-Null
      [IO.File]::WriteAllBytes(
        [string]$file.Path, [Text.Encoding]::UTF8.GetBytes([string]$file.Content)
      )
    }
    $generatedInventory = New-WagglePrebuiltInventory -Root $generatedTreeRoot
    $generatedLease = Open-WaggleValidatedPrebuiltTree `
      -Root $generatedTreeRoot -ExpectedInventory $generatedInventory `
      -Label "$passName private work tree" `
      -RegeneratedRoots @($generatedNsisRoot, $generatedBundleNsisRoot) `
      -CargoReleaseRelativePath 'x86_64-pc-windows-msvc\release'
    try {
      Clear-WaggleRegeneratedRoots $generatedLease
      Assert-Equal `
        (Test-Path -LiteralPath $generatedNsisRoot) $false `
        "$passName clears the exact Tauri NSIS work root"
      Assert-Equal `
        (Test-Path -LiteralPath $generatedBundleNsisRoot) $false `
        "$passName clears the exact Tauri installer output root"
      Assert-Equal `
        (Test-Path -LiteralPath $generatedNsisSiblingRoot -PathType Container) $true `
        "$passName preserves the nsis-evil sibling root"
      Assert-Equal `
        (Test-Path -LiteralPath $generatedBundleSiblingRoot -PathType Container) $true `
        "$passName preserves the bundle nsis-old sibling root"
      foreach ($lockedFile in @(
          (Join-Path $generatedNsisSiblingRoot 'sibling.dll'),
          (Join-Path $generatedBundleSiblingRoot 'sibling.exe'),
          (Join-Path $generatedResourceRoot 'data.bin')
        )) {
        Assert-Throws {
          $writeProbe = [IO.File]::Open(
            $lockedFile,
            [IO.FileMode]::Open,
            [IO.FileAccess]::Write,
            [IO.FileShare]::None
          )
          $writeProbe.Dispose()
        } 'used by another process|cannot access' `
          "$passName retains the non-generated work-tree lock for $lockedFile"
      }
    } finally {
      Close-PrebuiltTreeLease $generatedLease
    }
  }

  $copySeed = {
    param([string]$Name)
    $destination = Join-Path $prebuiltFixtureRoot $Name
    [IO.Directory]::CreateDirectory($destination) | Out-Null
    Copy-Item -Path (Join-Path $seedRoot '*') -Destination $destination -Recurse
    return $destination
  }

  $extraRoot = & $copySeed 'extra'
  [IO.File]::WriteAllText((Join-Path $extraRoot 'unexpected.bin'), 'unexpected')
  Assert-Throws {
    Open-WaggleValidatedPrebuiltTree `
      -Root $extraRoot -ExpectedInventory $expectedInventory -Label 'Extra-file tree'
  } 'extra|unexpected|inventory' 'prebuilt tree extra-file rejection'

  $missingRoot = & $copySeed 'missing'
  [IO.File]::Delete((Join-Path $missingRoot 'resources\data.bin'))
  Assert-Throws {
    Open-WaggleValidatedPrebuiltTree `
      -Root $missingRoot -ExpectedInventory $expectedInventory -Label 'Missing-file tree'
  } 'missing|inventory' 'prebuilt tree missing-file rejection'

  $mutatedRoot = & $copySeed 'same-size-mutation'
  $mutatedPath = Join-Path $mutatedRoot 'Bin\Payload.bin'
  $originalLength = (Get-Item -LiteralPath $mutatedPath).Length
  [IO.File]::WriteAllBytes(
    $mutatedPath,
    [Text.Encoding]::UTF8.GetBytes('tampered-payload-one!')
  )
  Assert-Equal `
    (Get-Item -LiteralPath $mutatedPath).Length `
    $originalLength `
    'same-size prebuilt mutation fixture'
  Assert-Throws {
    Open-WaggleValidatedPrebuiltTree `
      -Root $mutatedRoot -ExpectedInventory $expectedInventory -Label 'Mutated tree'
  } 'SHA-256|digest|inventory' 'prebuilt tree same-size mutation rejection'

  $collisionInventory = $expectedInventory | ConvertTo-Json -Depth 32 |
    ConvertFrom-Json -Depth 32 -DateKind String
  $collisionEntry = $collisionInventory.entries[0] | ConvertTo-Json -Depth 8 |
    ConvertFrom-Json -Depth 8 -DateKind String
  $collisionEntry.path = ([string]$collisionEntry.path).ToUpperInvariant()
  $collisionInventory.entries = @($collisionInventory.entries) + @($collisionEntry)
  Assert-Throws {
    Open-WaggleValidatedPrebuiltTree `
      -Root $seedRoot -ExpectedInventory $collisionInventory -Label 'Case-collision inventory'
  } 'case-insensitive|case collision|duplicate canonical' 'prebuilt inventory case-collision rejection'

  $traversalInventory = $expectedInventory | ConvertTo-Json -Depth 32 |
    ConvertFrom-Json -Depth 32 -DateKind String
  $traversalInventory.entries[0].path = '..\outside.bin'
  Assert-Throws {
    Open-WaggleValidatedPrebuiltTree `
      -Root $seedRoot -ExpectedInventory $traversalInventory -Label 'Traversal inventory'
  } 'relative|traversal|canonical|unsafe' 'prebuilt inventory traversal rejection'

  $adsRoot = & $copySeed 'alternate-data-stream'
  $adsCarrier = Join-Path $adsRoot 'Bin\Payload.bin'
  [IO.File]::WriteAllText("${adsCarrier}:waggle-probe", 'hidden-content')
  Assert-Throws {
    Open-WaggleValidatedPrebuiltTree `
      -Root $adsRoot -ExpectedInventory $expectedInventory -Label 'ADS tree'
  } 'alternate data stream|ADS|named stream' 'prebuilt tree ADS rejection'

  $reparseRoot = & $copySeed 'reparse'
  $reparseDirectory = Join-Path $reparseRoot 'resources'
  $reparseTarget = Join-Path $prebuiltFixtureRoot 'reparse-target'
  Move-Item -LiteralPath $reparseDirectory -Destination $reparseTarget
  New-Item -ItemType Junction -Path $reparseDirectory -Target $reparseTarget | Out-Null
  Assert-Throws {
    Open-WaggleValidatedPrebuiltTree `
      -Root $reparseRoot -ExpectedInventory $expectedInventory -Label 'Reparse tree'
  } 'reparse point|linked filesystem|junction' 'prebuilt tree reparse rejection'

  $unapprovedLinkRoot = & $copySeed 'unapproved-hardlink'
  $unapprovedLink = Join-Path $unapprovedLinkRoot 'rogue-link.bin'
  Copy-Item -LiteralPath (Join-Path $unapprovedLinkRoot 'resources\data.bin') `
    -Destination $unapprovedLink
  $unapprovedLinkInventory = New-WagglePrebuiltInventory -Root $unapprovedLinkRoot
  [IO.File]::Delete($unapprovedLink)
  New-Item -ItemType HardLink -Path $unapprovedLink `
    -Target (Join-Path $unapprovedLinkRoot 'resources\data.bin') | Out-Null
  Assert-Throws {
    Open-WaggleValidatedPrebuiltTree `
      -Root $unapprovedLinkRoot -ExpectedInventory $unapprovedLinkInventory `
      -Label 'Unapproved hard-link tree'
  } 'hard-link|hardlink|link topology' 'prebuilt tree unapproved hard-link rejection'

  $approvedLinkRoot = Join-Path $prebuiltFixtureRoot 'approved-hardlink'
  $approvedDependency = Join-Path $approvedLinkRoot 'release\deps\waggle.exe'
  $approvedMain = Join-Path $approvedLinkRoot 'release\waggle.exe'
  [IO.Directory]::CreateDirectory((Split-Path $approvedDependency -Parent)) | Out-Null
  New-SyntheticPe $approvedDependency 91
  New-Item -ItemType HardLink -Path $approvedMain -Target $approvedDependency | Out-Null
  $approvedLinkInventory = New-WagglePrebuiltInventory -Root $approvedLinkRoot
  $approvedLinkLease = Open-WaggleValidatedPrebuiltTree `
    -Root $approvedLinkRoot -ExpectedInventory $approvedLinkInventory `
    -Label 'Approved Cargo hard-link tree'
  try {
    Assert-ApprovedHardLinkTopology `
      $approvedMain (Join-Path $approvedLinkRoot 'release')
    $passed++
  } finally {
    Close-PrebuiltTreeLease $approvedLinkLease
  }

  $combinedSourceRoot = Join-Path $prebuiltFixtureRoot 'combined-source'
  $combinedReleaseRelative = 'x86_64-pc-windows-msvc\release'
  $combinedDependency = Join-Path `
    $combinedSourceRoot "$combinedReleaseRelative\deps\waggle.exe"
  $combinedMain = Join-Path $combinedSourceRoot "$combinedReleaseRelative\waggle.exe"
  $combinedResource = Join-Path $combinedSourceRoot 'resources\service.js'
  [IO.Directory]::CreateDirectory((Split-Path $combinedDependency -Parent)) | Out-Null
  [IO.Directory]::CreateDirectory((Split-Path $combinedResource -Parent)) | Out-Null
  New-SyntheticPe $combinedDependency 92
  New-Item -ItemType HardLink -Path $combinedMain -Target $combinedDependency | Out-Null
  [IO.File]::WriteAllText($combinedResource, 'receipt-bound-sidecar')
  $combinedInventory = New-WagglePrebuiltInventory `
    -Root $combinedSourceRoot -CargoReleaseRelativePath $combinedReleaseRelative
  $requiredDiskBytes = Assert-WaggleHostedDiskCapacity `
    -Path $combinedSourceRoot -Inventory $combinedInventory -AvailableBytes ([long]::MaxValue)
  Assert-Throws {
    Assert-WaggleHostedDiskCapacity `
      -Path $combinedSourceRoot -Inventory $combinedInventory `
      -AvailableBytes ($requiredDiskBytes - 1)
  } 'insufficient free disk space' 'hosted signing disk-capacity fail-fast'
  $passed++
  $combinedSourceLease = Open-WaggleValidatedPrebuiltTree `
    -Root $combinedSourceRoot -ExpectedInventory $combinedInventory `
    -Label 'Combined hosted input tree' `
    -CargoReleaseRelativePath $combinedReleaseRelative
  $combinedWorkRoot = Join-Path $prebuiltFixtureRoot 'combined-work'
  try {
    $sourceHashBeforeCopy = Get-Sha256 $combinedMain
    New-WagglePrebuiltWorkCopy `
      -SourceRoot $combinedSourceRoot -DestinationRoot $combinedWorkRoot `
      -Inventory $combinedInventory -Label 'Combined hosted input tree' `
      -CargoReleaseRelativePath $combinedReleaseRelative | Out-Null
    Assert-Equal (Get-Sha256 $combinedMain) $sourceHashBeforeCopy `
      'work-copy creation leaves receipt source unchanged'
    $workMain = Join-Path $combinedWorkRoot "$combinedReleaseRelative\waggle.exe"
    $workDependency = Join-Path `
      $combinedWorkRoot "$combinedReleaseRelative\deps\waggle.exe"
    Assert-ApprovedHardLinkTopology `
      $workMain (Join-Path $combinedWorkRoot $combinedReleaseRelative)
    $workLinks = @(Get-HardLinkPaths $workMain)
    if ($workLinks.Count -ne 2 -or $workLinks -notcontains $workMain -or
        $workLinks -notcontains $workDependency -or
        $workLinks -contains $combinedMain -or $workLinks -contains $combinedDependency) {
      throw 'Work copy did not create a destination-local Cargo hard-link pair.'
    }
    $passed++
    $combinedWorkLease = Open-WaggleValidatedPrebuiltTree `
      -Root $combinedWorkRoot -ExpectedInventory $combinedInventory `
      -Label 'Combined mutable private work tree' `
      -MutablePaths @($workMain, $workDependency) `
      -CargoReleaseRelativePath $combinedReleaseRelative
    try {
      $writeProbe = [IO.File]::Open(
        $workMain,
        [IO.FileMode]::Open,
        [IO.FileAccess]::Write,
        [IO.FileShare]::None
      )
      $writeProbe.Dispose()
      Assert-Throws {
        $writeProbe = [IO.File]::Open(
          (Join-Path $combinedWorkRoot 'resources\service.js'),
          [IO.FileMode]::Open,
          [IO.FileAccess]::Write,
          [IO.FileShare]::None
        )
        $writeProbe.Dispose()
      } 'used by another process|cannot access|being used|denied' `
        'private work tree locks immutable resources while Cargo pair stays mutable'
    } finally {
      Close-PrebuiltTreeLease $combinedWorkLease
    }
  } finally {
    Close-PrebuiltTreeLease $combinedSourceLease
    if (Test-Path -LiteralPath $combinedWorkRoot) {
      [IO.Directory]::Delete($combinedWorkRoot, $true)
    }
  }

  $resourcesInventory = New-WagglePrebuiltInventory `
    -Root (Join-Path $seedRoot 'resources')
  $hostedReceiptPath = Join-Path $prebuiltFixtureRoot 'build-receipt.json'
  $hostedReceipt = [pscustomobject][ordered]@{
    schemaVersion = 1
    repository = 'marolinik/waggle-os'
    sourceRevision = 'a' * 40
    targetTriple = 'x86_64-pc-windows-msvc'
    targetInventory = $expectedInventory
    resourcesInventory = $resourcesInventory
    checker = [pscustomobject]@{ exitCode = 0; sha256 = 'A' * 64 }
  }
  Write-JsonNoBom $hostedReceiptPath $hostedReceipt
  $hostedReceiptLease = Get-WaggleHostedBuildReceipt `
    $hostedReceiptPath (Get-Sha256 $hostedReceiptPath) ('a' * 40)
  $hostedReceiptLease.Lock.Dispose()
  $passed++
  $mismatchedReceipt = $hostedReceipt | ConvertTo-Json -Depth 32 |
    ConvertFrom-Json -Depth 32 -DateKind String
  $mismatchedReceipt.resourcesInventory.entries[0].sha256 = 'B' * 64
  $mismatchedReceipt.resourcesInventory.sha256 = Get-WaggleInventorySha256 `
    @($mismatchedReceipt.resourcesInventory.entries)
  Write-JsonNoBom $hostedReceiptPath $mismatchedReceipt
  Assert-Throws {
    Get-WaggleHostedBuildReceipt `
      $hostedReceiptPath (Get-Sha256 $hostedReceiptPath) ('a' * 40)
  } 'resource projection.*does not match' `
    'hosted receipt rejects independently valid mismatched resource inventory'

  $payloadProjection = @(
    [pscustomobject]@{ path = 'waggle.exe'; size = 128; sha256 = 'C' * 64 },
    [pscustomobject]@{
      path = 'resources\data.bin'
      size = [long]$resourcesInventory.entries[0].size
      sha256 = [string]$resourcesInventory.entries[0].sha256
    }
  )
  Assert-WaggleUnsignedPayloadResourceProjection `
    $payloadProjection $resourcesInventory
  $passed++
  $tamperedPayloadProjection = $payloadProjection | ConvertTo-Json -Depth 8 |
    ConvertFrom-Json -Depth 8 -DateKind String
  $tamperedPayloadProjection[1].sha256 = 'D' * 64
  Assert-Throws {
    Assert-WaggleUnsignedPayloadResourceProjection `
      $tamperedPayloadProjection $resourcesInventory
  } 'resource projection.*does not match' `
    'unsigned payload rejects resource digest mismatch against build receipt'

  $preflightSigningRoot = Join-Path $prebuiltFixtureRoot 'preflight-signing'
  $preflightUnsignedRoot = Join-Path $prebuiltFixtureRoot 'preflight-unsigned'
  $preflightRelative = 'resources\service.js'
  $preflightSigningPath = Join-Path $preflightSigningRoot $preflightRelative
  $preflightUnsignedPath = Join-Path $preflightUnsignedRoot $preflightRelative
  [IO.Directory]::CreateDirectory((Split-Path $preflightSigningPath -Parent)) | Out-Null
  [IO.Directory]::CreateDirectory((Split-Path $preflightUnsignedPath -Parent)) | Out-Null
  [IO.File]::WriteAllText($preflightSigningPath, 'signing-copy')
  [IO.File]::WriteAllText($preflightUnsignedPath, 'unsigned-copy')
  Assert-Equal `
    (Resolve-WagglePreflightFixedPath `
      $preflightSigningPath $preflightSigningRoot $preflightUnsignedRoot) `
    ([IO.Path]::GetFullPath($preflightUnsignedPath)) `
    'manifest preflight resolves same relative path from unsigned work tree'
  Assert-Throws {
    Resolve-WagglePreflightFixedPath `
      (Join-Path $prebuiltFixtureRoot 'outside.bin') `
      $preflightSigningRoot $preflightUnsignedRoot
  } 'escaped.*signing target root' 'manifest preflight rejects signing-root escape'

  $rollbackRoot = Join-Path $prebuiltFixtureRoot 'rollback'
  $rollbackDependency = Join-Path $rollbackRoot 'release\deps\waggle.exe'
  $rollbackMain = Join-Path $rollbackRoot 'release\waggle.exe'
  [IO.Directory]::CreateDirectory((Split-Path $rollbackDependency -Parent)) | Out-Null
  New-SyntheticPe $rollbackDependency 101
  New-Item -ItemType HardLink -Path $rollbackMain -Target $rollbackDependency | Out-Null
  $expectedOriginalSha256 = Get-Sha256 $rollbackMain
  $expectedHardLinkPaths = @(Get-HardLinkPaths $rollbackMain)
  $replacement = Join-Path $rollbackRoot 'signed-replacement.exe'
  $backup = Join-Path $rollbackRoot 'original.backup'
  New-SyntheticPe $replacement 102
  [IO.File]::Replace($replacement, $rollbackMain, $backup, $true)
  if ((Get-Sha256 $rollbackMain) -ceq $expectedOriginalSha256) {
    throw 'Rollback test fixture did not replace the original artifact.'
  }
  $passed++
  Restore-WaggleReplacedArtifact `
    -ArtifactPath $rollbackMain -BackupPath $backup `
    -ExpectedOriginalSha256 $expectedOriginalSha256 `
    -ExpectedHardLinkPaths $expectedHardLinkPaths
  Assert-Equal (Get-Sha256 $rollbackMain) $expectedOriginalSha256 'rollback restores exact main bytes'
  Assert-Equal (Get-Sha256 $rollbackDependency) $expectedOriginalSha256 'rollback preserves exact dependency bytes'
  Assert-ApprovedHardLinkTopology `
    $rollbackMain (Join-Path $rollbackRoot 'release')
  $passed++

  $regularRollbackArtifact = Join-Path $rollbackRoot 'regular-artifact.dll'
  $regularRollbackReplacement = Join-Path $rollbackRoot 'regular-replacement.dll'
  $regularRollbackBackup = Join-Path $rollbackRoot 'regular.backup'
  New-SyntheticPe $regularRollbackArtifact 106
  New-SyntheticPe $regularRollbackReplacement 107
  $regularOriginalHash = Get-Sha256 $regularRollbackArtifact
  [IO.File]::Replace(
    $regularRollbackReplacement,
    $regularRollbackArtifact,
    $regularRollbackBackup,
    $true
  )
  Restore-WaggleReplacedArtifact `
    -ArtifactPath $regularRollbackArtifact -BackupPath $regularRollbackBackup `
    -ExpectedOriginalSha256 $regularOriginalHash `
    -ExpectedHardLinkPaths @($regularRollbackArtifact)
  Assert-Equal `
    (Get-Sha256 $regularRollbackArtifact) $regularOriginalHash `
    'rollback restores exact regular-artifact bytes'

  $missingBackupArtifact = Join-Path $rollbackRoot 'missing-backup-artifact.exe'
  $missingBackup = Join-Path $rollbackRoot 'missing.backup'
  New-SyntheticPe $missingBackupArtifact 103
  $missingArtifactHash = Get-Sha256 $missingBackupArtifact
  Assert-Throws {
    Restore-WaggleReplacedArtifact `
      -ArtifactPath $missingBackupArtifact -BackupPath $missingBackup `
      -ExpectedOriginalSha256 ('0' * 64) `
      -ExpectedHardLinkPaths @($missingBackupArtifact)
  } 'backup.*missing|does not exist' 'rollback missing-backup rejection'
  Assert-Equal `
    (Get-Sha256 $missingBackupArtifact) $missingArtifactHash `
    'missing rollback backup leaves replacement unchanged'

  $corruptBackupArtifact = Join-Path $rollbackRoot 'corrupt-backup-artifact.exe'
  $corruptBackup = Join-Path $rollbackRoot 'corrupt.backup'
  New-SyntheticPe $corruptBackupArtifact 104
  New-SyntheticPe $corruptBackup 105
  $corruptArtifactHash = Get-Sha256 $corruptBackupArtifact
  Assert-Throws {
    Restore-WaggleReplacedArtifact `
      -ArtifactPath $corruptBackupArtifact -BackupPath $corruptBackup `
      -ExpectedOriginalSha256 ('0' * 64) `
      -ExpectedHardLinkPaths @($corruptBackupArtifact)
  } 'backup.*SHA-256|backup.*digest|original.*digest' 'rollback corrupt-backup rejection'
  Assert-Equal `
    (Get-Sha256 $corruptBackupArtifact) $corruptArtifactHash `
    'corrupt rollback backup leaves replacement unchanged'

  Assert-Throws {
    Open-WaggleValidatedPrebuiltTree `
      -Root $seedRoot -ExpectedInventory $expectedInventory `
      -Label 'Overlapping prebuilt tree' -DisallowedRoots @($prebuiltFixtureRoot)
  } 'overlap|disallowed root|must be distinct' 'prebuilt tree root-overlap rejection'
} finally {
  if ($null -ne $reparseDirectory -and (Test-Path -LiteralPath $reparseDirectory)) {
    [IO.Directory]::Delete($reparseDirectory)
  }
  if (Test-Path -LiteralPath $prebuiltFixtureRoot) {
    [IO.Directory]::Delete($prebuiltFixtureRoot, $true)
  }
}

$sessionFixtureRoot = Join-Path `
  ([IO.Path]::GetTempPath()) `
  "waggle-signing-session-$([Guid]::NewGuid().ToString('N'))"
$environmentNames = @(
  'WAGGLE_SIGNING_MANIFEST_PATH', 'WAGGLE_SIGNING_MANIFEST_SHA256',
  'WAGGLE_SIGNING_SESSION_ID', 'CARGO_TARGET_DIR', 'TEMP', 'TMP',
  'WAGGLE_NSIS_SIGNING_TEMP_ROOT', 'NODE_OPTIONS', 'NODE_PATH',
  'WAGGLE_SIGNING_PORTABLE_TOOLCHAIN_ROOT',
  'WAGGLE_SIGNING_PORTABLE_NODE_PATH',
  'WAGGLE_SIGNING_PORTABLE_GIT_PATH',
  'WAGGLE_SIGNING_PORTABLE_SEVEN_ZIP_PATH',
  'NAPI_RS_NATIVE_LIBRARY_PATH', 'NAPI_RS_FORCE_WASI',
  'npm_config_node_options', 'TARGET_ARCH'
)
$savedEnvironment = @{}
foreach ($name in $environmentNames) {
  $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name)
}
try {
  $sessionId = '0123456789abcdef0123456789abcdef'
  $tauriRoot = Join-Path $sessionFixtureRoot 'app\src-tauri'
  $resourcesRoot = Join-Path $tauriRoot 'resources'
  $targetRoot = New-PrivateDirectory `
    (Join-Path $tauriRoot "target\.signing-builds\run-$sessionId")
  $releaseRoot = Join-Path $targetRoot 'x86_64-pc-windows-msvc\release'
  [IO.Directory]::CreateDirectory($resourcesRoot) | Out-Null
  [IO.File]::WriteAllText((Join-Path $resourcesRoot 'service.js'), 'sidecar')
  [IO.Directory]::CreateDirectory($releaseRoot) | Out-Null
  $sessionDirectory = New-PrivateDirectory `
    (Join-Path $tauriRoot "target\.signing-sessions\run-$sessionId")
  $tempRoot = New-PrivateDirectory `
    (Join-Path $tauriRoot "target\.signing-temp\run-$sessionId")
  $configPath = Join-Path $tauriRoot 'tauri.conf.json'
  $overridePath = Join-Path $sessionDirectory 'tauri.signing-override.json'
  Write-JsonNoBom $configPath ([ordered]@{ version = '0.2.0' })
  Write-WaggleSigningOverride `
    $overridePath $wrapperPath $resourcesRoot | Out-Null
  $unsignedOverride = Get-Content -Raw $overridePath | ConvertFrom-Json -Depth 16
  Assert-Equal $unsignedOverride.bundle.targets[0] 'nsis' 'unsigned preflight targets NSIS only'
  Assert-Equal $unsignedOverride.build.beforeBuildCommand '' 'unsigned preflight disables nested build'
  Assert-Equal $unsignedOverride.build.beforeBundleCommand '' 'unsigned preflight disables nested bundle hook'
  $unsignedResourceMap = @($unsignedOverride.bundle.resources.PSObject.Properties)
  Assert-Equal $unsignedResourceMap.Count 1 'unsigned override maps one complete resource tree'
  Assert-Equal `
    ([IO.Path]::GetFullPath([string]$unsignedResourceMap[0].Name)) `
    ([IO.Path]::GetFullPath($resourcesRoot)) `
    'unsigned override resource source'
  Assert-Equal ([string]$unsignedResourceMap[0].Value) 'resources' `
    'unsigned override resource destination'
  if ($null -ne $unsignedOverride.bundle.windows.PSObject.Properties['signCommand']) {
    throw 'Unsigned preflight override unexpectedly contains a signing command.'
  }
  $passed++
  Write-WaggleSigningOverride `
    $overridePath $wrapperPath $resourcesRoot -EnableSigning | Out-Null
  $signedOverride = Get-Content -Raw $overridePath | ConvertFrom-Json -Depth 16
  Assert-Equal $signedOverride.bundle.windows.signCommand.cmd `
    $SystemPowerShellPath 'signed override uses canonical bootstrap host'
  Assert-Equal `
    (@($signedOverride.bundle.windows.signCommand.args | Where-Object { $_ -ceq '%1' }).Count) `
    1 'signed override contains one artifact placeholder'
  Assert-Equal $signedOverride.build.beforeBundleCommand '' 'signed override disables nested bundle hook'
  $invalidOverride = $signedOverride | ConvertTo-Json -Depth 16 |
    ConvertFrom-Json -Depth 16
  $invalidOverride.bundle.resources = [ordered]@{
    (Join-Path $resourcesRoot 'native') = 'resources'
  }
  Write-JsonNoBom $overridePath $invalidOverride
  Assert-Throws {
    Assert-WaggleSigningOverrideContract `
      $overridePath $wrapperPath $resourcesRoot
  } 'exact receipt-bound resource tree' `
    'signed override rejects receipt resource subroot substitution'
  Write-WaggleSigningOverride `
    $overridePath $wrapperPath $resourcesRoot -EnableSigning | Out-Null

  $toolDirectory = Join-Path $sessionFixtureRoot 'tools'
  [IO.Directory]::CreateDirectory($toolDirectory) | Out-Null
  $toolNames = @(
    'wrapper.ps1', 'tauri.js', 'tauri-main.js', 'tauri-index.js',
    'tauri-package.json', 'tauri-native-package.json', 'tauri-native.node',
    'vite.js', 'vite-package.json', 'bundle-node.mjs', 'build-sidecar.mjs',
    'bundle-native-deps.mjs', 'stage-sidecar-deps.mjs', 'makensis.exe',
    'git.exe', 'git-runtime.exe', 'node.exe', 'npm-cli.js', '7z.exe', 'signtool.exe',
    'artifact-signing.nupkg'
  )
  $toolPaths = @{}
  foreach ($toolName in $toolNames) {
    $toolPath = Join-Path $toolDirectory $toolName
    [IO.File]::WriteAllText($toolPath, "fixture:$toolName")
    $toolPaths[$toolName] = $toolPath
  }

  $context = [pscustomobject]@{
    RepoRoot = $sessionFixtureRoot
    AppRoot = Join-Path $sessionFixtureRoot 'app'
    TauriRoot = $tauriRoot
    ResourcesRoot = $resourcesRoot
    TargetRoot = $targetRoot
    ReleaseRoot = $releaseRoot
    ConfigPath = $configPath
    OverrideConfigPath = $overridePath
    WrapperPath = $wrapperPath
    TauriCliPath = $toolPaths['tauri.js']
    TauriCliPackagePath = $toolPaths['tauri-package.json']
    TauriCliMainPath = $toolPaths['tauri-main.js']
    TauriCliIndexPath = $toolPaths['tauri-index.js']
    TauriNativePackagePath = $toolPaths['tauri-native-package.json']
    TauriNativeBinaryPath = $toolPaths['tauri-native.node']
    ViteCliPath = $toolPaths['vite.js']
    VitePackagePath = $toolPaths['vite-package.json']
    WebRoot = Join-Path $sessionFixtureRoot 'apps\web'
    BuildScriptPaths = [ordered]@{
      bundleNode = $toolPaths['bundle-node.mjs']
      buildSidecar = $toolPaths['build-sidecar.mjs']
      bundleNativeDeps = $toolPaths['bundle-native-deps.mjs']
      stageSidecarDeps = $toolPaths['stage-sidecar-deps.mjs']
    }
    MakensisPath = $toolPaths['makensis.exe']
    GitPath = $toolPaths['git.exe']
    GitRuntimePath = $toolPaths['git-runtime.exe']
    PortableToolchainRoot = $null
    NodePath = $toolPaths['node.exe']
    NpmCliPath = $toolPaths['npm-cli.js']
    SevenZipPath = $toolPaths['7z.exe']
    SevenZipDllPath = $toolPaths['7z.exe']
    SignToolPath = $toolPaths['signtool.exe']
    ArtifactSigningPackagePath = $toolPaths['artifact-signing.nupkg']
    SourceRevision = 'a' * 40
    TauriCliVersion = '2.10.1'
    TauriCliSha256 = Get-Sha256 $toolPaths['tauri.js']
    TauriCliPackageSha256 = Get-Sha256 $toolPaths['tauri-package.json']
    TauriCliMainSha256 = Get-Sha256 $toolPaths['tauri-main.js']
    TauriCliIndexSha256 = Get-Sha256 $toolPaths['tauri-index.js']
    TauriNativePackageSha256 = Get-Sha256 $toolPaths['tauri-native-package.json']
    TauriNativeBinarySha256 = Get-Sha256 $toolPaths['tauri-native.node']
    ViteCliSha256 = Get-Sha256 $toolPaths['vite.js']
    VitePackageSha256 = Get-Sha256 $toolPaths['vite-package.json']
    ViteVersion = '6.4.3'
    BuildScriptHashes = [ordered]@{
      bundleNode = Get-Sha256 $toolPaths['bundle-node.mjs']
      buildSidecar = Get-Sha256 $toolPaths['build-sidecar.mjs']
      bundleNativeDeps = Get-Sha256 $toolPaths['bundle-native-deps.mjs']
      stageSidecarDeps = Get-Sha256 $toolPaths['stage-sidecar-deps.mjs']
    }
    MakensisSha256 = Get-Sha256 $toolPaths['makensis.exe']
    GitSha256 = Get-Sha256 $toolPaths['git.exe']
    GitRuntimeSha256 = Get-Sha256 $toolPaths['git-runtime.exe']
    NodeSha256 = Get-Sha256 $toolPaths['node.exe']
    NpmCliSha256 = Get-Sha256 $toolPaths['npm-cli.js']
    SevenZipSha256 = Get-Sha256 $toolPaths['7z.exe']
    SevenZipDllSha256 = Get-Sha256 $toolPaths['7z.exe']
    SignToolSha256 = Get-Sha256 $toolPaths['signtool.exe']
    ArtifactSigningPackageSha256 = Get-Sha256 $toolPaths['artifact-signing.nupkg']
    ArtifactSigningX64ManifestSha256 = 'B' * 64
  }
  $fixedPaths = @(Get-ExpectedNsisFixedPaths $context '0.2.0')
  $packagedPaths = @(Get-ExpectedNsisPackagedPaths)
  $slots = [Collections.Generic.List[object]]::new()
  for ($index = 0; $index -lt $fixedPaths.Count; $index++) {
    New-SyntheticPe $fixedPaths[$index] ([byte]($index + 1))
    $slots.Add([pscustomobject][ordered]@{
      id = 'fixed-{0:d2}' -f ($index + 1)
      order = $index + 1
      kind = 'fixed'
      maxUses = 1
      path = $fixedPaths[$index]
      packagedPath = $packagedPaths[$index]
      preSignSha256 = Get-Sha256 $fixedPaths[$index]
    })
  }
  $slots.Add([pscustomobject][ordered]@{
    id = 'nsis-uninstaller'
    order = 13
    kind = 'generated-nsis-uninstaller'
    maxUses = 1
    pathPattern = $NsisUninstallerPattern
    evidencePath = Join-Path $sessionDirectory 'signed-evidence\13-nsis-uninstaller.exe'
  })
  $slots.Add([pscustomobject][ordered]@{
    id = 'nsis-installer'
    order = 14
    kind = 'generated-nsis-installer'
    maxUses = 1
    path = Join-Path $releaseRoot 'bundle\nsis\Waggle_0.2.0_x64-setup.exe'
  })

  $manifestPath = Join-Path $sessionDirectory 'manifest.json'
  $ledgerPath = Join-Path $sessionDirectory 'callback-ledger.json'
  $baseManifest = [pscustomobject][ordered]@{
    schemaVersion = 1
    mode = 'nsis'
    sessionId = $sessionId
    sourceRevision = $context.SourceRevision
    createdAtUtc = [DateTimeOffset]::UtcNow.AddMinutes(-1).ToString('O')
    expiresAtUtc = [DateTimeOffset]::UtcNow.AddHours(1).ToString('O')
    repoRoot = $context.RepoRoot
    tauriRoot = $tauriRoot
    targetRoot = $targetRoot
    releaseRoot = $releaseRoot
    resourcesRoot = $resourcesRoot
    tempRoot = $tempRoot
    ledgerPath = $ledgerPath
    appVersion = '0.2.0'
    payloads = @(
      [pscustomobject]@{ path = 'waggle.exe'; sha256 = '1' * 64; size = 128 }
    ) + @(1..9 | ForEach-Object {
      [pscustomobject]@{ path = "resources\fixture-$_.bin"; sha256 = '2' * 64; size = $_ }
    })
    toolchain = [pscustomobject][ordered]@{
      wrapperPath = $context.WrapperPath
      wrapperSha256 = Get-Sha256 $context.WrapperPath
      tauriConfigPath = $configPath
      tauriConfigSha256 = Get-Sha256 $configPath
      tauriOverrideConfigPath = $overridePath
      tauriOverrideConfigSha256 = Get-Sha256 $overridePath
      tauriCliPath = $context.TauriCliPath
      tauriCliSha256 = $context.TauriCliSha256
      tauriCliPackagePath = $context.TauriCliPackagePath
      tauriCliPackageSha256 = $context.TauriCliPackageSha256
      tauriCliMainPath = $context.TauriCliMainPath
      tauriCliMainSha256 = $context.TauriCliMainSha256
      tauriCliIndexPath = $context.TauriCliIndexPath
      tauriCliIndexSha256 = $context.TauriCliIndexSha256
      tauriNativePackagePath = $context.TauriNativePackagePath
      tauriNativePackageSha256 = $context.TauriNativePackageSha256
      tauriNativeBinaryPath = $context.TauriNativeBinaryPath
      tauriNativeBinarySha256 = $context.TauriNativeBinarySha256
      tauriCliVersion = $context.TauriCliVersion
      viteCliPath = $context.ViteCliPath
      viteCliSha256 = $context.ViteCliSha256
      vitePackagePath = $context.VitePackagePath
      vitePackageSha256 = $context.VitePackageSha256
      viteVersion = $context.ViteVersion
      buildScripts = [pscustomobject][ordered]@{
        bundleNode = [pscustomobject]@{ path = $context.BuildScriptPaths.bundleNode; sha256 = $context.BuildScriptHashes.bundleNode }
        buildSidecar = [pscustomobject]@{ path = $context.BuildScriptPaths.buildSidecar; sha256 = $context.BuildScriptHashes.buildSidecar }
        bundleNativeDeps = [pscustomobject]@{ path = $context.BuildScriptPaths.bundleNativeDeps; sha256 = $context.BuildScriptHashes.bundleNativeDeps }
        stageSidecarDeps = [pscustomobject]@{ path = $context.BuildScriptPaths.stageSidecarDeps; sha256 = $context.BuildScriptHashes.stageSidecarDeps }
      }
      makensisPath = $context.MakensisPath
      makensisSha256 = $context.MakensisSha256
      gitPath = $context.GitPath
      gitSha256 = $context.GitSha256
      gitRuntimePath = $context.GitRuntimePath
      gitRuntimeSha256 = $context.GitRuntimeSha256
      nodePath = $context.NodePath
      nodeSha256 = $context.NodeSha256
      npmCliPath = $context.NpmCliPath
      npmCliSha256 = $context.NpmCliSha256
      sevenZipPath = $context.SevenZipPath
      sevenZipSha256 = $context.SevenZipSha256
      signToolPath = $context.SignToolPath
      signToolSha256 = $context.SignToolSha256
      artifactSigningPackagePath = $context.ArtifactSigningPackagePath
      artifactSigningPackageSha256 = $context.ArtifactSigningPackageSha256
      artifactSigningX64ManifestSha256 = $context.ArtifactSigningX64ManifestSha256
    }
    slots = @($slots)
  }
  $writeSessionFixture = {
    param([object]$Manifest)
    Write-JsonNoBom $manifestPath $Manifest
    $manifestHash = Get-Sha256 $manifestPath
    Write-JsonNoBom $ledgerPath (New-PendingLedger $sessionId $manifestHash $Manifest.slots)
    $env:WAGGLE_SIGNING_MANIFEST_SHA256 = $manifestHash
    return $manifestHash
  }

  $env:WAGGLE_SIGNING_MANIFEST_PATH = $manifestPath
  $env:WAGGLE_SIGNING_SESSION_ID = $sessionId
  $env:CARGO_TARGET_DIR = $targetRoot
  $env:TEMP = $tempRoot
  $env:TMP = $tempRoot
  $env:WAGGLE_NSIS_SIGNING_TEMP_ROOT = $tempRoot
  [void](& $writeSessionFixture $baseManifest)

  $loadedSession = Get-WaggleSigningSession $context
  try {
    Assert-Equal $loadedSession.Id $sessionId 'valid manifest session load'
    foreach ($lockedPath in @(
        $context.TauriCliMainPath,
        $context.TauriCliIndexPath,
        $context.TauriNativeBinaryPath
      )) {
      Assert-Throws {
        $writeProbe = [IO.File]::Open(
          $lockedPath,
          [IO.FileMode]::Open,
          [IO.FileAccess]::Write,
          [IO.FileShare]::None
        )
        $writeProbe.Dispose()
      } 'used by another process|cannot access' 'loaded session locks complete Tauri runtime closure'
    }
  } finally {
    foreach ($lock in $loadedSession.Locks) { $lock.Dispose() }
  }

  $portableContext = $context | Select-Object *
  $portableContext.PortableToolchainRoot = $toolDirectory
  $portableContext | Add-Member `
    -NotePropertyName PortableToolchainReceiptPath `
    -NotePropertyValue $toolPaths['artifact-signing.nupkg']
  $portableContext | Add-Member `
    -NotePropertyName PortableToolchainReceiptSha256 `
    -NotePropertyValue (Get-Sha256 $toolPaths['artifact-signing.nupkg'])
  $portableContext | Add-Member `
    -NotePropertyName PortableToolchainInventorySha256 `
    -NotePropertyValue $PortableToolchainInventorySha256
  $portableContext | Add-Member `
    -NotePropertyName PortableToolchainLocks `
    -NotePropertyValue ([Collections.Generic.List[IDisposable]]::new())
  $portableContext.SevenZipDllPath = $toolPaths['7z.exe']
  $portableContext.SevenZipDllSha256 = Get-Sha256 $toolPaths['7z.exe']
  $portableManifest = $baseManifest | ConvertTo-Json -Depth 32 |
    ConvertFrom-Json -Depth 32 -DateKind String
  $portableManifest | Add-Member -NotePropertyName buildReceipt -NotePropertyValue (
    [pscustomobject]@{
      schemaVersion = 1
      repository = 'marolinik/waggle-os'
      sourceRevision = $context.SourceRevision
      targetTriple = 'x86_64-pc-windows-msvc'
    }
  )
  $portableManifest.toolchain | Add-Member `
    -NotePropertyName portableToolchainRoot -NotePropertyValue $toolDirectory
  $portableManifest.toolchain | Add-Member `
    -NotePropertyName sevenZipDllPath -NotePropertyValue $portableContext.SevenZipDllPath
  $portableManifest.toolchain | Add-Member `
    -NotePropertyName sevenZipDllSha256 -NotePropertyValue $portableContext.SevenZipDllSha256
  $portableManifest.toolchain | Add-Member `
    -NotePropertyName portableToolchainReceiptPath `
    -NotePropertyValue $portableContext.PortableToolchainReceiptPath
  $portableManifest.toolchain | Add-Member `
    -NotePropertyName portableToolchainReceiptSha256 `
    -NotePropertyValue $portableContext.PortableToolchainReceiptSha256
  $portableManifest.toolchain | Add-Member `
    -NotePropertyName portableToolchainInventorySha256 `
    -NotePropertyValue $PortableToolchainInventorySha256
  $portableManifest.toolchain | Add-Member `
    -NotePropertyName portableToolchainFileCount `
    -NotePropertyValue $PortableToolchainFileCount
  $env:WAGGLE_SIGNING_PORTABLE_TOOLCHAIN_ROOT = $toolDirectory
  $env:WAGGLE_SIGNING_PORTABLE_NODE_PATH = $context.NodePath
  $env:WAGGLE_SIGNING_PORTABLE_GIT_PATH = $context.GitPath
  $env:WAGGLE_SIGNING_PORTABLE_SEVEN_ZIP_PATH = $context.SevenZipPath
  $env:WAGGLE_SIGNING_PORTABLE_RECEIPT_PATH = `
    $portableContext.PortableToolchainReceiptPath
  $env:WAGGLE_SIGNING_PORTABLE_RECEIPT_SHA256 = `
    $portableContext.PortableToolchainReceiptSha256
  [void](& $writeSessionFixture $portableManifest)
  $portableSession = Get-WaggleSigningSession $portableContext
  try {
    Assert-Equal $portableSession.Id $sessionId `
      'receipt-bound portable manifest session load'
  } finally {
    foreach ($lock in $portableSession.Locks) { $lock.Dispose() }
  }

  $wrongPortableRootManifest = $portableManifest | ConvertTo-Json -Depth 32 |
    ConvertFrom-Json -Depth 32 -DateKind String
  $wrongPortableRootManifest.toolchain.portableToolchainRoot = `
    Join-Path $sessionFixtureRoot 'substituted-tools'
  [void](& $writeSessionFixture $wrongPortableRootManifest)
  Assert-Throws {
    Get-WaggleSigningSession $portableContext
  } 'Portable signing toolchain root does not match' `
    'portable manifest root substitution rejection'

  $wrongPortableHashManifest = $portableManifest | ConvertTo-Json -Depth 32 |
    ConvertFrom-Json -Depth 32 -DateKind String
  $wrongPortableHashManifest.toolchain.sevenZipDllSha256 = '0' * 64
  [void](& $writeSessionFixture $wrongPortableHashManifest)
  Assert-Throws {
    Get-WaggleSigningSession $portableContext
  } '7-Zip runtime library manifest SHA-256' `
    'portable manifest closure digest substitution rejection'

  [void](& $writeSessionFixture $portableManifest)
  $env:WAGGLE_SIGNING_PORTABLE_NODE_PATH = $context.GitPath
  Assert-Throws {
    Get-WaggleSigningSession $portableContext
  } 'WAGGLE_SIGNING_PORTABLE_NODE_PATH does not match' `
    'portable callback environment substitution rejection'
  $env:WAGGLE_SIGNING_PORTABLE_NODE_PATH = $context.NodePath

  $unboundPortableManifest = $portableManifest | ConvertTo-Json -Depth 32 |
    ConvertFrom-Json -Depth 32 -DateKind String
  $unboundPortableManifest.PSObject.Properties.Remove('buildReceipt')
  [void](& $writeSessionFixture $unboundPortableManifest)
  Assert-Throws {
    Get-WaggleSigningSession $portableContext
  } 'missing required property.*buildReceipt' `
    'portable callback without hosted receipt rejection'

  foreach ($portableEnvironmentName in @(
      'WAGGLE_SIGNING_PORTABLE_TOOLCHAIN_ROOT',
      'WAGGLE_SIGNING_PORTABLE_NODE_PATH',
      'WAGGLE_SIGNING_PORTABLE_GIT_PATH',
      'WAGGLE_SIGNING_PORTABLE_SEVEN_ZIP_PATH',
      'WAGGLE_SIGNING_PORTABLE_RECEIPT_PATH',
      'WAGGLE_SIGNING_PORTABLE_RECEIPT_SHA256'
    )) {
    [Environment]::SetEnvironmentVariable($portableEnvironmentName, $null)
  }
  [void](& $writeSessionFixture $baseManifest)

  $validManifestHash = $env:WAGGLE_SIGNING_MANIFEST_SHA256
  $env:WAGGLE_SIGNING_MANIFEST_SHA256 = '0' * 64
  Assert-Throws {
    Get-WaggleSigningSession $context
  } 'manifest does not match.*SHA256|manifest.*WAGGLE_SIGNING_MANIFEST_SHA256' 'wrong manifest digest rejection'
  $env:WAGGLE_SIGNING_MANIFEST_SHA256 = $validManifestHash

  $unsupportedManifest = $baseManifest | ConvertTo-Json -Depth 32 |
    ConvertFrom-Json -Depth 32 -DateKind String
  $unsupportedManifest.mode = 'msi'
  [void](& $writeSessionFixture $unsupportedManifest)
  Assert-Throws {
    Get-WaggleSigningSession $context
  } 'NSIS-only' 'unsupported manifest mode rejection'

  $expiredManifest = $baseManifest | ConvertTo-Json -Depth 32 |
    ConvertFrom-Json -Depth 32 -DateKind String
  $expiredManifest.createdAtUtc = [DateTimeOffset]::UtcNow.AddHours(-2).ToString('O')
  $expiredManifest.expiresAtUtc = [DateTimeOffset]::UtcNow.AddHours(-1).ToString('O')
  [void](& $writeSessionFixture $expiredManifest)
  Assert-Throws {
    Get-WaggleSigningSession $context
  } 'expired|four-hour' 'expired manifest rejection'

  $wrongToolManifest = $baseManifest | ConvertTo-Json -Depth 32 |
    ConvertFrom-Json -Depth 32 -DateKind String
  $wrongToolManifest.toolchain.wrapperSha256 = '0' * 64
  [void](& $writeSessionFixture $wrongToolManifest)
  Assert-Throws {
    Get-WaggleSigningSession $context
  } 'wrapper.*SHA-256' 'wrong wrapper digest rejection'

  $wrongNativeManifest = $baseManifest | ConvertTo-Json -Depth 32 |
    ConvertFrom-Json -Depth 32 -DateKind String
  $wrongNativeManifest.toolchain.tauriNativeBinarySha256 = '0' * 64
  [void](& $writeSessionFixture $wrongNativeManifest)
  Assert-Throws {
    Get-WaggleSigningSession $context
  } 'native CLI binary.*SHA-256|native CLI binary.*digest' 'wrong Tauri native digest rejection'

  Write-JsonNoBom $overridePath ([ordered]@{
    build = @{ beforeBuildCommand = '' }
    bundle = @{ active = $true; targets = @('msi'); windows = @{
      signCommand = @{ cmd = $SystemPowerShellPath; args = @(
        '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', $wrapperPath, '-ArtifactPath', '%1'
      ) }
    } }
  })
  $wrongOverrideManifest = $baseManifest | ConvertTo-Json -Depth 32 |
    ConvertFrom-Json -Depth 32 -DateKind String
  $wrongOverrideManifest.toolchain.tauriOverrideConfigSha256 = Get-Sha256 $overridePath
  [void](& $writeSessionFixture $wrongOverrideManifest)
  Assert-Throws {
    Get-WaggleSigningSession $context
  } 'NSIS-only callback contract' 'MSI signing override rejection'
  Write-WaggleSigningOverride $overridePath $wrapperPath -EnableSigning | Out-Null

  [void](& $writeSessionFixture $baseManifest)
  $env:TEMP = Join-Path $sessionFixtureRoot 'wrong-temp'
  Assert-Throws {
    Get-WaggleSigningSession $context
  } 'TEMP path does not match' 'cross-session TEMP rejection'
  $env:TEMP = $tempRoot

  [void](& $writeSessionFixture $baseManifest)
  $legacyLedger = [pscustomobject]@{
    schemaVersion = 1
    sessionId = $sessionId
    manifestSha256 = $env:WAGGLE_SIGNING_MANIFEST_SHA256
    nextOrder = 1
    entries = @()
  }
  Assert-Throws {
    Assert-WaggleSigningLedgerState `
      ([pscustomobject]@{
        Id = $sessionId
        ManifestSha256 = $env:WAGGLE_SIGNING_MANIFEST_SHA256
        Manifest = $baseManifest
        TempRoot = $tempRoot
      }) `
      $legacyLedger
  } 'active manifest session|schemaVersion' 'legacy empty ledger rejection'

  $lifecycleDirectory = New-PrivateDirectory (Join-Path $sessionFixtureRoot 'lifecycle')
  $lifecycleTemp = New-PrivateDirectory (Join-Path $lifecycleDirectory 'temp')
  $lifecycleSlots = [Collections.Generic.List[object]]::new()
  $signedHost = Get-TrustedPath (Get-Process -Id $PID).Path 'Signed lifecycle host' -AllowHardLink
  for ($index = 0; $index -lt 14; $index++) {
    $path = if ($index -eq 0) {
      $signedHost
    } else {
      $candidate = Join-Path $lifecycleDirectory "slot-$($index + 1).exe"
      New-SyntheticPe $candidate ([byte]($index + 20))
      $candidate
    }
    $lifecycleSlots.Add([pscustomobject][ordered]@{
      id = 'lifecycle-{0:d2}' -f ($index + 1)
      order = $index + 1
      kind = 'fixed'
      maxUses = 1
      path = $path
      preSignSha256 = Get-Sha256 $path
    })
  }
  $lifecycleLedgerPath = Join-Path $lifecycleDirectory 'callback-ledger.json'
  $lifecycleSession = [pscustomobject]@{
    Id = 'abcdef0123456789abcdef0123456789'
    ManifestSha256 = 'C' * 64
    Manifest = [pscustomobject]@{ slots = @($lifecycleSlots) }
    TempRoot = $lifecycleTemp
    SessionDirectory = $lifecycleDirectory
    LedgerPath = $lifecycleLedgerPath
    ManifestPath = Join-Path $lifecycleDirectory 'manifest.json'
    Context = [pscustomobject]@{ SourceRevision = 'a' * 40 }
  }
  Write-JsonNoBom $lifecycleLedgerPath `
    (New-PendingLedger $lifecycleSession.Id $lifecycleSession.ManifestSha256 $lifecycleSlots)
  $lifecycleLedger = Get-Content -Raw $lifecycleLedgerPath |
    ConvertFrom-Json -Depth 32 -DateKind String
  Assert-WaggleSigningLedgerState $lifecycleSession $lifecycleLedger
  $passed++

  Assert-Throws {
    Reserve-WaggleSigningCallback $lifecycleSession $lifecycleSlots[1].path
  } 'callback phase' 'cross-phase callback rejection'

  $ledgerBeforeInvalidMutation = Get-Content -Raw -LiteralPath $lifecycleLedgerPath
  Assert-Throws {
    Invoke-WaggleLedgerMutation $lifecycleSession {
      param($ledger)
      $ledger.entries[0].attempts = 99
    }
  } 'pristine|reservation metadata' 'invalid ledger mutation rejection'
  Assert-Equal `
    (Get-Content -Raw -LiteralPath $lifecycleLedgerPath) `
    $ledgerBeforeInvalidMutation `
    'invalid mutation leaves ledger unchanged'

  $reservation = Reserve-WaggleSigningCallback $lifecycleSession $lifecycleSlots[0].path
  Assert-Throws {
    Reserve-WaggleSigningCallback $lifecycleSession $lifecycleSlots[0].path
  } 'already consumed|state must be' 'duplicate callback rejection'
  Assert-Throws {
    Reserve-WaggleSigningCallback $lifecycleSession $lifecycleSlots[1].path
  } 'callback phase|state must be' 'reserved callback blocks later slot'
  Complete-WaggleSigningCallback $lifecycleSession $reservation $lifecycleSlots[0].path | Out-Null
  $completedLedger = Get-Content -Raw -LiteralPath $lifecycleLedgerPath |
    ConvertFrom-Json -Depth 32 -DateKind String
  Assert-Equal $completedLedger.entries[0].status 'completed' 'callback completion state'
  [IO.File]::Copy($signedHost, $lifecycleSlots[2].path, $true)
  $lifecycleSlots[2].preSignSha256 = Get-Sha256 $lifecycleSlots[2].path
  $phaseReservation = Reserve-WaggleSigningCallback `
    $lifecycleSession $lifecycleSlots[2].path
  Assert-Equal $phaseReservation.order 3 'resource callback may arrive out of manifest order'
  Complete-WaggleSigningCallback `
    $lifecycleSession $phaseReservation $lifecycleSlots[2].path | Out-Null
  $secondReservation = Reserve-WaggleSigningCallback $lifecycleSession $lifecycleSlots[1].path
  Assert-Equal $secondReservation.order 2 'next ordered callback reservation'
  $failureReceiptPath = Fail-WaggleSigningSession `
    $lifecycleSession $secondReservation 'fixture_failure' 'fixture error' 'restored-original'
  Assert-Equal `
    (Test-Path -LiteralPath $failureReceiptPath -PathType Leaf) `
    $true `
    'failed callback publishes durable failure receipt'
  $failedLedger = Get-Content -Raw -LiteralPath $lifecycleLedgerPath |
    ConvertFrom-Json -Depth 32 -DateKind String
  Assert-Equal $failedLedger.state 'failed' 'callback failure terminal ledger state'
  Assert-Equal $failedLedger.entries[1].status 'failed' 'reserved callback becomes failed'
  $failedLedgerBeforeRetry = Get-Content -Raw -LiteralPath $lifecycleLedgerPath
  Assert-Throws {
    Reserve-WaggleSigningCallback $lifecycleSession $lifecycleSlots[2].path
  } 'receipt already exists|terminal' 'failed session callback retry rejection'
  Assert-Equal `
    (Get-Content -Raw -LiteralPath $lifecycleLedgerPath) `
    $failedLedgerBeforeRetry `
    'failed session retry leaves ledger unchanged'

  $completeDirectory = New-PrivateDirectory (Join-Path $sessionFixtureRoot 'complete-ledger')
  $completeTemp = New-PrivateDirectory (Join-Path $completeDirectory 'temp')
  $completeSlots = [Collections.Generic.List[object]]::new()
  $completePayloads = [Collections.Generic.List[object]]::new()
  for ($index = 0; $index -lt 12; $index++) {
    $completePath = Join-Path $completeDirectory "complete-$($index + 1).exe"
    New-SyntheticPe $completePath ([byte]($index + 40))
    $completeSlots.Add([pscustomobject][ordered]@{
      id = 'complete-{0:d2}' -f ($index + 1)
      order = $index + 1
      kind = 'fixed'
      maxUses = 1
      path = $completePath
      packagedPath = $packagedPaths[$index]
      preSignSha256 = Get-Sha256 $completePath
    })
    $completePayloads.Add([pscustomobject][ordered]@{
      path = $packagedPaths[$index]
      sha256 = Get-Sha256 $completePath
      size = [long](Get-Item -LiteralPath $completePath).Length
      extractedPath = $completePath
    })
  }
  $completeUninstallerPath = Join-Path $completeTemp 'nstABCD.tmp'
  New-SyntheticPe $completeUninstallerPath 80
  $completeEvidencePath = Join-Path $completeDirectory 'signed-evidence\13-nsis-uninstaller.exe'
  New-SyntheticPe $completeEvidencePath 81
  $completeSlots.Add([pscustomobject][ordered]@{
    id = 'complete-13'; order = 13; kind = 'generated-nsis-uninstaller'; maxUses = 1
    pathPattern = $NsisUninstallerPattern; evidencePath = $completeEvidencePath
  })
  $completeInstallerPath = Join-Path $completeDirectory 'Waggle_0.2.0_x64-setup.exe'
  New-SyntheticPe $completeInstallerPath 82
  $completeSlots.Add([pscustomobject][ordered]@{
    id = 'complete-14'; order = 14; kind = 'generated-nsis-installer'; maxUses = 1
    path = $completeInstallerPath
  })
  $completeLedgerPath = Join-Path $completeDirectory 'callback-ledger.json'
  $completeSession = [pscustomobject]@{
    Id = 'fedcba9876543210fedcba9876543210'
    ManifestSha256 = 'D' * 64
    Manifest = [pscustomobject]@{
      slots = @($completeSlots)
      payloads = @($completePayloads | ForEach-Object {
        [pscustomobject]@{ path = $_.path; sha256 = $_.sha256; size = $_.size }
      })
    }
    TempRoot = $completeTemp
    SessionDirectory = $completeDirectory
    LedgerPath = $completeLedgerPath
    ManifestPath = Join-Path $completeDirectory 'manifest.json'
    Context = [pscustomobject]@{
      SourceRevision = 'b' * 40
      SignToolPath = $toolPaths['signtool.exe']
      SevenZipPath = $toolPaths['7z.exe']
    }
  }
  $completeLedger = New-PendingLedger `
    $completeSession.Id $completeSession.ManifestSha256 @($completeSlots)
  $reservedAt = [DateTimeOffset]::UtcNow.AddMinutes(-2).ToString('O')
  $completedAt = [DateTimeOffset]::UtcNow.AddMinutes(-1).ToString('O')
  foreach ($entry in $completeLedger.entries) {
    $slot = $completeSlots[[int]$entry.order - 1]
    $entryPath = if ([int]$entry.order -eq 13) {
      $completeUninstallerPath
    } else {
      [string]$slot.path
    }
    $entry.status = 'completed'
    $entry.attempts = 1
    $entry.reservationId = [Guid]::NewGuid().ToString('N')
    $entry.path = $entryPath
    $entry.preSignSha256 = Get-Sha256 $entryPath
    $entry.reservedAtUtc = $reservedAt
    $entry.completedAtUtc = $completedAt
    $entry.postSignSha256 = if ([int]$entry.order -eq 13) {
      Get-Sha256 $completeEvidencePath
    } else {
      Get-Sha256 $entryPath
    }
    $entry.signerSubject = 'CN=Fixture signer'
  }
  Write-JsonNoBom $completeLedgerPath $completeLedger
  $loadedCompleteLedger = Get-CompletedWaggleSigningLedger $completeSession
  Assert-Equal $loadedCompleteLedger.entries.Count 14 'complete finalizer accepts exact 14-slot ledger'
  $changedPayloads = @($completePayloads | ForEach-Object {
    [pscustomobject]@{
      path = $_.path; sha256 = $_.sha256; size = $_.size; extractedPath = $_.extractedPath
    }
  })
  $changedPayloads[0].sha256 = '0' * 64
  Assert-Throws {
    Assert-WaggleFinalPayloadBindings `
      $completeSession $loadedCompleteLedger $changedPayloads { param($Path, $SignTool) }
  } 'payload bytes differ' 'same-name changed packaged payload rejection'
  $completeLedger.entries[13].status = 'pending'
  $completeLedger.entries[13].attempts = 0
  foreach ($field in @(
      'reservationId', 'path', 'preSignSha256', 'reservedAtUtc',
      'completedAtUtc', 'postSignSha256', 'signerSubject'
    )) {
    $completeLedger.entries[13].$field = $null
  }
  Write-JsonNoBom $completeLedgerPath $completeLedger
  Assert-Throws {
    Get-CompletedWaggleSigningLedger $completeSession
  } 'incomplete' 'finalizer rejects incomplete callback ledger'
  Write-JsonNoBom $completeLedgerPath $loadedCompleteLedger
  $finalResult = Assert-WaggleSigningPackageComplete `
    $completeSession @($completePayloads) { param($Path, $SignTool) }
  Assert-Equal `
    (Test-Path -LiteralPath $finalResult.ReceiptPath -PathType Leaf) `
    $true `
    'finalizer publishes regular provenance receipt'
  $sealedLedger = Get-Content -Raw -LiteralPath $completeLedgerPath |
    ConvertFrom-Json -Depth 32 -DateKind String
  Assert-Equal $sealedLedger.state 'sealed' 'finalizer seals only after receipt publication'
  Assert-Equal `
    $sealedLedger.terminalReceiptSha256 `
    (Get-Sha256 $finalResult.ReceiptPath) `
    'sealed ledger binds exact provenance receipt digest'

  $receiptFailureDirectory = New-PrivateDirectory `
    (Join-Path $sessionFixtureRoot 'receipt-ledger-recovery')
  $receiptFailureLedgerPath = Join-Path $receiptFailureDirectory 'callback-ledger.json'
  $receiptFailureSession = [pscustomobject]@{
    Id = '11111111111111111111111111111111'
    ManifestSha256 = 'F' * 64
    Manifest = [pscustomobject]@{ slots = @($completeSlots) }
    TempRoot = $completeTemp
    SessionDirectory = $receiptFailureDirectory
    LedgerPath = $receiptFailureLedgerPath
    ManifestPath = Join-Path $receiptFailureDirectory 'manifest.json'
    Context = [pscustomobject]@{ SourceRevision = 'b' * 40 }
  }
  Write-JsonNoBom $receiptFailureLedgerPath `
    (New-PendingLedger $receiptFailureSession.Id $receiptFailureSession.ManifestSha256 @($completeSlots))
  $ledgerBlocker = [IO.FileStream]::new(
    $receiptFailureLedgerPath,
    [IO.FileMode]::Open,
    [IO.FileAccess]::Read,
    [IO.FileShare]::Read
  )
  try {
    Assert-Throws {
      Fail-WaggleSigningSession `
        $receiptFailureSession $null 'forced-ledger-failure' `
        'forced receipt-before-ledger recovery fixture'
    } 'replace|access|being used|used by another process' `
      'ledger replace failure occurs after durable receipt publication'
  } finally {
    $ledgerBlocker.Dispose()
  }
  $pendingReceiptPath = Join-Path $receiptFailureDirectory 'failure-receipt.json'
  $terminalIntentPath = Join-Path $receiptFailureDirectory 'terminal-intent.json'
  Assert-Equal `
    (Test-Path -LiteralPath $pendingReceiptPath -PathType Leaf) $true `
    'ledger failure leaves a durable pending terminal receipt'
  Assert-Equal `
    (Test-Path -LiteralPath $terminalIntentPath -PathType Leaf) $true `
    'ledger failure leaves a durable terminal intent'
  $receiptFailureLedger = Get-Content -Raw -LiteralPath $receiptFailureLedgerPath |
    ConvertFrom-Json -Depth 32 -DateKind String
  Assert-Equal $receiptFailureLedger.state 'open' 'receipt failure leaves ledger open'
  Assert-Throws {
    Invoke-WaggleLedgerMutation $receiptFailureSession { param($ledger) }
  } 'pending terminal receipt' 'pending terminal intent blocks ordinary ledger mutation'
  $pendingReceiptBytes = [IO.File]::ReadAllBytes($pendingReceiptPath)
  $pendingReceipt = Get-Content -Raw -LiteralPath $pendingReceiptPath |
    ConvertFrom-Json -Depth 32 -DateKind String
  $pendingReceiptSha256 = Get-Sha256 $pendingReceiptPath
  [IO.File]::WriteAllText(
    $pendingReceiptPath,
    '{"schemaVersion":1,"status":"failed","tampered":true}',
    [Text.UTF8Encoding]::new($false)
  )
  Assert-Throws {
    Fail-WaggleSigningSession `
      $receiptFailureSession $null 'forced-ledger-failure' `
      'forced receipt-before-ledger recovery fixture'
  } 'intent|digest|receipt' 'tampered pending terminal receipt is rejected'
  [IO.File]::WriteAllBytes($pendingReceiptPath, $pendingReceiptBytes)
  $recoveredReceiptPath = Fail-WaggleSigningSession `
    $receiptFailureSession $null 'forced-ledger-failure' `
    'forced receipt-before-ledger recovery fixture'
  $recoveredLedger = Get-Content -Raw -LiteralPath $receiptFailureLedgerPath |
    ConvertFrom-Json -Depth 32 -DateKind String
  Assert-Equal $recoveredLedger.state 'failed' 'pending terminal receipt recovers ledger state'
  Assert-Equal `
    $recoveredLedger.terminalAtUtc $pendingReceipt.terminalAtUtc `
    'recovery reuses the original durable terminal timestamp'
  Assert-Equal `
    $recoveredLedger.terminalReceiptSha256 $pendingReceiptSha256 `
    'recovery reuses the original durable terminal receipt digest'
  $recoveredBytes = [IO.File]::ReadAllBytes($recoveredReceiptPath)
  [IO.File]::WriteAllText($recoveredReceiptPath, '{}', [Text.UTF8Encoding]::new($false))
  Assert-Throws {
    Fail-WaggleSigningSession `
      $receiptFailureSession $null 'forced-ledger-failure' `
      'forced receipt-before-ledger recovery fixture'
  } 'intent|digest|receipt' 'post-commit terminal receipt tampering is rejected'
  [IO.File]::WriteAllBytes($recoveredReceiptPath, $recoveredBytes)

  $intentOnlyDirectory = New-PrivateDirectory `
    (Join-Path $sessionFixtureRoot 'intent-only-recovery')
  $intentOnlyLedgerPath = Join-Path $intentOnlyDirectory 'callback-ledger.json'
  $intentOnlySession = [pscustomobject]@{
    Id = '12121212121212121212121212121212'
    ManifestSha256 = '1' * 64
    Manifest = [pscustomobject]@{ slots = @($completeSlots) }
    TempRoot = $completeTemp
    SessionDirectory = $intentOnlyDirectory
    LedgerPath = $intentOnlyLedgerPath
    ManifestPath = Join-Path $intentOnlyDirectory 'manifest.json'
    Context = [pscustomobject]@{ SourceRevision = 'b' * 40 }
  }
  Write-JsonNoBom $intentOnlyLedgerPath `
    (New-PendingLedger $intentOnlySession.Id $intentOnlySession.ManifestSha256 @($completeSlots))
  $intentOnlyTerminalAt = [DateTimeOffset]::UtcNow.AddMinutes(-3).ToString('O')
  $intentOnlyReceipt = [pscustomobject][ordered]@{
    schemaVersion = 1
    status = 'failed'
    sessionId = $intentOnlySession.Id
    sourceRevision = $intentOnlySession.Context.SourceRevision
    manifestPath = $intentOnlySession.ManifestPath
    manifestSha256 = $intentOnlySession.ManifestSha256
    failureCode = 'intent-only-failure'
    failureMessage = 'recover the receipt from the durable terminal intent'
    failedSlotId = $null
    rollbackOutcome = 'not-required'
    terminalAtUtc = $intentOnlyTerminalAt
  }
  $intentOnlyStagedReceiptPath = Join-Path $intentOnlyDirectory 'staged-receipt.tmp'
  Write-WaggleDurableJsonNew $intentOnlyStagedReceiptPath $intentOnlyReceipt
  $intentOnlyReceiptSha256 = Get-Sha256 $intentOnlyStagedReceiptPath
  [IO.File]::Delete($intentOnlyStagedReceiptPath)
  Write-WaggleDurableJsonNew `
    (Join-Path $intentOnlyDirectory 'terminal-intent.json') `
    ([pscustomobject][ordered]@{
      schemaVersion = 1
      state = 'failed'
      sessionId = $intentOnlySession.Id
      manifestSha256 = $intentOnlySession.ManifestSha256
      terminalAtUtc = $intentOnlyTerminalAt
      receiptSha256 = $intentOnlyReceiptSha256
    })
  Assert-Throws {
    Fail-WaggleSigningSession `
      $intentOnlySession $null 'intent-only-failure' 'tampered recovery candidate'
  } 'intent|candidate' 'intent-only recovery rejects a changed terminal candidate'
  Assert-Equal `
    (Test-Path -LiteralPath (Join-Path $intentOnlyDirectory 'failure-receipt.json')) `
    $false `
    'intent-only candidate mismatch does not publish a receipt'
  $intentOnlyOpenLedger = Get-Content -Raw -LiteralPath $intentOnlyLedgerPath |
    ConvertFrom-Json -Depth 32 -DateKind String
  Assert-Equal $intentOnlyOpenLedger.state 'open' 'intent-only candidate mismatch leaves ledger open'
  $intentOnlyRecoveredReceiptPath = Fail-WaggleSigningSession `
    $intentOnlySession $null 'intent-only-failure' `
    'recover the receipt from the durable terminal intent'
  $intentOnlyRecoveredLedger = Get-Content -Raw -LiteralPath $intentOnlyLedgerPath |
    ConvertFrom-Json -Depth 32 -DateKind String
  Assert-Equal $intentOnlyRecoveredLedger.state 'failed' 'intent-only retry terminalizes the ledger'
  Assert-Equal `
    $intentOnlyRecoveredLedger.terminalAtUtc $intentOnlyTerminalAt `
    'intent-only retry reuses the durable terminal timestamp'
  Assert-Equal `
    (Get-Sha256 $intentOnlyRecoveredReceiptPath) $intentOnlyReceiptSha256 `
    'intent-only retry publishes the exact intent-bound receipt bytes'

  $concurrencyRoot = New-PrivateDirectory `
    (Join-Path $sessionFixtureRoot 'concurrent-reservation')
  $concurrencyLedgerPath = Join-Path $concurrencyRoot 'callback-ledger.json'
  $concurrencySessionPath = Join-Path $concurrencyRoot 'session.json'
  $concurrencySession = [pscustomobject]@{
    Id = '22222222222222222222222222222222'
    ManifestSha256 = '2' * 64
    Manifest = [pscustomobject]@{ slots = @($lifecycleSlots) }
    TempRoot = $lifecycleTemp
    SessionDirectory = $concurrencyRoot
    LedgerPath = $concurrencyLedgerPath
    ManifestPath = Join-Path $concurrencyRoot 'manifest.json'
    Context = [pscustomobject]@{ SourceRevision = 'a' * 40 }
  }
  Write-JsonNoBom $concurrencyLedgerPath `
    (New-PendingLedger `
      $concurrencySession.Id $concurrencySession.ManifestSha256 @($lifecycleSlots))
  Write-JsonNoBom $concurrencySessionPath $concurrencySession
  $reservationChildPath = Join-Path $concurrencyRoot 'reserve-child.ps1'
  $reservationChildSource = @'
param(
  [string]$WrapperPath, [string]$SessionPath, [string]$CallbackArtifactPath,
  [string]$ReadyPath, [string]$GoPath, [string]$ResultPath
)
$ErrorActionPreference = 'Stop'
. $WrapperPath -ArtifactPath 'C:\unused.exe'
$session = Get-Content -Raw -LiteralPath $SessionPath |
  ConvertFrom-Json -Depth 32 -DateKind String
[IO.File]::WriteAllText($ReadyPath, 'ready')
while (-not [IO.File]::Exists($GoPath)) { Start-Sleep -Milliseconds 10 }
try {
  $reservation = Reserve-WaggleSigningCallback $session $CallbackArtifactPath
  [IO.File]::WriteAllText($ResultPath, "reserved:$($reservation.reservationId)")
} catch {
  [IO.File]::WriteAllText($ResultPath, "error:$($_.Exception.Message)")
}
'@
  [IO.File]::WriteAllText(
    $reservationChildPath, $reservationChildSource, [Text.UTF8Encoding]::new($false)
  )
  $reservationGoPath = Join-Path $concurrencyRoot 'go'
  $reservationReadyPaths = @(
    (Join-Path $concurrencyRoot 'ready-1'),
    (Join-Path $concurrencyRoot 'ready-2')
  )
  $reservationResultPaths = @(
    (Join-Path $concurrencyRoot 'result-1'),
    (Join-Path $concurrencyRoot 'result-2')
  )
  $reservationProcesses = @()
  for ($index = 0; $index -lt 2; $index++) {
    $reservationProcesses += Start-SynchronizedChild `
      -PowerShellPath $approvedPowerShell -ScriptPath $reservationChildPath `
      -Arguments @{
        WrapperPath = $wrapperPath
        SessionPath = $concurrencySessionPath
        CallbackArtifactPath = [string]$lifecycleSlots[0].path
        ReadyPath = $reservationReadyPaths[$index]
        GoPath = $reservationGoPath
        ResultPath = $reservationResultPaths[$index]
      }
  }
  Wait-ForChildBarriers $reservationReadyPaths 'reservation race'
  [IO.File]::WriteAllText($reservationGoPath, 'go')
  foreach ($process in $reservationProcesses) {
    if (-not $process.WaitForExit(30000)) {
      $process.Kill()
      throw 'Timed out waiting for the duplicate reservation race.'
    }
    Assert-Equal $process.ExitCode 0 'reservation race child exit code'
  }
  $reservationResults = @($reservationResultPaths | ForEach-Object {
    [IO.File]::ReadAllText($_)
  })
  Assert-Equal `
    @($reservationResults | Where-Object { $_ -cmatch '^reserved:[0-9a-f]{32}$' }).Count `
    1 `
    "concurrent duplicate reservation has exactly one winner [$($reservationResults -join ' | ')]"
  Assert-Equal `
    @($reservationResults | Where-Object {
      $_ -cmatch '^error:.*(already consumed|state must be|reservation)'
    }).Count `
    1 `
    'concurrent duplicate reservation has exactly one rejected loser'
  $concurrencyLedger = Get-Content -Raw -LiteralPath $concurrencyLedgerPath |
    ConvertFrom-Json -Depth 32 -DateKind String
  Assert-WaggleSigningLedgerState $concurrencySession $concurrencyLedger
  Assert-Equal $concurrencyLedger.entries[0].status 'reserved' 'reservation race persists one reservation'
  Assert-Equal $concurrencyLedger.entries[0].attempts 1 'reservation race consumes one attempt'

  $terminalRoot = New-PrivateDirectory `
    (Join-Path $sessionFixtureRoot 'concurrent-terminal')
  $terminalLedgerPath = Join-Path $terminalRoot 'callback-ledger.json'
  $terminalSessionPath = Join-Path $terminalRoot 'session.json'
  $terminalSession = [pscustomobject]@{
    Id = '33333333333333333333333333333333'
    ManifestSha256 = '3' * 64
    Manifest = [pscustomobject]@{ slots = @($completeSlots) }
    TempRoot = $completeTemp
    SessionDirectory = $terminalRoot
    LedgerPath = $terminalLedgerPath
    ManifestPath = Join-Path $terminalRoot 'manifest.json'
    Context = [pscustomobject]@{ SourceRevision = 'b' * 40 }
  }
  $terminalLedger = $loadedCompleteLedger | ConvertTo-Json -Depth 32 |
    ConvertFrom-Json -Depth 32 -DateKind String
  $terminalLedger.sessionId = $terminalSession.Id
  $terminalLedger.manifestSha256 = $terminalSession.ManifestSha256
  $terminalLedger.state = 'open'
  $terminalLedger.terminalAtUtc = $null
  $terminalLedger.terminalReceiptSha256 = $null
  Write-JsonNoBom $terminalLedgerPath $terminalLedger
  Write-JsonNoBom $terminalSessionPath $terminalSession
  $terminalChildPath = Join-Path $terminalRoot 'terminal-child.ps1'
  $terminalChildSource = @'
param(
  [string]$WrapperPath, [string]$SessionPath, [string]$State,
  [string]$ReadyPath, [string]$GoPath, [string]$ResultPath
)
$ErrorActionPreference = 'Stop'
. $WrapperPath -ArtifactPath 'C:\unused.exe'
$session = Get-Content -Raw -LiteralPath $SessionPath |
  ConvertFrom-Json -Depth 32 -DateKind String
[IO.File]::WriteAllText($ReadyPath, 'ready')
while (-not [IO.File]::Exists($GoPath)) { Start-Sleep -Milliseconds 10 }
$receipt = [pscustomobject][ordered]@{
  schemaVersion = 1
  status = $State
  sessionId = $session.Id
  sourceRevision = $session.Context.SourceRevision
  manifestSha256 = $session.ManifestSha256
  terminalAtUtc = [DateTimeOffset]::UtcNow.ToString('O')
  failureCode = if ($State -ceq 'failed') { 'race-fixture' } else { $null }
  failureMessage = if ($State -ceq 'failed') { 'race fixture failure' } else { $null }
  failedSlotId = $null
  rollbackOutcome = if ($State -ceq 'failed') { 'not-required' } else { $null }
  manifestPath = if ($State -ceq 'sealed') { $session.ManifestPath } else { $null }
  callbackLedgerPath = if ($State -ceq 'sealed') { $session.LedgerPath } else { $null }
  installerPath = if ($State -ceq 'sealed') { [string]$session.Manifest.slots[13].path } else { $null }
  installerSha256 = if ($State -ceq 'sealed') { 'A' * 64 } else { $null }
  signerSubject = if ($State -ceq 'sealed') { 'CN=Race Fixture' } else { $null }
  payloadManifestSha256 = if ($State -ceq 'sealed') { 'B' * 64 } else { $null }
  artifactBindings = if ($State -ceq 'sealed') { @(
    [pscustomobject]@{ kind = 'fixture'; sha256 = 'C' * 64 },
    [pscustomobject]@{ kind = 'fixture'; sha256 = 'D' * 64 }
  ) } else { $null }
}
try {
  $path = Set-WaggleSigningTerminalState `
    -Session $session -State $State -Receipt $receipt `
    -LedgerMutation { param($ledger) }
  [IO.File]::WriteAllText($ResultPath, "terminal:${State}:$path")
} catch {
  [IO.File]::WriteAllText($ResultPath, "error:$($_.Exception.Message)")
}
'@
  [IO.File]::WriteAllText(
    $terminalChildPath, $terminalChildSource, [Text.UTF8Encoding]::new($false)
  )
  $terminalGoPath = Join-Path $terminalRoot 'go'
  $terminalReadyPaths = @(
    (Join-Path $terminalRoot 'ready-failed'),
    (Join-Path $terminalRoot 'ready-sealed')
  )
  $terminalResultPaths = @(
    (Join-Path $terminalRoot 'result-failed'),
    (Join-Path $terminalRoot 'result-sealed')
  )
  $terminalStates = @('failed', 'sealed')
  $terminalProcesses = @()
  for ($index = 0; $index -lt 2; $index++) {
    $terminalProcesses += Start-SynchronizedChild `
      -PowerShellPath $approvedPowerShell -ScriptPath $terminalChildPath `
      -Arguments @{
        WrapperPath = $wrapperPath
        SessionPath = $terminalSessionPath
        State = $terminalStates[$index]
        ReadyPath = $terminalReadyPaths[$index]
        GoPath = $terminalGoPath
        ResultPath = $terminalResultPaths[$index]
      }
  }
  Wait-ForChildBarriers $terminalReadyPaths 'terminal fail-vs-seal race'
  [IO.File]::WriteAllText($terminalGoPath, 'go')
  foreach ($process in $terminalProcesses) {
    if (-not $process.WaitForExit(30000)) {
      $process.Kill()
      throw 'Timed out waiting for the terminal fail-vs-seal race.'
    }
    Assert-Equal $process.ExitCode 0 'terminal race child exit code'
  }
  $terminalResults = @($terminalResultPaths | ForEach-Object {
    [IO.File]::ReadAllText($_)
  })
  Assert-Equal `
    @($terminalResults | Where-Object { $_ -cmatch '^terminal:(failed|sealed):' }).Count `
    1 `
    'terminal fail-vs-seal race has exactly one winner'
  Assert-Equal `
    @($terminalResults | Where-Object {
      $_ -cmatch '^error:.*(terminal|opposite|different)'
    }).Count `
    1 `
    'terminal fail-vs-seal race has exactly one rejected loser'
  $terminalReceiptPaths = @(
    (Join-Path $terminalRoot 'failure-receipt.json'),
    (Join-Path $terminalRoot 'provenance-receipt.json')
  )
  $publishedTerminalReceipts = @($terminalReceiptPaths | Where-Object {
    Test-Path -LiteralPath $_ -PathType Leaf
  })
  Assert-Equal $publishedTerminalReceipts.Count 1 'terminal race publishes one receipt'
  $terminalLedgerAfterRace = Get-Content -Raw -LiteralPath $terminalLedgerPath |
    ConvertFrom-Json -Depth 32 -DateKind String
  Assert-WaggleSigningLedgerState $terminalSession $terminalLedgerAfterRace
  $expectedTerminalState = if (
    [IO.Path]::GetFileName($publishedTerminalReceipts[0]) -ceq 'failure-receipt.json'
  ) { 'failed' } else { 'sealed' }
  Assert-Equal `
    $terminalLedgerAfterRace.state $expectedTerminalState `
    'terminal race ledger matches its sole receipt'
  Assert-Equal `
    $terminalLedgerAfterRace.terminalReceiptSha256 `
    (Get-Sha256 $publishedTerminalReceipts[0]) `
    'terminal race ledger binds its sole receipt digest'
} finally {
  foreach ($name in $environmentNames) {
    [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name])
  }
  if (Test-Path -LiteralPath $sessionFixtureRoot) {
    [IO.Directory]::Delete($sessionFixtureRoot, $true)
  }
}

Write-Host "Artifact Signing policy tests passed: $passed"
