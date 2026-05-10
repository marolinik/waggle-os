<#
.SYNOPSIS
    Self-sign cert generation + signtool wrapper for the Wave-1 Egzakta-internal pilot build.

.DESCRIPTION
    Implements docs/code-signing-pilot-and-launch.md §1.1 (Windows self-sign).
    Two modes:

      -Mode Setup    Generate self-signed cert (idempotent — reuses existing cert
                     by subject if it exists), export to .pfx, write thumbprint
                     to app/src-tauri/.thumbprint.txt.
      -Mode Sign     Sign the artefact at -ArtifactPath using the cert produced
                     by Setup. Wraps signtool.exe.

    Password resolution order (Setup): env WAGGLE_PILOT_PFX_PASSWORD; otherwise
    Read-Host -AsSecureString prompt. Setup writes the .pfx to %USERPROFILE%
    so it never lands inside the repo working tree.

    NOT for public Day-0 signing — that uses a real EV Authenticode cert per §2.

.PARAMETER Mode
    Setup or Sign. Setup is idempotent — safe to re-run.

.PARAMETER ArtifactPath
    Required when -Mode Sign. Path to the .msi or .exe to sign.

.PARAMETER Subject
    Cert subject. Default: "CN=Egzakta Internal Pilot, O=Egzakta Group, C=RS".
    Override only if rotating cert identity.

.PARAMETER PfxPath
    Where to write the exported .pfx. Default:
    $env:USERPROFILE\waggle-pilot-codesign.pfx

.PARAMETER ThumbprintFile
    Where to write the captured thumbprint for downstream consumption by
    apply-signing-config.mjs. Default: app/src-tauri/.thumbprint.txt
    (relative to repo root, resolved via this script's location).

.PARAMETER TimestampUrl
    RFC3161 timestamp server. Default: http://timestamp.digicert.com.

.EXAMPLE
    PS> $env:WAGGLE_PILOT_PFX_PASSWORD = "your-strong-pw"
    PS> .\sign-windows-pilot.ps1 -Mode Setup
    Generates cert (or reuses existing), writes thumbprint to .thumbprint.txt.

.EXAMPLE
    PS> .\sign-windows-pilot.ps1 -Mode Sign -ArtifactPath .\target\release\bundle\msi\Waggle_0.2.0_x64_en-US.msi
    Signs the MSI using the cert from Setup.

.NOTES
    Last updated: LAUNCH-06 (Phase 2 Step 4).
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Setup', 'Sign')]
    [string]$Mode,

    [Parameter()]
    [string]$ArtifactPath,

    [Parameter()]
    [string]$Subject = 'CN=Egzakta Internal Pilot, O=Egzakta Group, C=RS',

    [Parameter()]
    [string]$PfxPath = (Join-Path $env:USERPROFILE 'waggle-pilot-codesign.pfx'),

    [Parameter()]
    [string]$ThumbprintFile,

    [Parameter()]
    [string]$TimestampUrl = 'http://timestamp.digicert.com'
)

$ErrorActionPreference = 'Stop'

# ─── Resolve repo-root paths ────────────────────────────────────────────────

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppDir    = Split-Path -Parent $ScriptDir          # ...\waggle-os\app
$RepoRoot  = Split-Path -Parent $AppDir             # ...\waggle-os

if (-not $ThumbprintFile) {
    $ThumbprintFile = Join-Path $AppDir 'src-tauri\.thumbprint.txt'
}

# ─── Helpers ────────────────────────────────────────────────────────────────

function Resolve-Password {
    if ($env:WAGGLE_PILOT_PFX_PASSWORD) {
        return ConvertTo-SecureString -String $env:WAGGLE_PILOT_PFX_PASSWORD -Force -AsPlainText
    }
    Write-Host 'WAGGLE_PILOT_PFX_PASSWORD not set in env — prompting.' -ForegroundColor Yellow
    return Read-Host -Prompt 'Enter password to protect the .pfx export' -AsSecureString
}

