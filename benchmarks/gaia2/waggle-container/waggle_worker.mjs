#!/usr/bin/env node
// waggle_worker — bridges Waggle's runAgentLoop to the GAIA 2 ARE adapter.
//
// Mirrors hermes_worker.py's contract so the harness comparison is fair:
//   - same single `terminal` tool (GAIA 2 apps invoked as shell cmds via gaia2-exec)
//   - same AGENTS.md as system prompt (rendered by gaia2-init-entrypoint.sh)
//   - same model (Sonnet 4.6) — the ONLY variable is Waggle's loop logic.
//
// Protocol (JSON lines over Unix socket):
//   Worker -> Adapter: {"type":"ready"}
//                      {"type":"response","run_id","state":"final"|"error","message"}
//   Adapter -> Worker: {"type":"message","text","run_id"}  /  {"type":"interrupt","text"}
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
import { runAgentLoop } from "@waggle/agent/dist/agent-loop.js";
// F2 (2026-05-27): opt-in persona overlay via composePersonaPrompt. Bare-Waggle behavior
// (matching the 2026-05-22 N=40 on-par-with-Hermes baseline) preserved when
// WAGGLE_PERSONA_ID is unset / empty.
import { getPersona, composePersonaPrompt } from "@waggle/agent/dist/personas.js";

const WORKER_SOCK = process.env.WAGGLE_WORKER_SOCK || process.env.HERMES_WORKER_SOCK || "/tmp/waggle-worker.sock";
const AGENTS_MD = `${os.homedir()}/AGENTS.md`;
const MODEL = process.env.MODEL || "claude-sonnet-4-6";
const LITELLM_URL = process.env.BASE_URL || process.env.LITELLM_URL || "https://openrouter.ai/api/v1";
const API_KEY = process.env.API_KEY || process.env.LITELLM_API_KEY || "";
const MAX_TURNS = parseInt(process.env.MAX_ITERATIONS || "90", 10);
const MAX_TOKENS = process.env.MAX_TOKENS ? parseInt(process.env.MAX_TOKENS, 10) : undefined;

function log(...a) { console.log("[waggle-worker]", ...a); }

// Single `terminal` tool: runs a shell command (the agent calls gaia2-exec via AGENTS.md
// instructions). bash -lc so PATH includes gaia2-exec; inherits the agent-user env.
const terminalTool = {
  name: "terminal",
  description: "Execute a shell command in the sandbox. Use it to call the available GAIA2 app CLIs as described in the system prompt. Returns combined stdout+stderr.",
  parameters: {
    type: "object",
    properties: { command: { type: "string", description: "The shell command to run." } },
    required: ["command"],
  },
  execute: ({ command }) =>
    new Promise((resolve) => {
      const cmd = typeof command === "string" ? command : String(command ?? "");
      const child = spawn("bash", ["-lc", cmd], { cwd: os.homedir(), env: process.env });
      let out = "";
      const cap = (d) => { out += d.toString(); if (out.length > 200_000) { try { child.kill(); } catch {} } };
      child.stdout.on("data", cap);
      child.stderr.on("data", cap);
      child.on("close", (code) => resolve(out + (code ? `\n[exit ${code}]` : "")));
      child.on("error", (e) => resolve(`[terminal error] ${e.message}`));
    }),
};

function readAgentsMd() {
  try { return fs.readFileSync(AGENTS_MD, "utf8"); }
  catch (e) { log("WARN: could not read", AGENTS_MD, e.message); return "You are a helpful agent. Use the terminal tool to complete the task."; }
}

// Fairness with Hermes: Hermes has NO skill-distillation / verification-gate, so for
// "harness is the only variable" to hold, Waggle runs with the same task contract —
// these meta-features OFF. (They also hijacked the final user answer with a skill
// summary in the n1 smoke — a real Waggle bug to fix separately.) Env-overridable so
// an as-shipped (gates ON) variant can be measured later without a rebuild.
const SKILL_GATE = process.env.WAGGLE_SKILL_DISTILLATION_GATE === "1";
const VERIFY_GATE = process.env.WAGGLE_VERIFICATION_GATE === "1";

// F2 (2026-05-27): when WAGGLE_PERSONA_ID is set (e.g. "executive-assistant"), the
// worker composes AGENTS.md (the GAIA 2 tool / app context — REQUIRED) with the
// persona's `systemPrompt` via composePersonaPrompt(). Resolved once at startup so
// every scenario in a run sees the same prompt shape. If the ID is unrecognized we
// log a WARN and fall back to bare AGENTS.md so a typo never silently changes the
// measurement.
const PERSONA_ID = (process.env.WAGGLE_PERSONA_ID || "").trim();
let resolvedPersona = null;
if (PERSONA_ID) {
  try {
    resolvedPersona = getPersona(PERSONA_ID) ?? null;
    if (resolvedPersona) {
      log(`F2: persona overlay ON — id=${PERSONA_ID} (${resolvedPersona.name})`);
    } else {
      log(`F2: WARN — WAGGLE_PERSONA_ID="${PERSONA_ID}" did not resolve to a known persona; falling back to bare AGENTS.md`);
    }
  } catch (e) {
    log(`F2: WARN — getPersona threw (${e?.message || e}); falling back to bare AGENTS.md`);
    resolvedPersona = null;
  }
}

