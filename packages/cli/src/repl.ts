/**
 * Interactive REPL for the Waggle CLI.
 *
 * Loads WaggleConfig, MindDB, Orchestrator, ModelRouter.
 * Uses runAgentLoop() via LiteLLM for all chat interactions.
 * Supports slash commands and multi-model chat with tool use.
 */

import readline from 'node:readline';
import os from 'node:os';
import path from 'node:path';
import chalk from 'chalk';
import { MindDB, WaggleConfig, createLiteLLMEmbedder } from '@waggle/core';
import { Orchestrator, ModelRouter, runAgentLoop, createSystemTools, createPlanTools, createGitTools, Workspace, ensureIdentity, loadSystemPrompt, loadSkills, CostTracker, HookRegistry, loadHooksFromConfig, needsConfirmation } from '@waggle/agent';
import { parseCommand, COMMANDS } from './commands.js';
import { renderMarkdown } from './renderer.js';
import { AdminClient, formatTable } from './commands/admin.js';
import { AuthManager } from './auth.js';
import { detectMode, checkServerHealth } from './mode-detector.js';

/**
 * Build an embedder backed by LiteLLM's /embeddings endpoint.
 * Falls back to a deterministic mock (text→Float32Array hash) if the API is unavailable,
 * so the CLI always works even without a running LiteLLM proxy.
 */
function buildEmbedder(litellmUrl: string, litellmApiKey: string) {
  return createLiteLLMEmbedder({
    litellmUrl,
    litellmApiKey,
    model: 'text-embedding',
    dimensions: 1024,
    fallbackToMock: true,
  });
}

export interface ReplOptions {
  model?: string;
  local?: boolean;
  team?: boolean;
}

