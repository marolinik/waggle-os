# Code-Signing Playbook — Pilot + Public Day 0

**Decision (2026-05-07):** Self-sign for pilot (Wave-1 Egzakta-internal, T+10 = 2026-05-16). Procure real certs in parallel for public Day 0 (T+30 = 2026-06-05).

**Why split:** Real Authenticode + Apple Developer ID have 5-15 business-day lead times. Self-signing unblocks the pilot ship date without paying for certs that aren't usable until a vetting check completes.

---

## 1. Pilot phase — self-sign (T+0 → T+10, Wave-1 only)

### 1.1 Windows self-sign

**Automated path (LAUNCH-06).** Three npm scripts wrap the cert generation + config wiring + signtool steps. Run from `app/`:

```powershell
# 1. Generate self-signed cert (idempotent — reuses existing cert by subject
#    if one is still valid). Writes thumbprint to app/src-tauri/.thumbprint.txt
#    (gitignored). PFX exports to %USERPROFILE%\waggle-pilot-codesign.pfx.
$env:WAGGLE_PILOT_PFX_PASSWORD = "your-strong-pw"
npm run tauri:sign:pilot:win:setup

# 2. Apply the captured thumbprint to tauri.build-override.conf.json
#    (touches bundle.windows.{certificateThumbprint,digestAlgorithm,timestampUrl}
#    only — preserves all other fields).
npm run tauri:sign:pilot:win:apply

# 3. Build — Tauri's MSI/NSIS bundlers pick up the thumbprint from the
#    override config and sign automatically.
npm run tauri:build:win

# 4. (Optional, redundant safety) Re-sign the produced MSI explicitly
#    via signtool. Useful if you want to apply timestamp at a different time
#    than build.
npm run tauri:sign:pilot:win:sign -- src-tauri/target/release/bundle/msi/Waggle_*.msi
```

**What the scripts wrap (reference, in case you need to step outside the npm wrappers):**

- `app/scripts/sign-windows-pilot.ps1` — `-Mode Setup` runs `New-SelfSignedCertificate` with `Subject="CN=Egzakta Internal Pilot, O=Egzakta Group, C=RS"`, 2-year `NotAfter`, `Cert:\CurrentUser\My` store, then `Export-PfxCertificate`. `-Mode Sign -ArtifactPath <path>` wraps `signtool.exe sign /f <pfx> /tr http://timestamp.digicert.com /td sha256 /fd sha256` plus a `signtool verify /pa /v` round-trip.
- `app/scripts/apply-signing-config.mjs` — pure JSON merge: reads `.thumbprint.txt`, parses + uppercases + validates 40-hex format via the canonical helpers in `signing-config.ts`, writes the three fields back to `tauri.build-override.conf.json`. Idempotent.
- `app/scripts/signing-config.ts` — pure utility module (parse + merge) with 19-test vitest suite (`signing-config.test.ts`). Authoritative for thumbprint validation rules + idempotency invariants.

**What pilot users see on first install:**
- Windows SmartScreen: "Windows protected your PC" → "More info" → "Run anyway"
- Frame this in the pilot installer email: *"Internal Egzakta build — SmartScreen will warn. Click 'More info' then 'Run anyway' the first time. Subsequent launches are silent."*

### 1.2 macOS self-sign (ad-hoc)

**Already wired (LAUNCH-06).** `app/src-tauri/tauri.build-override.conf.json` ships with `bundle.macOS.signingIdentity = "-"`, so every `npm run tauri:build:mac` produces an ad-hoc-signed `.app` automatically — no operator step required.

**Re-sign + verify wrapper.** For nested helpers (sidecar, native deps) Tauri's bundler may miss, run:

```bash
npm run tauri:sign:pilot:mac:adhoc -- /path/to/Waggle.app
# Wraps: codesign --force --deep --sign -  +  codesign --verify --deep --strict
# Source: app/scripts/sign-macos-adhoc.sh
```

**Distribution:** Wrap `Waggle.app` in `.zip` (NOT `.dmg` — Gatekeeper enforces notarization on disk images more aggressively than zips since macOS 10.15):

```bash
ditto -c -k --keepParent /path/to/Waggle.app /path/to/Waggle.zip
```

**What pilot users see on first install:**
- Gatekeeper: "Waggle.app cannot be opened because Apple cannot check it for malicious software"
- **Workaround:** Right-click → Open → Open (one-time per user/machine)
- Or: System Settings → Privacy & Security → "Open Anyway" button after the first blocked attempt
- Frame this in the pilot installer email: *"Right-click → Open the first time. Apple notarization is in progress; this is an internal build."*

### 1.3 Pilot user comms template

Subject: **Welcome to Waggle Wave-1 — install + first-run notes**

