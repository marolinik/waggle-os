# Waggle OS — Threat Model

Waggle OS is a **workspace-native AI agent platform with persistent memory**. The current
launch scope is a Windows-first Tauri desktop binary with a bundled Node.js sidecar;
macOS packaging and certification remain roadmap work. This document states the trust
boundary and the controls that enforce it.

> Status: living document. The controls below are implemented and cited to source.
> Known gaps are open and honestly listed.

## Trust Boundary

Waggle runs **on the user's own machine, for that single user**. The human operator is
trusted: they own the workspace, the vault, the filesystem, and the connector
credentials. The threat model does **not** try to stop the operator from doing what they
are entitled to do on their own device.

The boundary Waggle defends is between the **trusted operator + Waggle's own code** and
**untrusted external content** that flows into the agent's context:

- conversation/file imports (Harvest: ChatGPT/Claude/Gemini/PDF/markdown/URL adapters)
- connector auto-fetch + tool reads (calendar, email, GitHub, web, files)
- tool output sourced from outside the process
- MCP server output
- saved memory frames derived from any of the above

The core risk is **prompt injection**: untrusted content carrying instructions that try
to hijack the agent ("ignore previous instructions", fake `SYSTEM:` authority, role
override, prompt-extraction) and make it act against the operator's intent.

## Controls (implemented)

### 1. Injection scanning at every ingress — `scanForInjection`
`packages/hive-mind-core/src/injection-scanner.ts` (re-exported via
`packages/agent/src/injection-scanner.ts`). Three pattern sets — role-override,
prompt-extraction, instruction-injection — produce a score; `safe = score < 0.3`
(instruction-injection is weighted higher, 0.6, for `tool_output` context). It gates the
three untrusted chokepoints:
- **Harvest** ingestion (external conversation exports).
- **Recall**: `orchestrator.ts` scans the joined recalled block and **drops the entire
  recall** on a flag (`orchestrator.ts:777-786`) — a poisoned memory frame never silently
  re-enters context on a later turn.
- **Tool output**: `tool-executor.ts` scans every executed-tool result and replaces
  flagged content with a `[SECURITY] … sanitized` placeholder **before** any observer or
  the model sees it.

### 2. Structural untrusted-content fence — `untrustedContextWrapper`
`packages/agent/src/untrusted-context.ts`. Tool output that *passes* the scan is still
external data. Before it enters the model's next-turn context it is wrapped in a
delimiter-guarded block with a "this is DATA, not instructions" header, applied in
`tool-executor.ts` (after scan + compression). Embedded guard markers in the body are
escaped so untrusted content **cannot break out of the fence** to forge a close-marker.
This is defense-in-depth on top of the scanner: the scanner blocks *known* attack
phrasings; the fence makes *all* external tool output structurally non-authoritative.

**Maintained invariant (taint preservation):** tool output is delivered as a **discrete
`role:'tool'` message** (`agent-loop.ts`) / Anthropic **`tool_result` content block**
(`anthropic-proxy.ts`) and is **never string-concatenated into the user turn**. Waggle's
provider adapters do no lossy role-alternation merge (`openai-compat.ts`), so the
data/instruction boundary is preserved natively. **Follow-up guard:** if a provider
adapter that merges consecutive same-role turns is ever added, it MUST insert a boundary
rather than concatenate an untrusted block into the operator's real request — re-audit at
that time.

### 3. Human-in-the-loop confirmation — `confirmation.ts`
`packages/agent/src/confirmation.ts`. State-changing tools require explicit approval:
an `ALWAYS_CONFIRM` set (`write_file`, `edit_file`, `git_push`, `install_capability`,
`create_skill`/`delete_skill`, cross-workspace reads, …) plus a `CONNECTOR_WRITE_PATTERNS`
regex that gates connector write actions (`_create_/_update_/_delete_/_send_/…`).
Read-only/informational calls flow freely; destructive ops do not inherit autonomy.

