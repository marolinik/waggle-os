[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') {
  throw 'This guarded real-agent runner is Windows-only.'
}

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$runRoot = Join-Path $tempBase ("waggle-windows-external-agents-" + [guid]::NewGuid().ToString('N'))
$hookProfile = Join-Path $runRoot 'hook-profile'
$originalEnvironment = @{}
$profileVariables = @('USERPROFILE', 'HOME', 'APPDATA', 'LOCALAPPDATA')
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
  'SSH_AUTH_SOCK',
  'GIT_ASKPASS',
  'SSH_ASKPASS',
  'GIT_SSH_COMMAND',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NODE_OPTIONS'
)
$runnerVariables = @(
  'WAGGLE_E2E_REAL_HOOKS',
  'WAGGLE_E2E_HOOK_HOME',
  'WAGGLE_E2E_REAL_TOOLS',
  'WAGGLE_E2E_TEMP_ROOT',
  'WAGGLE_E2E_DATA_DIR',
  'WAGGLE_E2E_PORT',
  'WAGGLE_E2E_BASE_URL',
  'WAGGLE_E2E_SKIP_LITELLM',
  'WAGGLE_E2E_REUSE_EXISTING_SERVER'
)
$environmentToRestore = @($profileVariables + $secretVariables + $runnerVariables | Select-Object -Unique)

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

function Invoke-PlaywrightLane([string]$Spec, [string]$DataDir) {
  $port = Get-FreeLoopbackPort
  Set-ProcessEnvironment -Name 'WAGGLE_E2E_DATA_DIR' -Value $DataDir
  Set-ProcessEnvironment -Name 'WAGGLE_E2E_PORT' -Value ([string]$port)
  Set-ProcessEnvironment -Name 'WAGGLE_E2E_BASE_URL' -Value "http://127.0.0.1:$port"
  Write-Host "Running $Spec on isolated port $port"
  & $script:npxPath playwright test $Spec --config=playwright.config.ts --project=chromium --reporter=list
  if ($LASTEXITCODE -ne 0) {
    throw "$Spec failed with exit code $LASTEXITCODE"
  }
}

$npxCommand = Get-Command npx.cmd -ErrorAction SilentlyContinue
if ($null -eq $npxCommand) { $npxCommand = Get-Command npx -ErrorAction Stop }
$script:npxPath = $npxCommand.Source

try {
  $null = New-Item -ItemType Directory -Path $hookProfile -Force
  foreach ($name in $secretVariables) { Set-ProcessEnvironment -Name $name -Value $null }
  Set-ProcessEnvironment -Name 'WAGGLE_E2E_SKIP_LITELLM' -Value '1'
  Set-ProcessEnvironment -Name 'WAGGLE_E2E_REUSE_EXISTING_SERVER' -Value '0'
  Set-ProcessEnvironment -Name 'WAGGLE_E2E_TEMP_ROOT' -Value $runRoot

  Push-Location $repoRoot
  try {
    Set-ProcessEnvironment -Name 'USERPROFILE' -Value $hookProfile
    Set-ProcessEnvironment -Name 'HOME' -Value $hookProfile
    Set-ProcessEnvironment -Name 'APPDATA' -Value (Join-Path $hookProfile 'AppData\Roaming')
    Set-ProcessEnvironment -Name 'LOCALAPPDATA' -Value (Join-Path $hookProfile 'AppData\Local')
    Set-ProcessEnvironment -Name 'WAGGLE_E2E_HOOK_HOME' -Value $hookProfile
    Set-ProcessEnvironment -Name 'WAGGLE_E2E_REAL_HOOKS' -Value '1'
    Set-ProcessEnvironment -Name 'WAGGLE_E2E_REAL_TOOLS' -Value $null
    Invoke-PlaywrightLane -Spec 'tests/e2e/launcher-real-hook-lifecycle.spec.ts' -DataDir (Join-Path $runRoot 'hook-data')

    foreach ($name in $profileVariables) { Restore-ProcessEnvironment -Name $name }
    Set-ProcessEnvironment -Name 'WAGGLE_E2E_HOOK_HOME' -Value $null
    Set-ProcessEnvironment -Name 'WAGGLE_E2E_REAL_HOOKS' -Value $null
    Set-ProcessEnvironment -Name 'WAGGLE_E2E_REAL_TOOLS' -Value '1'
    Invoke-PlaywrightLane -Spec 'tests/e2e/launcher-real-tool-lifecycle.spec.ts' -DataDir (Join-Path $runRoot 'tool-data')
  } finally {
    Pop-Location
  }
} finally {
  foreach ($name in $environmentToRestore) { Restore-ProcessEnvironment -Name $name }
  Remove-VerifiedTempTree -Target $runRoot
}

Write-Host 'Windows external-agent route and hook lifecycle passed with isolated cleanup.'