> Hi [name],
>
> You're in the first pilot wave. The build is signed with our internal Egzakta certificate, which means your OS will warn you the first time you run it. This is expected — it's the same warning you'd get installing any new internal tool.
>
> **Windows:** download → run installer → on the SmartScreen warning, click "More info" then "Run anyway."
> **Mac:** download `.zip` → unzip → right-click `Waggle.app` → Open → Open. (Yes, twice "Open." That's the one-time Gatekeeper handshake.)
>
> Your `.mind/` data stays local — see attached one-pager on pilot data handling.
>
> Reply with your first task you'd like to do in Waggle. I'll watch the trace.

---

## 2. Public Day 0 prep — real certificates (start by T+15 = 2026-05-21)

### 2.1 Windows Authenticode

**Vendor options (price + lead time):**

| Vendor | OV (1yr) | EV (1yr) | Lead | SmartScreen reputation |
|---|---|---|---|---|
| SSL.com | ~$179 | ~$249 | 3-7 biz days | EV = instant; OV = builds over months |
| Sectigo / Comodo | ~$199 | ~$329 | 5-10 biz days | Same |
| DigiCert | ~$474 | ~$599 | 1-3 biz days | Same |
| GlobalSign | ~$259 | ~$439 | 5-10 biz days | Same |

**Recommendation: SSL.com EV Authenticode (~$249/yr).**
- EV gives instant SmartScreen trust (no warning on first install)
- SSL.com is fastest of the cheap-tier vendors
- EV requires a hardware token (USB HSM) shipped to you OR cloud-HSM for CI signing
- Tauri 2.0 supports Azure Key Vault for cloud-HSM signing — recommended for CI

**Verification you'll need to provide:**
- Egzakta Group business registration (APR)
- Egzakta Group D-U-N-S number (request free at dnb.com if not assigned)
- Phone verification call to a publicly listed Egzakta phone number
- Domain control proof for waggle-os.ai

**After receipt:**
- Replace `certificateThumbprint` in `tauri.conf.json` with the real cert's thumbprint
- Or use Azure Key Vault signing flow per Tauri docs
- Test sign + install on a fresh Win 11 VM; SmartScreen should pass without "More info" click

### 2.2 macOS — Apple Developer ID + Notarization

**Step 1: Enroll in Apple Developer Program ($99/yr).**
- Go to https://developer.apple.com/programs/enroll/
- Use Egzakta Group's Apple ID (create one tied to a generic ops@ address; do NOT use Marko's personal)
- Provide D-U-N-S number (same as Windows above)
- Lead time: 1-3 days for individual approval; 1-2 weeks for organization approval

**Step 2: Generate Developer ID certificates.**
- Xcode → Settings → Accounts → Manage Certificates → "+" → "Developer ID Application"
- Also create "Developer ID Installer" if you ship `.pkg`

**Step 3: App-specific password for notarytool.**
- https://appleid.apple.com → Sign-in and Security → App-Specific Passwords → Generate
- Label: `notarytool-waggle-ci`
- Copy the password — it shows only once

**Step 4: Sign + notarize.**

```bash
# Sign
codesign --force --deep --options runtime \
  --sign "Developer ID Application: Egzakta Group (TEAMID)" \
  /path/to/Waggle.app

# Zip for notarization
ditto -c -k --keepParent Waggle.app Waggle.zip

# Submit for notarization
xcrun notarytool submit Waggle.zip \
  --apple-id "ops@egzakta.com" \
  --team-id "TEAMID" \
  --password "APP_SPECIFIC_PASSWORD" \
  --wait

# After approval (5-30 min typical):
xcrun stapler staple Waggle.app
```

**Tauri config:**

```json
{
  "bundle": {
    "macOS": {
      "signingIdentity": "Developer ID Application: Egzakta Group (TEAMID)",
      "providerShortName": "TEAMID",
      "entitlements": "./entitlements.plist"
    }
  }
}
```

**`entitlements.plist`** (allow JIT + outbound network for sidecar):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.network.client</key><true/>
  <key>com.apple.security.network.server</key><true/>
  <key>com.apple.security.files.user-selected.read-write</key><true/>
</dict>
</plist>
```

After notarization + stapling, Mac users see no warning on first launch — `.dmg` distribution becomes safe.

---

## 3. CI integration (post-pilot, before public Day 0)

**Target state:** every `main`-branch tag triggers signed builds for both platforms.

**Windows (GitHub Actions sketch):**

```yaml
- name: Sign Windows artifacts
  shell: pwsh
  run: |
    # Use Azure Key Vault for cloud-HSM signing (EV cert lives in Key Vault)
    az login --service-principal -u $env:AZURE_CLIENT_ID -p $env:AZURE_CLIENT_SECRET --tenant $env:AZURE_TENANT_ID
    AzureSignTool sign -kvu "$env:KEY_VAULT_URL" -kvc "$env:CERT_NAME" `
      -kva "$env:AZURE_CLIENT_ID" -kvs "$env:AZURE_CLIENT_SECRET" -kvt "$env:AZURE_TENANT_ID" `
      -tr "http://timestamp.digicert.com" -td sha256 `
      "src-tauri/target/release/bundle/msi/Waggle_*.msi"
```

Secrets needed in GH Actions env: `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`, `KEY_VAULT_URL`, `CERT_NAME`.

**macOS (GitHub Actions sketch):**