export async function startRepl(options: ReplOptions = {}): Promise<void> {
  // Load config
  const config = new WaggleConfig();
  const mindPath = config.getMindPath();

  // Open (or create) .mind database
  const db = new MindDB(mindPath);

  // Build model router from config
  const providers = config.getProviders();
  const defaultModel = options.model ?? config.getDefaultModel();

  const router = new ModelRouter({
    providers,
    defaultModel,
  });

  let currentModel = defaultModel;

  // Token/cost tracker for /cost command
  const costTracker = new CostTracker({});

  // Init workspace
  const workspace = new Workspace(process.cwd());
  workspace.init();

  // Load user customizations from ~/.waggle/
  const waggleHome = path.join(os.homedir(), '.waggle');
  const userSystemPrompt = loadSystemPrompt(waggleHome);
  const skills = loadSkills(waggleHome);

  // Load user-configurable hooks from ~/.waggle/hooks.json
  const hookRegistry = new HookRegistry();
  await loadHooksFromConfig(path.join(waggleHome, 'hooks.json'), hookRegistry);

  // Detect mode
  const auth = new AuthManager();
  const modeResult = await detectMode({
    hasToken: auth.isLoggedIn(),
    serverUrl: auth.getServerUrl(),
    forceLocal: options.local ?? false,
    forceTeam: options.team ?? false,
    healthCheck: checkServerHealth,
  });

  if (modeResult.type === 'error') {
    console.log(chalk.red(modeResult.error ?? 'Mode detection failed.'));
    db.close();
    process.exit(1);
  }

  // Get LiteLLM config from workspace
  const wsConfig = workspace.getConfig();
  const litellmUrl = wsConfig.litellmUrl ?? 'http://localhost:4000/v1';
  // LiteLLM master key for proxy auth (NOT the provider API key — LiteLLM reads that from its own env)
  const litellmApiKey = process.env.LITELLM_API_KEY ?? process.env.LITELLM_MASTER_KEY ?? 'sk-waggle-dev';

  // Build embedder backed by LiteLLM (falls back to mock if API unavailable)
  const embedder = buildEmbedder(litellmUrl, litellmApiKey);

  // Build orchestrator
  const orchestrator = new Orchestrator({ db, embedder });

  // Ensure identity exists (first-run wizard)
  ensureIdentity(orchestrator.getIdentity());

  // Build system tools
  const systemTools = createSystemTools(process.cwd());

  // Build plan tools
  const planTools = createPlanTools();

  // Build git tools
  const gitTools = createGitTools(process.cwd());

  // Start session
  const sessionId = workspace.startSession();

  // Stats for welcome banner
  const frameCount = (db.getDatabase().prepare('SELECT COUNT(*) as cnt FROM memory_frames').get() as { cnt: number }).cnt;
  const sessionCount = (db.getDatabase().prepare('SELECT COUNT(*) as cnt FROM sessions').get() as { cnt: number }).cnt;

  // Print welcome banner
  console.log('');
  console.log(chalk.bold.magenta('  Waggle') + chalk.dim(' — AI agent with persistent memory'));
  console.log(chalk.dim('  ─────────────────────────────────────'));
  console.log(chalk.dim('  Mode:     ') + chalk.cyan(modeResult.type));
  console.log(chalk.dim('  Model:    ') + chalk.cyan(currentModel));
  console.log(chalk.dim('  Memory:   ') + chalk.cyan(`${frameCount} frames`));
  console.log(chalk.dim('  Sessions: ') + chalk.cyan(`${sessionCount}`));
  console.log(chalk.dim('  Mind:     ') + chalk.cyan(mindPath));
  console.log(chalk.dim('  Workspace:') + chalk.cyan(` ${process.cwd()}`));
  if (modeResult.warning) {
    console.log(chalk.yellow('  ⚠ ' + modeResult.warning));
  }
  console.log(chalk.dim('  Type /help for commands'));
  console.log('');

  // Conversation history for agent loop
  let conversationHistory: Array<{ role: string; content: string }> = [];

  // Setup readline
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.green('you > '),
  });

  // Register confirmation gate as pre:tool hook
  hookRegistry.on('pre:tool', async (ctx) => {
    if (!ctx.toolName || !needsConfirmation(ctx.toolName)) return;

    // Ask user for confirmation via readline
    const answer = await new Promise<string>((resolve) => {
      rl.question(
        chalk.yellow(`  ⚠ Allow ${ctx.toolName}? [Y/n] `),
        (ans) => resolve(ans.trim().toLowerCase()),
      );
    });

    if (answer === 'n' || answer === 'no') {
      return { cancel: true, reason: `User denied ${ctx.toolName}` };
    }
  });

  rl.prompt();

  rl.on('line', async (line: string) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    // Check for slash commands
    const cmd = parseCommand(input);
    if (cmd) {
      switch (cmd.name) {
        case 'exit':
          console.log(chalk.dim('Goodbye!'));
          rl.close();
          return;

        case 'help':
          console.log('');
          console.log(chalk.bold('Available commands:'));
          for (const [, helpText] of Object.entries(COMMANDS)) {
            console.log(chalk.dim('  ' + helpText));
          }
          console.log('');
          break;

        case 'model':
          if (!cmd.args) {
            console.log(chalk.dim(`Current model: ${currentModel}`));
          } else {
            try {
              router.resolve(cmd.args);
              currentModel = cmd.args;
              console.log(chalk.green(`Switched to model: ${currentModel}`));
            } catch {
              console.log(chalk.red(`Unknown model: ${cmd.args}`));
              console.log(chalk.dim(`Available: ${router.listModels().join(', ')}`));
            }
          }
          break;

        case 'models': {
          const models = router.listModels();
          console.log('');
          console.log(chalk.bold('Available models:'));
          for (const m of models) {
            const marker = m === currentModel ? chalk.green(' (active)') : '';
            console.log(chalk.dim('  ') + chalk.cyan(m) + marker);
          }
          if (models.length === 0) {
            console.log(chalk.dim('  No models configured. Edit ~/.waggle/config.json'));
          }
          console.log('');
          break;
        }

        case 'clear':
          conversationHistory = [];
          console.log(chalk.dim('Conversation cleared.'));
          break;

        case 'identity': {
          const identityCtx = orchestrator.getIdentity().toContext();
          console.log('');
          console.log(renderMarkdown(identityCtx));
          console.log('');
          break;
        }

        case 'login': {
          try {
            const clerkUrl = process.env.CLERK_URL ?? 'https://waggle.clerk.accounts.dev/sign-in';
            console.log(chalk.dim('Opening browser for login...'));
            const { token, email } = await auth.loginWithBrowser(clerkUrl);
            auth.saveToken(token, email);
            console.log(chalk.green(`Logged in as ${email}`));
          } catch (err) {
            console.log(chalk.red(`Login failed: ${(err as Error).message}`));
          }
          break;
        }

        case 'logout':
          auth.logout();
          console.log(chalk.dim('Logged out.'));
          break;

        case 'whoami': {
          const email = auth.getEmail();
          console.log('');
          console.log(chalk.dim('  User:   ') + (email ? chalk.cyan(email) : chalk.dim('not logged in')));
          console.log(chalk.dim('  Mode:   ') + chalk.cyan(modeResult.type));
          console.log(chalk.dim('  Server: ') + chalk.cyan(auth.getServerUrl()));
          if (modeResult.warning) console.log(chalk.yellow('  ⚠ ' + modeResult.warning));
          console.log('');
          break;
        }

        case 'mode':
          console.log(chalk.dim(`Current mode: ${modeResult.type}`));
          if (modeResult.warning) console.log(chalk.yellow(modeResult.warning));
          break;

        case 'cost':
          console.log('');
          console.log(chalk.dim(costTracker.formatSummary()));
          console.log('');
          break;

        case 'plan': {
          const showPlan = planTools.find(t => t.name === 'show_plan');
          if (showPlan) {
            const output = await showPlan.execute({});
            console.log('');
            console.log(output);
            console.log('');
          }
          break;
        }

        case 'git': {
          const gitStatus = gitTools.find(t => t.name === 'git_status');
          if (gitStatus) {
            const output = await gitStatus.execute({});
            console.log('');
            console.log(output);
            console.log('');
          }
          break;
        }

        case 'admin': {
          const adminClient = new AdminClient();
          const parts = cmd.args.split(/\s+/);
          const subCmd = parts[0] || '';
          const teamSlug = parts[1] || '';

          if (!subCmd) {
            console.log('');
            console.log(chalk.bold('Admin commands:'));
            console.log(chalk.dim('  /admin teams              — List teams'));
            console.log(chalk.dim('  /admin jobs <team-slug>   — List agent jobs'));
            console.log(chalk.dim('  /admin cron <team-slug>   — List cron schedules'));
            console.log(chalk.dim('  /admin audit <team-slug>  — List audit log'));
            console.log(chalk.dim('  /admin stats <team-slug>  — Show usage stats'));
            console.log('');
            console.log(chalk.dim('  Set WAGGLE_API_URL and WAGGLE_TOKEN env vars to connect.'));
            console.log('');
            break;
          }

          try {
            let result: unknown;
            switch (subCmd) {
              case 'teams':
                result = await adminClient.listTeams();
                break;
              case 'jobs':
                if (!teamSlug) { console.log(chalk.red('Usage: /admin jobs <team-slug>')); break; }
                result = await adminClient.listJobs(teamSlug);
                break;
              case 'cron':
                if (!teamSlug) { console.log(chalk.red('Usage: /admin cron <team-slug>')); break; }
                result = await adminClient.listCron(teamSlug);
                break;
              case 'audit':
                if (!teamSlug) { console.log(chalk.red('Usage: /admin audit <team-slug>')); break; }
                result = await adminClient.listAudit(teamSlug);
                break;
              case 'stats':
                if (!teamSlug) { console.log(chalk.red('Usage: /admin stats <team-slug>')); break; }
                result = await adminClient.getStats(teamSlug);
                break;
              default:
                console.log(chalk.red(`Unknown admin command: ${subCmd}`));
                console.log(chalk.dim('Type /admin for available commands.'));
            }
            if (result !== undefined) {
              console.log('');
              if (Array.isArray(result)) {
                console.log(formatTable(result as Record<string, unknown>[]));
              } else {
                console.log(JSON.stringify(result, null, 2));
              }
              console.log('');
            }
          } catch (err) {
            console.log(chalk.red(`Admin error: ${(err as Error).message}`));
          }
          break;
        }

        default:
          console.log(chalk.red(`Unknown command: /${cmd.name}`));
          console.log(chalk.dim('Type /help for available commands.'));
      }

      rl.prompt();
      return;
    }

    // Chat message — send to model via runAgentLoop (LiteLLM)
    try {
      const tools = [...orchestrator.getTools(), ...systemTools, ...planTools, ...gitTools];

      let systemPrompt = '';

      // Prepend user's custom system prompt if exists
      if (userSystemPrompt) {
        systemPrompt += userSystemPrompt + '\n\n';
      }

      systemPrompt += orchestrator.buildSystemPrompt() + `

# Who You Are
You are Waggle — an AI assistant with persistent memory and web access.
Your key strength: you remember past conversations through your .mind memory system.

# CRITICAL RULES — FOLLOW THESE EXACTLY

## ABSOLUTE RULE: Never guess — USE YOUR TOOLS
- If you don't know a FACT, USE YOUR TOOLS to find out. You have bash, web_search, read_file — use them.
- Never say "I don't know" or "I can't determine" when you have tools that can answer the question.
- Need the date? Run \`date\` via bash. Need current info? Use web_search. Need file contents? Use read_file.
- Be resourceful. Solve problems yourself instead of asking the user or giving up.
- The words "likely", "probably", "I believe", "I think" before a factual claim = YOU ARE GUESSING. Stop. Search instead.
- This is ESPECIALLY important for comparisons. If someone asks "how do you compare to X", you MUST:
  1. Use web_search to find X's actual current features
  2. Use web_fetch to read their docs/website if needed
  3. ONLY THEN state what X can and cannot do, citing what you found
  4. If your search didn't find clear info, say "I couldn't verify this" — don't fill the gap with guesses
- NEVER say "X probably can't do Y" or "X likely doesn't have Y". Either you verified it or you don't claim it.
- When corrected: "You're right, my mistake." Move on. No apology paragraphs.

## Be concise — HARD LIMITS
- Simple questions: 2-5 sentences. Complex questions: max 10-12 lines.
- Max 4 bullet points per response. If you need more, you're over-explaining.
- Zero emoji unless the user uses them first.
- Lead with the answer. No preamble like "Great question!" or "That's interesting!"
- Don't list your capabilities. Demonstrate them.
- Don't repeat back what the user said.

## Be sharp, not generic
- Specific > generic. "Use web_search to find Claude Code's changelog" > "I can help with research!"
- Have a clear recommendation when asked. Not "here are options", but "I'd do X because Y".
- When you research something, give the user the INSIGHT, not a reformatted copy of search results.
- If you don't have useful info, say so in one sentence. Don't pad with filler.

# Tools
Workspace (${process.cwd()}): bash, read_file, write_file, edit_file, search_files, search_content
Web: web_search (DuckDuckGo), web_fetch (read any URL)
Memory: search_memory, save_memory, get_identity, get_awareness, query_knowledge, add_task

When asked about current events, products, releases, docs, or anything you're not 100% certain about — web_search FIRST, answer SECOND.`;

      // Append loaded skills
      if (skills.length > 0) {
        systemPrompt += '\n\n# Loaded Skills\n';
        for (const skill of skills) {
          systemPrompt += `\n## Skill: ${skill.name}\n${skill.content}\n`;
        }
      }

      conversationHistory.push({ role: 'user', content: input });

      const result = await runAgentLoop({
        litellmUrl,
        litellmApiKey,
        model: currentModel,
        systemPrompt,
        tools,
        messages: conversationHistory,
        stream: true,
        hooks: hookRegistry,
        onToken: (token: string) => { process.stdout.write(token); },
        onToolUse: (name: string, toolInput: Record<string, unknown>) => {
          console.log(chalk.dim(`  [tool] ${name}`));
          workspace.logAudit(sessionId, name, toolInput, '');
        },
      });

      // Track token usage
      costTracker.addUsage(currentModel, result.usage.inputTokens, result.usage.outputTokens);

      // Log the turn
      workspace.logTurn(sessionId, 'user', input);
      workspace.logTurn(sessionId, 'agent', result.content, result.toolsUsed);

      // Update conversation history
      conversationHistory.push({ role: 'assistant', content: result.content });

      // Display — streaming already wrote tokens to stdout, just add metadata
      console.log('');
      console.log('');
      console.log(chalk.dim(`  [${currentModel} | ${result.usage.inputTokens}→${result.usage.outputTokens} tokens]`));
      console.log('');
    } catch (err) {
      const errMsg = (err as Error).message;
      if (errMsg.includes('Unknown model')) {
        console.log(chalk.red(`Model "${currentModel}" is not configured.`));
        console.log(chalk.dim('Run /models to see available models, or edit ~/.waggle/config.json'));
      } else if (errMsg.includes('API key') || errMsg.includes('authentication') || errMsg.includes('401')) {
        console.log(chalk.red('Authentication failed. Check your API key in ~/.waggle/config.json'));
      } else {
        console.log(chalk.red(`Error: ${errMsg}`));
      }
      console.log('');
    }

    rl.prompt();
  });

  rl.on('close', () => {
    db.close();
    process.exit(0);
  });

  // Graceful shutdown on SIGINT
  process.on('SIGINT', () => {
    console.log('');
    console.log(chalk.dim('Goodbye!'));
    db.close();
    process.exit(0);
  });
}