### 4. Capability install audit trail — `install-audit.ts`
`packages/core/src/install-audit.ts`. Every install-relevant action (proposed, approved,
installed, rejected, failed, uninstalled) is persisted to the `.mind` DB with risk,
approval class, initiator, and trust source — a verifiable history of what was installed,
when, why, and by whom. Backs the EU-AI-Act capability-provenance story.

### 5. Local secret storage — `vault.ts`
`packages/core/src/vault.ts`. Secrets are encrypted with AES-256-GCM under a
machine-local key file; each entry is independently encrypted. Runtime API keys
belong in the vault or a local `.env` (never committed). `.env.example` contains
names plus non-secret development defaults, never live credentials. Callers must
not persist secret values into prompts, logs, or memory frames.

### 6. MCP tool scope gate — `scope.ts`
`packages/memory-mcp/src/scope.ts` + `packages/hive-mind-mcp-server/src/scope.ts`. An
external agent (Claude Code/Codex) granted stdio access to the memory substrate can be
scoped **read-only** via `WAGGLE_MCP_SCOPES` / `HIVE_MIND_SCOPES`: a `memory:read` scope
registers only the read tools, so a read-only client literally cannot call
save/cleanup/ingest. Default (unset) stays full read+write for backward-compat;
`memory:write` implies `memory:read`. This keeps a poisoned or buggy external agent from
writing junk into the substrate.

### 7. Workspace filesystem boundary + secret deny — `file-store.ts`
`packages/core/src/file-store.ts`. Every FileStore op resolves the caller path and asserts
it cannot escape the workspace root: a **segment-boundary** containment check (not a string
prefix — `${root}-evil` is rejected) plus **symlink-aware** containment (the realpath'd
target must stay under the realpath'd root, so a benign-named symlink/junction pointing at
`~/.ssh` or `/etc` is denied, while in-root monorepo links still work). For LINKED external
folders, `isSensitiveFilePath` additionally denies reads/writes/listing of well-known secret
material (SSH/GPG keys, cloud + terraform credentials, `.env`, `id_rsa`, `authorized_keys`,
backup copies, `*.pem`), normalized against Windows ADS (`::$DATA`) and trailing-dot/space
tricks. `searchFiles`/`listFiles` filter the same set so search never even discloses a
secret's existence. **This is real containment + a defense-in-depth BLOCKLIST — not a
sandbox:** the deny is a curated list (it cannot enumerate every secret a home dir holds) and
is deny-by-default with no per-workspace override yet.

### 8. SSRF egress guard — `url-egress-guard.ts`
`packages/agent/src/url-egress-guard.ts` (guarding `web_fetch` in `system-tools.ts`) and
the structurally-identical `packages/hive-mind-core/src/harvest/url-egress-guard.ts`
(guarding `UrlAdapter.fetchAndParse`, reached by the MCP `ingest_source` url path in
`packages/{memory-mcp,hive-mind-mcp-server}/src/tools/ingest.ts`). A URL named by untrusted
content or a user is resolved to concrete IP(s); the fetch is **refused if any resolved
address is loopback / private (RFC1918 + CGNAT) / link-local / unique-local / multicast /
reserved / unspecified**. This closes the **cloud instance-metadata** exfiltration path —
`169.254.169.254` (link-local) reaching IAM credentials — which matters because the
cloud/TEAMS sidecar binds `0.0.0.0` (`docker-compose.production.yml`, `render.yaml`).
Coverage:
- **Scheme allowlist:** only `http:`/`https:` (blocks `file:`/`gopher:`/`ftp:` redirect tricks).
- **Obfuscated literals** (octal `0177.0.0.1`, decimal `2130706433`, hex `0x7f000001`) are
  normalized by the OS resolver — `net.isIP` rejects them as literals, so they route through
  `dns.lookup` (getaddrinfo) which returns the canonical dotted form the classifier blocks.
- **IPv6** including `::1`, `fe80::/10`, `fc00::/7`, `ff00::/8`, and **IPv4-mapped**
  (`::ffff:169.254.169.254`) which is unwrapped and classified as its embedded v4.
