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

async function runOnce(text) {
  const res = await runAgentLoop({
    litellmUrl: LITELLM_URL,
    litellmApiKey: API_KEY,
    model: MODEL,
    systemPrompt: readAgentsMd(),
    tools: [terminalTool],
    messages: [{ role: "user", content: text }],
    maxTurns: MAX_TURNS,
    maxTokenBudget: MAX_TOKENS,
    stream: true,
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