function Find-Signtool {
    # Prefer signtool from latest installed Windows SDK; fall back to PATH.
    $candidates = @(
        'C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe',
        'C:\Program Files (x86)\Windows Kits\10\bin\10.0.22000.0\x64\signtool.exe',
        'C:\Program Files (x86)\Windows Kits\10\bin\10.0.19041.0\x64\signtool.exe'
    )
    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) { return $candidate }
    }
    $fromPath = Get-Command signtool.exe -ErrorAction SilentlyContinue
    if ($fromPath) { return $fromPath.Source }
    throw 'signtool.exe not found. Install Windows 10 SDK or add signtool to PATH.'
}

# ─── Mode: Setup ────────────────────────────────────────────────────────────

if ($Mode -eq 'Setup') {
    Write-Host "[setup] subject:        $Subject"
    Write-Host "[setup] pfx path:       $PfxPath"
    Write-Host "[setup] thumbprint out: $ThumbprintFile"

    # Reuse existing cert by subject if present (idempotency).
    $existing = Get-ChildItem 'Cert:\CurrentUser\My' |
        Where-Object { $_.Subject -eq $Subject -and $_.HasPrivateKey } |
        Sort-Object NotAfter -Descending |
        Select-Object -First 1

    if ($existing -and $existing.NotAfter -gt (Get-Date)) {
        Write-Host "[setup] reusing existing cert (NotAfter $($existing.NotAfter))" -ForegroundColor Green
        $cert = $existing
    } else {
        Write-Host '[setup] generating new self-signed code-signing cert' -ForegroundColor Cyan
        $cert = New-SelfSignedCertificate `
            -Type CodeSigningCert `
            -Subject $Subject `
            -KeyUsage DigitalSignature `
            -KeySpec Signature `
            -KeyAlgorithm RSA -KeyLength 2048 `
            -NotAfter (Get-Date).AddYears(2) `
            -CertStoreLocation 'Cert:\CurrentUser\My' `
            -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}')
    }

    # Export .pfx (always — re-export is harmless and refreshes the file).
    $pwd = Resolve-Password
    Export-PfxCertificate -Cert $cert -FilePath $PfxPath -Password $pwd | Out-Null
    Write-Host "[setup] exported .pfx -> $PfxPath" -ForegroundColor Green

    # Write thumbprint where apply-signing-config.mjs expects it.
    $thumbprintDir = Split-Path -Parent $ThumbprintFile
    if (-not (Test-Path $thumbprintDir)) {
        New-Item -ItemType Directory -Force -Path $thumbprintDir | Out-Null
    }
    Set-Content -Path $ThumbprintFile -Value $cert.Thumbprint -Encoding ascii -NoNewline
    Write-Host "[setup] thumbprint -> $ThumbprintFile" -ForegroundColor Green
    Write-Host ''
    Write-Host 'Next:' -ForegroundColor Cyan
    Write-Host '  1. cd app && npm run tauri:sign:pilot:win:apply'
    Write-Host '  2. npm run tauri:build:win'
    Write-Host '  3. .\scripts\sign-windows-pilot.ps1 -Mode Sign -ArtifactPath <path-to-msi>'
    return
}

# ─── Mode: Sign ─────────────────────────────────────────────────────────────

if ($Mode -eq 'Sign') {
    if (-not $ArtifactPath) {
        throw '-ArtifactPath required when -Mode Sign'
    }
    if (-not (Test-Path $ArtifactPath)) {
        throw "Artifact not found: $ArtifactPath"
    }
    if (-not (Test-Path $PfxPath)) {
        throw "PFX not found at $PfxPath. Run -Mode Setup first."
    }

    $signtool = Find-Signtool
    $pwd = Resolve-Password
    $plainPwd = [System.Net.NetworkCredential]::new('', $pwd).Password

    Write-Host "[sign] signtool: $signtool"
    Write-Host "[sign] artifact: $ArtifactPath"

    & $signtool sign `
        /f $PfxPath `
        /p $plainPwd `
        /tr $TimestampUrl `
        /td sha256 /fd sha256 `
        $ArtifactPath

    if ($LASTEXITCODE -ne 0) {
        throw "signtool failed with exit code $LASTEXITCODE"
    }

    Write-Host '[sign] verifying signature' -ForegroundColor Cyan
    & $signtool verify /pa /v $ArtifactPath
    if ($LASTEXITCODE -ne 0) {
        throw "signtool verify failed with exit code $LASTEXITCODE"
    }

    Write-Host '[sign] OK' -ForegroundColor Green
    return
}