// F3 (2026-05-27): opt-in output-discipline appendix targeting Qwen-thinking failure
// modes seen in the bare N=160 (Cat 1 verbose multi-paragraph answers + Cat 3
// thinking-mode bleed). Activated by WAGGLE_GAIA2_QWEN_SHAPE=1. Applied as the
// FINAL section of the system prompt so it overrides any persona-introduced framing.
// Composes cleanly with or without the F2 persona overlay (compose-then-append).
const APPLY_QWEN_SHAPE = process.env.WAGGLE_GAIA2_QWEN_SHAPE === "1";
const QWEN_SHAPE_APPENDIX = `

---

## Final Answer Discipline (CRITICAL — read before every send_message_to_user)

Your final \`send_message_to_user\` MUST be the ANSWER, not an analysis. Hard rules:

1. **One short line.** No multi-paragraph response. No headers. No bullet lists. No bold formatting.
2. **No preamble.** Do NOT begin with "Based on my analysis", "Let me", "Now let me", "Here is", "I found", "After analyzing", or "Looking at the data". Just give the value.
3. **No restatement of the question.** The user knows what they asked.
4. **No appended reasoning.** Do NOT include "because…", "since…", "due to…" clauses unless the question explicitly asked for justification.
5. **No "Answer:" / "**Answer:**" prefix.** Just the value itself.

Shape by question type:
- "Which city…?" → \`Stockholm\` (one word, the city name)
- "What is the average…?" → \`45\` (the number, rounded as the question specified)
- "Who is the contact…?" → \`Astrid Lindqvist\` (the name)
- "How many…?" → \`12\` (the count)
- "What time…?" → \`14:30\` (the time)
- Listy "What are the…?" → \`Stockholm, Oslo, Copenhagen\` (comma-separated, no bullets)

Your reasoning ALREADY happened in your \`<think>\` blocks and tool calls. The send_message_to_user is a result delivery, not a reasoning rendition. If you find yourself writing more than ~15 words in send_message_to_user, you are wrong — rewrite shorter.

`;

function buildSystemPrompt() {
  const core = readAgentsMd();
  let prompt = resolvedPersona ? composePersonaPrompt(core, resolvedPersona) : core;
  if (APPLY_QWEN_SHAPE) prompt += QWEN_SHAPE_APPENDIX;
  return prompt;
}

async function runOnce(text) {
  const res = await runAgentLoop({
    litellmUrl: LITELLM_URL,
    litellmApiKey: API_KEY,
    model: MODEL,
    systemPrompt: buildSystemPrompt(),
    tools: [terminalTool],
    messages: [{ role: "user", content: text }],
    maxTurns: MAX_TURNS,
    maxTokenBudget: MAX_TOKENS,
    stream: true,
    skillDistillationGate: SKILL_GATE,
    verificationGate: VERIFY_GATE,
  });
  // AgentResponse — final assistant text. Fall back across likely field names.
  return res?.content ?? res?.message ?? res?.finalResponse ?? res?.text ?? "";
}

function connect() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 60_000;
    const attempt = () => {
      const sock = net.createConnection(WORKER_SOCK);
      sock.once("connect", () => { log("connected", WORKER_SOCK); resolve(sock); });
      sock.once("error", () => {
        sock.destroy();
        if (Date.now() > deadline) reject(new Error(`timeout connecting ${WORKER_SOCK}`));
        else setTimeout(attempt, 200);
      });
    };
    attempt();
  });
}

function send(sock, obj) { sock.write(JSON.stringify(obj) + "\n"); }

async function main() {
  const sock = await connect();
  send(sock, { type: "ready" });
  let buf = "";
  let busy = false;
  sock.on("data", async (chunk) => {
    buf += chunk.toString();
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.type === "interrupt") { log("interrupt (ignored — single-turn scenarios)"); continue; }
      if (msg.type !== "message") { log("unknown msg type", msg.type); continue; }
      if (busy) { log("WARN: message while busy"); }
      busy = true;
      const runId = msg.run_id || "unknown";
      try {
        log(`run ${runId}:`, (msg.text || "").slice(0, 100));
        const message = await runOnce(msg.text || "");
        log(`done ${runId}:`, String(message).slice(0, 100));
        send(sock, { type: "response", run_id: runId, state: "final", message: String(message) });
      } catch (e) {
        log(`error ${runId}:`, e?.message || e);
        send(sock, { type: "response", run_id: runId, state: "error", message: `Error: ${e?.message || e}`, errorMessage: String(e?.message || e) });
      } finally { busy = false; }
    }
  });
  sock.on("close", () => { log("socket closed"); process.exit(0); });
}

main().catch((e) => { console.error("[waggle-worker] fatal", e); process.exit(1); });