- **Redirects** are followed manually (`redirect: 'manual'`) and the target is **re-validated
  at every hop**, so a public URL cannot 30x-bounce into a private address; a hop cap bounds it.
- **Desktop localhost:** loopback is blocked by default; a legitimate local-dev fetch is
  permitted only when `WAGGLE_ALLOW_LOCAL_FETCH=1` (loopback only — private/link-local stay
  blocked even then). Fail-closed: an unclassifiable/malformed address is treated as blocked.

## Known Gaps (open, honest)

1. **Pattern-based scanner.** `scanForInjection` is regex/heuristic — novel phrasings,
   heavy obfuscation, or non-English attacks outside the small multilingual set can evade
   it. The structural fence (control 2) is the backstop, but the fence is *advisory*: a
   sufficiently capable model can still be jailbroken from inside a correctly-fenced block.
   Both controls reduce, not eliminate, injection risk.
2. **No filesystem/shell sandbox.** File and command tools run as the app-process user.
   Control 7 now confines FileStore ops to the workspace boundary and blocks well-known
   secrets in linked dirs, but it is a path-level guard + blocklist, not OS-level confinement;
   shell/command tools remain bounded only by the confirmation gate (control 3). The linked-dir
   secret deny is also a curated blocklist (whole secret classes — e.g. browser profiles,
   shell history, `.config/gh|gcloud` tokens — are out of scope) and has no per-workspace
   override, so legitimate `.env`/`.npmrc` edits in a linked project are denied by default.
   (`S3FileStore` — the TEAMS/cloud backend — now rejects `..` traversal in keys and uses a
   ReDoS-safe glob matcher for search, but it has no secret-deny blocklist; its bucket prefix
   is the isolation boundary.)
3. **Fence scope is tool output only.** Recalled memory carries an equivalent prose
   preamble (`orchestrator.ts`) but is not yet wrapped in the same structural fence;
   harvest content is scanned at ingest but not re-fenced per frame. Extending the fence to
   recall is a low-marginal-value follow-up.
4. **Read-only persona gating depends on explicit classification.** Built-in tools are
   filtered through `READ_ONLY_ALLOWED_TOOLS`; dynamic connector and MCP tools are dropped
   wholesale for read-only personas. The residual risk is governance drift if a stateful
   tool is incorrectly classified as side-effect-free and added to the allowlist; focused
   tests guard known mutators and the MCP-denial boundary.
5. **Connector endpoint URLs are not redacted before logging.** userinfo/query/fragment
   on LiteLLM/connector URLs can leak credentials into logs — fold a `redactUrl` pass into
   the next compliance/logging pass.
6. **Connector auto-harvest persists external content durably.** Opt-in Solo/FREE connector
   harvest writes external data (e.g. inbox metadata + message previews) into the personal
   mind, where it is recalled into model context on later turns. Content is injection-scanned
   per frame but NOT scanned for secrets/PII; the email harvest pins `$select` to
   subject/from/preview (not full bodies) to bound exposure. A secret-pattern redaction pass
   before `writeFrame` is a follow-up.
7. **SSRF guard has a residual DNS-rebind TOCTOU window.** The egress guard (control 8)
   resolves + validates the hostname, then hands the URL to `fetch`, which resolves it a
   second time — a hostname whose DNS flips to a private IP between the two lookups could slip
   through on the fetch's own resolution. The window is re-validated on every redirect hop, but
   full closure needs IP-pinning (connect to the validated address) which `fetch`+HTTPS can't
   do portably without breaking TLS SNI/cert validation. Also out of scope: the guard bounds
   the *target* address, not response size/content, and does not defend a genuinely
   public-but-malicious endpoint. The duplicated agent/hive-mind-core guard copies share one
   spec and must be kept in sync (they cannot share a module — hive-mind-core is OSS-mirrored
   and must not import `@waggle/agent`).
