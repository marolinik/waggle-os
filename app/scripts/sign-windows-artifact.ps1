[CmdletBinding()]
param(
  [ValidateSet('Callback', 'Package')]
  [string]$Mode = 'Callback',

  [AllowEmptyString()]
  [string]$ArtifactPath = '',

  [AllowEmptyString()]
  [string]$ArtifactSigningPackageSource = '',

  [AllowEmptyString()]
  [string]$UnsignedInputRoot = '',

  [AllowEmptyString()]
  [string]$SigningInputRoot = '',

  [AllowEmptyString()]
  [string]$BuildReceiptPath = '',

  [AllowEmptyString()]
  [string]$BuildReceiptSha256 = '',

  [AllowEmptyString()]
  [string]$PortableToolchainRoot = '',

  [AllowEmptyString()]
  [string]$PortableNodePath = '',

  [AllowEmptyString()]
  [string]$PortableGitPath = '',

  [AllowEmptyString()]
  [string]$PortableSevenZipPath = '',

  [AllowEmptyString()]
  [string]$PortableToolchainReceiptPath = '',

  [AllowEmptyString()]
  [string]$PortableToolchainReceiptSha256 = '',

  [switch]$TrustedPowerShellHost
)

$trustedModuleRoot = [IO.Path]::GetFullPath([IO.Path]::Combine($PSHOME, 'Modules'))
[Environment]::SetEnvironmentVariable('PSModulePath', $trustedModuleRoot, 'Process')
$global:PSModuleAutoLoadingPreference = 'None'
foreach ($moduleName in @(
    'Microsoft.PowerShell.Security',
    'Microsoft.PowerShell.Management',
    'Microsoft.PowerShell.Utility'
  )) {
  $moduleManifest = [IO.Path]::Combine(
    $trustedModuleRoot, $moduleName, "$moduleName.psd1"
  )
  if (-not [IO.File]::Exists($moduleManifest)) {
    throw "Trusted PowerShell module is missing: $moduleManifest"
  }
  Microsoft.PowerShell.Core\Import-Module `
    $moduleManifest -Force -Scope Global -ErrorAction Stop
}
if ($PSVersionTable.PSEdition -ceq 'Desktop') {
  $appxManifest = [IO.Path]::Combine($trustedModuleRoot, 'Appx', 'Appx.psd1')
  if ([IO.File]::Exists($appxManifest)) {
    Microsoft.PowerShell.Core\Import-Module `
      $appxManifest -Force -Scope Global -ErrorAction Stop
  }
}

$trustedCommandModules = [ordered]@{
  'Get-AuthenticodeSignature' = 'Microsoft.PowerShell.Security'
  'Get-Acl' = 'Microsoft.PowerShell.Security'
  'Set-Acl' = 'Microsoft.PowerShell.Security'
  'Get-FileHash' = 'Microsoft.PowerShell.Utility'
}
foreach ($entry in $trustedCommandModules.GetEnumerator()) {
  $command = $ExecutionContext.SessionState.InvokeCommand.GetCommand(
    [string]$entry.Key,
    [Management.Automation.CommandTypes]::All
  )
  $expectedModulePath = [IO.Path]::Combine(
    $trustedModuleRoot, [string]$entry.Value, "$([string]$entry.Value).psd1"
  )
  if ($null -eq $command -or
      -not [string]::Equals(
        [IO.Path]::GetFullPath([string]$command.Module.Path),
        [IO.Path]::GetFullPath($expectedModulePath),
        [StringComparison]::OrdinalIgnoreCase
      )) {
    throw "PowerShell command '$($entry.Key)' did not resolve from the trusted module root."
  }
}

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$MicrosoftPublisher = 'CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond, S=Washington, C=US'
$MicrosoftWindowsPublisher = 'CN=Microsoft Windows, O=Microsoft Corporation, L=Redmond, S=Washington, C=US'
$DotNetPublisher = 'CN=.NET, O=Microsoft Corporation, L=Redmond, S=Washington, C=US'
$NodePublisher = 'CN=OpenJS Foundation, O=OpenJS Foundation, L=San Francisco, S=California, C=US'
$GitPublisher = 'CN=Johannes Schindelin, O=Johannes Schindelin, S=Nordrhein-Westfalen, C=DE'
$ArtifactSigningEndpoint = 'https://weu.codesigning.azure.net/'
$ArtifactSigningAccount = 'waggleos-egzakta-signing'
$ArtifactSigningProfile = 'waggleos-public-trust'
$ArtifactSigningClientVersion = '1.0.128.0'
$ArtifactSigningDlibSha256 = '2D4C1BBC87467B3AC25BBC49DF58CC8B36A0F92B3E21AA98BBBAD08A4D7C98BA'
$ArtifactSigningPackageSha256 = '74BD7D27E6CE1051409C38D9B46BC8DF0400ECD643D51FFBF2AC00869061E40B'
$ArtifactSigningX64ManifestSha256 = '7B78EF94C8B5939281F7AA364EA6406716F844D893DAA89AF601933D0BA1DB6E'
$SignToolSha256 = '431EE314C83988CACDA86606356FD321B75AE0093481B97E3B738E99C412F2A0'
$TauriCliVersion = '2.10.1'
$TauriCliSha256 = '0DD6EC63C7C63A993FDE20955E291D833C03F3760E63E0EE21E83482F6C0B43A'
$TauriCliPackageSha256 = '15A3A9383E8EDF7AD3D5117DBD8B9A6D75EE36654D3F71D2D0AD48E294EBAB98'
$TauriCliMainSha256 = '49DF414A16784E3711D5582D55C5C9E537ACEB1108C5ECFC6A17CDC2F5259B4D'
$TauriCliIndexSha256 = 'F6A7556765D3ED2DD40F9FCF609CEB7D3646FCCBB7FA01EEB9B7931F8BC8BB4F'
$TauriNativePackageSha256 = '6CB1DD193C36BAA11679ED9403FC564AA1E06A2BFAA066A146555D93BD07A783'
$TauriNativeBinarySha256 = 'F7289148FDF4CE6CE527D34C63A0055C87DE4FFE0A98475F3998D527225B1443'
$MakensisSha256 = '42850802704ECB11163F7E0329D35EE54BD288953200D4966E226D572848CFC5'
$NsisClosureSha256 = '1FC822D1A183552A80ADEA01B0BF456F462B90518256EF1FE9EDFA22D76CD85A'
$GitSha256 = '34A408843194BE320D8A87A3C12CD5C7D2E08D03B24567A41DB32E21D12569D2'
$GitRuntimeSha256 = '755D4896D35663D0FF08924F84507F35236B83D240635B512C519BF43CC71A87'
$NodePath = 'C:\Program Files\nodejs\node.exe'
$NodeSha256 = 'AE1A50511BE58E987483FDBC12125407443926D2D394669ADE2352776E920DD3'
$SevenZipPath = 'C:\Program Files\7-Zip\7z.exe'
$SevenZipSha256 = '4CD7D776C686427226A151789D2D61F0B2ED2C392148CC4E69C0238362FAFECF'
$SevenZipDllSha256 = '5BD20FB38499D95C39594F41D4781B6181B3304B7F1F4D06B0182F514E7EAA74'
$NodeArchiveSha256 = '7C93E9D92BF68C07182B471AA187E35EE6CD08EF0F24AB060DFFF605FCC1C57C'
$GitArchiveSha256 = 'C2C955A21FA99889D83F485F24FA5D9A38FFFC2D509D4022385510E11C26B250'
$SevenZipArchiveSha256 = '78AFA2A1C773CAF3CF7EDF62F857D2A8A5DA55FB0FFF5DA416074C0D28B2B55F'
$PortableToolchainFileCount = 2495
$PortableToolchainInventorySha256 = 'D64F897D4E1A7F07FE9BA62D6AF062EF9F0E41C595CDAF2F3C4F73991BBEA0F5'
$ApprovedPublisher = 'CN=EGZAKTA DOO BEOGRAD, O=EGZAKTA DOO BEOGRAD, L=Amsterdam, C=NL'
$CodeSigningOid = '1.3.6.1.5.5.7.3.3'
$SystemPowerShellPath = 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
$SignToolPath = 'C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe'
$GitPath = 'C:\Program Files\Git\cmd\git.exe'
$NsisUninstallerPattern = '^nst[0-9A-F]{4}\.tmp$'

