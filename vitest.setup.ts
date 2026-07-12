/**
 * Vitest global setup — loads .env file into process.env for server tests
 * that need DATABASE_URL, REDIS_URL, CLERK_SECRET_KEY, etc.
 * No external dependencies (no dotenv required).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Phase 5 canary — pin to 0 (canary OFF) for tests. Production code-default
// post-kick-off (2026-04-30) is 10; tests need explicit OFF so shape-selection
// assertions stay deterministic across runs. CI / dev env can still override.
// Audit: gepa-phase-5/manifest.yaml § canary_toggle.
if (!process.env.WAGGLE_PHASE5_CANARY_PCT) {
  process.env.WAGGLE_PHASE5_CANARY_PCT = '0';
}

// W4.5: the cross-encoder reranker is default-ON in production (kill switch
// WAGGLE_RERANKER=0). Tests pin it OFF — the real ONNX model is a ~22MB
// download + per-call CPU inference, both unwanted in unit suites. Tests
// that exercise reranking inject a mock Reranker via OrchestratorConfig.
if (!process.env.WAGGLE_RERANKER) {
  process.env.WAGGLE_RERANKER = '0';
}

// W4 (2026-06-11): the PromptAssembler is default-ON in production (kill
// switch WAGGLE_PROMPT_ASSEMBLER=0) after the live chat smoke. Tests pin it
// OFF so the broad chat-route suite keeps exercising the stable legacy
// buildSystemPrompt path (prompt-cache assertions, deterministic shapes);
// assembler behavior has its own dedicated suites that opt in explicitly.
if (!process.env.WAGGLE_PROMPT_ASSEMBLER) {
  process.env.WAGGLE_PROMPT_ASSEMBLER = '0';
}

// D1 (2026-06-12): chunk-level retrieval is default-ON in production (kill
// switch WAGGLE_CHUNK_RETRIEVAL=0) after the long-frame needle probe. Tests
// pin it OFF — the broad suites' retrieval assertions predate the chunk lane;
// chunk behavior has its own suite (search-chunks.test.ts) that opts in.
if (!process.env.WAGGLE_CHUNK_RETRIEVAL) {
  process.env.WAGGLE_CHUNK_RETRIEVAL = '0';
}

// D1: the local sidecar now requires a bearer token even on loopback in production
// (no localhost-trust). The broad server suite predates this and uses raw inject()
// without tokens, so default tests to localhost-trust mode. Production keeps the
// SECURE default (no env). The dedicated D1 auth tests set WAGGLE_TRUST_LOCALHOST='0'
// to exercise the real secure path. CI/dev can override.
if (!process.env.WAGGLE_TRUST_LOCALHOST) {
  process.env.WAGGLE_TRUST_LOCALHOST = '1';
}

// Pin the embedding provider to 'mock' for tests. The auto-fallback chain
// (embedding-provider.ts) probes the in-process @xenova/transformers model
// FIRST — it fails to init on some dev machines (-> mock) but succeeds on CI
// Linux (-> 'inprocess'), making getActiveProvider() platform-dependent and
// breaking mock-embedder-guard assertions (plus downloading ~87MB of model
// weights into the test data dir). 'mock' short-circuits the chain
// deterministically: no network, no native model load. Read by
// WaggleConfig.getEmbeddingConfig(); CI/dev can still override.
if (!process.env.EMBEDDING_PROVIDER) {
  process.env.EMBEDDING_PROVIDER = 'mock';
}

// Mock embeddings are intentional in deterministic tests; the production
// warning remains enabled unless a caller explicitly opts into this test flag.
if (!process.env.WAGGLE_SUPPRESS_EMBEDDING_WARNING) {
  process.env.WAGGLE_SUPPRESS_EMBEDDING_WARNING = '1';
}

try {
  const content = readFileSync(resolve(process.cwd(), '.env'), 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    // Don't override existing env vars (CLI > .env)
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
} catch {
  // .env not found — tests will use fallback config values
}