```yaml
- name: Import Apple cert
  env:
    DEV_CERT_P12_BASE64: ${{ secrets.APPLE_DEVID_P12_BASE64 }}
    DEV_CERT_PASSWORD: ${{ secrets.APPLE_DEVID_P12_PASSWORD }}
    KEYCHAIN_PASSWORD: ${{ secrets.MAC_KEYCHAIN_PASSWORD }}
  run: |
    echo "$DEV_CERT_P12_BASE64" | base64 -d > cert.p12
    security create-keychain -p "$KEYCHAIN_PASSWORD" build.keychain
    security default-keychain -s build.keychain
    security unlock-keychain -p "$KEYCHAIN_PASSWORD" build.keychain
    security import cert.p12 -P "$DEV_CERT_PASSWORD" -k build.keychain -T /usr/bin/codesign
    security set-key-partition-list -S apple-tool:,apple: -s -k "$KEYCHAIN_PASSWORD" build.keychain

- name: Build, sign, notarize
  env:
    APPLE_ID: ${{ secrets.APPLE_ID }}
    APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
    APPLE_APP_PASSWORD: ${{ secrets.APPLE_APP_PASSWORD }}
  run: |
    npm run tauri build -- --target universal-apple-darwin
    xcrun notarytool submit "src-tauri/target/universal-apple-darwin/release/bundle/macos/Waggle.app.zip" \
      --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_APP_PASSWORD" --wait
    xcrun stapler staple "src-tauri/target/universal-apple-darwin/release/bundle/macos/Waggle.app"
```

---

## 4. Timeline

| T+ | Date | Action |
|---|---|---|
| 0 | 2026-05-07 | Decision locked: self-sign for pilot, real certs for public Day 0 |
| 5 | 2026-05-12 | Generate self-sign certs (Win + Mac), update `tauri.build-override.conf.json` (now scripted via LAUNCH-06 wrappers), build pilot binaries |
| 9 | 2026-05-16 | **Pilot Wave-1 ship** with self-signed binaries + comms template §1.3 |
| 14 | 2026-05-21 | **Start cert procurement** — SSL.com EV Authenticode + Apple Developer Program enrollment |
| 21 | 2026-05-28 | Real certs in hand (assumes 7-day worst case) — replace thumbprints, rebuild, smoke-test |
| 25 | 2026-06-01 | Final notarization + signed-build CI green |
| 28-30 | 2026-06-05 | **Public Day 0** with fully-trusted signed binaries on both platforms |

## 5. Costs (year 1)

| Item | Cost |
|---|---|
| SSL.com EV Authenticode (Win, 1yr) | ~$249 |
| SSL.com USB HSM token (one-time) | ~$50, OR Azure Key Vault HSM ~$1.50/key/month |
| Apple Developer Program (Mac, 1yr) | $99 |
| D-U-N-S number | $0 (free request) |
| **Total Y1 minimum** | **~$348-400** |

Renewals: ~$348/yr ongoing. Tauri auto-updater also expects signed binaries — same certs cover that.

## 6. Failure modes + mitigations

| Failure | Symptom | Fix |
|---|---|---|
| Self-sign cert expired during pilot | Users get "certificate has expired" warning | Re-run `npm run tauri:sign:pilot:win:setup` (script reuses cert if still valid; generates a new one when NotAfter has passed); rerun apply + rebuild; redistribute installer |
| EV cert vendor demands more verification | Procurement slips past 2026-05-21 | Switch to OV ($179, faster) — accept slower SmartScreen reputation buildup |
| Notarization fails on a specific binary | Apple rejects with malware-pattern false positive | `xcrun notarytool log` for details; usually a sidecar binary needs `--options runtime` |
| Apple Developer Program enrollment delayed | Org approval takes 2 weeks | Enroll as individual under Marko's name first, transfer to org post-launch (allowed) |
| Win cert lost / HSM lost | Can't sign new builds | Re-purchase ($249); re-issue; old signed binaries remain valid until expiry |

---

## 7. References

- Tauri 2.0 signing docs: https://tauri.app/v1/guides/distribution/sign-windows + sign-macos
- Apple notarytool docs: https://developer.apple.com/documentation/security/customizing_the_notarization_workflow
- SSL.com Authenticode order page: https://www.ssl.com/certificates/code-signing/
- Microsoft signtool reference: https://learn.microsoft.com/en-us/windows/win32/seccrypto/signtool
- AzureSignTool (cloud HSM signing): https://github.com/vcsjones/AzureSignTool

---

Last updated: 2026-05-10 — LAUNCH-06 self-sign automation landed (Phase 2 Step 4). §1.1 now points to the npm-wrapped scripts (`tauri:sign:pilot:win:setup` / `:apply` / `:sign`) backed by `app/scripts/sign-windows-pilot.ps1`, `apply-signing-config.mjs`, and the tested `signing-config.ts` utility. §1.2 ships the macOS ad-hoc identity in the build-override config by default; `tauri:sign:pilot:mac:adhoc` re-signs nested helpers post-build.
Owner: Marko Marković (driving via CC); pilot self-sign actionable T+5; real cert procurement actionable T+14.