function Get-TrustedPath {
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
      $Path -match '^[\\/]{2}[?.][\\/]' -or
      $Path -match '(^|[\\/])\.\.?(?:[\\/]|$)' -or
      $Path.Substring(2) -match ':' -or
      @($Path -split '[\\/]' | Where-Object { $_ -match '[. ]$' }).Count -gt 0) {
    throw "$Label must use a safe, fully qualified local Windows path."
  }

  $fullPath = [IO.Path]::GetFullPath($Path)
  $testPathType = if ($PathType -eq 'Leaf') { 'Leaf' } else { 'Container' }
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
    $linkType = if ($null -eq $linkTypeProperty) { '' } else { [string]$linkTypeProperty.Value }
    if (-not [string]::IsNullOrEmpty($linkType) -and
        -not ($AllowHardLink -and $linkType -ceq 'HardLink')) {
      throw "$Label traverses a linked filesystem object: $current"
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

function Get-ContainedRelativePath {
  param(
    [Parameter(Mandatory = $true)] [string]$Path,
    [Parameter(Mandatory = $true)] [string]$Root
  )

  $relative = [IO.Path]::GetRelativePath($Root, $Path)
  if ([IO.Path]::IsPathRooted($relative) -or
      $relative -eq '..' -or
      $relative.StartsWith("..$([IO.Path]::DirectorySeparatorChar)", [StringComparison]::Ordinal)) {
    return $null
  }
  return $relative.Replace('/', '\')
}

function Get-ArtifactPolicyKind {
  param(
    [Parameter(Mandatory = $true)] [string]$Path,
    [Parameter(Mandatory = $true)] [string]$ReleaseRoot,
    [Parameter(Mandatory = $true)] [string]$ResourcesRoot,
    [AllowNull()] [string]$NsisTempRoot,
    [Parameter(Mandatory = $true)] [string]$Version
  )

  $releaseRelative = Get-ContainedRelativePath $Path $ReleaseRoot
  if ($null -ne $releaseRelative) {
    $allowedPeFiles = @(
      'waggle.exe',
      'nsis\x64\Plugins\x86-unicode\NSISdl.dll',
      'nsis\x64\Plugins\x86-unicode\StartMenu.dll',
      'nsis\x64\Plugins\x86-unicode\System.dll',
      'nsis\x64\Plugins\x86-unicode\nsDialogs.dll',
      'nsis\x64\Plugins\x86-unicode\additional\nsis_tauri_utils.dll',
      "bundle\nsis\Waggle_${Version}_x64-setup.exe"
    )
    if ($allowedPeFiles -contains $releaseRelative) {
      return 'PE'
    }
    throw "Artifact is not in the approved Tauri release manifest: $releaseRelative"
  }

  $resourceRelative = Get-ContainedRelativePath $Path $ResourcesRoot
  if ($null -ne $resourceRelative) {
    $allowedResourceFiles = @(
      'native\vec0.dll',
      'native\onnxruntime\onnxruntime.dll',
      'node_modules\@img\sharp-win32-x64\lib\libvips-42.dll',
      'node_modules\@img\sharp-win32-x64\lib\libvips-cpp-8.18.3.dll',
      'node_modules\onnxruntime-node\bin\napi-v3\win32\x64\onnxruntime.dll',
      'node_modules\sqlite-vec-windows-x64\vec0.dll'
    )
    if ($allowedResourceFiles -contains $resourceRelative) {
      return 'PE'
    }
    throw "Artifact is not in the approved Tauri resource manifest: $resourceRelative"
  }

  if ($null -ne $NsisTempRoot) {
    $tempRelative = Get-ContainedRelativePath $Path $NsisTempRoot
    if ($null -ne $tempRelative -and
        $tempRelative -notmatch '[\\/]' -and
        $tempRelative -cmatch '^nst[0-9A-F]{4}\.tmp$') {
      return 'PE'
    }
  }

  throw 'Artifact is outside every approved Waggle signing root.'
}

function Assert-PeFile {
  param([Parameter(Mandatory = $true)] [string]$Path)

  $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  try {
    if ($stream.Length -lt 64) { throw 'PE file is too short.' }
    $reader = [IO.BinaryReader]::new($stream)
    if ($reader.ReadUInt16() -ne 0x5A4D) { throw 'Artifact lacks the PE MZ header.' }
    $stream.Position = 0x3C
    $peOffset = $reader.ReadUInt32()
    if ($peOffset -lt 64 -or $peOffset -gt 4MB -or $peOffset + 4 -gt $stream.Length) {
      throw 'Artifact has an invalid PE header offset.'
    }
    $stream.Position = $peOffset
    if ($reader.ReadUInt32() -ne 0x00004550) { throw 'Artifact lacks the PE signature.' }
  } finally {
    $stream.Dispose()
  }
}

function Assert-MsiFile {
  param([Parameter(Mandatory = $true)] [string]$Path)

  $expected = [byte[]](0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1)
  $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  try {
    if ($stream.Length -lt $expected.Length) { throw 'MSI file is too short.' }
    $actual = [byte[]]::new($expected.Length)
    if ($stream.Read($actual, 0, $actual.Length) -ne $actual.Length) {
      throw 'Could not read the MSI header.'
    }
    if (-not [Linq.Enumerable]::SequenceEqual($actual, $expected)) {
      throw 'Artifact lacks the MSI compound-file header.'
    }
  } finally {
    $stream.Dispose()
  }
}

function Assert-ApprovedAuthenticodeFile {
  param(
    [Parameter(Mandatory = $true)] [string]$Path,
    [Parameter(Mandatory = $true)] [string]$Label,
    [AllowNull()] [string]$ExpectedSha256,
    [Parameter(Mandatory = $true)] [string]$ExpectedPublisher,
    [switch]$AllowCatalog
  )

  $signature = Get-AuthenticodeSignature -LiteralPath $Path
  $signatureType = [string]$signature.SignatureType
  $approvedSignatureType = $signatureType -ceq 'Authenticode' -or
    ($AllowCatalog -and $signatureType -ceq 'Catalog')
  if ($signature.Status -ne [Management.Automation.SignatureStatus]::Valid -or
      -not $approvedSignatureType -or
      $null -eq $signature.SignerCertificate -or
      -not [string]::Equals(
        [string]$signature.SignerCertificate.Subject,
        $ExpectedPublisher,
        [StringComparison]::Ordinal
      )) {
    throw "$Label is not validly Authenticode-signed by the approved publisher."
  }

  $hasCodeSigningEku = @(
    $signature.SignerCertificate.Extensions |
      Where-Object { $_ -is [Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension] } |
      ForEach-Object { $_.EnhancedKeyUsages } |
      Where-Object { $_.Value -eq $CodeSigningOid }
  ).Count -gt 0
  if (-not $hasCodeSigningEku) { throw "$Label lacks the Code Signing EKU." }

  if (-not [string]::IsNullOrEmpty($ExpectedSha256)) {
    $actualHash = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
    if (-not [string]::Equals($actualHash, $ExpectedSha256, [StringComparison]::OrdinalIgnoreCase)) {
      throw "$Label does not match the pinned SHA-256 digest."
    }
  }
}

function Assert-MicrosoftAuthenticodeFile {
  param(
    [Parameter(Mandatory = $true)] [string]$Path,
    [Parameter(Mandatory = $true)] [string]$Label,
    [AllowNull()] [string]$ExpectedSha256,
    [string]$ExpectedPublisher = $MicrosoftPublisher,
    [switch]$AllowCatalog
  )

  Assert-ApprovedAuthenticodeFile `
    $Path $Label $ExpectedSha256 $ExpectedPublisher -AllowCatalog:$AllowCatalog
}

function Assert-ApprovedPowerShell7Path {
  param([Parameter(Mandatory = $true)] [string]$Path)

  $programFiles = [Environment]::GetFolderPath(
    [Environment+SpecialFolder]::ProgramFiles
  )
  $standardPath = [IO.Path]::GetFullPath((Join-Path $programFiles 'PowerShell\7\pwsh.exe'))
  $windowsAppsPattern = '^[A-Za-z]:\\Program Files\\WindowsApps\\Microsoft\.PowerShell_\d+\.\d+\.\d+\.\d+_x64__8wekyb3d8bbwe\\pwsh\.exe$'
  if (-not [string]::Equals($Path, $standardPath, [StringComparison]::OrdinalIgnoreCase) -and
      $Path -notmatch $windowsAppsPattern) {
    throw 'PowerShell 7 must come from the canonical Microsoft installation path.'
  }
  if ([Version](Get-Item -LiteralPath $Path).VersionInfo.FileVersion -lt [Version]'7.5.0') {
    throw 'Artifact Signing requires PowerShell 7.5 or newer for non-coercing JSON validation.'
  }
  Assert-MicrosoftAuthenticodeFile $Path 'PowerShell 7 host' $null
}

function Get-ApprovedPowerShell7Path {
  $programFiles = [Environment]::GetFolderPath(
    [Environment+SpecialFolder]::ProgramFiles
  )
  $candidates = @()
  $standardPath = Join-Path $programFiles 'PowerShell\7\pwsh.exe'
  if (Test-Path -LiteralPath $standardPath -PathType Leaf) {
    $candidates += $standardPath
  }
  if ($PSVersionTable.PSEdition -ceq 'Core') {
    $currentHost = (Get-Process -Id $PID).Path
    if (-not [string]::IsNullOrWhiteSpace($currentHost)) {
      $candidates += $currentHost
    }
  }

  if ($PSVersionTable.PSEdition -ceq 'Desktop') {
    $windowsAppsRoot = Join-Path $programFiles 'WindowsApps'
    $candidates += @(
      Microsoft.PowerShell.Core\Get-Module Appx |
        ForEach-Object { Appx\Get-AppxPackage -Name Microsoft.PowerShell -ErrorAction SilentlyContinue } |
        Where-Object {
          [string]$_.Architecture -ceq 'X64' -and
          $_.InstallLocation -like "$windowsAppsRoot\Microsoft.PowerShell_*"
        } |
        Sort-Object Version -Descending |
        ForEach-Object { Join-Path $_.InstallLocation 'pwsh.exe' } |
        Where-Object { Test-Path -LiteralPath $_ -PathType Leaf }
    )
  }

  foreach ($candidate in $candidates) {
    try {
      $trustedCandidate = Get-TrustedPath $candidate 'PowerShell 7 host' -AllowHardLink
      Assert-ApprovedPowerShell7Path $trustedCandidate
      return $trustedCandidate
    } catch {
      continue
    }
  }
  throw 'No approved, Microsoft-signed 64-bit PowerShell 7 host is installed.'
}

function Invoke-TrustedPowerShellRelaunch {
  param(
    [Parameter(Mandatory = $true)] [ValidateSet('Callback', 'Package')] [string]$LaunchMode,
    [string]$Path = '',
    [string]$PackageSource = '',
    [string]$ToolchainRoot = '',
    [string]$Node = '',
    [string]$Git = '',
    [string]$SevenZip = '',
    [string]$ToolchainReceipt = '',
    [string]$ToolchainReceiptSha256 = ''
  )

  $systemHost = Get-TrustedPath $SystemPowerShellPath 'Windows PowerShell bootstrap' -AllowHardLink
  $actualHost = Get-TrustedPath (Get-Process -Id $PID).Path 'Current bootstrap host' -AllowHardLink
  if (-not [string]::Equals($actualHost, $systemHost, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Artifact Signing bootstrap must run under canonical Windows PowerShell.'
  }
  Assert-MicrosoftAuthenticodeFile `
    $systemHost 'Windows PowerShell bootstrap' $null $MicrosoftWindowsPublisher -AllowCatalog

  $powerShell7 = Get-ApprovedPowerShell7Path
  $arguments = @(
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', $PSCommandPath, '-Mode', $LaunchMode, '-TrustedPowerShellHost'
  )
  if ($LaunchMode -ceq 'Callback') {
    if ([string]::IsNullOrWhiteSpace($Path)) {
      throw 'Signing callback requires an artifact path.'
    }
    $arguments += @('-ArtifactPath', $Path)
  } else {
    foreach ($pair in @(
        @('-UnsignedInputRoot', $UnsignedInputRoot),
        @('-SigningInputRoot', $SigningInputRoot),
        @('-BuildReceiptPath', $BuildReceiptPath),
        @('-BuildReceiptSha256', $BuildReceiptSha256),
        @('-ArtifactSigningPackageSource', $PackageSource),
        @('-PortableToolchainRoot', $ToolchainRoot),
        @('-PortableNodePath', $Node),
        @('-PortableGitPath', $Git),
        @('-PortableSevenZipPath', $SevenZip),
        @('-PortableToolchainReceiptPath', $ToolchainReceipt),
        @('-PortableToolchainReceiptSha256', $ToolchainReceiptSha256)
      )) {
      if (-not [string]::IsNullOrWhiteSpace([string]$pair[1])) {
        $arguments += @([string]$pair[0], [string]$pair[1])
      }
    }
  }
  & $powerShell7 @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Trusted PowerShell 7 signing process failed with exit code $LASTEXITCODE."
  }
}

function New-PrivateDirectory {
  param([Parameter(Mandatory = $true)] [string]$Path)

  [IO.Directory]::CreateDirectory($Path) | Out-Null
  $inheritance = [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor
    [Security.AccessControl.InheritanceFlags]::ObjectInherit
  $propagation = [Security.AccessControl.PropagationFlags]::None
  $allow = [Security.AccessControl.AccessControlType]::Allow
  $fullControl = [Security.AccessControl.FileSystemRights]::FullControl
  $identities = @(
    [Security.Principal.WindowsIdentity]::GetCurrent().User,
    [Security.Principal.SecurityIdentifier]::new('S-1-5-18'),
    [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')
  )
  $approvedSids = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach ($identity in $identities) { [void]$approvedSids.Add($identity.Value) }
  $isApprovedAcl = {
    param([Security.AccessControl.DirectorySecurity]$Acl)

    if (-not $Acl.AreAccessRulesProtected -or
        -not $approvedSids.Contains(
          $Acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
        )) {
      return $false
    }
    $rules = @($Acl.GetAccessRules(
      $true,
      $true,
      [Security.Principal.SecurityIdentifier]
    ))
    if ($rules.Count -ne $approvedSids.Count) { return $false }
    foreach ($rule in $rules) {
      if ($rule.IsInherited -or
          $rule.AccessControlType -ne $allow -or
          -not $approvedSids.Contains($rule.IdentityReference.Value) -or
          ($rule.FileSystemRights -band $fullControl) -ne $fullControl) {
        return $false
      }
    }
    return $true
  }

  $existing = Get-Acl -LiteralPath $Path
  if (-not (& $isApprovedAcl $existing)) {
    $security = $existing
    $security.SetAccessRuleProtection($true, $false)
    $security.SetOwner([Security.Principal.WindowsIdentity]::GetCurrent().User)
    $existingRules = @($security.GetAccessRules(
      $true,
      $true,
      [Security.Principal.SecurityIdentifier]
    ))
    foreach ($existingRule in $existingRules) {
      $security.RemoveAccessRuleSpecific($existingRule)
    }
    foreach ($identity in $identities) {
      $rule = [Security.AccessControl.FileSystemAccessRule]::new(
        $identity,
        $fullControl,
        $inheritance,
        $propagation,
        $allow
      )
      [void]$security.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $Path -AclObject $security
  }

  $trustedPath = Get-TrustedPath $Path 'Private signing directory' 'Container'
  $applied = Get-Acl -LiteralPath $trustedPath
  if (-not (& $isApprovedAcl $applied)) {
    throw 'Private signing directory permissions do not match the approved principals.'
  }
  return $trustedPath
}

function Open-ReadLock {
  param([Parameter(Mandatory = $true)] [string]$Path)

  return [IO.File]::Open(
    $Path,
    [IO.FileMode]::Open,
    [IO.FileAccess]::Read,
    [IO.FileShare]::Read
  )
}

function Get-WagglePrebuiltFiles {
  param(
    [Parameter(Mandatory = $true)] [string]$Root,
    [Parameter(Mandatory = $true)] [string]$Label
  )

  $trustedRoot = Get-TrustedPath $Root $Label 'Container'
  $pending = [Collections.Generic.Queue[string]]::new()
  $files = [Collections.Generic.List[string]]::new()
  $pending.Enqueue($trustedRoot)
  while ($pending.Count -gt 0) {
    $directory = $pending.Dequeue()
    foreach ($item in @(Get-ChildItem -LiteralPath $directory -Force)) {
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "$Label contains a reparse point or linked filesystem object: $($item.FullName)"
      }
      if ($item.PSIsContainer) {
        $pending.Enqueue((Get-TrustedPath $item.FullName $Label 'Container'))
      } else {
        $files.Add((Get-TrustedPath $item.FullName $Label -AllowHardLink))
      }
    }
  }
  return [pscustomobject]@{ Root = $trustedRoot; Files = @($files) }
}

function Get-WaggleInventorySha256 {
  param([Parameter(Mandatory = $true)] [object[]]$Entries)

  $canonical = @($Entries | ForEach-Object {
    [ordered]@{
      path = [string]$_.path
      size = [long]$_.size
      sha256 = ([string]$_.sha256).ToUpperInvariant()
    }
  }) | ConvertTo-Json -Depth 8 -Compress
  return [Convert]::ToHexString(
    [Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($canonical))
  )
}

function Assert-WaggleCanonicalInventoryEntries {
  param(
    [Parameter(Mandatory = $true)] [object[]]$Entries,
    [Parameter(Mandatory = $true)] [string]$Label
  )

  $exactPaths = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  $foldedPaths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  $orderedPaths = [Collections.Generic.List[string]]::new()
  foreach ($entry in $Entries) {
    $relativePath = [string](Get-RequiredPropertyValue $entry 'path' "$Label entry")
    $sha256 = [string](Get-RequiredPropertyValue $entry 'sha256' "$Label entry")
    $size = [long](Get-RequiredPropertyValue $entry 'size' "$Label entry")
    if ([string]::IsNullOrWhiteSpace($relativePath) -or
        $relativePath -match '[\x00-\x1F\x7F]' -or
        $relativePath -match '(^|[\\/])\.\.?(?:[\\/]|$)' -or
        [IO.Path]::IsPathRooted($relativePath) -or
        $relativePath.Contains('/') -or
        $relativePath.Contains(':') -or
        @($relativePath -split '\\' | Where-Object { $_ -match '[. ]$' }).Count -ne 0) {
      throw "$Label contains an unsafe or non-canonical relative path."
    }
    if (-not $exactPaths.Add($relativePath) -or -not $foldedPaths.Add($relativePath)) {
      throw "$Label contains a duplicate canonical path or case-insensitive case collision."
    }
    if ($sha256 -notmatch '^[0-9A-Fa-f]{64}$' -or $size -lt 0) {
      throw "$Label contains an invalid SHA-256 digest or file size."
    }
    $orderedPaths.Add($relativePath)
  }
  $sortedPaths = [Collections.Generic.List[string]]::new()
  foreach ($path in $orderedPaths) { $sortedPaths.Add($path) }
  $sortedPaths.Sort([StringComparer]::Ordinal)
  if ([string]::Join("`n", $orderedPaths) -cne [string]::Join("`n", $sortedPaths)) {
    throw "$Label entries must be sorted by ordinal canonical path."
  }
}

function New-WagglePrebuiltInventory {
  param(
    [Parameter(Mandatory = $true)] [string]$Root,
    [string]$CargoReleaseRelativePath = 'release'
  )

  $tree = Get-WagglePrebuiltFiles $Root 'Prebuilt input tree'
  $entries = [Collections.Generic.List[object]]::new()
  foreach ($path in $tree.Files) {
    $streams = @(Get-Item -LiteralPath $path -Stream * -ErrorAction Stop)
    if ($streams.Count -ne 1 -or [string]$streams[0].Stream -cne ':$DATA') {
      throw 'Prebuilt input tree contains an alternate data stream (ADS).'
    }
    $relative = (Get-ContainedRelativePath $path $tree.Root).Replace('/', '\')
    if ($null -eq $relative) { throw 'Prebuilt input tree path escaped its root.' }
    $item = Get-Item -LiteralPath $path -Force
    $linkTypeProperty = $item.PSObject.Properties['LinkType']
    $linkType = if ($null -eq $linkTypeProperty) { '' } else { [string]$linkTypeProperty.Value }
    if (-not [string]::IsNullOrEmpty($linkType)) {
      if ($linkType -cne 'HardLink') {
        throw 'Prebuilt input tree contains an unsupported linked filesystem object.'
      }
      Assert-ApprovedHardLinkTopology `
        $path (Join-Path $tree.Root $CargoReleaseRelativePath)
    }
    $lock = Open-ReadLock $path
    try {
      $entries.Add([pscustomobject][ordered]@{
        path = $relative
        size = [long]$item.Length
        sha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
      })
    } finally {
      $lock.Dispose()
    }
  }
  $sortedEntries = @($entries)
  [Array]::Sort($sortedEntries, [Comparison[object]]{
    param($left, $right)
    return [StringComparer]::Ordinal.Compare([string]$left.path, [string]$right.path)
  })
  Assert-WaggleCanonicalInventoryEntries $sortedEntries 'Prebuilt input inventory'
  return [pscustomobject][ordered]@{
    entries = $sortedEntries
    sha256 = Get-WaggleInventorySha256 $sortedEntries
  }
}

function Test-WagglePathsOverlap {
  param(
    [Parameter(Mandatory = $true)] [string]$Left,
    [Parameter(Mandatory = $true)] [string]$Right
  )
  $leftPath = [IO.Path]::GetFullPath($Left).TrimEnd('\')
  $rightPath = [IO.Path]::GetFullPath($Right).TrimEnd('\')
  return [string]::Equals($leftPath, $rightPath, [StringComparison]::OrdinalIgnoreCase) -or
    $leftPath.StartsWith("$rightPath\", [StringComparison]::OrdinalIgnoreCase) -or
    $rightPath.StartsWith("$leftPath\", [StringComparison]::OrdinalIgnoreCase)
}

function New-WagglePrebuiltWorkCopy {
  param(
    [Parameter(Mandatory = $true)] [string]$SourceRoot,
    [Parameter(Mandatory = $true)] [string]$DestinationRoot,
    [Parameter(Mandatory = $true)] [object]$Inventory,
    [Parameter(Mandatory = $true)] [string]$Label,
    [string]$CargoReleaseRelativePath = 'x86_64-pc-windows-msvc\release'
  )

  $source = Get-TrustedPath $SourceRoot "$Label source" 'Container'
  $destination = [IO.Path]::GetFullPath($DestinationRoot)
  if ((Test-WagglePathsOverlap $source $destination) -or
      (Test-Path -LiteralPath $destination)) {
    throw "$Label destination must be absent and distinct from its source."
  }
  $root = New-PrivateDirectory $destination
  $entries = @((Get-RequiredPropertyValue $Inventory 'entries' "$Label inventory"))
  Assert-WaggleCanonicalInventoryEntries $entries "$Label inventory"
  $releaseRelative = $CargoReleaseRelativePath
  $mainRelative = "$releaseRelative\waggle.exe"
  $dependencyRelative = "$releaseRelative\deps\waggle.exe"
  $mainEntry = @($entries | Where-Object { [string]$_.path -ceq $mainRelative })
  $dependencyEntry = @($entries | Where-Object { [string]$_.path -ceq $dependencyRelative })
  if ($mainEntry.Count -ne 1 -or $dependencyEntry.Count -ne 1 -or
      [long]$mainEntry[0].size -ne [long]$dependencyEntry[0].size -or
      -not [string]::Equals(
        [string]$mainEntry[0].sha256,
        [string]$dependencyEntry[0].sha256,
        [StringComparison]::OrdinalIgnoreCase
      )) {
    throw "$Label inventory lacks the exact equal-byte Cargo executable pair."
  }
  try {
    foreach ($entry in $entries) {
      $relative = [string]$entry.path
      if ($relative -ceq $mainRelative) { continue }
      $sourcePath = Get-TrustedPath `
        (Join-Path $source $relative) "$Label source file" -AllowHardLink
      $destinationPath = Join-Path $root $relative
      [IO.Directory]::CreateDirectory((Split-Path $destinationPath -Parent)) | Out-Null
      [IO.File]::Copy($sourcePath, $destinationPath, $false)
    }
    $dependencyPath = Join-Path $root $dependencyRelative
    $mainPath = Join-Path $root $mainRelative
    New-Item -ItemType HardLink -Path $mainPath -Target $dependencyPath | Out-Null
    $copyInventory = New-WagglePrebuiltInventory `
      -Root $root -CargoReleaseRelativePath $CargoReleaseRelativePath
    if (-not [string]::Equals(
        [string]$copyInventory.sha256,
        [string](Get-RequiredPropertyValue $Inventory 'sha256' "$Label inventory"),
        [StringComparison]::OrdinalIgnoreCase
      )) {
      throw "$Label work copy does not match the receipt-bound inventory."
    }
    Assert-ApprovedHardLinkTopology `
      $mainPath (Join-Path $root $releaseRelative)
    return $root
  } catch {
    if (Test-Path -LiteralPath $root) {
      Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
    }
    throw
  }
}

function Assert-WaggleHostedDiskCapacity {
  param(
    [Parameter(Mandatory = $true)] [string]$Path,
    [Parameter(Mandatory = $true)] [object]$Inventory,
    [long]$AvailableBytes = -1
  )
  $entries = @((Get-RequiredPropertyValue $Inventory 'entries' 'Hosted build target inventory'))
  $inventoryBytes = [long]0
  foreach ($entry in $entries) {
    $size = [long](Get-RequiredPropertyValue $entry 'size' 'Hosted build inventory entry')
    if ($size -lt 0 -or $inventoryBytes -gt [long]::MaxValue - $size) {
      throw 'Hosted build target inventory has an invalid aggregate size.'
    }
    $inventoryBytes += $size
  }
  $safetyBytes = [Math]::Max(2GB, [long][Math]::Ceiling($inventoryBytes / 2.0))
  $requiredBytes = $inventoryBytes + $safetyBytes
  if ($AvailableBytes -lt 0) {
    $root = [IO.Path]::GetPathRoot([IO.Path]::GetFullPath($Path))
    $AvailableBytes = [IO.DriveInfo]::new($root).AvailableFreeSpace
  }
  if ($AvailableBytes -lt $requiredBytes) {
    throw "Hosted signing has insufficient free disk space: requires $requiredBytes bytes, available $AvailableBytes bytes."
  }
  return $requiredBytes
}

function New-WagglePreflightEvidenceCopy {
  param(
    [Parameter(Mandatory = $true)] [object]$Context,
    [Parameter(Mandatory = $true)] [string]$DestinationRoot
  )
  $root = New-PrivateDirectory $DestinationRoot
  try {
    $fixedPaths = @(Get-ExpectedNsisFixedPaths $Context '0.0.0')
    $mainSource = Get-TrustedPath $fixedPaths[0] 'Unsigned preflight main' -AllowHardLink
    $mainRelative = Get-ContainedRelativePath $mainSource $Context.TargetRoot
    if ($null -eq $mainRelative) {
      throw 'Unsigned preflight main escaped its target root.'
    }
    $mainDestination = Join-Path $root $mainRelative
    $dependencyDestination = Join-Path `
      (Split-Path $mainDestination -Parent) 'deps\waggle.exe'
    [IO.Directory]::CreateDirectory((Split-Path $dependencyDestination -Parent)) | Out-Null
    [IO.File]::Copy($mainSource, $dependencyDestination, $false)
    New-Item -ItemType HardLink -Path $mainDestination -Target $dependencyDestination | Out-Null
    Assert-ApprovedHardLinkTopology `
      $mainDestination (Split-Path $mainDestination -Parent)

    foreach ($sourcePathValue in @($fixedPaths | Select-Object -Skip 1)) {
      $sourcePath = Get-TrustedPath `
        $sourcePathValue 'Unsigned preflight evidence source' -AllowHardLink
      $relative = Get-ContainedRelativePath $sourcePath $Context.TargetRoot
      if ($null -eq $relative) {
        throw 'Unsigned preflight evidence escaped its target root.'
      }
      $destination = Join-Path $root $relative
      [IO.Directory]::CreateDirectory((Split-Path $destination -Parent)) | Out-Null
      [IO.File]::Copy($sourcePath, $destination, $false)
      if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -cne
          (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash) {
        throw 'Unsigned preflight evidence copy failed digest verification.'
      }
    }
    return $root
  } catch {
    if (Test-Path -LiteralPath $root) {
      Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
    }
    throw
  }
}

function Open-WaggleValidatedPrebuiltTree {
  param(
    [Parameter(Mandatory = $true)] [string]$Root,
    [Parameter(Mandatory = $true)] [object]$ExpectedInventory,
    [Parameter(Mandatory = $true)] [string]$Label,
    [string[]]$DisallowedRoots = @(),
    [string[]]$MutablePaths = @(),
    [string[]]$RegeneratedRoots = @(),
    [string]$CargoReleaseRelativePath = 'release'
  )

  $trustedRoot = Get-TrustedPath $Root $Label 'Container'
  foreach ($disallowedRoot in $DisallowedRoots) {
    $overlaps = if ([string]::IsNullOrWhiteSpace($disallowedRoot)) {
      $false
    } else {
      Test-WagglePathsOverlap $trustedRoot ([IO.Path]::GetFullPath($disallowedRoot))
    }
    if (-not [string]::IsNullOrWhiteSpace($disallowedRoot) -and
        $overlaps) {
      throw "$Label must be distinct from every disallowed root; root overlap is forbidden."
    }
  }
  $expectedEntries = @((Get-RequiredPropertyValue $ExpectedInventory 'entries' "$Label inventory"))
  $expectedSha256 = [string](Get-RequiredPropertyValue `
    $ExpectedInventory 'sha256' "$Label inventory")
  Assert-WaggleCanonicalInventoryEntries $expectedEntries "$Label inventory"
  if ($expectedSha256 -notmatch '^[0-9A-Fa-f]{64}$' -or
      -not [string]::Equals(
        (Get-WaggleInventorySha256 $expectedEntries),
        $expectedSha256,
        [StringComparison]::OrdinalIgnoreCase
      )) {
    throw "$Label inventory aggregate SHA-256 digest is invalid."
  }

  $tree = Get-WagglePrebuiltFiles $trustedRoot $Label
  $actualPaths = [Collections.Generic.List[string]]::new()
  foreach ($path in $tree.Files) {
    $relative = Get-ContainedRelativePath $path $trustedRoot
    if ($null -eq $relative) { throw "$Label path escaped its root." }
    $actualPaths.Add($relative.Replace('/', '\'))
  }
  $actualPaths.Sort([StringComparer]::Ordinal)
  $expectedPaths = @($expectedEntries | ForEach-Object { [string]$_.path })
  if ($actualPaths.Count -ne $expectedPaths.Count -or
      [string]::Join("`n", $actualPaths) -cne [string]::Join("`n", $expectedPaths)) {
    throw "$Label contains missing, extra, or unexpected files relative to its inventory."
  }

  $mutableSet = [Collections.Generic.HashSet[string]]::new(
    [StringComparer]::OrdinalIgnoreCase
  )
  foreach ($mutablePathValue in @($MutablePaths)) {
    $mutablePath = Get-TrustedPath `
      $mutablePathValue "$Label mutable file" -AllowHardLink
    if ($null -eq (Get-ContainedRelativePath $mutablePath $trustedRoot) -or
        -not $mutableSet.Add($mutablePath)) {
      throw "$Label mutable-file roster contains an escaped or duplicate path."
    }
  }
  $regeneratedRootList = [Collections.Generic.List[string]]::new()
  foreach ($regeneratedRootValue in @($RegeneratedRoots)) {
    $regeneratedRoot = Get-TrustedPath `
      $regeneratedRootValue "$Label regenerated root" 'Container'
    $relativeRoot = Get-ContainedRelativePath $regeneratedRoot $trustedRoot
    if ($null -eq $relativeRoot -or $relativeRoot -ceq '.') {
      throw "$Label regenerated-root roster contains an escaped or unsafe root."
    }
    foreach ($existingRoot in $regeneratedRootList) {
      if (Test-WagglePathsOverlap $regeneratedRoot $existingRoot) {
        throw "$Label regenerated-root roster contains duplicate or overlapping roots."
      }
    }
    $regeneratedRootList.Add($regeneratedRoot)
  }
  $matchedMutableSet = [Collections.Generic.HashSet[string]]::new(
    [StringComparer]::OrdinalIgnoreCase
  )
  $matchedRegeneratedRoots = [Collections.Generic.HashSet[string]]::new(
    [StringComparer]::OrdinalIgnoreCase
  )

  $locks = [Collections.Generic.List[IDisposable]]::new()
  try {
    for ($index = 0; $index -lt $expectedEntries.Count; $index++) {
      $entry = $expectedEntries[$index]
      $path = Get-TrustedPath (Join-Path $trustedRoot ([string]$entry.path)) $Label -AllowHardLink
      $streams = @(Get-Item -LiteralPath $path -Stream * -ErrorAction Stop)
      if ($streams.Count -ne 1 -or [string]$streams[0].Stream -cne ':$DATA') {
        throw "$Label contains an alternate data stream (ADS)."
      }
      $item = Get-Item -LiteralPath $path -Force
      $linkTypeProperty = $item.PSObject.Properties['LinkType']
      $linkType = if ($null -eq $linkTypeProperty) { '' } else { [string]$linkTypeProperty.Value }
      if (-not [string]::IsNullOrEmpty($linkType)) {
        if ($linkType -cne 'HardLink') { throw "$Label contains an unsupported link." }
        Assert-ApprovedHardLinkTopology `
          $path (Join-Path $trustedRoot $CargoReleaseRelativePath)
      }
      $lock = Open-ReadLock $path
      try {
        if ([long]$item.Length -ne [long]$entry.size -or
            -not [string]::Equals(
              (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash,
              [string]$entry.sha256,
              [StringComparison]::OrdinalIgnoreCase
            )) {
          throw "$Label file does not match its inventory SHA-256 digest and size."
        }
        if ($mutableSet.Contains($path)) {
          [void]$matchedMutableSet.Add($path)
        }
        $isRegeneratedOutput = $false
        foreach ($regeneratedRoot in $regeneratedRootList) {
          if ($null -ne (Get-ContainedRelativePath $path $regeneratedRoot)) {
            $isRegeneratedOutput = $true
            [void]$matchedRegeneratedRoots.Add($regeneratedRoot)
            break
          }
        }
        if (-not $mutableSet.Contains($path) -and -not $isRegeneratedOutput) {
          $locks.Add($lock)
          $lock = $null
        }
      } finally {
        if ($null -ne $lock) { $lock.Dispose() }
      }
    }
    if ($matchedMutableSet.Count -ne $mutableSet.Count) {
      throw "$Label mutable-file roster does not match its exact inventory."
    }
    if ($matchedRegeneratedRoots.Count -ne $regeneratedRootList.Count) {
      throw "$Label regenerated-root roster does not match its exact inventory."
    }
    return [pscustomobject]@{
      Root = $trustedRoot
      Inventory = $ExpectedInventory
      Locks = $locks
      MutablePaths = @($mutableSet)
      RegeneratedRoots = @($regeneratedRootList)
    }
  } catch {
    foreach ($lock in $locks) { $lock.Dispose() }
    throw
  }
}

function Clear-WaggleRegeneratedRoots {
  param([Parameter(Mandatory = $true)] [object]$Lease)

  $leaseRoot = Get-TrustedPath $Lease.Root 'Validated prebuilt work root' 'Container'
  foreach ($rootValue in @($Lease.RegeneratedRoots)) {
    $trustedRoot = Get-TrustedPath `
      ([string]$rootValue) 'Validated Tauri-generated output root' 'Container'
    $relativeRoot = Get-ContainedRelativePath $trustedRoot $leaseRoot
    if ($null -eq $relativeRoot -or $relativeRoot -ceq '.') {
      throw 'Tauri-generated output root escaped its validated private work root.'
    }
    [IO.Directory]::Delete($trustedRoot, $true)
    if (Test-Path -LiteralPath $trustedRoot) {
      throw 'Tauri-generated output root could not be cleared before packaging.'
    }
  }
}

function Get-NsisPatchedMainSha256 {
  param([Parameter(Mandatory = $true)] [string]$Path)

  $trustedPath = Get-TrustedPath $Path 'Tauri main executable' -AllowHardLink
  $lock = Open-ReadLock $trustedPath
  try {
    $bytes = [IO.File]::ReadAllBytes($trustedPath)
    $unknownToken = [Text.Encoding]::ASCII.GetBytes('__TAURI_BUNDLE_TYPE_VAR_UNK')
    $nsisToken = [Text.Encoding]::ASCII.GetBytes('__TAURI_BUNDLE_TYPE_VAR_NSS')
    $msiToken = [Text.Encoding]::ASCII.GetBytes('__TAURI_BUNDLE_TYPE_VAR_MSI')
    $findOffsets = {
      param([byte[]]$Needle)
      $offsets = [Collections.Generic.List[int]]::new()
      for ($offset = 0; $offset -le $bytes.Length - $Needle.Length; $offset++) {
        $matches = $true
        for ($index = 0; $index -lt $Needle.Length; $index++) {
          if ($bytes[$offset + $index] -ne $Needle[$index]) {
            $matches = $false
            break
          }
        }
        if ($matches) { $offsets.Add($offset) }
      }
      return @($offsets)
    }
    $unknownOffsets = @(& $findOffsets $unknownToken)
    if ($unknownOffsets.Count -ne 1 -or
        @(& $findOffsets $nsisToken).Count -ne 0 -or
        @(& $findOffsets $msiToken).Count -ne 0) {
      throw 'Tauri main executable must contain exactly one unpatched bundle-type token.'
    }
    $patched = [byte[]]$bytes.Clone()
    [Array]::Copy($nsisToken, 0, $patched, $unknownOffsets[0], $nsisToken.Length)
    return [Convert]::ToHexString(
      [Security.Cryptography.SHA256]::HashData($patched)
    )
  } finally {
    $lock.Dispose()
  }
}

function Get-RequiredPropertyValue {
  param(
    [Parameter(Mandatory = $true)] [object]$InputObject,
    [Parameter(Mandatory = $true)] [string]$Name,
    [Parameter(Mandatory = $true)] [string]$Label
  )

  $property = $InputObject.PSObject.Properties[$Name]
  if ($null -eq $property -or $null -eq $property.Value) {
    throw "$Label is missing required property '$Name'."
  }
  return $property.Value
}

function Assert-ExactCanonicalPathValue {
  param(
    [Parameter(Mandatory = $true)] [string]$Actual,
    [Parameter(Mandatory = $true)] [string]$Expected,
    [Parameter(Mandatory = $true)] [string]$Label
  )

  if ([string]::IsNullOrWhiteSpace($Actual) -or
      $Actual -match '[\x00-\x1F\x7F]' -or
      $Actual -notmatch '^[A-Za-z]:[\\/]' -or
      $Actual -match '^[\\/]{2}' -or
      $Actual -match '(^|[\\/])\.\.?(?:[\\/]|$)' -or
      $Actual.Substring(2) -match ':' -or
      @($Actual -split '[\\/]' | Where-Object { $_ -match '[. ]$' }).Count -gt 0) {
    throw "$Label must be a safe, fully qualified local Windows path."
  }
  if (-not [string]::Equals(
      [IO.Path]::GetFullPath($Actual),
      [IO.Path]::GetFullPath($Expected),
      [StringComparison]::OrdinalIgnoreCase
    )) {
    throw "$Label does not match the signing session."
  }
}

function Get-WaggleSigningSlotPhase {
  param([Parameter(Mandatory = $true)] [int]$Order)
  if ($Order -eq 1) { return 1 }
  if ($Order -ge 2 -and $Order -le 7) { return 2 }
  if ($Order -ge 8 -and $Order -le 12) { return 3 }
  if ($Order -eq 13) { return 4 }
  if ($Order -eq 14) { return 5 }
  throw 'Signing callback slot order is outside the exact NSIS phase roster.'
}

function Assert-PrivateDirectoryAcl {
  param(
    [Parameter(Mandatory = $true)] [string]$Path,
    [Parameter(Mandatory = $true)] [string]$Label
  )

  $directory = Get-TrustedPath $Path $Label 'Container'
  $acl = Get-Acl -LiteralPath $directory
  $allow = [Security.AccessControl.AccessControlType]::Allow
  $fullControl = [Security.AccessControl.FileSystemRights]::FullControl
  $approvedSids = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach ($identity in @(
      [Security.Principal.WindowsIdentity]::GetCurrent().User,
      [Security.Principal.SecurityIdentifier]::new('S-1-5-18'),
      [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')
    )) {
    [void]$approvedSids.Add($identity.Value)
  }

  if (-not $acl.AreAccessRulesProtected -or
      -not $approvedSids.Contains(
        $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
      )) {
    throw "$Label must have protected private signing permissions."
  }
  $rules = @($acl.GetAccessRules(
    $true,
    $true,
    [Security.Principal.SecurityIdentifier]
  ))
  if ($rules.Count -ne $approvedSids.Count) {
    throw "$Label contains an unexpected access rule."
  }
  foreach ($rule in $rules) {
    if ($rule.IsInherited -or
        $rule.AccessControlType -ne $allow -or
        -not $approvedSids.Contains($rule.IdentityReference.Value) -or
        ($rule.FileSystemRights -band $fullControl) -ne $fullControl) {
      throw "$Label contains an unapproved access rule."
    }
  }
  return $directory
}

function Assert-WagglePinnedToolFile {
  param(
    [Parameter(Mandatory = $true)] [string]$Path,
    [Parameter(Mandatory = $true)] [string]$Label,
    [Parameter(Mandatory = $true)] [string]$ExpectedSha256,
    [AllowNull()] [string]$ExpectedPublisher,
    [switch]$AllowCatalog,
    [switch]$AllowHardLink
  )

  $trustedPath = Get-TrustedPath $Path $Label -AllowHardLink:$AllowHardLink
  if ([string]::IsNullOrEmpty($ExpectedPublisher)) {
    if ((Get-FileHash -LiteralPath $trustedPath -Algorithm SHA256).Hash -cne
        $ExpectedSha256) {
      throw "$Label does not match the pinned SHA-256 digest."
    }
  } else {
    Assert-ApprovedAuthenticodeFile `
      $trustedPath $Label $ExpectedSha256 $ExpectedPublisher `
      -AllowCatalog:$AllowCatalog
  }
  return $trustedPath
}

function Open-WagglePortableToolchainReceipt {
  param(
    [Parameter(Mandatory = $true)] [string]$Root,
    [Parameter(Mandatory = $true)] [string]$ReceiptPath,
    [Parameter(Mandatory = $true)] [string]$ReceiptSha256,
    [string[]]$DisallowedRoots = @()
  )

  if ($ReceiptSha256 -notmatch '^[0-9A-Fa-f]{64}$') {
    throw 'Portable signing toolchain receipt SHA-256 is invalid.'
  }
  $trustedRoot = Assert-PrivateDirectoryAcl $Root 'Portable signing toolchain root'
  $trustedReceipt = Get-TrustedPath $ReceiptPath 'Portable signing toolchain receipt'
  if (Test-WagglePathsOverlap $trustedRoot $trustedReceipt) {
    throw 'Portable signing toolchain receipt must be outside its toolchain root.'
  }
  foreach ($disallowedRoot in @($DisallowedRoots | Where-Object {
      -not [string]::IsNullOrWhiteSpace([string]$_)
    })) {
    if (Test-WagglePathsOverlap $trustedReceipt ([string]$disallowedRoot)) {
      throw 'Portable signing toolchain receipt overlaps a protected signing boundary.'
    }
  }
  $locks = [Collections.Generic.List[IDisposable]]::new()
  try {
    $receiptLock = Open-ReadLock $trustedReceipt
    $locks.Add($receiptLock)
    if (-not [string]::Equals(
        (Get-FileHash -LiteralPath $trustedReceipt -Algorithm SHA256).Hash,
        $ReceiptSha256,
        [StringComparison]::OrdinalIgnoreCase
      )) {
      throw 'Portable signing toolchain receipt does not match its handoff SHA-256.'
    }
    try {
      $receipt = Get-Content -Raw -LiteralPath $trustedReceipt |
        ConvertFrom-Json -Depth 32 -DateKind String
    } catch {
      throw 'Portable signing toolchain receipt is not valid JSON.'
    }
    if ([int](Get-RequiredPropertyValue `
        $receipt 'schemaVersion' 'Portable signing toolchain receipt') -ne 1) {
      throw 'Portable signing toolchain receipt schemaVersion must be 1.'
    }
    Assert-ExactCanonicalPathValue `
      ([string](Get-RequiredPropertyValue `
        $receipt 'portableToolchainRoot' 'Portable signing toolchain receipt')) `
      $trustedRoot 'Portable signing toolchain receipt root'

    $archives = Get-RequiredPropertyValue `
      $receipt 'archives' 'Portable signing toolchain receipt'
    $archiveBindings = @(
      @('node', $NodeArchiveSha256),
      @('git', $GitArchiveSha256),
      @('sevenZip', $SevenZipArchiveSha256)
    )
    $archivePaths = [Collections.Generic.HashSet[string]]::new(
      [StringComparer]::OrdinalIgnoreCase
    )
    foreach ($binding in $archiveBindings) {
      $archive = Get-RequiredPropertyValue `
        $archives ([string]$binding[0]) 'Portable toolchain archives'
      $archivePath = Get-TrustedPath `
        ([string](Get-RequiredPropertyValue `
          $archive 'path' 'Portable toolchain vendor archive')) `
        'Portable toolchain vendor archive'
      $archiveHash = [string](Get-RequiredPropertyValue `
        $archive 'sha256' 'Portable toolchain vendor archive')
      if ($archiveHash -cne [string]$binding[1] -or
          -not $archivePaths.Add($archivePath) -or
          (Test-WagglePathsOverlap $trustedRoot $archivePath) -or
          [string]::Equals(
            $trustedReceipt, $archivePath, [StringComparison]::OrdinalIgnoreCase
          )) {
        throw 'Portable toolchain vendor archives are not the exact distinct repository-pinned handoff.'
      }
      foreach ($disallowedRoot in @($DisallowedRoots | Where-Object {
          -not [string]::IsNullOrWhiteSpace([string]$_)
        })) {
        if (Test-WagglePathsOverlap $archivePath ([string]$disallowedRoot)) {
          throw 'Portable toolchain vendor archive overlaps a protected signing boundary.'
        }
      }
      $archiveLock = Open-ReadLock $archivePath
      if ((Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash -cne
          $archiveHash) {
        $archiveLock.Dispose()
        throw 'Portable toolchain vendor archive does not match its pinned SHA-256.'
      }
      $locks.Add($archiveLock)
    }

    $inventory = Get-RequiredPropertyValue `
      $receipt 'inventory' 'Portable signing toolchain receipt'
    $inventoryEntries = @((Get-RequiredPropertyValue `
      $inventory 'entries' 'Portable signing toolchain inventory'))
    $inventoryHash = [string](Get-RequiredPropertyValue `
      $inventory 'sha256' 'Portable signing toolchain inventory')
    if ($inventoryEntries.Count -ne $PortableToolchainFileCount -or
        $inventoryHash -cne $PortableToolchainInventorySha256) {
      throw 'Portable signing toolchain inventory does not match the repository-pinned full closure.'
    }
    $treeLease = Open-WaggleValidatedPrebuiltTree `
      $trustedRoot $inventory 'Portable signing toolchain full closure' `
      ($DisallowedRoots + @($trustedReceipt) + @($archivePaths))
    foreach ($treeLock in $treeLease.Locks) { $locks.Add($treeLock) }
    $treeLease.Locks.Clear()
    return [pscustomobject]@{
      Receipt = $receipt
      ReceiptPath = $trustedReceipt
      ReceiptSha256 = $ReceiptSha256.ToUpperInvariant()
      Inventory = $inventory
      InventorySha256 = $inventoryHash
      Locks = $locks
    }
  } catch {
    foreach ($lock in $locks) { $lock.Dispose() }
    throw
  }
}

function Get-WagglePortableToolchain {
  param(
    [Parameter(Mandatory = $true)] [string]$Root,
    [Parameter(Mandatory = $true)] [string]$Node,
    [Parameter(Mandatory = $true)] [string]$Git,
    [Parameter(Mandatory = $true)] [string]$SevenZip,
    [Parameter(Mandatory = $true)] [string]$ReceiptPath,
    [Parameter(Mandatory = $true)] [string]$ReceiptSha256,
    [string[]]$DisallowedRoots = @()
  )

  $trustedRoot = Assert-PrivateDirectoryAcl $Root 'Portable signing toolchain root'
  foreach ($disallowedRoot in @($DisallowedRoots | Where-Object {
      -not [string]::IsNullOrWhiteSpace([string]$_)
    })) {
    if (Test-WagglePathsOverlap $trustedRoot ([string]$disallowedRoot)) {
      throw 'Portable signing toolchain root overlaps a repository, prebuilt, receipt, or signing-temp boundary.'
    }
  }

  $receiptLease = Open-WagglePortableToolchainReceipt `
    $trustedRoot $ReceiptPath $ReceiptSha256 -DisallowedRoots $DisallowedRoots
  $receiptLeaseTransferred = $false
  try {
  $rootItems = @(Get-ChildItem -LiteralPath $trustedRoot -Force -Recurse)
  $rootFiles = @($rootItems | Where-Object { -not $_.PSIsContainer })
  $rootBytes = [long](($rootFiles | Measure-Object -Property Length -Sum).Sum)
  if ($rootItems.Count -gt 20000 -or $rootBytes -gt 1GB) {
    throw 'Portable signing toolchain root exceeds the bounded 20,000-item or 1-GiB trust envelope.'
  }
  foreach ($item in $rootItems) {
    $linkProperty = $item.PSObject.Properties['LinkType']
    $linkType = if ($null -eq $linkProperty) { '' } else { [string]$linkProperty.Value }
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
        -not [string]::IsNullOrEmpty($linkType)) {
      throw 'Portable signing toolchain root contains a linked or reparse filesystem object.'
    }
  }

  $requestedTools = [ordered]@{
    Node = @($Node, 'Portable Node.js runtime')
    Git = @($Git, 'Portable Git executable')
    SevenZip = @($SevenZip, 'Portable 7-Zip inventory tool')
  }
  $trustedTools = @{}
  $uniquePaths = [Collections.Generic.HashSet[string]]::new(
    [StringComparer]::OrdinalIgnoreCase
  )
  foreach ($entry in $requestedTools.GetEnumerator()) {
    $trustedPath = Get-TrustedPath ([string]$entry.Value[0]) ([string]$entry.Value[1])
    $relativePath = Get-ContainedRelativePath $trustedPath $trustedRoot
    if ([string]::IsNullOrEmpty($relativePath)) {
      throw "$($entry.Value[1]) must be a regular non-reparse file contained by the private portable toolchain root."
    }
    if (-not $uniquePaths.Add($trustedPath)) {
      throw 'Portable signing tool paths must be distinct regular files.'
    }
    $trustedTools[[string]$entry.Key] = $trustedPath
  }

  $sevenZipDll = Get-TrustedPath `
    (Join-Path (Split-Path $trustedTools.SevenZip -Parent) '7z.dll') `
    'Portable 7-Zip runtime library'
  $sevenZipDllRelative = Get-ContainedRelativePath $sevenZipDll $trustedRoot
  if ([string]::IsNullOrEmpty($sevenZipDllRelative) -or
      -not $uniquePaths.Add($sevenZipDll)) {
    throw 'Portable 7-Zip runtime library must be a distinct regular file contained by the private portable toolchain root.'
  }
  $gitRuntime = Get-TrustedPath `
    (Join-Path (Split-Path (Split-Path $trustedTools.Git -Parent) -Parent) `
      'mingw64\bin\git.exe') `
    'Portable Git runtime'
  $gitRuntimeRelative = Get-ContainedRelativePath $gitRuntime $trustedRoot
  if ([string]::IsNullOrEmpty($gitRuntimeRelative) -or
      -not $uniquePaths.Add($gitRuntime)) {
    throw 'Portable Git runtime must be a distinct regular file contained by the private portable toolchain root.'
  }

  $trustedTools.Node = Assert-WagglePinnedToolFile `
    $trustedTools.Node 'Portable Node.js runtime' $NodeSha256 $NodePublisher
  $trustedTools.Git = Assert-WagglePinnedToolFile `
    $trustedTools.Git 'Portable Git executable' $GitSha256 $GitPublisher
  $gitRuntime = Assert-WagglePinnedToolFile `
    $gitRuntime 'Portable Git runtime' $GitRuntimeSha256 $GitPublisher
  $trustedTools.SevenZip = Assert-WagglePinnedToolFile `
    $trustedTools.SevenZip 'Portable 7-Zip inventory tool' $SevenZipSha256 $null
  $sevenZipDll = Assert-WagglePinnedToolFile `
    $sevenZipDll 'Portable 7-Zip runtime library' $SevenZipDllSha256 $null

  $result = [pscustomobject]@{
    PortableToolchainRoot = $trustedRoot
    NodePath = $trustedTools.Node
    GitPath = $trustedTools.Git
    GitRuntimePath = $gitRuntime
    SevenZipPath = $trustedTools.SevenZip
    SevenZipDllPath = $sevenZipDll
    ReceiptPath = $receiptLease.ReceiptPath
    ReceiptSha256 = $receiptLease.ReceiptSha256
    InventorySha256 = $receiptLease.InventorySha256
    Locks = $receiptLease.Locks
  }
  $receiptLeaseTransferred = $true
  return $result
  } finally {
    if (-not $receiptLeaseTransferred) {
      foreach ($lock in $receiptLease.Locks) { $lock.Dispose() }
    }
  }
}

function Get-WaggleSigningToolchain {
  param(
    [string[]]$DisallowedRoots = @(),
    [switch]$AllowPortableBeforeManifest
  )

  $portableValues = [ordered]@{
    Root = [Environment]::GetEnvironmentVariable('WAGGLE_SIGNING_PORTABLE_TOOLCHAIN_ROOT')
    Node = [Environment]::GetEnvironmentVariable('WAGGLE_SIGNING_PORTABLE_NODE_PATH')
    Git = [Environment]::GetEnvironmentVariable('WAGGLE_SIGNING_PORTABLE_GIT_PATH')
    SevenZip = [Environment]::GetEnvironmentVariable('WAGGLE_SIGNING_PORTABLE_SEVEN_ZIP_PATH')
    Receipt = [Environment]::GetEnvironmentVariable('WAGGLE_SIGNING_PORTABLE_RECEIPT_PATH')
    ReceiptSha256 = [Environment]::GetEnvironmentVariable('WAGGLE_SIGNING_PORTABLE_RECEIPT_SHA256')
  }
  $providedCount = @($portableValues.Values | Where-Object {
      -not [string]::IsNullOrWhiteSpace([string]$_)
    }).Count
  if ($providedCount -ne 0) {
    if ($providedCount -ne $portableValues.Count) {
      throw 'Portable signing toolchain environment must provide the exact root, Node, Git, 7-Zip, receipt path, and receipt SHA-256.'
    }
    if (-not $AllowPortableBeforeManifest -and
        ([Environment]::GetEnvironmentVariable('WAGGLE_SIGNING_MANIFEST_PATH') -notmatch
          '^[A-Za-z]:[\\/]' -or
         [Environment]::GetEnvironmentVariable('WAGGLE_SIGNING_MANIFEST_SHA256') -notmatch
          '^[0-9A-Fa-f]{64}$')) {
      throw 'Portable signing tools are valid only inside an active receipt-bound signing session.'
    }
    return Get-WagglePortableToolchain `
      $portableValues.Root $portableValues.Node $portableValues.Git `
      $portableValues.SevenZip $portableValues.Receipt `
      $portableValues.ReceiptSha256 -DisallowedRoots $DisallowedRoots
  }

  $systemNode = Assert-WagglePinnedToolFile `
    $NodePath 'Node.js runtime' $NodeSha256 $NodePublisher -AllowHardLink
  $systemGit = Assert-WagglePinnedToolFile `
    $GitPath 'Git executable' $GitSha256 $GitPublisher -AllowHardLink
  $systemGitRuntime = Assert-WagglePinnedToolFile `
    (Join-Path (Split-Path (Split-Path $systemGit -Parent) -Parent) `
      'mingw64\bin\git.exe') `
    'Git runtime' $GitRuntimeSha256 $GitPublisher -AllowHardLink
  $systemSevenZip = Assert-WagglePinnedToolFile `
    $SevenZipPath '7-Zip inventory tool' $SevenZipSha256 $null
  $systemSevenZipDll = Assert-WagglePinnedToolFile `
    (Join-Path (Split-Path $systemSevenZip -Parent) '7z.dll') `
    '7-Zip runtime library' $SevenZipDllSha256 $null
  return [pscustomobject]@{
    PortableToolchainRoot = $null
    NodePath = $systemNode
    GitPath = $systemGit
    GitRuntimePath = $systemGitRuntime
    SevenZipPath = $systemSevenZip
    SevenZipDllPath = $systemSevenZipDll
    ReceiptPath = $null
    ReceiptSha256 = $null
    InventorySha256 = $null
    Locks = [Collections.Generic.List[IDisposable]]::new()
  }
}

function Assert-WagglePortableToolchainEnvironment {
  param([Parameter(Mandatory = $true)] [object]$Context)

  if ($null -eq $Context.PortableToolchainRoot) { return }
  foreach ($binding in @(
      @('WAGGLE_SIGNING_PORTABLE_TOOLCHAIN_ROOT', $Context.PortableToolchainRoot),
      @('WAGGLE_SIGNING_PORTABLE_NODE_PATH', $Context.NodePath),
      @('WAGGLE_SIGNING_PORTABLE_GIT_PATH', $Context.GitPath),
      @('WAGGLE_SIGNING_PORTABLE_SEVEN_ZIP_PATH', $Context.SevenZipPath),
      @('WAGGLE_SIGNING_PORTABLE_RECEIPT_PATH', $Context.PortableToolchainReceiptPath)
    )) {
    Assert-ExactCanonicalPathValue `
      ([Environment]::GetEnvironmentVariable([string]$binding[0])) `
      ([string]$binding[1]) ([string]$binding[0])
  }
  if ([Environment]::GetEnvironmentVariable('WAGGLE_SIGNING_PORTABLE_RECEIPT_SHA256') -cne
      $Context.PortableToolchainReceiptSha256) {
    throw 'WAGGLE_SIGNING_PORTABLE_RECEIPT_SHA256 does not match the signing session.'
  }
}

function Assert-WagglePortableSessionBootstrap {
  param(
    [Parameter(Mandatory = $true)] [object]$Toolchain,
    [Parameter(Mandatory = $true)] [string]$RepoRoot,
    [Parameter(Mandatory = $true)] [string]$TauriRoot
  )

  if ($null -eq $Toolchain.PortableToolchainRoot) { return }
  $sessionId = [Environment]::GetEnvironmentVariable('WAGGLE_SIGNING_SESSION_ID')
  $manifestPathValue = [Environment]::GetEnvironmentVariable('WAGGLE_SIGNING_MANIFEST_PATH')
  $manifestSha256 = [Environment]::GetEnvironmentVariable('WAGGLE_SIGNING_MANIFEST_SHA256')
  if ($sessionId -notmatch '^[0-9a-f]{32}$' -or
      $manifestSha256 -notmatch '^[0-9A-Fa-f]{64}$') {
    throw 'Portable signing callback is not inside an active receipt-bound signing session.'
  }
  $sessionDirectory = Assert-PrivateDirectoryAcl `
    (Join-Path $TauriRoot "target\.signing-sessions\run-$sessionId") `
    'Portable signing callback session directory'
  $expectedManifestPath = Join-Path $sessionDirectory 'manifest.json'
  Assert-ExactCanonicalPathValue `
    $manifestPathValue $expectedManifestPath 'Portable signing callback manifest path'
  $manifestPath = Get-TrustedPath $manifestPathValue 'Portable signing callback manifest'
  $lock = Open-ReadLock $manifestPath
  try {
    if ((Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash -cne
        $manifestSha256.ToUpperInvariant()) {
      throw 'Portable signing callback manifest does not match its session digest.'
    }
    try {
      $manifest = Get-Content -Raw -LiteralPath $manifestPath |
        ConvertFrom-Json -Depth 32 -DateKind String
    } catch {
      throw 'Portable signing callback manifest is not valid JSON.'
    }
    if ([int](Get-RequiredPropertyValue $manifest 'schemaVersion' 'Signing manifest') -ne 1 -or
        [string](Get-RequiredPropertyValue $manifest 'mode' 'Signing manifest') -cne 'nsis' -or
        [string](Get-RequiredPropertyValue $manifest 'sessionId' 'Signing manifest') -cne $sessionId) {
      throw 'Portable signing callback manifest does not bind the active NSIS session.'
    }
    Assert-ExactCanonicalPathValue `
      ([string](Get-RequiredPropertyValue $manifest 'repoRoot' 'Signing manifest')) `
      $RepoRoot 'Portable signing callback repository root'
    $sourceRevision = [string](Get-RequiredPropertyValue `
      $manifest 'sourceRevision' 'Signing manifest')
    $receipt = Get-RequiredPropertyValue `
      $manifest 'buildReceipt' 'Receipt-bound signing manifest'
    if ($sourceRevision -notmatch '^[0-9a-f]{40}$' -or
        [int](Get-RequiredPropertyValue $receipt 'schemaVersion' 'Hosted build receipt') -ne 1 -or
        [string](Get-RequiredPropertyValue $receipt 'repository' 'Hosted build receipt') -cne
          'marolinik/waggle-os' -or
        [string](Get-RequiredPropertyValue $receipt 'sourceRevision' 'Hosted build receipt') -cne
          $sourceRevision -or
        [string](Get-RequiredPropertyValue $receipt 'targetTriple' 'Hosted build receipt') -cne
          'x86_64-pc-windows-msvc') {
      throw 'Portable signing callback manifest is not bound to the approved hosted receipt.'
    }
    $manifestToolchain = Get-RequiredPropertyValue $manifest 'toolchain' 'Signing manifest'
    foreach ($binding in @(
        @('portableToolchainRoot', $Toolchain.PortableToolchainRoot),
        @('nodePath', $Toolchain.NodePath),
        @('gitPath', $Toolchain.GitPath),
        @('gitRuntimePath', $Toolchain.GitRuntimePath),
        @('sevenZipPath', $Toolchain.SevenZipPath),
        @('sevenZipDllPath', $Toolchain.SevenZipDllPath),
        @('portableToolchainReceiptPath', $Toolchain.ReceiptPath)
      )) {
      Assert-ExactCanonicalPathValue `
        ([string](Get-RequiredPropertyValue `
          $manifestToolchain ([string]$binding[0]) 'Signing manifest toolchain')) `
        ([string]$binding[1]) "Portable signing callback $($binding[0])"
    }
    foreach ($binding in @(
        @('nodeSha256', $NodeSha256),
        @('gitSha256', $GitSha256),
        @('gitRuntimeSha256', $GitRuntimeSha256),
        @('sevenZipSha256', $SevenZipSha256),
        @('sevenZipDllSha256', $SevenZipDllSha256),
        @('portableToolchainReceiptSha256', $Toolchain.ReceiptSha256),
        @('portableToolchainInventorySha256', $PortableToolchainInventorySha256)
      )) {
      if ([string](Get-RequiredPropertyValue `
          $manifestToolchain ([string]$binding[0]) 'Signing manifest toolchain') -cne
          [string]$binding[1]) {
        throw "Portable signing callback $($binding[0]) is not repository-pinned."
      }
    }
    if ([int](Get-RequiredPropertyValue `
        $manifestToolchain 'portableToolchainFileCount' 'Signing manifest toolchain') -ne
        $PortableToolchainFileCount) {
      throw 'Portable signing callback full closure file count is not repository-pinned.'
    }
  } finally {
    $lock.Dispose()
  }
}

function Get-WaggleSigningContext {
  param([switch]$AllowPortableBeforeManifest)

  $sessionId = [Environment]::GetEnvironmentVariable('WAGGLE_SIGNING_SESSION_ID')
  if ($sessionId -notmatch '^[0-9a-f]{32}$') {
    throw 'WAGGLE_SIGNING_SESSION_ID must be one lowercase 128-bit session id.'
  }
  $scriptPath = Get-TrustedPath $PSCommandPath 'Signing wrapper'
  $appRoot = Split-Path (Split-Path $scriptPath -Parent) -Parent
  $repoRoot = Get-TrustedPath (Split-Path $appRoot -Parent) 'Repository root' 'Container'
  $tauriRoot = Get-TrustedPath (Join-Path $appRoot 'src-tauri') 'Tauri root' 'Container'
  $resourcesRootValue = [Environment]::GetEnvironmentVariable('WAGGLE_SIGNING_RESOURCES_ROOT')
  if ([string]::IsNullOrWhiteSpace($resourcesRootValue)) {
    throw 'WAGGLE_SIGNING_RESOURCES_ROOT must identify the receipt-bound resource tree.'
  }
  $resourcesRoot = Get-TrustedPath $resourcesRootValue 'Tauri resources root' 'Container'
  $cargoTargetRoot = [Environment]::GetEnvironmentVariable('CARGO_TARGET_DIR')
  if ([string]::IsNullOrWhiteSpace($cargoTargetRoot)) {
    throw 'CARGO_TARGET_DIR must identify the isolated signing package root.'
  }
  $targetRoot = Assert-PrivateDirectoryAcl $cargoTargetRoot 'Signing package target root'
  $releaseRoot = Get-TrustedPath `
    (Join-Path $targetRoot 'x86_64-pc-windows-msvc\release') `
    'Tauri release root' 'Container'
  $configPath = Get-TrustedPath (Join-Path $tauriRoot 'tauri.conf.json') 'Tauri config'
  $sessionDirectory = Join-Path `
    (Join-Path $tauriRoot 'target\.signing-sessions') `
    "run-$sessionId"
  $overrideConfigPath = Get-TrustedPath `
    (Join-Path $sessionDirectory 'tauri.signing-override.json') `
    'Tauri signing override config'
  $tauriCliPath = Get-TrustedPath `
    (Join-Path $appRoot 'node_modules\@tauri-apps\cli\tauri.js') `
    'Tauri CLI'
  $tauriCliPackagePath = Get-TrustedPath `
    (Join-Path $appRoot 'node_modules\@tauri-apps\cli\package.json') `
    'Tauri CLI package manifest'
  $tauriCliMainPath = Get-TrustedPath `
    (Join-Path $appRoot 'node_modules\@tauri-apps\cli\main.js') `
    'Tauri CLI main module'
  $tauriCliIndexPath = Get-TrustedPath `
    (Join-Path $appRoot 'node_modules\@tauri-apps\cli\index.js') `
    'Tauri CLI native loader'
  $tauriNativePackagePath = Get-TrustedPath `
    (Join-Path $appRoot 'node_modules\@tauri-apps\cli-win32-x64-msvc\package.json') `
    'Tauri native package manifest'
  $tauriNativeBinaryPath = Get-TrustedPath `
    (Join-Path $appRoot 'node_modules\@tauri-apps\cli-win32-x64-msvc\cli.win32-x64-msvc.node') `
    'Tauri native CLI binary'
  $tauriVersion = [string](
    Get-Content -Raw -LiteralPath $tauriCliPackagePath | ConvertFrom-Json
  ).version
  if ($tauriVersion -cne $TauriCliVersion) {
    throw "Tauri CLI must be the pinned version $TauriCliVersion."
  }
  $tauriNativeVersion = [string](
    Get-Content -Raw -LiteralPath $tauriNativePackagePath | ConvertFrom-Json
  ).version
  if ($tauriNativeVersion -cne $TauriCliVersion) {
    throw "Tauri native CLI must be the pinned version $TauriCliVersion."
  }
  $makensisPath = Get-TrustedPath `
    (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'tauri\NSIS\Bin\makensis.exe') `
    'makensis'
  $nsisRoot = Get-TrustedPath `
    (Split-Path (Split-Path $makensisPath -Parent) -Parent) `
    'NSIS compiler root' 'Container'
  $toolchain = Get-WaggleSigningToolchain `
    -DisallowedRoots @(
      $repoRoot, $targetRoot, $resourcesRoot,
      [Environment]::GetEnvironmentVariable('TEMP'),
      [Environment]::GetEnvironmentVariable('WAGGLE_SIGNING_MANIFEST_PATH')
    ) `
    -AllowPortableBeforeManifest:$AllowPortableBeforeManifest
  if (-not $AllowPortableBeforeManifest) {
    Assert-WagglePortableSessionBootstrap $toolchain $repoRoot $tauriRoot
  }
  $git = $toolchain.GitPath
  $gitLock = Open-ReadLock $git
  try {
    if ((Get-FileHash -LiteralPath $git -Algorithm SHA256).Hash -cne $GitSha256) {
      throw 'Git executable does not match the pinned SHA-256 digest.'
    }
    $sourceRevision = [string](& $git -C $repoRoot rev-parse --verify HEAD)
    if ($LASTEXITCODE -ne 0 -or $sourceRevision -notmatch '^[0-9a-f]{40}$') {
      throw 'Could not resolve the exact repository source revision.'
    }
    $status = @(& $git -C $repoRoot status --porcelain=v1 --untracked-files=all)
    if ($LASTEXITCODE -ne 0 -or $status.Count -ne 0) {
      throw 'Signing requires a clean exact repository revision.'
    }
  } finally {
    $gitLock.Dispose()
  }

  return [pscustomobject]@{
    RepoRoot = $repoRoot
    AppRoot = $appRoot
    TauriRoot = $tauriRoot
    ResourcesRoot = $resourcesRoot
    TargetRoot = $targetRoot
    ReleaseRoot = $releaseRoot
    ConfigPath = $configPath
    OverrideConfigPath = $overrideConfigPath
    WrapperPath = $scriptPath
    TauriCliPath = $tauriCliPath
    TauriCliPackagePath = $tauriCliPackagePath
    TauriCliMainPath = $tauriCliMainPath
    TauriCliIndexPath = $tauriCliIndexPath
    TauriNativePackagePath = $tauriNativePackagePath
    TauriNativeBinaryPath = $tauriNativeBinaryPath
    MakensisPath = $makensisPath
    NsisRoot = $nsisRoot
    GitPath = $git
    GitRuntimePath = $toolchain.GitRuntimePath
    PortableToolchainRoot = $toolchain.PortableToolchainRoot
    PortableToolchainReceiptPath = $toolchain.ReceiptPath
    PortableToolchainReceiptSha256 = $toolchain.ReceiptSha256
    PortableToolchainInventorySha256 = $toolchain.InventorySha256
    PortableToolchainLocks = $toolchain.Locks
    SignToolPath = Get-TrustedPath $SignToolPath 'SignTool' -AllowHardLink
    ArtifactSigningPackagePath = Get-TrustedPath `
      (Join-Path $tauriRoot 'target\.artifact-signing-tools\Microsoft.ArtifactSigning.Client.1.0.128.nupkg') `
      'Artifact Signing package'
    NodePath = $toolchain.NodePath
    SevenZipPath = $toolchain.SevenZipPath
    SevenZipDllPath = $toolchain.SevenZipDllPath
    SourceRevision = $sourceRevision
    TauriCliVersion = $TauriCliVersion
    TauriCliSha256 = $TauriCliSha256
    TauriCliPackageSha256 = $TauriCliPackageSha256
    TauriCliMainSha256 = $TauriCliMainSha256
    TauriCliIndexSha256 = $TauriCliIndexSha256
    TauriNativePackageSha256 = $TauriNativePackageSha256
    TauriNativeBinarySha256 = $TauriNativeBinarySha256
    MakensisSha256 = $MakensisSha256
    NsisClosureSha256 = $NsisClosureSha256
    GitSha256 = $GitSha256
    GitRuntimeSha256 = $GitRuntimeSha256
    NodeSha256 = $NodeSha256
    SevenZipSha256 = $SevenZipSha256
    SevenZipDllSha256 = $SevenZipDllSha256
    SignToolSha256 = $SignToolSha256
    ArtifactSigningPackageSha256 = $ArtifactSigningPackageSha256
    ArtifactSigningX64ManifestSha256 = $ArtifactSigningX64ManifestSha256
  }
}

function Get-ExpectedNsisFixedPaths {
  param(
    [Parameter(Mandatory = $true)] [object]$Context,
    [Parameter(Mandatory = $true)] [string]$Version
  )

  return @(
    Join-Path $Context.ReleaseRoot 'waggle.exe'
    Join-Path $Context.ResourcesRoot 'native\vec0.dll'
    Join-Path $Context.ResourcesRoot 'native\onnxruntime\onnxruntime.dll'
    Join-Path $Context.ResourcesRoot 'node_modules\@img\sharp-win32-x64\lib\libvips-42.dll'
    Join-Path $Context.ResourcesRoot 'node_modules\@img\sharp-win32-x64\lib\libvips-cpp-8.18.3.dll'
    Join-Path $Context.ResourcesRoot 'node_modules\onnxruntime-node\bin\napi-v3\win32\x64\onnxruntime.dll'
    Join-Path $Context.ResourcesRoot 'node_modules\sqlite-vec-windows-x64\vec0.dll'
    Join-Path $Context.ReleaseRoot 'nsis\x64\Plugins\x86-unicode\NSISdl.dll'
    Join-Path $Context.ReleaseRoot 'nsis\x64\Plugins\x86-unicode\StartMenu.dll'
    Join-Path $Context.ReleaseRoot 'nsis\x64\Plugins\x86-unicode\System.dll'
    Join-Path $Context.ReleaseRoot 'nsis\x64\Plugins\x86-unicode\nsDialogs.dll'
    Join-Path $Context.ReleaseRoot 'nsis\x64\Plugins\x86-unicode\additional\nsis_tauri_utils.dll'
  ) | ForEach-Object { [IO.Path]::GetFullPath($_) }
}

function Get-ExpectedNsisPackagedPaths {
  return @(
    'waggle.exe'
    'resources\native\vec0.dll'
    'resources\native\onnxruntime\onnxruntime.dll'
    'resources\node_modules\@img\sharp-win32-x64\lib\libvips-42.dll'
    'resources\node_modules\@img\sharp-win32-x64\lib\libvips-cpp-8.18.3.dll'
    'resources\node_modules\onnxruntime-node\bin\napi-v3\win32\x64\onnxruntime.dll'
    'resources\node_modules\sqlite-vec-windows-x64\vec0.dll'
    '$PLUGINSDIR\NSISdl.dll'
    '$PLUGINSDIR\StartMenu.dll'
    '$PLUGINSDIR\System.dll'
    '$PLUGINSDIR\nsDialogs.dll'
    '$PLUGINSDIR\nsis_tauri_utils.dll'
  )
}

function Add-ValidatedSessionFileLock {
  param(
    [Parameter(Mandatory = $true)] [Collections.Generic.List[IDisposable]]$Locks,
    [Parameter(Mandatory = $true)] [string]$Path,
    [Parameter(Mandatory = $true)] [string]$ExpectedSha256,
    [Parameter(Mandatory = $true)] [string]$Label,
    [switch]$AllowHardLink
  )

  if ($ExpectedSha256 -notmatch '^[0-9A-Fa-f]{64}$') {
    throw "$Label manifest SHA-256 is invalid."
  }
  $trustedPath = Get-TrustedPath $Path $Label -AllowHardLink:$AllowHardLink
  $lock = Open-ReadLock $trustedPath
  try {
    if (-not [string]::Equals(
        (Get-FileHash -LiteralPath $trustedPath -Algorithm SHA256).Hash,
        $ExpectedSha256,
        [StringComparison]::OrdinalIgnoreCase
      )) {
      throw "$Label does not match the signing manifest SHA-256 digest."
    }
    $Locks.Add($lock)
    $lock = $null
  } finally {
    if ($null -ne $lock) { $lock.Dispose() }
  }
  return $trustedPath
}

function Assert-WaggleSigningOverrideContract {
  param(
    [Parameter(Mandatory = $true)] [string]$Path,
    [Parameter(Mandatory = $true)] [string]$WrapperPath,
    [AllowNull()] [string]$ResourcesRoot = $null,
    [switch]$Unsigned
  )
  try {
    $override = Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json -Depth 16
  } catch {
    throw 'Tauri signing override is not valid JSON.'
  }
  $targets = @((Get-RequiredPropertyValue `
    (Get-RequiredPropertyValue $override 'bundle' 'Tauri signing override') `
    'targets' 'Tauri signing override bundle'))
  $bundle = $override.bundle
  $windows = Get-RequiredPropertyValue $bundle 'windows' 'Tauri signing override bundle'
  $signCommand = $windows.PSObject.Properties['signCommand']
  $expectedArgs = @(
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', $WrapperPath, '-ArtifactPath', '%1'
  )
  if ([bool](Get-RequiredPropertyValue $bundle 'active' 'Tauri signing override bundle') -ne $true -or
      $targets.Count -ne 1 -or [string]$targets[0] -cne 'nsis' -or
      [string](Get-RequiredPropertyValue `
        (Get-RequiredPropertyValue $override 'build' 'Tauri signing override') `
        'beforeBuildCommand' 'Tauri signing override build') -cne '' -or
      [string](Get-RequiredPropertyValue `
        (Get-RequiredPropertyValue $override 'build' 'Tauri signing override') `
        'beforeBundleCommand' 'Tauri signing override build') -cne '' -or
      $null -ne $windows.PSObject.Properties['certificateThumbprint'] -or
      $null -ne $windows.PSObject.Properties['timestampUrl']) {
    throw 'Tauri signing override must be the exact fail-closed NSIS-only callback contract.'
  }
  if (-not [string]::IsNullOrWhiteSpace($ResourcesRoot)) {
    $resourceMap = Get-RequiredPropertyValue `
      $bundle 'resources' 'Tauri signing override bundle'
    $resourceEntries = @($resourceMap.PSObject.Properties)
    $trustedResourcesRoot = Get-TrustedPath `
      $ResourcesRoot 'Tauri signing override resource root' 'Container'
    if ($resourceEntries.Count -ne 1 -or
        -not [string]::Equals(
          [IO.Path]::GetFullPath([string]$resourceEntries[0].Name),
          $trustedResourcesRoot,
          [StringComparison]::OrdinalIgnoreCase
        ) -or
        [string]$resourceEntries[0].Value -cne 'resources') {
      throw 'Tauri signing override must map the exact receipt-bound resource tree.'
    }
  } elseif ($null -ne $bundle.PSObject.Properties['resources']) {
    throw 'Tauri signing override unexpectedly contains an unbound resource map.'
  }
  if ($Unsigned) {
    if ($null -ne $signCommand) {
      throw 'Unsigned Tauri override cannot contain a signing callback.'
    }
    return
  }
  if ($null -eq $signCommand) {
    throw 'Signed Tauri override must contain the signing callback.'
  }
  $actualCommand = $signCommand.Value
  $actualArgs = @((Get-RequiredPropertyValue `
    $actualCommand 'args' 'Tauri signing override signCommand'))
  if ([string](Get-RequiredPropertyValue `
        $actualCommand 'cmd' 'Tauri signing override signCommand') -cne
        $SystemPowerShellPath -or
      $actualArgs.Count -ne $expectedArgs.Count -or
      [string]::Join("`n", $actualArgs) -cne [string]::Join("`n", $expectedArgs)) {
    throw 'Tauri signing override must be the exact fail-closed NSIS-only callback contract.'
  }
}

function Get-WaggleSigningSession {
  param([Parameter(Mandatory = $true)] [object]$Context)

  Assert-WagglePortableToolchainEnvironment $Context
  $manifestPathValue = [Environment]::GetEnvironmentVariable('WAGGLE_SIGNING_MANIFEST_PATH')
  $manifestSha256 = [Environment]::GetEnvironmentVariable('WAGGLE_SIGNING_MANIFEST_SHA256')
  $sessionId = [Environment]::GetEnvironmentVariable('WAGGLE_SIGNING_SESSION_ID')
  if ([string]::IsNullOrWhiteSpace($manifestPathValue)) {
    throw 'WAGGLE_SIGNING_MANIFEST_PATH is required for production signing.'
  }
  if ($manifestSha256 -notmatch '^[0-9A-Fa-f]{64}$') {
    throw 'WAGGLE_SIGNING_MANIFEST_SHA256 must be one exact SHA-256 digest.'
  }
  if ($sessionId -notmatch '^[0-9a-f]{32}$') {
    throw 'WAGGLE_SIGNING_SESSION_ID must be one lowercase 128-bit session id.'
  }

  $sessionDirectory = Join-Path `
    (Join-Path $Context.TauriRoot 'target\.signing-sessions') `
    "run-$sessionId"
  $expectedManifestPath = Join-Path $sessionDirectory 'manifest.json'
  Assert-ExactCanonicalPathValue `
    $manifestPathValue $expectedManifestPath 'Signing manifest path'
  $sessionDirectory = Assert-PrivateDirectoryAcl $sessionDirectory 'Signing session directory'
  $manifestPath = Get-TrustedPath $manifestPathValue 'Signing manifest'

  $locks = [Collections.Generic.List[IDisposable]]::new()
  $portableLocksProperty = $Context.PSObject.Properties['PortableToolchainLocks']
  if ($null -ne $portableLocksProperty -and $null -ne $portableLocksProperty.Value) {
    foreach ($portableLock in @($portableLocksProperty.Value)) {
      $locks.Add($portableLock)
    }
    $portableLocksProperty.Value.Clear()
  }
  try {
    $manifestLock = Open-ReadLock $manifestPath
    $locks.Add($manifestLock)
    if (-not [string]::Equals(
        (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash,
        $manifestSha256,
        [StringComparison]::OrdinalIgnoreCase
      )) {
      throw 'Signing manifest does not match WAGGLE_SIGNING_MANIFEST_SHA256.'
    }
    try {
      $manifest = Get-Content -Raw -LiteralPath $manifestPath |
        ConvertFrom-Json -Depth 32 -DateKind String
    } catch {
      throw 'Signing manifest is not valid JSON.'
    }

    if ([int](Get-RequiredPropertyValue $manifest 'schemaVersion' 'Signing manifest') -ne 1) {
      throw 'Signing manifest schemaVersion must be 1.'
    }
    if ([string](Get-RequiredPropertyValue $manifest 'mode' 'Signing manifest') -cne 'nsis') {
      throw 'Production signing is NSIS-only.'
    }
    if ([string](Get-RequiredPropertyValue $manifest 'sessionId' 'Signing manifest') -cne $sessionId) {
      throw 'Signing manifest session id does not match WAGGLE_SIGNING_SESSION_ID.'
    }
    if ([string](Get-RequiredPropertyValue $manifest 'sourceRevision' 'Signing manifest') -cne
        [string]$Context.SourceRevision) {
      throw 'Signing manifest source revision does not match the clean repository HEAD.'
    }
    if ($null -ne $Context.PortableToolchainRoot) {
      $buildReceipt = Get-RequiredPropertyValue `
        $manifest 'buildReceipt' 'Receipt-bound signing manifest'
      if ([int](Get-RequiredPropertyValue $buildReceipt 'schemaVersion' 'Hosted build receipt') -ne 1 -or
          [string](Get-RequiredPropertyValue $buildReceipt 'repository' 'Hosted build receipt') -cne
            'marolinik/waggle-os' -or
          [string](Get-RequiredPropertyValue $buildReceipt 'sourceRevision' 'Hosted build receipt') -cne
            [string]$Context.SourceRevision -or
          [string](Get-RequiredPropertyValue $buildReceipt 'targetTriple' 'Hosted build receipt') -cne
            'x86_64-pc-windows-msvc') {
        throw 'Portable signing callback is not bound to the approved hosted build receipt.'
      }
    }

    $createdAt = [DateTimeOffset]::MinValue
    $expiresAt = [DateTimeOffset]::MinValue
    if (-not [DateTimeOffset]::TryParseExact(
        [string](Get-RequiredPropertyValue $manifest 'createdAtUtc' 'Signing manifest'),
        'O',
        [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::AssumeUniversal,
        [ref]$createdAt
      ) -or
      -not [DateTimeOffset]::TryParseExact(
        [string](Get-RequiredPropertyValue $manifest 'expiresAtUtc' 'Signing manifest'),
        'O',
        [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::AssumeUniversal,
        [ref]$expiresAt
      )) {
      throw 'Signing manifest timestamps must use the round-trip UTC format.'
    }
    $now = [DateTimeOffset]::UtcNow
    if ($createdAt -gt $now.AddMinutes(5) -or
        $expiresAt -le $now -or
        $expiresAt -le $createdAt -or
        $expiresAt -gt $createdAt.AddHours(4)) {
      throw 'Signing manifest is expired or outside the four-hour signing window.'
    }

    Assert-ExactCanonicalPathValue `
      ([string](Get-RequiredPropertyValue $manifest 'repoRoot' 'Signing manifest')) `
      $Context.RepoRoot 'Signing manifest repository root'
    Assert-ExactCanonicalPathValue `
      ([string](Get-RequiredPropertyValue $manifest 'tauriRoot' 'Signing manifest')) `
      $Context.TauriRoot 'Signing manifest Tauri root'
    Assert-ExactCanonicalPathValue `
      ([string](Get-RequiredPropertyValue $manifest 'releaseRoot' 'Signing manifest')) `
      $Context.ReleaseRoot 'Signing manifest release root'
    Assert-ExactCanonicalPathValue `
      ([string](Get-RequiredPropertyValue $manifest 'resourcesRoot' 'Signing manifest')) `
      $Context.ResourcesRoot 'Signing manifest resources root'
    Assert-ExactCanonicalPathValue `
      ([string](Get-RequiredPropertyValue $manifest 'targetRoot' 'Signing manifest')) `
      $Context.TargetRoot 'Signing manifest target root'

    $expectedTempRoot = Join-Path `
      (Join-Path $Context.TauriRoot 'target\.signing-temp') `
      "run-$sessionId"
    $tempRootValue = [string](Get-RequiredPropertyValue $manifest 'tempRoot' 'Signing manifest')
    Assert-ExactCanonicalPathValue $tempRootValue $expectedTempRoot 'Signing manifest session temp root'
    $tempRoot = Assert-PrivateDirectoryAcl $tempRootValue 'Signing session temp root'
    foreach ($name in @('TEMP', 'TMP', 'WAGGLE_NSIS_SIGNING_TEMP_ROOT')) {
      $environmentPath = [Environment]::GetEnvironmentVariable($name)
      if ([string]::IsNullOrWhiteSpace($environmentPath)) {
        throw "$name must identify the signing session temp root."
      }
      Assert-ExactCanonicalPathValue $environmentPath $tempRoot "$name path"
    }

    $expectedLedgerPath = Join-Path $sessionDirectory 'callback-ledger.json'
    $ledgerPathValue = [string](Get-RequiredPropertyValue $manifest 'ledgerPath' 'Signing manifest')
    Assert-ExactCanonicalPathValue $ledgerPathValue $expectedLedgerPath 'Signing callback ledger path'
    $ledgerPath = Get-TrustedPath $ledgerPathValue 'Signing callback ledger'

    $config = Get-Content -Raw -LiteralPath $Context.ConfigPath | ConvertFrom-Json
    $version = [string]$config.version
    if ($version -notmatch '^\d+\.\d+\.\d+$' -or
        [string](Get-RequiredPropertyValue $manifest 'appVersion' 'Signing manifest') -cne $version) {
      throw 'Signing manifest app version does not match tauri.conf.json.'
    }

    $toolchain = Get-RequiredPropertyValue $manifest 'toolchain' 'Signing manifest'
    $toolBindings = @(
      @('wrapperPath', 'wrapperSha256', $Context.WrapperPath, $null, 'Signing wrapper', $false),
      @('tauriConfigPath', 'tauriConfigSha256', $Context.ConfigPath, $null, 'Tauri config', $false),
      @('tauriOverrideConfigPath', 'tauriOverrideConfigSha256', $Context.OverrideConfigPath, $null, 'Tauri signing override config', $false),
      @('tauriCliPath', 'tauriCliSha256', $Context.TauriCliPath, $Context.TauriCliSha256, 'Tauri CLI', $false),
      @('tauriCliPackagePath', 'tauriCliPackageSha256', $Context.TauriCliPackagePath, $Context.TauriCliPackageSha256, 'Tauri CLI package manifest', $false),
      @('tauriCliMainPath', 'tauriCliMainSha256', $Context.TauriCliMainPath, $Context.TauriCliMainSha256, 'Tauri CLI main module', $false),
      @('tauriCliIndexPath', 'tauriCliIndexSha256', $Context.TauriCliIndexPath, $Context.TauriCliIndexSha256, 'Tauri CLI native loader', $false),
      @('tauriNativePackagePath', 'tauriNativePackageSha256', $Context.TauriNativePackagePath, $Context.TauriNativePackageSha256, 'Tauri native package manifest', $false),
      @('tauriNativeBinaryPath', 'tauriNativeBinarySha256', $Context.TauriNativeBinaryPath, $Context.TauriNativeBinarySha256, 'Tauri native CLI binary', $false),
      @('makensisPath', 'makensisSha256', $Context.MakensisPath, $Context.MakensisSha256, 'makensis', $false),
      @('gitPath', 'gitSha256', $Context.GitPath, $Context.GitSha256, 'Git executable', $true),
      @('gitRuntimePath', 'gitRuntimeSha256', $Context.GitRuntimePath, $Context.GitRuntimeSha256, 'Git runtime', $true),
      @('nodePath', 'nodeSha256', $Context.NodePath, $Context.NodeSha256, 'Node.js runtime', $true),
      @('sevenZipPath', 'sevenZipSha256', $Context.SevenZipPath, $Context.SevenZipSha256, '7-Zip inventory tool', $false),
      @('signToolPath', 'signToolSha256', $Context.SignToolPath, $Context.SignToolSha256, 'SignTool', $true),
      @('artifactSigningPackagePath', 'artifactSigningPackageSha256', $Context.ArtifactSigningPackagePath, $Context.ArtifactSigningPackageSha256, 'Artifact Signing package', $false)
    )
    foreach ($binding in $toolBindings) {
      $manifestToolPath = [string](Get-RequiredPropertyValue $toolchain $binding[0] 'Signing manifest toolchain')
      $manifestToolHash = [string](Get-RequiredPropertyValue $toolchain $binding[1] 'Signing manifest toolchain')
      Assert-ExactCanonicalPathValue $manifestToolPath ([string]$binding[2]) "$($binding[4]) path"
      if ($null -ne $binding[3] -and $manifestToolHash -cne [string]$binding[3]) {
        throw "$($binding[4]) manifest SHA-256 is not the repository-pinned digest."
      }
      Add-ValidatedSessionFileLock `
        $locks ([string]$binding[2]) $manifestToolHash ([string]$binding[4]) `
        -AllowHardLink:([bool]$binding[5]) | Out-Null
    }
    if ($null -ne $Context.PortableToolchainRoot) {
      Assert-ExactCanonicalPathValue `
        ([string](Get-RequiredPropertyValue `
          $toolchain 'portableToolchainRoot' 'Signing manifest toolchain')) `
        $Context.PortableToolchainRoot 'Portable signing toolchain root'
      $sevenZipDllPath = [string](Get-RequiredPropertyValue `
        $toolchain 'sevenZipDllPath' 'Signing manifest toolchain')
      $sevenZipDllHash = [string](Get-RequiredPropertyValue `
        $toolchain 'sevenZipDllSha256' 'Signing manifest toolchain')
      Assert-ExactCanonicalPathValue `
        $sevenZipDllPath $Context.SevenZipDllPath '7-Zip runtime library path'
      if ($sevenZipDllHash -cne $Context.SevenZipDllSha256) {
        throw '7-Zip runtime library manifest SHA-256 is not the repository-pinned digest.'
      }
      Add-ValidatedSessionFileLock `
        $locks $Context.SevenZipDllPath $sevenZipDllHash `
        '7-Zip runtime library' | Out-Null
      Assert-ExactCanonicalPathValue `
        ([string](Get-RequiredPropertyValue `
          $toolchain 'portableToolchainReceiptPath' 'Signing manifest toolchain')) `
        $Context.PortableToolchainReceiptPath `
        'Portable signing toolchain receipt path'
      if ([string](Get-RequiredPropertyValue `
          $toolchain 'portableToolchainReceiptSha256' 'Signing manifest toolchain') -cne
            $Context.PortableToolchainReceiptSha256 -or
          [string](Get-RequiredPropertyValue `
          $toolchain 'portableToolchainInventorySha256' 'Signing manifest toolchain') -cne
            $PortableToolchainInventorySha256 -or
          [int](Get-RequiredPropertyValue `
          $toolchain 'portableToolchainFileCount' 'Signing manifest toolchain') -ne
            $PortableToolchainFileCount) {
        throw 'Portable signing toolchain manifest does not bind the repository-pinned full closure.'
      }
    }
    if ([string](Get-RequiredPropertyValue $toolchain 'tauriCliVersion' 'Signing manifest toolchain') -cne
        [string]$Context.TauriCliVersion) {
      throw 'Signing manifest Tauri CLI version is not the repository-pinned version.'
    }
    if ([string](Get-RequiredPropertyValue $toolchain 'artifactSigningX64ManifestSha256' 'Signing manifest toolchain') -cne
        [string]$Context.ArtifactSigningX64ManifestSha256) {
      throw 'Signing manifest Artifact Signing x64 closure digest is not repository-pinned.'
    }
    Assert-WaggleSigningOverrideContract `
      $Context.OverrideConfigPath $Context.WrapperPath $Context.ResourcesRoot

    $payloads = @((Get-RequiredPropertyValue $manifest 'payloads' 'Signing manifest'))
    $uniquePayloadPaths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($payload in $payloads) {
      $payloadPath = [string](Get-RequiredPropertyValue $payload 'path' 'Signing manifest payload')
      $payloadHash = [string](Get-RequiredPropertyValue $payload 'sha256' 'Signing manifest payload')
      $payloadSize = [long](Get-RequiredPropertyValue $payload 'size' 'Signing manifest payload')
      if ([string]::IsNullOrWhiteSpace($payloadPath) -or
          -not $uniquePayloadPaths.Add($payloadPath) -or
          $payloadHash -notmatch '^[0-9A-Fa-f]{64}$' -or $payloadSize -lt 0) {
        throw 'Signing manifest NSIS payload digest inventory is invalid.'
      }
    }
    if ($payloads.Count -lt 10 -or -not $uniquePayloadPaths.Contains('waggle.exe')) {
      throw 'Signing manifest NSIS payload inventory is invalid or incomplete.'
    }

    $expectedFixedPaths = @(Get-ExpectedNsisFixedPaths $Context $version)
    $expectedPackagedPaths = @(Get-ExpectedNsisPackagedPaths)
    $expectedFixedSet = [Collections.Generic.HashSet[string]]::new(
      [StringComparer]::OrdinalIgnoreCase
    )
    foreach ($expectedPath in $expectedFixedPaths) { [void]$expectedFixedSet.Add($expectedPath) }
    $seenFixedSet = [Collections.Generic.HashSet[string]]::new(
      [StringComparer]::OrdinalIgnoreCase
    )
    $seenIds = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    $seenOrders = [Collections.Generic.HashSet[int]]::new()
    $slots = @((Get-RequiredPropertyValue $manifest 'slots' 'Signing manifest'))
    if ($slots.Count -ne 14) {
      throw 'NSIS-only signing manifest must contain exactly 14 callback slots.'
    }
    $uninstallerSlots = 0
    $installerSlots = 0
    foreach ($slot in $slots) {
      $slotId = [string](Get-RequiredPropertyValue $slot 'id' 'Signing manifest slot')
      $slotKind = [string](Get-RequiredPropertyValue $slot 'kind' 'Signing manifest slot')
      $slotOrder = [int](Get-RequiredPropertyValue $slot 'order' 'Signing manifest slot')
      $maxUses = [int](Get-RequiredPropertyValue $slot 'maxUses' 'Signing manifest slot')
      if ($slotId -notmatch '^[a-z0-9][a-z0-9-]{2,63}$' -or
          -not $seenIds.Add($slotId) -or
          -not $seenOrders.Add($slotOrder) -or
          $slotOrder -lt 1 -or
          $slotOrder -gt $slots.Count -or
          $maxUses -ne 1) {
        throw 'Signing manifest callback slots must have unique ids, consecutive orders, and maxUses 1.'
      }
      switch ($slotKind) {
        'fixed' {
          $slotPath = [string](Get-RequiredPropertyValue $slot 'path' 'Fixed signing slot')
          $slotHash = [string](Get-RequiredPropertyValue $slot 'preSignSha256' 'Fixed signing slot')
          $packagedPath = [string](Get-RequiredPropertyValue $slot 'packagedPath' 'Fixed signing slot')
          if ($slotHash -notmatch '^[0-9A-Fa-f]{64}$' -or
              -not $expectedFixedSet.Contains([IO.Path]::GetFullPath($slotPath)) -or
              -not $seenFixedSet.Add([IO.Path]::GetFullPath($slotPath)) -or
              $slotOrder -gt $expectedPackagedPaths.Count -or
              $packagedPath -cne $expectedPackagedPaths[$slotOrder - 1]) {
            throw 'Fixed signing slot is outside the exact NSIS-only callback manifest.'
          }
        }
        'generated-nsis-uninstaller' {
          $uninstallerSlots++
          $expectedEvidencePath = Join-Path $sessionDirectory 'signed-evidence\13-nsis-uninstaller.exe'
          if ([string](Get-RequiredPropertyValue $slot 'pathPattern' 'NSIS uninstaller slot') -cne
              $NsisUninstallerPattern -or $slotOrder -ne ($slots.Count - 1)) {
            throw 'NSIS uninstaller slot must be the one-time penultimate session lease.'
          }
          Assert-ExactCanonicalPathValue `
            ([string](Get-RequiredPropertyValue $slot 'evidencePath' 'NSIS uninstaller slot')) `
            $expectedEvidencePath 'NSIS uninstaller evidence path'
        }
        'generated-nsis-installer' {
          $installerSlots++
          $expectedInstaller = Join-Path `
            $Context.ReleaseRoot `
            "bundle\nsis\Waggle_${version}_x64-setup.exe"
          Assert-ExactCanonicalPathValue `
            ([string](Get-RequiredPropertyValue $slot 'path' 'NSIS installer slot')) `
            $expectedInstaller 'NSIS installer slot path'
          if ($slotOrder -ne $slots.Count) {
            throw 'NSIS installer slot must be the final callback lease.'
          }
        }
        default { throw 'Production signing manifest contains a non-NSIS callback slot.' }
      }
    }
    if ($seenFixedSet.Count -ne $expectedFixedSet.Count -or
        $uninstallerSlots -ne 1 -or $installerSlots -ne 1 -or
        [int](@($slots | Where-Object { $_.order -eq 1 })[0].order) -ne 1 -or
        -not [string]::Equals(
          [string](@($slots | Where-Object { $_.order -eq 1 })[0].path),
          [string]$expectedFixedPaths[0],
          [StringComparison]::OrdinalIgnoreCase
        )) {
      throw 'Signing manifest does not cover the exact ordered NSIS callback surface.'
    }

    $session = [pscustomobject]@{
      Id = $sessionId
      Manifest = $manifest
      ManifestSha256 = $manifestSha256.ToUpperInvariant()
      ManifestPath = $manifestPath
      SessionDirectory = $sessionDirectory
      TempRoot = $tempRoot
      LedgerPath = $ledgerPath
      Context = $Context
      Locks = $locks
    }
    $ledger = Get-Content -Raw -LiteralPath $ledgerPath |
      ConvertFrom-Json -Depth 32 -DateKind String
    Assert-WaggleSigningLedgerState $session $ledger
    return $session
  } catch {
    foreach ($lock in $locks) { $lock.Dispose() }
    throw
  }
}

function Assert-WaggleSigningLedgerState {
  param(
    [Parameter(Mandatory = $true)] [object]$Session,
    [Parameter(Mandatory = $true)] [object]$Ledger
  )

  if ([int](Get-RequiredPropertyValue $Ledger 'schemaVersion' 'Signing callback ledger') -ne 3 -or
      [string](Get-RequiredPropertyValue $Ledger 'sessionId' 'Signing callback ledger') -cne
        [string]$Session.Id -or
      -not [string]::Equals(
        [string](Get-RequiredPropertyValue $Ledger 'manifestSha256' 'Signing callback ledger'),
        [string]$Session.ManifestSha256,
        [StringComparison]::OrdinalIgnoreCase
      ) -or
      [string](Get-RequiredPropertyValue $Ledger 'state' 'Signing callback ledger') -notin
        @('open', 'failed', 'sealed')) {
    throw 'Signing callback ledger does not belong to the active manifest session.'
  }
  foreach ($field in @('terminalAtUtc', 'terminalReceiptSha256')) {
    if ($null -eq $Ledger.PSObject.Properties[$field]) {
      throw "Signing callback ledger is missing required property '$field'."
    }
  }
  $ledgerState = [string]$Ledger.state
  if ($ledgerState -ceq 'open') {
    if ($null -ne $Ledger.terminalAtUtc -or $null -ne $Ledger.terminalReceiptSha256) {
      throw 'An open signing callback ledger cannot contain terminal metadata.'
    }
  } else {
    $terminalAt = [DateTimeOffset]::MinValue
    if (-not [DateTimeOffset]::TryParseExact(
        [string]$Ledger.terminalAtUtc,
        'O',
        [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::AssumeUniversal,
        [ref]$terminalAt
      ) -or [string]$Ledger.terminalReceiptSha256 -notmatch '^[0-9A-Fa-f]{64}$') {
      throw 'Terminal signing callback ledger metadata is invalid.'
    }
  }

  $manifestSlots = @($Session.Manifest.slots)
  $entries = @((Get-RequiredPropertyValue $Ledger 'entries' 'Signing callback ledger'))
  if ($entries.Count -ne $manifestSlots.Count -or $entries.Count -ne 14) {
    throw 'Signing callback ledger must predeclare the exact 14-slot manifest roster.'
  }

  $reservedCount = 0
  $failedCount = 0
  for ($index = 0; $index -lt $manifestSlots.Count; $index++) {
    $slot = $manifestSlots[$index]
    $entry = $entries[$index]
    $slotId = [string](Get-RequiredPropertyValue $slot 'id' 'Signing manifest slot')
    $slotKind = [string](Get-RequiredPropertyValue $slot 'kind' 'Signing manifest slot')
    $slotOrder = [int](Get-RequiredPropertyValue $slot 'order' 'Signing manifest slot')
    if ([string](Get-RequiredPropertyValue $entry 'slotId' 'Signing callback ledger entry') -cne
          $slotId -or
        [string](Get-RequiredPropertyValue $entry 'kind' 'Signing callback ledger entry') -cne
          $slotKind -or
        [int](Get-RequiredPropertyValue $entry 'order' 'Signing callback ledger entry') -ne
          $slotOrder -or $slotOrder -ne ($index + 1)) {
      throw 'Signing callback ledger roster does not exactly match the ordered manifest slots.'
    }

    foreach ($field in @(
        'reservationId', 'path', 'preSignSha256', 'reservedAtUtc',
        'completedAtUtc', 'postSignSha256', 'signerSubject'
      )) {
      if ($null -eq $entry.PSObject.Properties[$field]) {
        throw "Signing callback ledger entry is missing required property '$field'."
      }
    }
    $status = [string](Get-RequiredPropertyValue $entry 'status' 'Signing callback ledger entry')
    $attempts = [int](Get-RequiredPropertyValue $entry 'attempts' 'Signing callback ledger entry')

    if ($status -ceq 'pending') {
      if ($attempts -ne 0 -or @(
          'reservationId', 'path', 'preSignSha256', 'reservedAtUtc',
          'completedAtUtc', 'postSignSha256', 'signerSubject' |
            Where-Object { $null -ne $entry.PSObject.Properties[$_].Value }
        ).Count -ne 0) {
        throw 'Pending signing callback ledger entries must be pristine and unused.'
      }
      continue
    }

    if ($status -notin @('reserved', 'completed', 'failed') -or $attempts -ne 1 -or
        [string]$entry.reservationId -notmatch '^[0-9a-f]{32}$' -or
        [string]$entry.preSignSha256 -notmatch '^[0-9A-Fa-f]{64}$' -or
        [string]::IsNullOrWhiteSpace([string]$entry.path)) {
      throw 'Consumed signing callback ledger entry has invalid reservation metadata.'
    }
    $entryPath = [IO.Path]::GetFullPath([string]$entry.path)
    if ($slotKind -ceq 'generated-nsis-uninstaller') {
      $relative = Get-ContainedRelativePath $entryPath $Session.TempRoot
      if ($null -eq $relative -or $relative -match '[\\/]' -or
          $relative -cnotmatch $NsisUninstallerPattern) {
        throw 'Signing callback ledger contains an invalid NSIS uninstaller path.'
      }
    } else {
      Assert-ExactCanonicalPathValue `
        $entryPath ([string](Get-RequiredPropertyValue $slot 'path' 'Signing manifest slot')) `
        'Signing callback ledger artifact path'
    }
    if ($slotKind -ceq 'fixed' -and -not [string]::Equals(
        [string]$entry.preSignSha256,
        [string](Get-RequiredPropertyValue $slot 'preSignSha256' 'Fixed signing slot'),
        [StringComparison]::OrdinalIgnoreCase
      )) {
      throw 'Signing callback ledger fixed artifact hash does not match the manifest.'
    }

    $reservedAt = [DateTimeOffset]::MinValue
    if (-not [DateTimeOffset]::TryParseExact(
        [string]$entry.reservedAtUtc,
        'O',
        [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::AssumeUniversal,
        [ref]$reservedAt
      )) {
      throw 'Signing callback reservation timestamp is invalid.'
    }

    if ($status -ceq 'reserved') {
    if ($ledgerState -cne 'open') {
      throw 'Only an open signing callback ledger may contain a reservation.'
    }
      $reservedCount++
      if ($reservedCount -ne 1 -or @(
          'completedAtUtc', 'postSignSha256', 'signerSubject' |
            Where-Object { $null -ne $entry.PSObject.Properties[$_].Value }
        ).Count -ne 0) {
        throw 'Reserved signing callback ledger entry has invalid completion metadata.'
      }
      continue
    }

    if ($status -ceq 'failed') {
      if ($ledgerState -cne 'failed') {
        throw 'Only a failed signing callback ledger may contain a failed entry.'
      }
      $failedCount++
      if ($failedCount -ne 1 -or @(
          'completedAtUtc', 'postSignSha256', 'signerSubject' |
            Where-Object { $null -ne $entry.PSObject.Properties[$_].Value }
        ).Count -ne 0) {
        throw 'Failed signing callback ledger entry has invalid completion metadata.'
      }
      continue
    }

    $completedAt = [DateTimeOffset]::MinValue
    if (-not [DateTimeOffset]::TryParseExact(
        [string]$entry.completedAtUtc,
        'O',
        [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::AssumeUniversal,
        [ref]$completedAt
      ) -or $completedAt -lt $reservedAt -or
        [string]$entry.postSignSha256 -notmatch '^[0-9A-Fa-f]{64}$' -or
        [string]::IsNullOrWhiteSpace([string]$entry.signerSubject)) {
      throw 'Completed signing callback ledger entry has invalid completion metadata.'
    }
  }
  if ($ledgerState -ceq 'open' -and $failedCount -ne 0) {
    throw 'An open signing callback ledger cannot contain a failed entry.'
  }
  if ($ledgerState -ceq 'failed' -and $reservedCount -ne 0) {
    throw 'A failed signing callback ledger cannot retain a reservation.'
  }
  if ($ledgerState -ceq 'sealed' -and
      @($entries | Where-Object { [string]$_.status -cne 'completed' }).Count -ne 0) {
    throw 'A sealed signing callback ledger must contain only completed entries.'
  }
  if ($reservedCount -gt 1) {
    throw 'Signing callback ledger contains multiple reservations.'
  }
  if ($ledgerState -ceq 'open') {
    $incompletePhases = @($entries | Where-Object {
      [string]$_.status -cne 'completed'
    } | ForEach-Object { Get-WaggleSigningSlotPhase ([int]$_.order) })
    $firstIncompletePhase = if ($incompletePhases.Count -eq 0) {
      6
    } else {
      ($incompletePhases | Measure-Object -Minimum).Minimum
    }
    if (@($entries | Where-Object {
        (Get-WaggleSigningSlotPhase ([int]$_.order)) -gt $firstIncompletePhase -and
          [string]$_.status -ne 'pending'
      }).Count -ne 0) {
      throw 'Signing callback ledger crossed an incomplete NSIS signing phase.'
    }
  }
}

function Write-WaggleLedgerAtomicNoLock {
  param(
    [Parameter(Mandatory = $true)] [object]$Session,
    [Parameter(Mandatory = $true)] [object]$Ledger
  )

  $tempLedgerPath = $null
  $backupLedgerPath = $null
  try {
    $ledgerPath = Get-TrustedPath $Session.LedgerPath 'Signing callback ledger'
    Assert-ExactCanonicalPathValue `
      $ledgerPath (Join-Path $Session.SessionDirectory 'callback-ledger.json') `
      'Signing callback ledger path'
    Assert-WaggleSigningLedgerState $Session $ledger
    $json = $ledger | ConvertTo-Json -Depth 32 -Compress
    $tempLedgerPath = Join-Path `
      $Session.SessionDirectory `
      "callback-ledger.$([Guid]::NewGuid().ToString('N')).tmp"
    $backupLedgerPath = Join-Path `
      $Session.SessionDirectory `
      "callback-ledger.$([Guid]::NewGuid().ToString('N')).bak"
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes($json)
    $stream = [IO.FileStream]::new(
      $tempLedgerPath,
      [IO.FileMode]::CreateNew,
      [IO.FileAccess]::Write,
      [IO.FileShare]::None,
      4096,
      [IO.FileOptions]::WriteThrough
    )
    try {
      $stream.Write($bytes, 0, $bytes.Length)
      $stream.Flush($true)
    } finally {
      $stream.Dispose()
    }
    [IO.File]::Replace($tempLedgerPath, $ledgerPath, $backupLedgerPath, $true)
    $tempLedgerPath = $null
    try { [IO.File]::Delete($backupLedgerPath) } catch { }
    $backupLedgerPath = $null
  } finally {
    if ($null -ne $tempLedgerPath -and (Test-Path -LiteralPath $tempLedgerPath -PathType Leaf)) {
      try { [IO.File]::Delete($tempLedgerPath) } catch { }
    }
    if ($null -ne $backupLedgerPath -and (Test-Path -LiteralPath $backupLedgerPath -PathType Leaf)) {
      try { [IO.File]::Delete($backupLedgerPath) } catch { }
    }
  }
}

function Invoke-WaggleLedgerMutation {
  param(
    [Parameter(Mandatory = $true)] [object]$Session,
    [Parameter(Mandatory = $true)] [scriptblock]$Mutation,
    [switch]$AllowTerminalReceipt
  )

  $mutex = [Threading.Mutex]::new($false, "Local\WaggleSigning-$($Session.Id)")
  $hasMutex = $false
  try {
    try {
      $hasMutex = $mutex.WaitOne([TimeSpan]::FromSeconds(30))
    } catch [Threading.AbandonedMutexException] {
      $hasMutex = $true
    }
    if (-not $hasMutex) { throw 'Timed out waiting for the signing callback ledger.' }

    $ledgerPath = Get-TrustedPath $Session.LedgerPath 'Signing callback ledger'
    try {
      $ledger = Get-Content -Raw -LiteralPath $ledgerPath |
        ConvertFrom-Json -Depth 32 -DateKind String
    } catch {
      throw 'Signing callback ledger is not valid JSON.'
    }
    Assert-WaggleSigningLedgerState $Session $ledger
    if ([string]$ledger.state -cne 'open') {
      throw 'Signing callback ledger is already terminal.'
    }
    if (-not $AllowTerminalReceipt -and @(
        @('terminal-intent.json', 'provenance-receipt.json', 'failure-receipt.json') |
          Where-Object { Test-Path -LiteralPath (Join-Path $Session.SessionDirectory $_) }
      ).Count -ne 0) {
      throw 'Signing callback ledger has a pending terminal receipt.'
    }

    $mutationResult = & $Mutation $ledger
    Write-WaggleLedgerAtomicNoLock $Session $ledger
    return $mutationResult
  } finally {
    if ($hasMutex) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
  }
}

function Reserve-WaggleSigningCallback {
  param(
    [Parameter(Mandatory = $true)] [object]$Session,
    [Parameter(Mandatory = $true)] [string]$ArtifactPath
  )

  $artifact = Get-TrustedPath $ArtifactPath 'Signing callback artifact' -AllowHardLink
  $matches = @($Session.Manifest.slots | Where-Object {
    if ([string]$_.kind -ceq 'generated-nsis-uninstaller') {
      $relative = Get-ContainedRelativePath $artifact $Session.TempRoot
      return $null -ne $relative -and
        $relative -notmatch '[\\/]' -and $relative -cmatch $NsisUninstallerPattern
    }
    $pathProperty = $_.PSObject.Properties['path']
    return $null -ne $pathProperty -and [string]::Equals(
      [IO.Path]::GetFullPath([string]$pathProperty.Value),
      $artifact,
      [StringComparison]::OrdinalIgnoreCase
    )
  })
  if ($matches.Count -ne 1) {
    throw 'Signing callback artifact does not match exactly one manifest slot.'
  }
  $slot = $matches[0]
  $preSignHash = (Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash
  if ([string]$slot.kind -ceq 'fixed' -and
      -not [string]::Equals(
        $preSignHash,
        [string]$slot.preSignSha256,
        [StringComparison]::OrdinalIgnoreCase
      )) {
    throw 'Signing callback artifact does not match the manifest pre-sign SHA-256 digest.'
  }

    if (@(@('terminal-intent.json', 'provenance-receipt.json', 'failure-receipt.json') | Where-Object {
      Test-Path -LiteralPath (Join-Path $Session.SessionDirectory $_)
    }).Count -ne 0) {
    throw 'Signing provenance receipt already exists.'
  }
  Invoke-WaggleLedgerMutation $Session {
    param($ledger)

    $entries = @($ledger.entries)
    $entry = $entries[[int]$slot.order - 1]
    if ([string]$entry.status -cne 'pending' -or [int]$entry.attempts -ne 0) {
      throw 'Signing callback slot was already consumed.'
    }
    $slotPhase = Get-WaggleSigningSlotPhase ([int]$slot.order)
    if (@($entries | Where-Object { [string]$_.status -ceq 'reserved' }).Count -ne 0 -or
        @($entries | Where-Object {
          (Get-WaggleSigningSlotPhase ([int]$_.order)) -lt $slotPhase -and
            [string]$_.status -cne 'completed'
        }).Count -ne 0) {
      throw 'Signing callback phase does not match the manifest ledger.'
    }
    $entry.status = 'reserved'
    $entry.attempts = 1
    $entry.reservationId = [Guid]::NewGuid().ToString('N')
    $entry.path = $artifact
    $entry.preSignSha256 = $preSignHash
    $entry.reservedAtUtc = [DateTimeOffset]::UtcNow.ToString('O')
    return [pscustomobject][ordered]@{
      reservationId = [string]$entry.reservationId
      slotId = [string]$entry.slotId
      order = [int]$entry.order
      kind = [string]$entry.kind
      path = [string]$entry.path
      preSignSha256 = [string]$entry.preSignSha256
    }
  }
}

function Complete-WaggleSigningCallback {
  param(
    [Parameter(Mandatory = $true)] [object]$Session,
    [Parameter(Mandatory = $true)] [object]$Reservation,
    [Parameter(Mandatory = $true)] [string]$SignedArtifactPath
  )

  $artifact = Get-TrustedPath $SignedArtifactPath 'Signed callback artifact'
  $postSignHash = (Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash
  $signature = Get-AuthenticodeSignature -LiteralPath $artifact
  $signerSubject = if ($null -eq $signature.SignerCertificate) {
    $null
  } else {
    [string]$signature.SignerCertificate.Subject
  }
  Invoke-WaggleLedgerMutation $Session {
    param($ledger)

    $entries = @($ledger.entries)
    $matchingEntries = @($entries | Where-Object {
      [string]$_.slotId -ceq [string]$Reservation.slotId
    })
    if ($matchingEntries.Count -ne 1 -or
        [string]$matchingEntries[0].status -cne 'reserved' -or
        [string]$matchingEntries[0].reservationId -cne [string]$Reservation.reservationId -or
        [int]$matchingEntries[0].order -ne [int]$Reservation.order -or
        [string]$matchingEntries[0].kind -cne [string]$Reservation.kind -or
        -not [string]::Equals(
          [string]$matchingEntries[0].path,
          [string]$Reservation.path,
          [StringComparison]::OrdinalIgnoreCase
        ) -or
        -not [string]::Equals(
          [IO.Path]::GetFullPath([string]$matchingEntries[0].path),
          $artifact,
          [StringComparison]::OrdinalIgnoreCase
        ) -or
        -not [string]::Equals(
          [string]$matchingEntries[0].preSignSha256,
          [string]$Reservation.preSignSha256,
          [StringComparison]::OrdinalIgnoreCase
        )) {
      throw 'Signing callback reservation is missing or already completed.'
    }
    $matchingEntries[0].status = 'completed'
    $matchingEntries[0].completedAtUtc = [DateTimeOffset]::UtcNow.ToString('O')
    $matchingEntries[0].postSignSha256 = $postSignHash
    $matchingEntries[0].signerSubject = $signerSubject
    return $matchingEntries[0]
  }
}

function Write-WaggleDurableJsonNew {
  param(
    [Parameter(Mandatory = $true)] [string]$Path,
    [Parameter(Mandatory = $true)] [object]$Value
  )
  $bytes = [Text.UTF8Encoding]::new($false).GetBytes(
    ($Value | ConvertTo-Json -Depth 32 -Compress)
  )
  $stream = [IO.FileStream]::new(
    $Path,
    [IO.FileMode]::CreateNew,
    [IO.FileAccess]::Write,
    [IO.FileShare]::None,
    4096,
    [IO.FileOptions]::WriteThrough
  )
  try {
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Flush($true)
  } finally {
    $stream.Dispose()
  }
}

function Assert-WaggleTerminalReceipt {
  param(
    [Parameter(Mandatory = $true)] [object]$Session,
    [Parameter(Mandatory = $true)] [ValidateSet('failed', 'sealed')] [string]$State,
    [Parameter(Mandatory = $true)] [object]$Receipt
  )

  if ([int](Get-RequiredPropertyValue $Receipt 'schemaVersion' 'Signing terminal receipt') -ne 1 -or
      [string](Get-RequiredPropertyValue $Receipt 'status' 'Signing terminal receipt') -cne $State -or
      [string](Get-RequiredPropertyValue $Receipt 'sessionId' 'Signing terminal receipt') -cne
        [string]$Session.Id -or
      -not [string]::Equals(
        [string](Get-RequiredPropertyValue $Receipt 'manifestSha256' 'Signing terminal receipt'),
        [string]$Session.ManifestSha256,
        [StringComparison]::OrdinalIgnoreCase
      )) {
    throw 'Signing terminal receipt does not belong to the active session.'
  }
  $terminalAtUtc = [string](Get-RequiredPropertyValue `
    $Receipt 'terminalAtUtc' 'Signing terminal receipt')
  $terminalAt = [DateTimeOffset]::MinValue
  if (-not [DateTimeOffset]::TryParseExact(
      $terminalAtUtc,
      'O',
      [Globalization.CultureInfo]::InvariantCulture,
      [Globalization.DateTimeStyles]::AssumeUniversal,
      [ref]$terminalAt
    )) {
    throw 'Signing terminal receipt has an invalid terminal timestamp.'
  }
  $sourceRevision = [string](Get-RequiredPropertyValue `
    $Receipt 'sourceRevision' 'Signing terminal receipt')
  if ($sourceRevision -cne [string]$Session.Context.SourceRevision) {
    throw 'Signing terminal receipt does not match the active source revision.'
  }
  if ($State -ceq 'failed') {
    foreach ($name in @('failureCode', 'failureMessage', 'rollbackOutcome')) {
      if ([string]::IsNullOrWhiteSpace([string](Get-RequiredPropertyValue `
          $Receipt $name 'Signing failure receipt'))) {
        throw 'Signing failure receipt has incomplete failure provenance.'
      }
    }
    if ($null -eq $Receipt.PSObject.Properties['failedSlotId']) {
      throw 'Signing failure receipt is missing its failed-slot provenance.'
    }
  } else {
    foreach ($name in @(
        'manifestPath', 'callbackLedgerPath', 'installerPath',
        'installerSha256', 'signerSubject', 'payloadManifestSha256', 'artifactBindings'
      )) {
      [void](Get-RequiredPropertyValue $Receipt $name 'Signing provenance receipt')
    }
    Assert-ExactCanonicalPathValue `
      ([string]$Receipt.manifestPath) ([string]$Session.ManifestPath) `
      'Signing provenance manifest path'
    Assert-ExactCanonicalPathValue `
      ([string]$Receipt.callbackLedgerPath) ([string]$Session.LedgerPath) `
      'Signing provenance callback ledger path'
    $installerSlots = @($Session.Manifest.slots | Where-Object {
      [string]$_.kind -ceq 'generated-nsis-installer'
    })
    if ($installerSlots.Count -ne 1) {
      throw 'Signing provenance session lacks one exact installer slot.'
    }
    Assert-ExactCanonicalPathValue `
      ([string]$Receipt.installerPath) ([string]$installerSlots[0].path) `
      'Signing provenance installer path'
    if ([string]$Receipt.installerSha256 -notmatch '^[0-9A-Fa-f]{64}$' -or
        [string]$Receipt.payloadManifestSha256 -notmatch '^[0-9A-Fa-f]{64}$' -or
        [string]::IsNullOrWhiteSpace([string]$Receipt.signerSubject) -or
        @($Receipt.artifactBindings).Count -lt 2) {
      throw 'Signing provenance receipt has invalid artifact provenance.'
    }
  }
  return $terminalAtUtc
}

function Get-WaggleTerminalIntentPath {
  param([Parameter(Mandatory = $true)] [object]$Session)
  return Join-Path $Session.SessionDirectory 'terminal-intent.json'
}

function Assert-WaggleTerminalIntent {
  param(
    [Parameter(Mandatory = $true)] [object]$Session,
    [Parameter(Mandatory = $true)] [ValidateSet('failed', 'sealed')] [string]$State,
    [Parameter(Mandatory = $true)] [object]$Intent
  )
  if ([int](Get-RequiredPropertyValue $Intent 'schemaVersion' 'Signing terminal intent') -ne 1 -or
      [string](Get-RequiredPropertyValue $Intent 'state' 'Signing terminal intent') -cne $State -or
      [string](Get-RequiredPropertyValue $Intent 'sessionId' 'Signing terminal intent') -cne
        [string]$Session.Id -or
      -not [string]::Equals(
        [string](Get-RequiredPropertyValue $Intent 'manifestSha256' 'Signing terminal intent'),
        [string]$Session.ManifestSha256,
        [StringComparison]::OrdinalIgnoreCase
      ) -or
      [string](Get-RequiredPropertyValue `
        $Intent 'receiptSha256' 'Signing terminal intent') -notmatch '^[0-9A-Fa-f]{64}$') {
    throw 'Signing terminal intent does not belong to the active session.'
  }
  $terminalAtUtc = [string](Get-RequiredPropertyValue `
    $Intent 'terminalAtUtc' 'Signing terminal intent')
  $terminalAt = [DateTimeOffset]::MinValue
  if (-not [DateTimeOffset]::TryParseExact(
      $terminalAtUtc,
      'O',
      [Globalization.CultureInfo]::InvariantCulture,
      [Globalization.DateTimeStyles]::AssumeUniversal,
      [ref]$terminalAt
    )) {
    throw 'Signing terminal intent has an invalid terminal timestamp.'
  }
  return $terminalAtUtc
}

function Set-WaggleSigningTerminalState {
  param(
    [Parameter(Mandatory = $true)] [object]$Session,
    [Parameter(Mandatory = $true)] [ValidateSet('failed', 'sealed')] [string]$State,
    [Parameter(Mandatory = $true)] [object]$Receipt,
    [Parameter(Mandatory = $true)] [scriptblock]$LedgerMutation
  )

  $mutex = [Threading.Mutex]::new($false, "Local\WaggleSigning-$($Session.Id)")
  $hasMutex = $false
  $temporaryReceipt = $null
  $temporaryIntent = $null
  $receiptLock = $null
  $intentLock = $null
  try {
    try {
      $hasMutex = $mutex.WaitOne([TimeSpan]::FromSeconds(30))
    } catch [Threading.AbandonedMutexException] {
      $hasMutex = $true
    }
    if (-not $hasMutex) {
      throw 'Timed out waiting to terminalize the signing session.'
    }

    $fileName = if ($State -ceq 'sealed') {
      'provenance-receipt.json'
    } else {
      'failure-receipt.json'
    }
    $receiptPath = Join-Path $Session.SessionDirectory $fileName
    $oppositeFileName = if ($State -ceq 'sealed') {
      'failure-receipt.json'
    } else {
      'provenance-receipt.json'
    }
    $oppositePath = Join-Path $Session.SessionDirectory $oppositeFileName
    if (Test-Path -LiteralPath $oppositePath) {
      throw 'Signing session already contains the opposite terminal receipt.'
    }
    $intentPath = Get-WaggleTerminalIntentPath $Session

    $ledgerPath = Get-TrustedPath $Session.LedgerPath 'Signing callback ledger'
    try {
      $currentLedger = Get-Content -Raw -LiteralPath $ledgerPath |
        ConvertFrom-Json -Depth 32 -DateKind String
    } catch {
      throw 'Signing callback ledger is not valid JSON.'
    }
    Assert-WaggleSigningLedgerState $Session $currentLedger
    if ([string]$currentLedger.state -notin @('open', $State)) {
      throw 'Signing session is already in a different terminal state.'
    }

    if ([string]$currentLedger.state -ceq 'open') {
      & $LedgerMutation $currentLedger
    }

    if (Test-Path -LiteralPath $receiptPath) {
      $trustedReceiptPath = Get-TrustedPath $receiptPath 'Signing terminal receipt'
      $receiptLock = Open-ReadLock $trustedReceiptPath
      try {
        $persistedReceipt = Get-Content -Raw -LiteralPath $trustedReceiptPath |
          ConvertFrom-Json -Depth 32 -DateKind String
      } catch {
        throw 'Signing terminal receipt is not valid JSON.'
      }
      $terminalAtUtc = Assert-WaggleTerminalReceipt `
        $Session $State $persistedReceipt
      [void](Assert-WaggleTerminalReceipt $Session $State $Receipt)
      $candidateReceipt = $Receipt | ConvertTo-Json -Depth 32 |
        ConvertFrom-Json -Depth 32 -DateKind String
      $candidateReceipt.terminalAtUtc = $terminalAtUtc
      if (($candidateReceipt | ConvertTo-Json -Depth 32 -Compress) -cne
          ($persistedReceipt | ConvertTo-Json -Depth 32 -Compress)) {
        throw 'Signing terminal receipt does not match the current terminalization candidate.'
      }
      $receiptHash = (Get-FileHash -LiteralPath $trustedReceiptPath -Algorithm SHA256).Hash
      if (-not (Test-Path -LiteralPath $intentPath -PathType Leaf)) {
        throw 'Signing terminal receipt exists without its durable terminal intent.'
      }
      $trustedIntentPath = Get-TrustedPath $intentPath 'Signing terminal intent'
      $intentLock = Open-ReadLock $trustedIntentPath
      try {
        $intent = Get-Content -Raw -LiteralPath $trustedIntentPath |
          ConvertFrom-Json -Depth 16 -DateKind String
      } catch {
        throw 'Signing terminal intent is not valid JSON.'
      }
      $intentTerminalAtUtc = Assert-WaggleTerminalIntent $Session $State $intent
      if ($intentTerminalAtUtc -cne $terminalAtUtc -or
          -not [string]::Equals(
            [string]$intent.receiptSha256,
            $receiptHash,
            [StringComparison]::OrdinalIgnoreCase
          )) {
        throw 'Signing terminal receipt does not match its durable terminal intent.'
      }
    } else {
      $terminalAtUtc = Assert-WaggleTerminalReceipt $Session $State $Receipt
      $candidateReceipt = $Receipt | ConvertTo-Json -Depth 32 |
        ConvertFrom-Json -Depth 32 -DateKind String
      if (Test-Path -LiteralPath $intentPath) {
        $trustedIntentPath = Get-TrustedPath $intentPath 'Signing terminal intent'
        $intentLock = Open-ReadLock $trustedIntentPath
        try {
          $intent = Get-Content -Raw -LiteralPath $trustedIntentPath |
            ConvertFrom-Json -Depth 16 -DateKind String
        } catch {
          throw 'Signing terminal intent is not valid JSON.'
        }
        $terminalAtUtc = Assert-WaggleTerminalIntent $Session $State $intent
        $candidateReceipt.terminalAtUtc = $terminalAtUtc
      }
      $temporaryReceipt = Join-Path `
        $Session.SessionDirectory "$fileName.$([Guid]::NewGuid().ToString('N')).tmp"
      Write-WaggleDurableJsonNew $temporaryReceipt $candidateReceipt
      $trustedTemporaryReceipt = Get-TrustedPath `
        $temporaryReceipt 'Staged signing terminal receipt'
      $persistedReceipt = Get-Content -Raw -LiteralPath $trustedTemporaryReceipt |
        ConvertFrom-Json -Depth 32 -DateKind String
      $terminalAtUtc = Assert-WaggleTerminalReceipt `
        $Session $State $persistedReceipt
      $receiptHash = (Get-FileHash -LiteralPath $trustedTemporaryReceipt -Algorithm SHA256).Hash
      if ($null -ne $intentLock) {
        if (-not [string]::Equals(
            [string]$intent.receiptSha256,
            $receiptHash,
            [StringComparison]::OrdinalIgnoreCase
          )) {
          throw 'Signing terminalization candidate does not match its durable terminal intent.'
        }
      } else {
        $intent = [pscustomobject][ordered]@{
          schemaVersion = 1
          state = $State
          sessionId = $Session.Id
          manifestSha256 = $Session.ManifestSha256
          terminalAtUtc = $terminalAtUtc
          receiptSha256 = $receiptHash
        }
        $temporaryIntent = Join-Path `
          $Session.SessionDirectory "terminal-intent.$([Guid]::NewGuid().ToString('N')).tmp"
        Write-WaggleDurableJsonNew $temporaryIntent $intent
        [void](Assert-WaggleTerminalIntent $Session $State (
          Get-Content -Raw -LiteralPath $temporaryIntent |
            ConvertFrom-Json -Depth 16 -DateKind String
        ))
        [IO.File]::Move($temporaryIntent, $intentPath)
        $temporaryIntent = $null
        $trustedIntentPath = Get-TrustedPath $intentPath 'Signing terminal intent'
        $intentLock = Open-ReadLock $trustedIntentPath
        try {
          $persistedIntent = Get-Content -Raw -LiteralPath $trustedIntentPath |
            ConvertFrom-Json -Depth 16 -DateKind String
        } catch {
          throw 'Signing terminal intent is not valid JSON.'
        }
        $persistedIntentTerminalAtUtc = Assert-WaggleTerminalIntent `
          $Session $State $persistedIntent
        if ($persistedIntentTerminalAtUtc -cne $terminalAtUtc -or
            -not [string]::Equals(
              [string]$persistedIntent.receiptSha256,
              $receiptHash,
              [StringComparison]::OrdinalIgnoreCase
            )) {
          throw 'Published signing terminal intent does not match its staged receipt.'
        }
      }
    }

    if ([string]$currentLedger.state -ceq $State) {
      if (-not [string]::Equals(
          [string]$currentLedger.terminalReceiptSha256,
          $receiptHash,
          [StringComparison]::OrdinalIgnoreCase
        ) -or [string]$currentLedger.terminalAtUtc -cne $terminalAtUtc) {
        throw 'Terminal ledger does not match its durable receipt.'
      }
      return $receiptPath
    }

    $currentLedger.state = $State
    $currentLedger.terminalAtUtc = $terminalAtUtc
    $currentLedger.terminalReceiptSha256 = $receiptHash
    Assert-WaggleSigningLedgerState $Session $currentLedger
    if ($null -ne $temporaryReceipt) {
      [IO.File]::Move($temporaryReceipt, $receiptPath)
      $temporaryReceipt = $null
      $trustedReceiptPath = Get-TrustedPath $receiptPath 'Signing terminal receipt'
      $receiptLock = Open-ReadLock $trustedReceiptPath
      if (-not [string]::Equals(
          (Get-FileHash -LiteralPath $trustedReceiptPath -Algorithm SHA256).Hash,
          $receiptHash,
          [StringComparison]::OrdinalIgnoreCase
        )) {
        throw 'Published signing terminal receipt does not match its durable terminal intent.'
      }
    }
    Write-WaggleLedgerAtomicNoLock $Session $currentLedger
    return Get-TrustedPath $receiptPath 'Signing terminal receipt'
  } finally {
    if ($null -ne $temporaryReceipt -and
        (Test-Path -LiteralPath $temporaryReceipt -PathType Leaf)) {
      try { [IO.File]::Delete($temporaryReceipt) } catch { }
    }
    if ($null -ne $temporaryIntent -and
        (Test-Path -LiteralPath $temporaryIntent -PathType Leaf)) {
      try { [IO.File]::Delete($temporaryIntent) } catch { }
    }
    if ($null -ne $receiptLock) { $receiptLock.Dispose() }
    if ($null -ne $intentLock) { $intentLock.Dispose() }
    if ($hasMutex) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
  }
}

function Publish-WaggleTerminalReceipt {
  param(
    [Parameter(Mandatory = $true)] [object]$Session,
    [Parameter(Mandatory = $true)] [ValidateSet('failed', 'sealed')] [string]$State,
    [Parameter(Mandatory = $true)] [object]$Receipt,
    [Parameter(Mandatory = $true)] [scriptblock]$LedgerMutation
  )

  return Set-WaggleSigningTerminalState `
    -Session $Session -State $State -Receipt $Receipt `
    -LedgerMutation $LedgerMutation
}

function Fail-WaggleSigningSession {
  param(
    [Parameter(Mandatory = $true)] [object]$Session,
    [AllowNull()] [object]$Reservation,
    [Parameter(Mandatory = $true)] [string]$FailureCode,
    [Parameter(Mandatory = $true)] [string]$FailureMessage,
    [string]$RollbackOutcome = 'not-required'
  )

  $ledger = Get-Content -Raw -LiteralPath $Session.LedgerPath |
    ConvertFrom-Json -Depth 32 -DateKind String
  Assert-WaggleSigningLedgerState $Session $ledger
  if ([string]$ledger.state -ceq 'failed') {
    $persistedReceiptPath = Join-Path $Session.SessionDirectory 'failure-receipt.json'
    try {
      $persistedReceipt = Get-Content -Raw -LiteralPath $persistedReceiptPath |
        ConvertFrom-Json -Depth 32 -DateKind String
    } catch {
      throw 'Signing failure receipt is not valid JSON.'
    }
    return Publish-WaggleTerminalReceipt $Session 'failed' $persistedReceipt { param($_) }
  }
  if ([string]$ledger.state -cne 'open') {
    throw 'A sealed signing session cannot be marked failed.'
  }
  $reserved = @($ledger.entries | Where-Object { [string]$_.status -ceq 'reserved' })
  if ($reserved.Count -gt 1) { throw 'Signing ledger contains multiple reservations.' }
  $failedSlot = $null
  if ($null -ne $Reservation) {
    $reserved = @($reserved | Where-Object {
      [string]$_.reservationId -ceq [string]$Reservation.reservationId
    })
    if ($reserved.Count -ne 1) {
      throw 'Signing failure does not match the active reservation.'
    }
    $failedSlot = [string]$reserved[0].slotId
  } elseif ($reserved.Count -eq 1) {
    $failedSlot = [string]$reserved[0].slotId
  }
  $terminalAt = [DateTimeOffset]::UtcNow.ToString('O')
  $receipt = [pscustomobject][ordered]@{
    schemaVersion = 1
    status = 'failed'
    sessionId = $Session.Id
    sourceRevision = $Session.Context.SourceRevision
    manifestPath = $Session.ManifestPath
    manifestSha256 = $Session.ManifestSha256
    failureCode = $FailureCode
    failureMessage = $FailureMessage
    failedSlotId = $failedSlot
    rollbackOutcome = $RollbackOutcome
    terminalAtUtc = $terminalAt
  }
  return Publish-WaggleTerminalReceipt $Session 'failed' $receipt {
    param($activeLedger)
    $activeReserved = @($activeLedger.entries | Where-Object { [string]$_.status -ceq 'reserved' })
    if ($null -ne $failedSlot) {
      $activeReserved = @($activeReserved | Where-Object { [string]$_.slotId -ceq $failedSlot })
      if ($activeReserved.Count -ne 1) {
        throw 'Signing failure reservation changed before terminalization.'
      }
      $activeReserved[0].status = 'failed'
    } elseif ($activeReserved.Count -ne 0) {
      throw 'Signing failure receipt omitted an active reservation.'
    }
  }
}

function Expand-PinnedArtifactSigningPackage {
  param(
    [Parameter(Mandatory = $true)] [string]$PackagePath,
    [Parameter(Mandatory = $true)] [string]$StagingRoot
  )

  $package = Get-TrustedPath $PackagePath 'Artifact Signing package'
  $packageLock = Open-ReadLock $package
  try {
    if ((Get-FileHash -LiteralPath $package -Algorithm SHA256).Hash -cne
        $ArtifactSigningPackageSha256) {
      throw 'Artifact Signing package does not match the pinned SHA-256 digest.'
    }
    $stagedPackage = Join-Path $StagingRoot 'Microsoft.ArtifactSigning.Client.1.0.128.nupkg'
    [IO.File]::Copy($package, $stagedPackage, $false)
    if ((Get-FileHash -LiteralPath $stagedPackage -Algorithm SHA256).Hash -cne
        $ArtifactSigningPackageSha256) {
      throw 'Staged Artifact Signing package differs from the pinned package.'
    }
  } finally {
    $packageLock.Dispose()
  }

  $toolRoot = New-PrivateDirectory (Join-Path $StagingRoot 'artifact-signing-client')
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [IO.Compression.ZipFile]::ExtractToDirectory($stagedPackage, $toolRoot)
  $x64Root = Get-TrustedPath (Join-Path $toolRoot 'bin\x64') 'Artifact Signing x64 root' 'Container'
  $toolFiles = @(Get-ChildItem -LiteralPath $x64Root -Force)
  if ($toolFiles.Count -ne 41 -or @($toolFiles | Where-Object { -not $_.PSIsContainer }).Count -ne 41) {
    throw 'Artifact Signing x64 toolset does not match the pinned 41-file closure.'
  }
  $manifestLines = @(
    $toolFiles |
      Sort-Object Name |
      ForEach-Object {
        "{0}  {1}" -f (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash, $_.Name
      }
  )
  $manifestBytes = [Text.Encoding]::UTF8.GetBytes(($manifestLines -join "`n") + "`n")
  $manifestHash = [Convert]::ToHexString(
    [Security.Cryptography.SHA256]::HashData($manifestBytes)
  )
  if ($manifestHash -cne $ArtifactSigningX64ManifestSha256) {
    throw 'Artifact Signing x64 dependency manifest does not match the pinned digest.'
  }

  $dlib = Get-TrustedPath `
    (Join-Path $x64Root 'Azure.CodeSigning.Dlib.dll') `
    'Azure Artifact Signing dlib'
  if ([string](Get-Item -LiteralPath $dlib).VersionInfo.FileVersion -cne $ArtifactSigningClientVersion) {
    throw "Azure Artifact Signing dlib must be version $ArtifactSigningClientVersion x64."
  }
  Assert-MicrosoftAuthenticodeFile $dlib 'Azure Artifact Signing dlib' $ArtifactSigningDlibSha256

  $locks = [Collections.Generic.List[IDisposable]]::new()
  try {
    foreach ($toolFile in $toolFiles) {
      $trustedToolFile = Get-TrustedPath $toolFile.FullName 'Artifact Signing dependency'
      $locks.Add((Open-ReadLock $trustedToolFile))
    }
  } catch {
    foreach ($lock in $locks) { $lock.Dispose() }
    throw
  }
  return [pscustomobject]@{
    Dlib = $dlib
    Locks = $locks
  }
}

function Assert-DotNet8X64Runtime {
  $dotnet = Get-TrustedPath 'C:\Program Files\dotnet\dotnet.exe' '.NET host' -AllowHardLink
  Assert-MicrosoftAuthenticodeFile $dotnet '.NET host' $null $DotNetPublisher
  $dotnetLock = Open-ReadLock $dotnet
  try {
    $runtimes = @(& $dotnet --list-runtimes)
    if ($LASTEXITCODE -ne 0 -or
        -not ($runtimes -match '^Microsoft\.NETCore\.App 8\.\d+\.\d+ \[')) {
      throw 'Artifact Signing requires an installed x64 .NET 8 runtime.'
    }
  } finally {
    $dotnetLock.Dispose()
  }
}

function Get-SystemFsutilPath {
  return Get-TrustedPath `
    'C:\Windows\System32\fsutil.exe' 'fsutil' -AllowHardLink
}

function Get-HardLinkPaths {
  param([Parameter(Mandatory = $true)] [string]$Path)

  $fsutil = Get-SystemFsutilPath
  $fsutilLock = Open-ReadLock $fsutil
  try {
    Assert-MicrosoftAuthenticodeFile `
      $fsutil 'fsutil' $null $MicrosoftWindowsPublisher -AllowCatalog
    $rawLinks = @(& $fsutil hardlink list $Path)
    if ($LASTEXITCODE -ne 0 -or $rawLinks.Count -lt 2) {
      throw 'Could not enumerate the complete hard-link set for the signing artifact.'
    }
  } finally {
    $fsutilLock.Dispose()
  }

  $volumeRoot = [IO.Path]::GetPathRoot($Path)
  $links = foreach ($rawLink in $rawLinks) {
    $volumeRelative = [string]$rawLink
    if ($volumeRelative -notmatch '^\\[^\\]') {
      throw 'fsutil returned an invalid hard-link path.'
    }
    $absolutePath = $volumeRoot.TrimEnd('\') + $volumeRelative
    Get-TrustedPath $absolutePath 'Hard-link sibling' -AllowHardLink
  }
  return @($links | Sort-Object -Unique)
}

function Assert-ApprovedHardLinkTopology {
  param(
    [Parameter(Mandatory = $true)] [string]$Path,
    [Parameter(Mandatory = $true)] [string]$ReleaseRoot,
    [switch]$AllowDetachedMain
  )

  $expectedMain = [IO.Path]::GetFullPath((Join-Path $ReleaseRoot 'waggle.exe'))
  $expectedDependency = [IO.Path]::GetFullPath((Join-Path $ReleaseRoot 'deps\waggle.exe'))
  $isMain = [string]::Equals($Path, $expectedMain, [StringComparison]::OrdinalIgnoreCase)
  $isDependency = [string]::Equals(
    $Path,
    $expectedDependency,
    [StringComparison]::OrdinalIgnoreCase
  )
  $item = Get-Item -LiteralPath $Path -Force
  $linkTypeProperty = $item.PSObject.Properties['LinkType']
  $linkType = if ($null -eq $linkTypeProperty) { '' } else { [string]$linkTypeProperty.Value }
  if ([string]::IsNullOrEmpty($linkType)) {
    if ($isMain -and -not $AllowDetachedMain) {
      throw 'Cargo main executable must have the exact release\waggle.exe <-> release\deps\waggle.exe hard-link topology.'
    }
    return
  }
  if ($linkType -cne 'HardLink') {
    throw 'Only the exact Cargo main-executable hard-link topology is allowed.'
  }

  if (-not $isMain -and -not $isDependency) {
    throw 'Only the exact Cargo executable pair may be hard-linked.'
  }

  $actualLinks = @(Get-HardLinkPaths $Path)
  $actualSet = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($actualLink in $actualLinks) { [void]$actualSet.Add($actualLink) }
  if ($actualSet.Count -ne 2 -or
      -not $actualSet.Contains($expectedMain) -or
      -not $actualSet.Contains($expectedDependency)) {
    throw 'Cargo main executable has an unexpected hard-link sibling.'
  }
}

function Restore-WaggleReplacedArtifact {
  param(
    [Parameter(Mandatory = $true)] [string]$ArtifactPath,
    [Parameter(Mandatory = $true)] [string]$BackupPath,
    [Parameter(Mandatory = $true)] [string]$ExpectedOriginalSha256,
    [Parameter(Mandatory = $true)] [string[]]$ExpectedHardLinkPaths
  )

  if ($ExpectedOriginalSha256 -notmatch '^[0-9A-Fa-f]{64}$') {
    throw 'Rollback expected-original SHA-256 is invalid.'
  }

  $backup = Get-TrustedPath $BackupPath 'Rollback backup' -AllowHardLink
  if ((Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash -cne
      $ExpectedOriginalSha256.ToUpperInvariant()) {
    throw 'Rollback backup SHA-256 does not match expected original digest.'
  }

  $artifact = Get-TrustedPath $ArtifactPath 'Rollback artifact' -AllowHardLink
  $expectedSet = [Collections.Generic.HashSet[string]]::new(
    [StringComparer]::OrdinalIgnoreCase
  )
  foreach ($expectedPath in @($ExpectedHardLinkPaths)) {
    if ([string]::IsNullOrWhiteSpace($expectedPath)) {
      throw 'Rollback hard-link inventory contains an empty path.'
    }
    [void]$expectedSet.Add([IO.Path]::GetFullPath($expectedPath))
  }
  $isCargoPair = $expectedSet.Count -eq 2
  $releaseRoot = $null
  if ($isCargoPair) {
    $releaseRoot = Split-Path $artifact -Parent
    $expectedMain = [IO.Path]::GetFullPath((Join-Path $releaseRoot 'waggle.exe'))
    $expectedDependency = [IO.Path]::GetFullPath((Join-Path $releaseRoot 'deps\waggle.exe'))
    if (-not [string]::Equals(
        $artifact,
        $expectedMain,
        [StringComparison]::OrdinalIgnoreCase
      ) -or -not $expectedSet.Contains($expectedMain) -or
        -not $expectedSet.Contains($expectedDependency)) {
      throw 'Rollback hard-link inventory does not match the exact Cargo executable pair.'
    }
    $dependency = Get-TrustedPath `
      $expectedDependency 'Rollback Cargo dependency' -AllowHardLink
    if ((Get-FileHash -LiteralPath $dependency -Algorithm SHA256).Hash -cne
        $ExpectedOriginalSha256.ToUpperInvariant()) {
      throw 'Rollback Cargo dependency no longer matches the expected original digest.'
    }
    $backupLinks = @(Get-HardLinkPaths $backup)
    $backupSet = [Collections.Generic.HashSet[string]]::new(
      [StringComparer]::OrdinalIgnoreCase
    )
    foreach ($backupLink in $backupLinks) { [void]$backupSet.Add($backupLink) }
    if ($backupSet.Count -ne 2 -or
        -not $backupSet.Contains($backup) -or
        -not $backupSet.Contains($expectedDependency)) {
      throw 'Rollback backup has unexpected hard-link topology.'
    }
  } elseif ($expectedSet.Count -ne 1 -or -not $expectedSet.Contains($artifact)) {
    throw 'Rollback regular-file inventory must contain only the exact artifact path.'
  } else {
    $backupItem = Get-Item -LiteralPath $backup -Force
    $backupLinkType = $backupItem.PSObject.Properties['LinkType']
    if ($null -ne $backupLinkType -and
        -not [string]::IsNullOrEmpty([string]$backupLinkType.Value)) {
      throw 'Rollback regular-file backup unexpectedly has linked-file topology.'
    }
  }

  $failedReplacement = Join-Path `
    (Split-Path $backup -Parent) `
    "failed-replacement-$([Guid]::NewGuid().ToString('N')).bin"
  [IO.File]::Replace($backup, $artifact, $failedReplacement, $true)
  try {
    if ((Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash -cne
        $ExpectedOriginalSha256.ToUpperInvariant()) {
      throw 'Rollback did not restore the exact original artifact bytes.'
    }
    if ($isCargoPair) {
      Assert-ApprovedHardLinkTopology $artifact $releaseRoot
    } else {
      $restoredItem = Get-Item -LiteralPath $artifact -Force
      $restoredLinkType = $restoredItem.PSObject.Properties['LinkType']
      if ($null -ne $restoredLinkType -and
          -not [string]::IsNullOrEmpty([string]$restoredLinkType.Value)) {
        throw 'Rollback restored regular artifact with unexpected linked-file topology.'
      }
    }
  } finally {
    if (Test-Path -LiteralPath $failedReplacement -PathType Leaf) {
      [IO.File]::Delete($failedReplacement)
    }
  }
}

function Get-ApprovedArtifact {
  param(
    [Parameter(Mandatory = $true)] [string]$Path,
    [Parameter(Mandatory = $true)] [object]$SigningSession,
    [switch]$AllowDetachedMain
  )

  $context = $SigningSession.Context
  $tauriRoot = $context.TauriRoot
  $resourcesRoot = $context.ResourcesRoot
  $releaseRoot = $context.ReleaseRoot
  $artifact = Get-TrustedPath $Path 'Signing artifact' -AllowHardLink
  $tempRoot = $SigningSession.TempRoot
  $version = [string](Get-Content -Raw -LiteralPath $context.ConfigPath | ConvertFrom-Json).version
  if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Tauri version is not strict semantic version.' }

  $kind = Get-ArtifactPolicyKind $artifact $releaseRoot $resourcesRoot $tempRoot $version
  Assert-ApprovedHardLinkTopology $artifact $releaseRoot -AllowDetachedMain:$AllowDetachedMain
  if ($kind -eq 'MSI') { Assert-MsiFile $artifact } else { Assert-PeFile $artifact }
  return $artifact
}

function Assert-WaggleSignedArtifact {
  param(
    [Parameter(Mandatory = $true)] [string]$Path,
    [Parameter(Mandatory = $true)] [string]$SignTool
  )

  & $SignTool verify /pa /all /v $Path
  if ($LASTEXITCODE -ne 0) {
    throw "Signed artifact verification failed with SignTool exit code $LASTEXITCODE."
  }

  $signature = Get-AuthenticodeSignature -LiteralPath $Path
  if ($signature.Status -ne [Management.Automation.SignatureStatus]::Valid -or
      [string]$signature.SignatureType -cne 'Authenticode' -or
      $null -eq $signature.SignerCertificate -or
      $null -eq $signature.TimeStamperCertificate) {
    throw 'Signed artifact lacks a valid, timestamped Authenticode signature.'
  }
  if (-not [string]::Equals(
      [string]$signature.SignerCertificate.Subject,
      $ApprovedPublisher,
      [StringComparison]::Ordinal
    )) {
    throw 'Signed artifact publisher does not match the repository-approved identity.'
  }
  $hasCodeSigningEku = @(
    $signature.SignerCertificate.Extensions |
      Where-Object { $_ -is [Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension] } |
      ForEach-Object { $_.EnhancedKeyUsages } |
      Where-Object { $_.Value -eq $CodeSigningOid }
  ).Count -gt 0
  if (-not $hasCodeSigningEku) {
    throw 'Signed artifact certificate lacks the Code Signing EKU.'
  }
}

function Write-WaggleJsonNoBom {
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

function Write-WaggleSigningOverride {
  param(
    [Parameter(Mandatory = $true)] [string]$Path,
    [Parameter(Mandatory = $true)] [string]$WrapperPath,
    [AllowNull()] [string]$ResourcesRoot = $null,
    [switch]$EnableSigning
  )
  $windows = [ordered]@{}
  if ($EnableSigning) {
    $windows.signCommand = [ordered]@{
      cmd = $SystemPowerShellPath
      args = @(
        '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', $WrapperPath, '-ArtifactPath', '%1'
      )
    }
  }
  $bundle = [ordered]@{
    active = $true
    targets = @('nsis')
    windows = $windows
  }
  if (-not [string]::IsNullOrWhiteSpace($ResourcesRoot)) {
    $trustedResourcesRoot = Get-TrustedPath `
      $ResourcesRoot 'Signing override resource root' 'Container'
    $resourceMap = [ordered]@{}
    $resourceMap[$trustedResourcesRoot] = 'resources'
    $bundle.resources = $resourceMap
  }
  Write-WaggleJsonNoBom $Path ([ordered]@{
    build = [ordered]@{ beforeBuildCommand = ''; beforeBundleCommand = '' }
    bundle = $bundle
  })
  return Get-TrustedPath $Path 'Tauri signing override config'
}

function Get-NsisPayloadInventory {
  param(
    [Parameter(Mandatory = $true)] [string]$InstallerPath,
    [Parameter(Mandatory = $true)] [string]$InventoryTool
  )
  $installer = Get-TrustedPath $InstallerPath 'NSIS installer inventory artifact' -AllowHardLink
  $output = @(& $InventoryTool l -slt -- $installer)
  if ($LASTEXITCODE -ne 0) {
    throw "NSIS payload inventory failed with 7-Zip exit code $LASTEXITCODE."
  }
  $afterDelimiter = $false
  $paths = [Collections.Generic.List[string]]::new()
  $uniquePaths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($line in $output) {
    if ([string]$line -ceq '----------') {
      $afterDelimiter = $true
      continue
    }
    if ($afterDelimiter -and [string]$line -cmatch '^Path = (.+)$' -and
        $Matches[1] -cne '[0]') {
      $path = [string]$Matches[1]
      if ($path -match '[\x00-\x1F\x7F]' -or [IO.Path]::IsPathRooted($path) -or
          $path -match '(^|[\\/])\.\.?(?:[\\/]|$)' -or $path -match ':' -or
          -not $uniquePaths.Add($path)) {
        throw 'NSIS payload inventory contains an unsafe, duplicate, or case-colliding path.'
      }
      $paths.Add($path)
    }
  }
  $paths.Sort([StringComparer]::Ordinal)
  $inventory = @($paths)
  if ($inventory.Count -lt 10 -or $inventory -notcontains 'waggle.exe') {
    throw 'NSIS payload inventory is incomplete or missing waggle.exe.'
  }
  return $inventory
}

function Expand-NsisPayloadManifest {
  param(
    [Parameter(Mandatory = $true)] [string]$InstallerPath,
    [Parameter(Mandatory = $true)] [string]$InventoryTool,
    [Parameter(Mandatory = $true)] [string]$ExtractionRoot
  )
  $installer = Get-TrustedPath $InstallerPath 'NSIS payload artifact' -AllowHardLink
  $expectedPaths = @(Get-NsisPayloadInventory $installer $InventoryTool)
  $root = New-PrivateDirectory $ExtractionRoot
  if (@(Get-ChildItem -LiteralPath $root -Force).Count -ne 0) {
    throw 'NSIS payload extraction root must be empty.'
  }
  & $InventoryTool x -y "-o$root" -- $installer | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "NSIS payload extraction failed with 7-Zip exit code $LASTEXITCODE."
  }
  $entries = [Collections.Generic.List[object]]::new()
  $actualPaths = [Collections.Generic.List[string]]::new()
  foreach ($file in @(Get-ChildItem -LiteralPath $root -Recurse -File -Force)) {
    $trustedFile = Get-TrustedPath $file.FullName 'Extracted NSIS payload'
    $relative = (Get-ContainedRelativePath $trustedFile $root).Replace('/', '\')
    $actualPaths.Add($relative)
    $entries.Add([pscustomobject][ordered]@{
      path = $relative
      sha256 = (Get-FileHash -LiteralPath $trustedFile -Algorithm SHA256).Hash
      size = [long]$file.Length
      extractedPath = $trustedFile
    })
  }
  $actualPaths.Sort([StringComparer]::Ordinal)
  if ($actualPaths.Count -ne $expectedPaths.Count -or
      [string]::Join("`n", $actualPaths) -cne [string]::Join("`n", $expectedPaths)) {
    throw 'Extracted NSIS payload roster differs from the exact archive inventory.'
  }
  return @($entries | Sort-Object { [string]$_.path })
}

function Get-WagglePayloadManifestSha256 {
  param([Parameter(Mandatory = $true)] [object[]]$Payloads)
  $canonical = @($Payloads | Sort-Object { [string]$_.path } | ForEach-Object {
    [ordered]@{ path = [string]$_.path; sha256 = [string]$_.sha256; size = [long]$_.size }
  }) | ConvertTo-Json -Depth 8 -Compress
  return [Convert]::ToHexString(
    [Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($canonical))
  )
}

function Assert-WaggleUnsignedPayloadResourceProjection {
  param(
    [Parameter(Mandatory = $true)] [object[]]$Payloads,
    [Parameter(Mandatory = $true)] [object]$ResourcesInventory
  )

  $payloadResources = @(
    @($Payloads) |
      Where-Object { ([string]$_.path).StartsWith('resources\', [StringComparison]::Ordinal) } |
      ForEach-Object {
        [pscustomobject][ordered]@{
          path = ([string]$_.path).Substring('resources\'.Length)
          size = [long]$_.size
          sha256 = [string]$_.sha256
        }
      }
  )
  $expectedResources = @((Get-RequiredPropertyValue `
    $ResourcesInventory 'entries' 'Hosted build resourcesInventory'))
  Assert-WaggleCanonicalInventoryEntries `
    $payloadResources 'Unsigned NSIS payload resource projection'
  Assert-WaggleCanonicalInventoryEntries `
    $expectedResources 'Hosted build resourcesInventory'
  if ($payloadResources.Count -ne $expectedResources.Count) {
    throw 'Unsigned NSIS payload resource projection does not match build receipt.'
  }
  for ($index = 0; $index -lt $payloadResources.Count; $index++) {
    if ([string]$payloadResources[$index].path -cne [string]$expectedResources[$index].path -or
        [long]$payloadResources[$index].size -ne [long]$expectedResources[$index].size -or
        -not [string]::Equals(
          [string]$payloadResources[$index].sha256,
          [string]$expectedResources[$index].sha256,
          [StringComparison]::OrdinalIgnoreCase
        )) {
      throw 'Unsigned NSIS payload resource projection does not match build receipt.'
    }
  }
}

function New-WagglePendingLedger {
  param(
    [Parameter(Mandatory = $true)] [string]$SessionId,
    [Parameter(Mandatory = $true)] [string]$ManifestSha256,
    [Parameter(Mandatory = $true)] [object[]]$Slots
  )
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

function Resolve-WagglePreflightFixedPath {
  param(
    [Parameter(Mandatory = $true)] [string]$SigningPath,
    [Parameter(Mandatory = $true)] [string]$SigningTargetRoot,
    [Parameter(Mandatory = $true)] [string]$PreflightTargetRoot
  )

  $relativePath = Get-ContainedRelativePath `
    ([IO.Path]::GetFullPath($SigningPath)) `
    ([IO.Path]::GetFullPath($SigningTargetRoot))
  if ($null -eq $relativePath) {
    throw 'Preflight signing path escaped the signing target root.'
  }
  return Get-TrustedPath `
    (Join-Path $PreflightTargetRoot $relativePath) `
    'Preflight signing artifact' -AllowHardLink
}

function New-WaggleSigningManifest {
  param(
    [Parameter(Mandatory = $true)] [object]$Context,
    [Parameter(Mandatory = $true)] [object[]]$Payloads,
    [Parameter(Mandatory = $true)] [string]$PreflightTargetRoot,
    [AllowNull()] [object]$BuildReceipt = $null
  )
  $sessionId = [Environment]::GetEnvironmentVariable('WAGGLE_SIGNING_SESSION_ID')
  $sessionDirectory = Assert-PrivateDirectoryAcl `
    (Join-Path (Join-Path $Context.TauriRoot 'target\.signing-sessions') "run-$sessionId") `
    'Signing session directory'
  $manifestPath = Join-Path $sessionDirectory 'manifest.json'
  $ledgerPath = Join-Path $sessionDirectory 'callback-ledger.json'
  if (Test-Path -LiteralPath $manifestPath -or Test-Path -LiteralPath $ledgerPath) {
    throw 'Signing session manifest or ledger already exists.'
  }

  $version = [string](Get-Content -Raw -LiteralPath $Context.ConfigPath | ConvertFrom-Json).version
  $fixedPaths = @(Get-ExpectedNsisFixedPaths $Context $version)
  $packagedPaths = @(Get-ExpectedNsisPackagedPaths)
  $trustedPreflightTargetRoot = Get-TrustedPath `
    $PreflightTargetRoot 'Preflight signing target root' 'Container'
  $preflightReleaseRoot = Get-TrustedPath `
    (Join-Path $trustedPreflightTargetRoot 'x86_64-pc-windows-msvc\release') `
    'Preflight signing release root' 'Container'
  $slots = [Collections.Generic.List[object]]::new()
  for ($index = 0; $index -lt $fixedPaths.Count; $index++) {
    $fixedPath = [IO.Path]::GetFullPath($fixedPaths[$index])
    $preflightPath = Resolve-WagglePreflightFixedPath `
      $fixedPath $Context.TargetRoot $trustedPreflightTargetRoot
    Assert-PeFile $preflightPath
    Assert-ApprovedHardLinkTopology `
      $preflightPath $preflightReleaseRoot
    if ((Get-AuthenticodeSignature -LiteralPath $preflightPath).Status -ne
        [Management.Automation.SignatureStatus]::NotSigned) {
      throw 'Unsigned NSIS preflight contains an already signed or invalid callback artifact.'
    }
    $slots.Add([pscustomobject][ordered]@{
      id = 'fixed-{0:d2}' -f ($index + 1)
      order = $index + 1
      kind = 'fixed'
      maxUses = 1
      path = $fixedPath
      packagedPath = $packagedPaths[$index]
      preSignSha256 = if ($index -eq 0) {
        Get-NsisPatchedMainSha256 $preflightPath
      } else {
        (Get-FileHash -LiteralPath $preflightPath -Algorithm SHA256).Hash
      }
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
  $installerPath = Join-Path `
    $Context.ReleaseRoot "bundle\nsis\Waggle_${version}_x64-setup.exe"
  $slots.Add([pscustomobject][ordered]@{
    id = 'nsis-installer'
    order = 14
    kind = 'generated-nsis-installer'
    maxUses = 1
    path = $installerPath
  })

  $toolchain = [ordered]@{
    wrapperPath = $Context.WrapperPath
    wrapperSha256 = (Get-FileHash -LiteralPath $Context.WrapperPath -Algorithm SHA256).Hash
    tauriConfigPath = $Context.ConfigPath
    tauriConfigSha256 = (Get-FileHash -LiteralPath $Context.ConfigPath -Algorithm SHA256).Hash
    tauriOverrideConfigPath = $Context.OverrideConfigPath
    tauriOverrideConfigSha256 = (Get-FileHash -LiteralPath $Context.OverrideConfigPath -Algorithm SHA256).Hash
    tauriCliPath = $Context.TauriCliPath
    tauriCliSha256 = $Context.TauriCliSha256
    tauriCliPackagePath = $Context.TauriCliPackagePath
    tauriCliPackageSha256 = $Context.TauriCliPackageSha256
    tauriCliMainPath = $Context.TauriCliMainPath
    tauriCliMainSha256 = $Context.TauriCliMainSha256
    tauriCliIndexPath = $Context.TauriCliIndexPath
    tauriCliIndexSha256 = $Context.TauriCliIndexSha256
    tauriNativePackagePath = $Context.TauriNativePackagePath
    tauriNativePackageSha256 = $Context.TauriNativePackageSha256
    tauriNativeBinaryPath = $Context.TauriNativeBinaryPath
    tauriNativeBinarySha256 = $Context.TauriNativeBinarySha256
    tauriCliVersion = $Context.TauriCliVersion
    nsisRoot = $Context.NsisRoot
    nsisClosureSha256 = $Context.NsisClosureSha256
    makensisPath = $Context.MakensisPath
    makensisSha256 = $Context.MakensisSha256
    gitPath = $Context.GitPath
    gitSha256 = $Context.GitSha256
    gitRuntimePath = $Context.GitRuntimePath
    gitRuntimeSha256 = $Context.GitRuntimeSha256
    nodePath = $Context.NodePath
    nodeSha256 = $Context.NodeSha256
    sevenZipPath = $Context.SevenZipPath
    sevenZipSha256 = $Context.SevenZipSha256
    signToolPath = $Context.SignToolPath
    signToolSha256 = $Context.SignToolSha256
    artifactSigningPackagePath = $Context.ArtifactSigningPackagePath
    artifactSigningPackageSha256 = $Context.ArtifactSigningPackageSha256
    artifactSigningX64ManifestSha256 = $Context.ArtifactSigningX64ManifestSha256
  }
  if ($null -ne $Context.PortableToolchainRoot) {
    $toolchain.portableToolchainRoot = $Context.PortableToolchainRoot
    $toolchain.sevenZipDllPath = $Context.SevenZipDllPath
    $toolchain.sevenZipDllSha256 = $Context.SevenZipDllSha256
    $toolchain.portableToolchainReceiptPath = $Context.PortableToolchainReceiptPath
    $toolchain.portableToolchainReceiptSha256 = $Context.PortableToolchainReceiptSha256
    $toolchain.portableToolchainInventorySha256 = $PortableToolchainInventorySha256
    $toolchain.portableToolchainFileCount = $PortableToolchainFileCount
  }
  $now = [DateTimeOffset]::UtcNow
  $manifest = [pscustomobject][ordered]@{
    schemaVersion = 1
    mode = 'nsis'
    sessionId = $sessionId
    sourceRevision = $Context.SourceRevision
    buildReceipt = $BuildReceipt
    createdAtUtc = $now.ToString('O')
    expiresAtUtc = $now.AddHours(4).ToString('O')
    repoRoot = $Context.RepoRoot
    tauriRoot = $Context.TauriRoot
    targetRoot = $Context.TargetRoot
    releaseRoot = $Context.ReleaseRoot
    resourcesRoot = $Context.ResourcesRoot
    tempRoot = [Environment]::GetEnvironmentVariable('WAGGLE_NSIS_SIGNING_TEMP_ROOT')
    ledgerPath = $ledgerPath
    appVersion = $version
    payloads = @($Payloads | Sort-Object { [string]$_.path } | ForEach-Object {
      [pscustomobject][ordered]@{
        path = [string]$_.path
        sha256 = [string]$_.sha256
        size = [long]$_.size
      }
    })
    toolchain = $toolchain
    slots = @($slots)
  }
  Write-WaggleJsonNoBom $manifestPath $manifest
  $manifestSha256 = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash
  Write-WaggleJsonNoBom `
    $ledgerPath (New-WagglePendingLedger $sessionId $manifestSha256 @($slots))
  [Environment]::SetEnvironmentVariable('WAGGLE_SIGNING_MANIFEST_PATH', $manifestPath)
  [Environment]::SetEnvironmentVariable('WAGGLE_SIGNING_MANIFEST_SHA256', $manifestSha256)
  return Get-WaggleSigningSession $Context
}

function Get-CompletedWaggleSigningLedger {
  param([Parameter(Mandatory = $true)] [object]$Session)
  $ledger = Get-Content -Raw -LiteralPath $Session.LedgerPath |
    ConvertFrom-Json -Depth 32 -DateKind String
  Assert-WaggleSigningLedgerState $Session $ledger
  if ([string]$ledger.state -cne 'open' -or
      @($ledger.entries | Where-Object { [string]$_.status -cne 'completed' }).Count -ne 0) {
    throw 'Signing callback ledger is incomplete after the NSIS package.'
  }
  return $ledger
}

function Assert-WaggleFinalPayloadBindings {
  param(
    [Parameter(Mandatory = $true)] [object]$Session,
    [Parameter(Mandatory = $true)] [object]$Ledger,
    [Parameter(Mandatory = $true)] [object[]]$ActualPayloads,
    [Parameter(Mandatory = $true)] [scriptblock]$SignatureVerifier
  )
  $expectedPayloads = @($Session.Manifest.payloads | Sort-Object { [string]$_.path })
  $actualPayloadsSorted = @($ActualPayloads | Sort-Object { [string]$_.path })
  if ($expectedPayloads.Count -ne $actualPayloadsSorted.Count -or
      [string]::Join("`n", @($expectedPayloads | ForEach-Object { [string]$_.path })) -cne
        [string]::Join("`n", @($actualPayloadsSorted | ForEach-Object { [string]$_.path }))) {
    throw 'Final signed NSIS payload inventory differs from the unsigned preflight inventory.'
  }
  $fixedSlots = @($Session.Manifest.slots | Where-Object { [string]$_.kind -ceq 'fixed' })
  $bindings = [Collections.Generic.List[object]]::new()
  for ($index = 0; $index -lt $expectedPayloads.Count; $index++) {
    $expected = $expectedPayloads[$index]
    $actual = $actualPayloadsSorted[$index]
    $slot = @($fixedSlots | Where-Object {
      [string]$_.packagedPath -ceq [string]$expected.path
    })
    $expectedHash = [string]$expected.sha256
    $slotOrder = $null
    if ($slot.Count -eq 1) {
      $slotOrder = [int]$slot[0].order
      $expectedHash = [string]$Ledger.entries[$slotOrder - 1].postSignSha256
    } elseif ($slot.Count -gt 1) {
      throw 'Multiple signing slots map to one packaged NSIS payload.'
    }
    if (-not [string]::Equals(
        [string]$actual.sha256,
        $expectedHash,
        [StringComparison]::OrdinalIgnoreCase
      )) {
      throw "Final NSIS payload bytes differ for '$([string]$expected.path)'."
    }
    if ($null -ne $slotOrder) {
      & $SignatureVerifier ([string]$actual.extractedPath) $Session.Context.SignToolPath
      $bindings.Add([pscustomobject][ordered]@{
        order = $slotOrder
        kind = 'packaged-signed-payload'
        packagedPath = [string]$expected.path
        sha256 = $expectedHash
      })
    }
  }
  return @($bindings | Sort-Object order)
}

function Assert-WaggleSigningPackageComplete {
  param(
    [Parameter(Mandatory = $true)] [object]$Session,
    [AllowNull()] [object[]]$ActualPayloads,
    [AllowNull()] [scriptblock]$SignatureVerifier
  )

  $ledger = Get-CompletedWaggleSigningLedger $Session
  if ($null -eq $SignatureVerifier) {
    $SignatureVerifier = { param($Path, $SignTool) Assert-WaggleSignedArtifact $Path $SignTool }
  }
  $installerEntry = @($ledger.entries | Where-Object { [int]$_.order -eq 14 })
  if ($installerEntry.Count -ne 1) {
    throw 'Signing callback ledger lacks the final NSIS installer entry.'
  }
  $installer = Get-TrustedPath ([string]$installerEntry[0].path) 'Final NSIS installer'
  if (-not [string]::Equals(
      (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash,
      [string]$installerEntry[0].postSignSha256,
      [StringComparison]::OrdinalIgnoreCase
    )) {
    throw 'Final NSIS installer hash does not match the completed callback ledger.'
  }
  $installerLock = Open-ReadLock $installer
  $uninstallerLock = $null
  $extractionRoot = $null
  $validationSucceeded = $false
  try {
    & $SignatureVerifier $installer $Session.Context.SignToolPath
    if ($null -eq $ActualPayloads) {
      $extractionRoot = Join-Path $Session.SessionDirectory 'final-payload-extraction'
      $ActualPayloads = @(Expand-NsisPayloadManifest `
        $installer $Session.Context.SevenZipPath $extractionRoot)
    }
    $artifactBindings = [Collections.Generic.List[object]]::new()
    foreach ($binding in @(Assert-WaggleFinalPayloadBindings `
        $Session $ledger $ActualPayloads $SignatureVerifier)) {
      $artifactBindings.Add($binding)
    }
    $uninstallerSlot = @($Session.Manifest.slots | Where-Object {
      [string]$_.kind -ceq 'generated-nsis-uninstaller'
    })
    if ($uninstallerSlot.Count -ne 1) {
      throw 'Signing manifest lacks the generated NSIS uninstaller evidence slot.'
    }
    $uninstallerEvidence = Get-TrustedPath `
      ([string]$uninstallerSlot[0].evidencePath) 'Signed NSIS uninstaller evidence'
    $uninstallerLock = Open-ReadLock $uninstallerEvidence
    $uninstallerEntry = $ledger.entries[[int]$uninstallerSlot[0].order - 1]
    if (-not [string]::Equals(
        (Get-FileHash -LiteralPath $uninstallerEvidence -Algorithm SHA256).Hash,
        [string]$uninstallerEntry.postSignSha256,
        [StringComparison]::OrdinalIgnoreCase
      )) {
      throw 'Signed NSIS uninstaller evidence differs from the callback ledger.'
    }
    & $SignatureVerifier $uninstallerEvidence $Session.Context.SignToolPath
    $artifactBindings.Add([pscustomobject][ordered]@{
      order = [int]$uninstallerEntry.order
      kind = 'generated-nsis-uninstaller-evidence'
      evidencePath = $uninstallerEvidence
      sha256 = [string]$uninstallerEntry.postSignSha256
    })
    $artifactBindings.Add([pscustomobject][ordered]@{
      order = [int]$installerEntry[0].order
      kind = 'generated-nsis-installer'
      path = $installer
      sha256 = [string]$installerEntry[0].postSignSha256
    })
    $validationSucceeded = $true
  } finally {
    if ($null -ne $extractionRoot -and (Test-Path -LiteralPath $extractionRoot)) {
      Remove-Item -LiteralPath $extractionRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
    if (-not $validationSucceeded) {
      if ($null -ne $uninstallerLock) { $uninstallerLock.Dispose() }
      $installerLock.Dispose()
    }
  }

  try {
    if (-not [string]::Equals(
        (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash,
        [string]$installerEntry[0].postSignSha256,
        [StringComparison]::OrdinalIgnoreCase
      )) {
      throw 'Final NSIS installer changed before provenance publication.'
    }
    $terminalAt = [DateTimeOffset]::UtcNow.ToString('O')
    $receipt = [pscustomobject][ordered]@{
      schemaVersion = 1
      status = 'sealed'
      sessionId = $Session.Id
      sourceRevision = $Session.Context.SourceRevision
      manifestPath = $Session.ManifestPath
      manifestSha256 = $Session.ManifestSha256
      callbackLedgerPath = $Session.LedgerPath
      installerPath = $installer
      installerSha256 = [string]$installerEntry[0].postSignSha256
      signerSubject = [string]$installerEntry[0].signerSubject
      payloadManifestSha256 = Get-WagglePayloadManifestSha256 $ActualPayloads
      artifactBindings = @($artifactBindings | Sort-Object order)
      terminalAtUtc = $terminalAt
    }
    $receiptPath = Publish-WaggleTerminalReceipt $Session 'sealed' $receipt {
      param($activeLedger)
      if (@($activeLedger.entries | Where-Object { [string]$_.status -cne 'completed' }).Count -ne 0) {
        throw 'Signing callback ledger changed before final sealing.'
      }
    }
    return [pscustomobject]@{
      InstallerPath = $installer
      ReceiptPath = $receiptPath
    }
  } finally {
    if ($null -ne $uninstallerLock) { $uninstallerLock.Dispose() }
    $installerLock.Dispose()
  }
}

function Install-WaggleArtifactSigningPackage {
  param(
    [Parameter(Mandatory = $true)] [string]$TauriRoot,
    [string]$SourcePath = ''
  )
  $destinationDirectoryPath = Join-Path $TauriRoot 'target\.artifact-signing-tools'
  $destinationPath = Join-Path `
    $destinationDirectoryPath 'Microsoft.ArtifactSigning.Client.1.0.128.nupkg'
  if (Test-Path -LiteralPath $destinationPath -PathType Leaf) {
    $destination = Get-TrustedPath $destinationPath 'Artifact Signing package'
    if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -cne
        $ArtifactSigningPackageSha256) {
      throw 'Existing production Artifact Signing package has the wrong SHA-256 digest.'
    }
    return $destination
  }
  if ([string]::IsNullOrWhiteSpace($SourcePath)) {
    throw 'Production Artifact Signing package is not provisioned by the protected hosted signing workflow.'
  }
  $source = Get-TrustedPath $SourcePath 'Artifact Signing package source'
  $sourceLock = Open-ReadLock $source
  $temporaryPath = $null
  try {
    if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -cne
        $ArtifactSigningPackageSha256) {
      throw 'Artifact Signing package source does not match the pinned SHA-256 digest.'
    }
    $destinationDirectory = New-PrivateDirectory $destinationDirectoryPath
    $temporaryPath = Join-Path `
      $destinationDirectory "artifact-signing.$([Guid]::NewGuid().ToString('N')).tmp"
    [IO.File]::Copy($source, $temporaryPath, $false)
    if ((Get-FileHash -LiteralPath $temporaryPath -Algorithm SHA256).Hash -cne
        $ArtifactSigningPackageSha256) {
      throw 'Provisioned Artifact Signing package copy failed digest verification.'
    }
    [IO.File]::Move($temporaryPath, $destinationPath)
    $temporaryPath = $null
    return Get-TrustedPath $destinationPath 'Artifact Signing package'
  } finally {
    $sourceLock.Dispose()
    if ($null -ne $temporaryPath -and (Test-Path -LiteralPath $temporaryPath -PathType Leaf)) {
      try { [IO.File]::Delete($temporaryPath) } catch { }
    }
  }
}

function Open-WagglePackageToolchainLocks {
  param([Parameter(Mandatory = $true)] [object]$Context)
  $bindings = @(
    @($Context.WrapperPath, (Get-FileHash -LiteralPath $Context.WrapperPath -Algorithm SHA256).Hash, 'Signing wrapper'),
    @($Context.NodePath, $Context.NodeSha256, 'Node.js runtime'),
    @($Context.SevenZipPath, $Context.SevenZipSha256, '7-Zip'),
    @($Context.SevenZipDllPath, $Context.SevenZipDllSha256, '7-Zip runtime library'),
    @($Context.TauriCliPath, $Context.TauriCliSha256, 'Tauri CLI'),
    @($Context.TauriCliPackagePath, $Context.TauriCliPackageSha256, 'Tauri CLI package'),
    @($Context.TauriCliMainPath, $Context.TauriCliMainSha256, 'Tauri CLI main module'),
    @($Context.TauriCliIndexPath, $Context.TauriCliIndexSha256, 'Tauri CLI native loader'),
    @($Context.TauriNativePackagePath, $Context.TauriNativePackageSha256, 'Tauri native package'),
    @($Context.TauriNativeBinaryPath, $Context.TauriNativeBinarySha256, 'Tauri native binary'),
    @($Context.MakensisPath, $Context.MakensisSha256, 'makensis'),
    @($Context.GitPath, $Context.GitSha256, 'Git executable'),
    @($Context.GitRuntimePath, $Context.GitRuntimeSha256, 'Git runtime'),
    @($Context.SignToolPath, $Context.SignToolSha256, 'SignTool'),
    @($Context.ArtifactSigningPackagePath, $Context.ArtifactSigningPackageSha256, 'Artifact Signing package')
  )
  $locks = [Collections.Generic.List[IDisposable]]::new()
  try {
    foreach ($portableLock in @($Context.PortableToolchainLocks)) {
      $locks.Add($portableLock)
    }
    $Context.PortableToolchainLocks.Clear()
    $trackedBundleInputs = @(
      'app/src-tauri/tauri.conf.json',
      'app/src-tauri/Cargo.toml',
      'app/src-tauri/Cargo.lock',
      'app/src-tauri/build.rs',
      'app/src-tauri/nsis/installer.nsi',
      'app/src-tauri/icons/32x32.png',
      'app/src-tauri/icons/128x128.png',
      'app/src-tauri/icons/128x128@2x.png',
      'app/src-tauri/icons/icon.icns',
      'app/src-tauri/icons/icon.ico',
      'app/src-tauri/icons/icon.png'
    )
    foreach ($relativePath in $trackedBundleInputs) {
      $trackedPath = Get-TrustedPath `
        (Join-Path $Context.RepoRoot $relativePath) `
        'Tracked Tauri packaging input' -AllowHardLink
      $locks.Add((Open-ReadLock $trackedPath))
    }
    $nsisInventory = New-WagglePrebuiltInventory -Root $Context.NsisRoot
    if (@($nsisInventory.entries).Count -ne 442 -or
        -not [string]::Equals(
          [string]$nsisInventory.sha256,
          [string]$Context.NsisClosureSha256,
          [StringComparison]::OrdinalIgnoreCase
        )) {
      throw 'NSIS compiler closure does not match the pinned 442-file inventory.'
    }
    $nsisLease = Open-WaggleValidatedPrebuiltTree `
      $Context.NsisRoot $nsisInventory 'NSIS compiler closure'
    foreach ($nsisLock in $nsisLease.Locks) { $locks.Add($nsisLock) }
    $nsisLease.Locks.Clear()
    foreach ($binding in $bindings) {
      $path = Get-TrustedPath ([string]$binding[0]) ([string]$binding[2]) -AllowHardLink
      $lock = Open-ReadLock $path
      if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -cne [string]$binding[1]) {
        $lock.Dispose()
        throw "$($binding[2]) does not match the pinned production-build digest."
      }
      $locks.Add($lock)
    }
    $lockedRevision = [string](& $Context.GitPath -C $Context.RepoRoot rev-parse --verify HEAD)
    $lockedStatus = @(& $Context.GitPath -C $Context.RepoRoot status --porcelain=v1 --untracked-files=all)
    if ($LASTEXITCODE -ne 0 -or
        $lockedRevision -cne [string]$Context.SourceRevision -or
        $lockedStatus.Count -ne 0) {
      throw 'Exact repository revision changed before packaging inputs were locked.'
    }
    Assert-WaggleHostedSigningBoundary $lockedRevision ([string](
      Get-Content -Raw -LiteralPath $Context.ConfigPath | ConvertFrom-Json
    ).version)
    return $locks
  } catch {
    foreach ($lock in $locks) { $lock.Dispose() }
    throw
  }
}

function Invoke-WagglePinnedNodeScript {
  param(
    [Parameter(Mandatory = $true)] [object]$Context,
    [Parameter(Mandatory = $true)] [string]$ScriptPath,
    [Parameter(Mandatory = $true)] [string]$WorkingDirectory,
    [string[]]$Arguments = @(),
    [string]$Label = 'Node build step'
  )
  Push-Location $WorkingDirectory
  try {
    & $Context.NodePath $ScriptPath @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "$Label failed with exit code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }
}

function Assert-WaggleHostedResourceInventoryProjection {
  param(
    [Parameter(Mandatory = $true)] [object]$TargetInventory,
    [Parameter(Mandatory = $true)] [object]$ResourcesInventory
  )

  $projection = @(
    @((Get-RequiredPropertyValue `
      $TargetInventory 'entries' 'Hosted build targetInventory')) |
      Where-Object { ([string]$_.path).StartsWith('resources\', [StringComparison]::Ordinal) } |
      ForEach-Object {
        [pscustomobject][ordered]@{
          path = ([string]$_.path).Substring('resources\'.Length)
          size = [long]$_.size
          sha256 = [string]$_.sha256
        }
      }
  )
  $resourceEntries = @((Get-RequiredPropertyValue `
    $ResourcesInventory 'entries' 'Hosted build resourcesInventory'))
  Assert-WaggleCanonicalInventoryEntries `
    $projection 'Hosted build target resource projection'
  Assert-WaggleCanonicalInventoryEntries `
    $resourceEntries 'Hosted build resourcesInventory'
  if ($projection.Count -ne $resourceEntries.Count) {
    throw 'Hosted build target resource projection does not match resourcesInventory.'
  }
  for ($index = 0; $index -lt $projection.Count; $index++) {
    if ([string]$projection[$index].path -cne [string]$resourceEntries[$index].path -or
        [long]$projection[$index].size -ne [long]$resourceEntries[$index].size -or
        -not [string]::Equals(
          [string]$projection[$index].sha256,
          [string]$resourceEntries[$index].sha256,
          [StringComparison]::OrdinalIgnoreCase
        )) {
      throw 'Hosted build target resource projection does not match resourcesInventory.'
    }
  }
  if (-not [string]::Equals(
      (Get-WaggleInventorySha256 $projection),
      [string](Get-RequiredPropertyValue `
        $ResourcesInventory 'sha256' 'Hosted build resourcesInventory'),
      [StringComparison]::OrdinalIgnoreCase
    )) {
    throw 'Hosted build target resource projection does not match resourcesInventory.'
  }
}

function Get-WaggleHostedBuildReceipt {
  param(
    [Parameter(Mandatory = $true)] [string]$Path,
    [Parameter(Mandatory = $true)] [string]$ExpectedSha256,
    [Parameter(Mandatory = $true)] [string]$ExpectedSourceRevision
  )

  if ($ExpectedSha256 -notmatch '^[0-9A-Fa-f]{64}$') {
    throw 'Build receipt SHA-256 must be one exact digest.'
  }
  $receiptPath = Get-TrustedPath $Path 'Hosted build receipt'
  $lock = Open-ReadLock $receiptPath
  try {
    if (-not [string]::Equals(
        (Get-FileHash -LiteralPath $receiptPath -Algorithm SHA256).Hash,
        $ExpectedSha256,
        [StringComparison]::OrdinalIgnoreCase
      )) {
      throw 'Hosted build receipt does not match its SHA-256 handoff.'
    }
    try {
      $receipt = Get-Content -Raw -LiteralPath $receiptPath |
        ConvertFrom-Json -Depth 32 -DateKind String
    } catch {
      throw 'Hosted build receipt is not valid JSON.'
    }
    if ([int](Get-RequiredPropertyValue $receipt 'schemaVersion' 'Hosted build receipt') -ne 1 -or
        [string](Get-RequiredPropertyValue $receipt 'repository' 'Hosted build receipt') -cne
          'marolinik/waggle-os' -or
        [string](Get-RequiredPropertyValue $receipt 'sourceRevision' 'Hosted build receipt') -cne
          $ExpectedSourceRevision -or
        [string](Get-RequiredPropertyValue $receipt 'targetTriple' 'Hosted build receipt') -cne
          'x86_64-pc-windows-msvc') {
      throw 'Hosted build receipt does not bind the approved repository, revision, and target.'
    }
    foreach ($name in @('targetInventory', 'resourcesInventory')) {
      $inventory = Get-RequiredPropertyValue $receipt $name 'Hosted build receipt'
      $entries = @((Get-RequiredPropertyValue $inventory 'entries' "Hosted build $name"))
      Assert-WaggleCanonicalInventoryEntries $entries "Hosted build $name"
      if (-not [string]::Equals(
          (Get-WaggleInventorySha256 $entries),
          [string](Get-RequiredPropertyValue $inventory 'sha256' "Hosted build $name"),
          [StringComparison]::OrdinalIgnoreCase
        )) {
        throw "Hosted build $name aggregate digest is invalid."
      }
    }
    Assert-WaggleHostedResourceInventoryProjection `
      $receipt.targetInventory $receipt.resourcesInventory
    $checker = Get-RequiredPropertyValue $receipt 'checker' 'Hosted build receipt'
    if ([int](Get-RequiredPropertyValue $checker 'exitCode' 'Hosted build checker') -ne 0 -or
        [string](Get-RequiredPropertyValue $checker 'sha256' 'Hosted build checker') -notmatch
          '^[0-9A-Fa-f]{64}$') {
      throw 'Hosted build sidecar/resource checker did not succeed with a bound digest.'
    }
    return [pscustomobject]@{ Receipt = $receipt; Path = $receiptPath; Lock = $lock }
  } catch {
    $lock.Dispose()
    throw
  }
}

function Assert-WaggleHostedSigningBoundary {
  param(
    [Parameter(Mandatory = $true)] [string]$ExpectedRevision,
    [Parameter(Mandatory = $true)] [string]$ExpectedVersion
  )

  $expected = [ordered]@{
    GITHUB_ACTIONS = 'true'
    RUNNER_ENVIRONMENT = 'github-hosted'
    GITHUB_REPOSITORY = 'marolinik/waggle-os'
    GITHUB_SHA = $ExpectedRevision
    GITHUB_REF_TYPE = 'tag'
    WAGGLE_PROTECTED_SIGNING_ENVIRONMENT = 'production-windows-signing'
  }
  foreach ($entry in $expected.GetEnumerator()) {
    if ([Environment]::GetEnvironmentVariable([string]$entry.Key) -cne [string]$entry.Value) {
      throw "Hosted Package mode requires exact $($entry.Key) boundary evidence."
    }
  }
  $expectedTag = "v$ExpectedVersion"
  if ($ExpectedVersion -notmatch '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$' -or
      [Environment]::GetEnvironmentVariable('GITHUB_REF_NAME') -cne $expectedTag) {
    throw 'Hosted Package mode requires the exact app-version release tag.'
  }
}

function Invoke-WaggleSigningPackage {
  if (-not $IsWindows -or -not [Environment]::Is64BitProcess -or
      $PSVersionTable.PSEdition -cne 'Core' -or
      $PSVersionTable.PSVersion -lt [Version]'7.5.0') {
    throw 'Production signing Package mode requires approved 64-bit PowerShell 7.5+ on Windows.'
  }
  $actualHost = Get-TrustedPath (Get-Process -Id $PID).Path 'Current PowerShell 7 host' -AllowHardLink
  Assert-ApprovedPowerShell7Path $actualHost

  $scriptPath = Get-TrustedPath $PSCommandPath 'Signing wrapper'
  $appRoot = Split-Path (Split-Path $scriptPath -Parent) -Parent
  $repoRoot = Get-TrustedPath (Split-Path $appRoot -Parent) 'Repository root' 'Container'
  $tauriRoot = Get-TrustedPath (Join-Path $appRoot 'src-tauri') 'Tauri root' 'Container'
  if (@(
      $UnsignedInputRoot, $SigningInputRoot, $BuildReceiptPath, $BuildReceiptSha256,
      $PortableToolchainRoot, $PortableNodePath, $PortableGitPath,
      $PortableSevenZipPath, $PortableToolchainReceiptPath,
      $PortableToolchainReceiptSha256 |
      Where-Object { [string]::IsNullOrWhiteSpace([string]$_) }
    ).Count -ne 0) {
    throw 'Hosted Package mode requires both prebuilt roots, the exact build receipt, and the complete portable toolchain handoff.'
  }
  $unsignedSourceRoot = Get-TrustedPath `
    $UnsignedInputRoot 'Unsigned prebuilt input root' 'Container'
  $signingSourceRoot = Get-TrustedPath `
    $SigningInputRoot 'Signing prebuilt input root' 'Container'
  $portableToolchain = Get-WagglePortableToolchain `
    $PortableToolchainRoot $PortableNodePath $PortableGitPath `
    $PortableSevenZipPath $PortableToolchainReceiptPath `
    $PortableToolchainReceiptSha256 `
    -DisallowedRoots @(
      $repoRoot, $unsignedSourceRoot, $signingSourceRoot,
      $BuildReceiptPath, $ArtifactSigningPackageSource
    )
  $portableBootstrapLocks = $portableToolchain.Locks
  try {
  $gitLock = Open-ReadLock $portableToolchain.GitPath
  try {
    $sourceRevision = [string](& $portableToolchain.GitPath `
      -C $repoRoot rev-parse --verify HEAD)
    if ($LASTEXITCODE -ne 0 -or $sourceRevision -notmatch '^[0-9a-f]{40}$') {
      throw 'Could not resolve the exact repository source revision.'
    }
  } finally {
    $gitLock.Dispose()
  }
  $appVersion = [string](
    Get-Content -Raw -LiteralPath (Join-Path $tauriRoot 'tauri.conf.json') |
      ConvertFrom-Json
  ).version
  Assert-WaggleHostedSigningBoundary $sourceRevision $appVersion
  foreach ($pair in @(
      @($unsignedSourceRoot, $signingSourceRoot),
      @($unsignedSourceRoot, $BuildReceiptPath),
      @($signingSourceRoot, $BuildReceiptPath),
      @($unsignedSourceRoot, $tauriRoot),
      @($signingSourceRoot, $tauriRoot)
    )) {
    if (Test-WagglePathsOverlap ([string]$pair[0]) ([string]$pair[1])) {
      throw 'Hosted Package input, receipt, repository, and output roots must be distinct.'
    }
  }
  $receiptLease = Get-WaggleHostedBuildReceipt `
    $BuildReceiptPath $BuildReceiptSha256 $sourceRevision
  $receipt = $receiptLease.Receipt
  } catch {
    foreach ($lock in $portableBootstrapLocks) { $lock.Dispose() }
    throw
  }
  $sessionId = [Guid]::NewGuid().ToString('N')
  $sessionDirectory = New-PrivateDirectory `
    (Join-Path $tauriRoot "target\.signing-sessions\run-$sessionId")
  $tempRoot = New-PrivateDirectory `
    (Join-Path $tauriRoot "target\.signing-temp\run-$sessionId")
  $overridePath = Join-Path $sessionDirectory 'tauri.signing-override.json'

  $environmentNames = @(
    'WAGGLE_SIGNING_SESSION_ID', 'WAGGLE_SIGNING_MANIFEST_PATH',
    'WAGGLE_SIGNING_MANIFEST_SHA256', 'CARGO_TARGET_DIR', 'TEMP', 'TMP',
    'WAGGLE_NSIS_SIGNING_TEMP_ROOT', 'WAGGLE_SIGNING_RESOURCES_ROOT',
    'WAGGLE_SIGNING_PORTABLE_TOOLCHAIN_ROOT',
    'WAGGLE_SIGNING_PORTABLE_NODE_PATH',
    'WAGGLE_SIGNING_PORTABLE_GIT_PATH',
    'WAGGLE_SIGNING_PORTABLE_SEVEN_ZIP_PATH',
    'WAGGLE_SIGNING_PORTABLE_RECEIPT_PATH',
    'WAGGLE_SIGNING_PORTABLE_RECEIPT_SHA256',
    'NODE_OPTIONS', 'NODE_PATH',
    'NAPI_RS_NATIVE_LIBRARY_PATH', 'NAPI_RS_FORCE_WASI',
    'npm_config_node_options', 'TARGET_ARCH'
  )
  $savedEnvironment = @{}
  foreach ($name in $environmentNames) {
    $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name)
  }
  $session = $null
  $packageLocks = $null
  $unsignedSourceLease = $null
  $signingSourceLease = $null
  $unsignedWorkLease = $null
  $signingWorkLease = $null
  $unsignedWorkRoot = $null
  $signingWorkRoot = $null
  $preflightEvidenceRoot = $null
  $unsignedExtractionRoot = $null
  $unsignedOverrideLock = $null
  $packageSucceeded = $false
  try {
    [Environment]::SetEnvironmentVariable('WAGGLE_SIGNING_SESSION_ID', $sessionId)
    [Environment]::SetEnvironmentVariable('WAGGLE_SIGNING_MANIFEST_PATH', $null)
    [Environment]::SetEnvironmentVariable('WAGGLE_SIGNING_MANIFEST_SHA256', $null)
    [Environment]::SetEnvironmentVariable(
      'WAGGLE_SIGNING_PORTABLE_TOOLCHAIN_ROOT', $portableToolchain.PortableToolchainRoot
    )
    [Environment]::SetEnvironmentVariable(
      'WAGGLE_SIGNING_PORTABLE_NODE_PATH', $portableToolchain.NodePath
    )
    [Environment]::SetEnvironmentVariable(
      'WAGGLE_SIGNING_PORTABLE_GIT_PATH', $portableToolchain.GitPath
    )
    [Environment]::SetEnvironmentVariable(
      'WAGGLE_SIGNING_PORTABLE_SEVEN_ZIP_PATH', $portableToolchain.SevenZipPath
    )
    [Environment]::SetEnvironmentVariable(
      'WAGGLE_SIGNING_PORTABLE_RECEIPT_PATH', $portableToolchain.ReceiptPath
    )
    [Environment]::SetEnvironmentVariable(
      'WAGGLE_SIGNING_PORTABLE_RECEIPT_SHA256', $portableToolchain.ReceiptSha256
    )
    [Environment]::SetEnvironmentVariable('TEMP', $tempRoot)
    [Environment]::SetEnvironmentVariable('TMP', $tempRoot)
    [Environment]::SetEnvironmentVariable('WAGGLE_NSIS_SIGNING_TEMP_ROOT', $tempRoot)
    [Environment]::SetEnvironmentVariable('NODE_OPTIONS', $null)
    [Environment]::SetEnvironmentVariable('NODE_PATH', $null)
    [Environment]::SetEnvironmentVariable('NAPI_RS_NATIVE_LIBRARY_PATH', $null)
    [Environment]::SetEnvironmentVariable('NAPI_RS_FORCE_WASI', $null)
    [Environment]::SetEnvironmentVariable('npm_config_node_options', $null)
    [Environment]::SetEnvironmentVariable('TARGET_ARCH', 'x64')

    $cargoReleaseRelative = 'x86_64-pc-windows-msvc\release'
    $sourceDisallowedRoots = @(
      $sessionDirectory, $tempRoot, $tauriRoot, $BuildReceiptPath
    )
    $unsignedSourceLease = Open-WaggleValidatedPrebuiltTree `
      $unsignedSourceRoot $receipt.targetInventory `
      'Unsigned receipt-bound prebuilt input tree' `
      ($sourceDisallowedRoots + @($signingSourceRoot)) `
      -CargoReleaseRelativePath $cargoReleaseRelative
    $signingSourceLease = Open-WaggleValidatedPrebuiltTree `
      $signingSourceRoot $receipt.targetInventory `
      'Signing receipt-bound prebuilt input tree' `
      ($sourceDisallowedRoots + @($unsignedSourceRoot)) `
      -CargoReleaseRelativePath $cargoReleaseRelative

    $workRoot = Join-Path $sessionDirectory 'work'
    $unsignedWorkRoot = Join-Path $workRoot 'unsigned'
    $signingWorkRoot = Join-Path $workRoot 'signing'
    [void](Assert-WaggleHostedDiskCapacity $sessionDirectory $receipt.targetInventory)
    New-WagglePrebuiltWorkCopy `
      $unsignedSourceRoot $unsignedWorkRoot $receipt.targetInventory `
      'Unsigned hosted prebuilt input' $cargoReleaseRelative | Out-Null

    $unsignedReleaseRoot = Join-Path $unsignedWorkRoot $cargoReleaseRelative
    $unsignedResourcesRoot = Join-Path $unsignedWorkRoot 'resources'
    $unsignedMutablePaths = @(
      (Join-Path $unsignedReleaseRoot 'waggle.exe'),
      (Join-Path $unsignedReleaseRoot 'deps\waggle.exe')
    )
    $unsignedRegeneratedRoots = @(
      (Join-Path $unsignedReleaseRoot 'nsis'),
      (Join-Path $unsignedReleaseRoot 'bundle\nsis')
    )
    $unsignedWorkLease = Open-WaggleValidatedPrebuiltTree `
      $unsignedWorkRoot $receipt.targetInventory 'Unsigned private work tree' `
      @($unsignedSourceRoot, $signingSourceRoot, $signingWorkRoot, $tempRoot) `
      -MutablePaths $unsignedMutablePaths `
      -RegeneratedRoots $unsignedRegeneratedRoots `
      -CargoReleaseRelativePath $cargoReleaseRelative
    Clear-WaggleRegeneratedRoots $unsignedWorkLease
    Write-WaggleSigningOverride `
      $overridePath $scriptPath $unsignedResourcesRoot | Out-Null
    Assert-WaggleSigningOverrideContract `
      $overridePath $scriptPath $unsignedResourcesRoot -Unsigned
    Install-WaggleArtifactSigningPackage `
      $tauriRoot $ArtifactSigningPackageSource | Out-Null

    [Environment]::SetEnvironmentVariable('CARGO_TARGET_DIR', $unsignedWorkRoot)
    [Environment]::SetEnvironmentVariable(
      'WAGGLE_SIGNING_RESOURCES_ROOT', $unsignedResourcesRoot
    )
    $context = Get-WaggleSigningContext -AllowPortableBeforeManifest
    $packageLocks = Open-WagglePackageToolchainLocks $context

    $unsignedOverrideLock = Open-ReadLock $overridePath
    try {
      Assert-WaggleSigningOverrideContract `
        $overridePath $scriptPath $unsignedResourcesRoot -Unsigned
      Invoke-WagglePinnedNodeScript `
        $context $context.TauriCliPath $context.AppRoot @(
          'bundle', '--target', 'x86_64-pc-windows-msvc', '--no-sign',
          '--bundles', 'nsis', '--config', $overridePath, '--ci'
        ) 'Unsigned immutable NSIS preflight package'
    } finally {
      $unsignedOverrideLock.Dispose()
      $unsignedOverrideLock = $null
    }

    $version = [string](Get-Content -Raw -LiteralPath $context.ConfigPath | ConvertFrom-Json).version
    $installerPath = Join-Path `
      $context.ReleaseRoot "bundle\nsis\Waggle_${version}_x64-setup.exe"
    $unsignedExtractionRoot = Join-Path $sessionDirectory 'unsigned-payload-extraction'
    $payloads = @(Expand-NsisPayloadManifest `
      $installerPath $context.SevenZipPath $unsignedExtractionRoot)
    Assert-WaggleUnsignedPayloadResourceProjection `
      $payloads $receipt.resourcesInventory
    $preflightEvidenceRoot = New-WagglePreflightEvidenceCopy `
      $context (Join-Path $sessionDirectory 'preflight-evidence')
    Remove-Item -LiteralPath $unsignedExtractionRoot -Recurse -Force
    $unsignedExtractionRoot = $null
    Remove-Item -LiteralPath $installerPath -Force
    foreach ($lock in $unsignedWorkLease.Locks) { $lock.Dispose() }
    $unsignedWorkLease = $null
    Remove-Item -LiteralPath $unsignedWorkRoot -Recurse -Force
    $unsignedWorkRoot = $null

    [void](Assert-WaggleHostedDiskCapacity $sessionDirectory $receipt.targetInventory)
    New-WagglePrebuiltWorkCopy `
      $signingSourceRoot $signingWorkRoot $receipt.targetInventory `
      'Signing hosted prebuilt input' $cargoReleaseRelative | Out-Null
    $signingReleaseRoot = Join-Path $signingWorkRoot $cargoReleaseRelative
    $signingResourcesRoot = Join-Path $signingWorkRoot 'resources'
    $signingMutablePaths = @(
      Get-ExpectedNsisFixedPaths `
        ([pscustomobject]@{
          ReleaseRoot = $signingReleaseRoot
          ResourcesRoot = $signingResourcesRoot
        }) `
        '0.0.0'
    ) + @((Join-Path $signingReleaseRoot 'deps\waggle.exe'))
    $signingRegeneratedRoots = @(
      (Join-Path $signingReleaseRoot 'nsis'),
      (Join-Path $signingReleaseRoot 'bundle\nsis')
    )
    $signingWorkLease = Open-WaggleValidatedPrebuiltTree `
      $signingWorkRoot $receipt.targetInventory 'Signing private work tree' `
      @($unsignedSourceRoot, $signingSourceRoot, $tempRoot) `
      -MutablePaths $signingMutablePaths `
      -RegeneratedRoots $signingRegeneratedRoots `
      -CargoReleaseRelativePath $cargoReleaseRelative
    Clear-WaggleRegeneratedRoots $signingWorkLease

    Write-WaggleSigningOverride `
      $overridePath $scriptPath $signingResourcesRoot -EnableSigning | Out-Null
    Assert-WaggleSigningOverrideContract `
      $overridePath $scriptPath $signingResourcesRoot
    [Environment]::SetEnvironmentVariable('CARGO_TARGET_DIR', $signingWorkRoot)
    [Environment]::SetEnvironmentVariable(
      'WAGGLE_SIGNING_RESOURCES_ROOT', $signingResourcesRoot
    )
    $context = Get-WaggleSigningContext -AllowPortableBeforeManifest
    $session = New-WaggleSigningManifest `
      $context $payloads $preflightEvidenceRoot $receipt
    Remove-Item -LiteralPath $preflightEvidenceRoot -Recurse -Force
    $preflightEvidenceRoot = $null
    Assert-DotNet8X64Runtime

    Invoke-WagglePinnedNodeScript `
      $context $context.TauriCliPath $context.AppRoot @(
        'bundle', '--target', 'x86_64-pc-windows-msvc', '--bundles', 'nsis',
        '--config', $overridePath, '--ci'
      ) 'Signed NSIS bundle'

    $result = Assert-WaggleSigningPackageComplete $session
    $packageSucceeded = $true
    Write-Host "Public Artifact Signing package sealed: $($result.InstallerPath)"
    Write-Host "Provenance receipt: $($result.ReceiptPath)"
  } catch {
    $packageFailure = $_
    if ($null -ne $session) {
      try {
        Fail-WaggleSigningSession `
          $session $null 'package_or_finalization_failure' `
          $packageFailure.Exception.Message | Out-Null
      } catch {
        throw "Signing package failed: $($packageFailure.Exception.Message) Terminalization also failed: $($_.Exception.Message)"
      }
    }
    throw $packageFailure
  } finally {
    if ($null -ne $unsignedExtractionRoot -and (Test-Path -LiteralPath $unsignedExtractionRoot)) {
      Remove-Item -LiteralPath $unsignedExtractionRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
    if ($null -ne $preflightEvidenceRoot -and (Test-Path -LiteralPath $preflightEvidenceRoot)) {
      Remove-Item -LiteralPath $preflightEvidenceRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
    if ($null -ne $unsignedOverrideLock) { $unsignedOverrideLock.Dispose() }
    if ($null -ne $session) {
      foreach ($sessionLock in $session.Locks) { $sessionLock.Dispose() }
    }
    if ($null -ne $packageLocks) { foreach ($lock in $packageLocks) { $lock.Dispose() } }
    foreach ($lock in $portableBootstrapLocks) { $lock.Dispose() }
    foreach ($lease in @(
        $unsignedWorkLease, $signingWorkLease,
        $unsignedSourceLease, $signingSourceLease
      )) {
      if ($null -ne $lease) { foreach ($lock in $lease.Locks) { $lock.Dispose() } }
    }
    if ($null -ne $unsignedWorkRoot -and (Test-Path -LiteralPath $unsignedWorkRoot)) {
      Remove-Item -LiteralPath $unsignedWorkRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
    if (-not $packageSucceeded -and $null -ne $signingWorkRoot -and
        (Test-Path -LiteralPath $signingWorkRoot)) {
      Remove-Item -LiteralPath $signingWorkRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
    $receiptLease.Lock.Dispose()
    foreach ($name in $environmentNames) {
      [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name])
    }
  }
}

function Invoke-WaggleArtifactSigning {
  param([Parameter(Mandatory = $true)] [string]$Path)

  if (-not $IsWindows -or -not [Environment]::Is64BitProcess -or
      $PSVersionTable.PSEdition -cne 'Core' -or
      $PSVersionTable.PSVersion -lt [Version]'7.5.0') {
    throw 'Azure Artifact Signing requires approved 64-bit PowerShell 7.5+ on Windows.'
  }

  $actualHost = Get-TrustedPath (Get-Process -Id $PID).Path 'Current PowerShell 7 host' -AllowHardLink
  Assert-ApprovedPowerShell7Path $actualHost
  $context = Get-WaggleSigningContext
  $session = Get-WaggleSigningSession $context
  $artifact = $null
  $reservation = $null
  $stagingRoot = $null
  $signToolLock = $null
  $toolsetLocks = $null
  $signedArtifactLock = $null
  $replaced = $false
  $expectedRollbackPaths = $null
  try {
    $artifact = Get-ApprovedArtifact $Path $session
    $reservation = Reserve-WaggleSigningCallback $session $artifact
    $sourceHash = [string]$reservation.preSignSha256
    try {
      Assert-DotNet8X64Runtime
      $signTool = $context.SignToolPath
      $packagePath = $context.ArtifactSigningPackagePath
      $stagingParent = New-PrivateDirectory `
        (Join-Path $context.TauriRoot 'target\.signing-staging')
      $stagingRoot = New-PrivateDirectory `
        (Join-Path $stagingParent ([Guid]::NewGuid().ToString('N')))
      $stagedArtifact = Join-Path $stagingRoot ([IO.Path]::GetFileName($artifact))
      $backupPath = Join-Path $stagingRoot 'original.backup'
      $metadataPath = Join-Path $stagingRoot 'artifact-signing.json'
      $metadata = [ordered]@{
        Endpoint = $ArtifactSigningEndpoint
        CodeSigningAccountName = $ArtifactSigningAccount
        CertificateProfileName = $ArtifactSigningProfile
      }
      [IO.File]::Copy($artifact, $stagedArtifact, $false)
      $stagedArtifact = Get-TrustedPath $stagedArtifact 'Staged signing artifact'
      Assert-PeFile $stagedArtifact
      if ((Get-FileHash -LiteralPath $stagedArtifact -Algorithm SHA256).Hash -cne $sourceHash) {
        throw 'Staged artifact bytes differ from the validated source artifact.'
      }
      [IO.File]::WriteAllText(
        $metadataPath,
        ($metadata | ConvertTo-Json -Compress),
        [Text.UTF8Encoding]::new($false)
      )

      $signToolLock = Open-ReadLock $signTool
      Assert-MicrosoftAuthenticodeFile $signTool 'SignTool' $SignToolSha256
      $toolset = Expand-PinnedArtifactSigningPackage $packagePath $stagingRoot
      $dlib = $toolset.Dlib
      $toolsetLocks = $toolset.Locks

      & $signTool sign `
        /v /debug `
        /fd SHA256 `
        /tr 'http://timestamp.acs.microsoft.com' `
        /td SHA256 `
        /dlib $dlib `
        /dmdf $metadataPath `
        $stagedArtifact
      if ($LASTEXITCODE -ne 0) {
        throw "Azure Artifact Signing failed with SignTool exit code $LASTEXITCODE."
      }
      Assert-WaggleSignedArtifact $stagedArtifact $signTool

      $artifact = Get-ApprovedArtifact $artifact $session
      if ((Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash -cne $sourceHash) {
        throw 'Source artifact changed while its validated staging copy was being signed.'
      }
      $sourceItem = Get-Item -LiteralPath $artifact -Force
      $sourceLinkTypeProperty = $sourceItem.PSObject.Properties['LinkType']
      $sourceLinkType = if ($null -eq $sourceLinkTypeProperty) {
        ''
      } else {
        [string]$sourceLinkTypeProperty.Value
      }
      $expectedRollbackPaths = if ($sourceLinkType -ceq 'HardLink') {
        @(Get-HardLinkPaths $artifact)
      } else {
        @($artifact)
      }
      [IO.File]::Replace($stagedArtifact, $artifact, $backupPath, $true)
      $replaced = $true
      $artifact = Get-ApprovedArtifact $artifact $session -AllowDetachedMain
      $signedArtifactLock = Open-ReadLock $artifact
      Assert-WaggleSignedArtifact $artifact $signTool
      if ([string]$reservation.kind -ceq 'generated-nsis-uninstaller') {
        $uninstallerSlot = $session.Manifest.slots[[int]$reservation.order - 1]
        $evidencePath = [string]$uninstallerSlot.evidencePath
        $evidenceDirectory = New-PrivateDirectory (Split-Path $evidencePath -Parent)
        Assert-ExactCanonicalPathValue `
          $evidenceDirectory (Join-Path $session.SessionDirectory 'signed-evidence') `
          'Signed evidence directory'
        if (Test-Path -LiteralPath $evidencePath) {
          throw 'Signed NSIS uninstaller evidence was already published.'
        }
        $temporaryEvidence = Join-Path `
          $evidenceDirectory "uninstaller.$([Guid]::NewGuid().ToString('N')).tmp"
        [IO.File]::Copy($artifact, $temporaryEvidence, $false)
        if ((Get-FileHash -LiteralPath $temporaryEvidence -Algorithm SHA256).Hash -cne
            (Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash) {
          throw 'Signed NSIS uninstaller evidence copy failed digest verification.'
        }
        [IO.File]::Move($temporaryEvidence, $evidencePath)
      }
      Complete-WaggleSigningCallback $session $reservation $artifact | Out-Null
      $replaced = $false
      Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue
    } catch {
      $signingFailure = $_
      $rollbackOutcome = 'not-required'
      if ($null -ne $signedArtifactLock) {
        $signedArtifactLock.Dispose()
        $signedArtifactLock = $null
      }
      if ($replaced) {
        if (-not (Test-Path -LiteralPath $backupPath -PathType Leaf)) {
          $rollbackOutcome = 'rollback-failed: Rollback backup is missing.'
        } else {
          try {
            Restore-WaggleReplacedArtifact `
              -ArtifactPath $artifact -BackupPath $backupPath `
              -ExpectedOriginalSha256 $sourceHash `
              -ExpectedHardLinkPaths $expectedRollbackPaths
            $rollbackOutcome = 'restored-original'
          } catch {
            $rollbackOutcome = "rollback-failed: $($_.Exception.Message)"
          }
        }
      }
      try {
        Fail-WaggleSigningSession `
          $session $reservation 'callback_failure' `
          $signingFailure.Exception.Message $rollbackOutcome | Out-Null
      } catch {
        throw "Signing callback failed: $($signingFailure.Exception.Message) Terminalization also failed: $($_.Exception.Message)"
      }
      throw $signingFailure
    } finally {
      if ($null -ne $toolsetLocks) {
        foreach ($toolsetLock in $toolsetLocks) { $toolsetLock.Dispose() }
      }
      if ($null -ne $signedArtifactLock) { $signedArtifactLock.Dispose() }
      if ($null -ne $signToolLock) { $signToolLock.Dispose() }
      if ($null -ne $stagingRoot) {
        Remove-Item -LiteralPath $stagingRoot -Recurse -Force -ErrorAction SilentlyContinue
      }
    }
  } finally {
    foreach ($sessionLock in $session.Locks) { $sessionLock.Dispose() }
  }

  Write-Host "Azure Artifact Signing verified: $artifact"
}

if ($MyInvocation.InvocationName -ne '.') {
  if ($TrustedPowerShellHost) {
    if ($Mode -ceq 'Package') {
      Invoke-WaggleSigningPackage
    } else {
      if ([string]::IsNullOrWhiteSpace($ArtifactPath)) {
        throw 'Signing callback requires an artifact path.'
      }
      Invoke-WaggleArtifactSigning -Path $ArtifactPath
    }
  } else {
    Invoke-TrustedPowerShellRelaunch `
      -LaunchMode $Mode -Path $ArtifactPath `
      -PackageSource $ArtifactSigningPackageSource `
      -ToolchainRoot $PortableToolchainRoot `
      -Node $PortableNodePath -Git $PortableGitPath -SevenZip $PortableSevenZipPath `
      -ToolchainReceipt $PortableToolchainReceiptPath `
      -ToolchainReceiptSha256 $PortableToolchainReceiptSha256
  }
}
