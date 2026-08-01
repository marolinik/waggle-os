[CmdletBinding()]
param(
  [string[]]$HostIds = @(),
  [string]$ReceiptDir = '',
  [string]$RunnerNode = ''
)

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') {
  throw 'This guarded real-agent runner is Windows-only.'
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
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$runRoot = Join-Path $tempBase ("waggle-windows-external-agents-" + [guid]::NewGuid().ToString('N'))
$hookProfile = Join-Path $runRoot 'hook-profile'
$receiptRoot = if ([string]::IsNullOrWhiteSpace($ReceiptDir)) {
  $null
} else {
  [IO.Path]::GetFullPath($ReceiptDir)
}
$originalEnvironment = @{}
$profileVariables = @('USERPROFILE', 'HOME', 'APPDATA', 'LOCALAPPDATA', 'HERMES_HOME')
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
  'PLAYWRIGHT_JSON_OUTPUT_FILE'
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

function Remove-UnsafeReceipt([string]$ReceiptPath) {
  if ([string]::IsNullOrWhiteSpace($ReceiptPath)) { return }
  if (-not (Test-Path -LiteralPath $ReceiptPath -PathType Leaf)) {
    throw "Expected Playwright receipt was not created: $ReceiptPath"
  }

  $receipt = Get-Content -Raw -LiteralPath $ReceiptPath | ConvertFrom-Json
  $receiptStrings = @(Get-ReceiptStrings -Node $receipt)
  $artifactText = @{}
  foreach ($file in Get-ChildItem -LiteralPath $receiptRoot -Recurse -File) {
    $artifactText[$file.FullName] = [IO.File]::ReadAllText($file.FullName)
  }
  $unsafePaths = @()
  $leakedVariables = @()
  foreach ($name in $secretVariables) {
    $value = $originalEnvironment[$name]
    if ([string]::IsNullOrEmpty($value)) { continue }
    $jsonValue = ConvertTo-Json -InputObject $value -Compress
    $escapedValue = if ($jsonValue.Length -ge 2) {
      $jsonValue.Substring(1, $jsonValue.Length - 2)
    } else {
      $jsonValue
    }

    $nameLeaked = $false
    foreach ($entry in $artifactText.GetEnumerator()) {
      if ($entry.Value.Contains($value) -or $entry.Value.Contains($escapedValue)) {
        $unsafePaths += $entry.Key
        $nameLeaked = $true
      }
    }
    foreach ($candidate in $receiptStrings) {
      if ($candidate.Contains($value) -or $candidate.Contains($escapedValue)) {
        $unsafePaths += $ReceiptPath
        $nameLeaked = $true
      }
      if ($candidate.Length -ge 8 -and $candidate.Length % 4 -eq 0 -and
          $candidate -match '^[A-Za-z0-9+/]*={0,2}$') {
        try {
          $decoded = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($candidate))
          if ($decoded.Contains($value) -or $decoded.Contains($escapedValue)) {
            $unsafePaths += $ReceiptPath
            $nameLeaked = $true
          }
        } catch {
          # Not every base64-shaped reporter string is valid base64.
        }
      }
    }
    if ($nameLeaked) { $leakedVariables += $name }
  }
  if ($leakedVariables.Count -eq 0) { return }

  foreach ($path in @($unsafePaths | Select-Object -Unique)) {
    Remove-Item -LiteralPath $path -Force
  }
  throw (
    'Unsafe Playwright artifacts removed: captured secret values found for environment variables: ' +
    (@($leakedVariables | Select-Object -Unique) -join ', ')
  )
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
  if (-not (Test-Path -LiteralPath $resolved)) { return }

  $lastError = $null
  for ($attempt = 0; $attempt -lt 10; $attempt += 1) {
    try {
      Remove-Item -LiteralPath $resolved -Recurse -Force
      return
    } catch {
      $lastError = $_
      Start-Sleep -Milliseconds 250
    }
  }
  throw $lastError
}

function Invoke-PlaywrightLane([string]$Spec, [string]$DataDir, [string]$ReceiptName) {
  $port = Get-FreeLoopbackPort
  $receiptPath = $null
  Set-ProcessEnvironment -Name 'WAGGLE_E2E_DATA_DIR' -Value $DataDir
  Set-ProcessEnvironment -Name 'WAGGLE_E2E_PORT' -Value ([string]$port)
  Set-ProcessEnvironment -Name 'WAGGLE_E2E_BASE_URL' -Value "http://127.0.0.1:$port"
  Write-Host "Running $Spec on isolated port $port"
  $playwrightArgs = @(
    'test',
    $Spec,
    '--config=playwright.config.ts',
    '--project=chromium',
    '--retries=0'
  )
  if ($null -ne $receiptRoot) {
    $receiptPath = Join-Path $receiptRoot "$ReceiptName-report.json"
    Set-ProcessEnvironment -Name 'PLAYWRIGHT_JSON_OUTPUT_FILE' -Value $receiptPath
    $playwrightArgs += @(
      '--reporter=list,json',
      '--output',
      (Join-Path $receiptRoot $ReceiptName)
    )
  } else {
    Set-ProcessEnvironment -Name 'PLAYWRIGHT_JSON_OUTPUT_FILE' -Value $null
    $playwrightArgs += '--reporter=list'
  }
  & $script:runnerNodePath $script:playwrightCli @playwrightArgs
  $exitCode = $LASTEXITCODE
  Remove-UnsafeReceipt -ReceiptPath $receiptPath
  if ($exitCode -ne 0) {
    throw "$Spec failed with exit code $exitCode"
  }
}

try {
  $null = New-Item -ItemType Directory -Path $hookProfile -Force
  if ($null -ne $receiptRoot) {
    $null = New-Item -ItemType Directory -Path $receiptRoot -Force
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
    Set-ProcessEnvironment -Name 'APPDATA' -Value (Join-Path $hookProfile 'AppData\Roaming')
    Set-ProcessEnvironment -Name 'LOCALAPPDATA' -Value (Join-Path $hookProfile 'AppData\Local')
    Set-ProcessEnvironment -Name 'HERMES_HOME' -Value (Join-Path $hookProfile '.hermes')
    Set-ProcessEnvironment -Name 'WAGGLE_E2E_HOOK_HOME' -Value $hookProfile
    Set-ProcessEnvironment -Name 'WAGGLE_E2E_REAL_HOOKS' -Value '1'
    Set-ProcessEnvironment -Name 'WAGGLE_E2E_REAL_TOOLS' -Value $null
    Invoke-PlaywrightLane -Spec 'tests/e2e/launcher-real-hook-lifecycle.spec.ts' -DataDir (Join-Path $runRoot 'hook-data') -ReceiptName 'hooks'

    foreach ($name in $profileVariables) { Restore-ProcessEnvironment -Name $name }
    Set-ProcessEnvironment -Name 'WAGGLE_E2E_HOOK_HOME' -Value $null
    Set-ProcessEnvironment -Name 'WAGGLE_E2E_REAL_HOOKS' -Value $null
    Set-ProcessEnvironment -Name 'WAGGLE_E2E_REAL_TOOLS' -Value '1'
    Invoke-PlaywrightLane -Spec 'tests/e2e/launcher-real-tool-lifecycle.spec.ts' -DataDir (Join-Path $runRoot 'tool-data') -ReceiptName 'tools'
  } finally {
    Pop-Location
  }
} finally {
  foreach ($name in $environmentToRestore) { Restore-ProcessEnvironment -Name $name }
  Remove-VerifiedTempTree -Target $runRoot
}

Write-Host 'Windows external-agent route and hook lifecycle passed with isolated cleanup.'
