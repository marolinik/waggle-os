import { describe, it, expect } from 'vitest';
import { getPersona, type ToolDefinition, type AgentPersona } from '@waggle/agent';
import {
  applyPersonaToolFilter,
  filterMcpToolsForPersona,
  ALWAYS_AVAILABLE_TOOLS,
  READ_ONLY_WRITE_TOOLS,
  READ_ONLY_ALLOWED_TOOLS,
  DEFAULT_TURN_SCHEMA_CHAR_LIMIT,
  DEFAULT_TURN_TOOL_LIMIT,
  measureOpenAiToolSchemaChars,
  selectToolsForTurn,
} from '../src/local/persona-tool-filter.js';

const tool = (name: string): ToolDefinition =>
  ({ name, description: name, parameters: { type: 'object', properties: {} }, execute: async () => '' }) as unknown as ToolDefinition;

// applyPersonaToolFilter only reads tools / disallowedTools / isReadOnly.
const persona = (over: Partial<AgentPersona>): AgentPersona =>
  ({ id: 'p', name: 'P', tools: [], ...over }) as unknown as AgentPersona;

const POOL = ['chat_x', 'create_skill', 'read_skill', 'delete_skill', 'search_skills', 'write_file'].map(tool);

describe('applyPersonaToolFilter — self-evolving skill loop guarantee', () => {
  it('create_skill survives a persona allowlist (the loop can author skills)', () => {
    // A persona that declares only its own tool — pre-fix the allowlist stripped
    // create_skill (not declared, not in ALWAYS_AVAILABLE) and the loop 404'd.
    const out = applyPersonaToolFilter(POOL, persona({ tools: ['chat_x'] })).map(t => t.name);
    expect(out).toContain('create_skill');
    expect(out).toContain('read_skill');
    expect(out).toContain('delete_skill');
    expect(out).toContain('search_skills'); // read-side always worked
    expect(out).toContain('chat_x'); // persona's own declared tool
  });

  it('read-only personas cannot create or delete skills, but read_skill stays', () => {
    const out = applyPersonaToolFilter(POOL, persona({ tools: ['chat_x'], isReadOnly: true })).map(t => t.name);
    expect(out).not.toContain('create_skill');
    expect(out).not.toContain('delete_skill');
    expect(out).not.toContain('write_file');
    expect(out).toContain('read_skill'); // a read — allowed even for read-only personas
  });

  it('disallowedTools wins over the always-available set', () => {
    const out = applyPersonaToolFilter(POOL, persona({ tools: ['chat_x'], disallowedTools: ['create_skill'] })).map(t => t.name);
    expect(out).not.toContain('create_skill');
    expect(out).toContain('read_skill'); // not denied
  });

  it('a persona with no declared tools applies no allowlist narrowing', () => {
    const out = applyPersonaToolFilter(POOL, persona({ tools: [] })).map(t => t.name);
    expect(out).toContain('write_file'); // full pool preserved
    expect(out).toContain('create_skill');
  });

  it('the policy sets encode the write-side skill tools correctly', () => {
    expect(ALWAYS_AVAILABLE_TOOLS.has('create_skill')).toBe(true);
    expect(ALWAYS_AVAILABLE_TOOLS.has('read_skill')).toBe(true);
    expect(ALWAYS_AVAILABLE_TOOLS.has('delete_skill')).toBe(true);
    expect(READ_ONLY_WRITE_TOOLS.has('create_skill')).toBe(true);
    expect(READ_ONLY_WRITE_TOOLS.has('delete_skill')).toBe(true);
    expect(READ_ONLY_WRITE_TOOLS.has('read_skill')).toBe(false);
  });
});

// SEC-GATE fix #4: read-only personas use an ALLOWLIST, so genuine write tools
// not on the old denylist (add_task, compose_workflow, execute_step) can no
// longer silently leak. Ephemeral plan-authoring (create_plan / add_plan_step)
// IS kept — verified side-effect-free in plan-tools.ts (in-memory Plan only),
// exactly like show_plan — so the isReadOnly `planner` persona still works.
describe('applyPersonaToolFilter — read-only allowlist (no write tool leaks)', () => {
  const LEAK_POOL = [
    'read_file', 'search_memory', 'read_skill', 'search_skills', 'show_plan',
    'add_task', 'create_plan', 'add_plan_step', 'compose_workflow', 'execute_step',
    'write_file', 'save_memory', 'bash',
  ].map(tool);

  it('a read-only persona cannot invoke genuine writes (add_task / compose_workflow / execute_step / write_file / bash)', () => {
    const out = applyPersonaToolFilter(LEAK_POOL, persona({ tools: [], isReadOnly: true })).map(t => t.name);
    for (const leaked of ['add_task', 'compose_workflow', 'execute_step', 'write_file', 'save_memory', 'bash']) {
      expect(out, `${leaked} must be stripped from a read-only persona`).not.toContain(leaked);
    }
  });

  it('a read-only persona keeps read tools AND side-effect-free plan authoring', () => {
    const out = applyPersonaToolFilter(LEAK_POOL, persona({ tools: [], isReadOnly: true })).map(t => t.name);
    expect(out).toContain('read_file');
    expect(out).toContain('search_memory');
    expect(out).toContain('read_skill');
    expect(out).toContain('search_skills');
    expect(out).toContain('show_plan');
    // Plan authoring is ephemeral (no persistence) — the planner persona needs it.
    expect(out).toContain('create_plan');
    expect(out).toContain('add_plan_step');
  });

  it('the read-only allowlist enumerates reads + ephemeral plan authoring, excludes real writes', () => {
    expect(READ_ONLY_ALLOWED_TOOLS.has('read_file')).toBe(true);
    expect(READ_ONLY_ALLOWED_TOOLS.has('read_skill')).toBe(true);
    expect(READ_ONLY_ALLOWED_TOOLS.has('create_plan')).toBe(true);
    expect(READ_ONLY_ALLOWED_TOOLS.has('add_plan_step')).toBe(true);
    expect(READ_ONLY_ALLOWED_TOOLS.has('add_task')).toBe(false);
    expect(READ_ONLY_ALLOWED_TOOLS.has('compose_workflow')).toBe(false);
    expect(READ_ONLY_ALLOWED_TOOLS.has('execute_step')).toBe(false);
  });

  it('the real planner persona keeps its planning tools but loses execute/write/bash (regression lock)', () => {
    const PLANNER_POOL = [
      'read_file', 'search_files', 'search_memory', 'query_knowledge',
      'create_plan', 'add_plan_step', 'show_plan',
      'execute_step', 'write_file', 'bash', 'save_memory',
    ].map(tool);
    // Mirrors the shipped isReadOnly planner (persona-data.ts): declares planning
    // tools + bash, disallows the writes. The read-only strip must keep authoring.
    const plannerLike = persona({
      tools: ['read_file', 'search_files', 'search_memory', 'query_knowledge', 'create_plan', 'add_plan_step', 'show_plan', 'bash'],
      disallowedTools: ['write_file', 'execute_step', 'save_memory'],
      isReadOnly: true,
    });
    const out = applyPersonaToolFilter(PLANNER_POOL, plannerLike).map(t => t.name);
    expect(out).toContain('create_plan');
    expect(out).toContain('add_plan_step');
    expect(out).toContain('show_plan');
    expect(out).toContain('read_file');
    expect(out).not.toContain('execute_step');
    expect(out).not.toContain('write_file');
    expect(out).not.toContain('bash'); // read-only strips arbitrary command execution
  });
});

describe('applyPersonaToolFilter — dynamic connector safety rails', () => {
  const CONNECTOR_POOL = [
    'chat_x',
    'connector_slack_list_channels',
    'connector_slack_send_message',
  ].map(tool);

  it('keeps connected connector actions eligible for a persona with a static allowlist', () => {
    const out = applyPersonaToolFilter(
      CONNECTOR_POOL,
      persona({ tools: ['chat_x'] }),
    ).map(t => t.name);

    expect(out).toContain('connector_slack_list_channels');
    expect(out).toContain('connector_slack_send_message');
  });

  it('honors disallowedTools against dynamic connector names', () => {
    const out = applyPersonaToolFilter(
      CONNECTOR_POOL,
      persona({
        tools: ['chat_x'],
        disallowedTools: ['connector_slack_send_message'],
      }),
    ).map(t => t.name);

    expect(out).toContain('connector_slack_list_channels');
    expect(out).not.toContain('connector_slack_send_message');
  });

  it('grants a read-only persona no dynamic connector actions', () => {
    const out = applyPersonaToolFilter(
      CONNECTOR_POOL,
      persona({ tools: ['chat_x'], isReadOnly: true }),
    ).map(t => t.name);

    expect(out).not.toContain('connector_slack_list_channels');
    expect(out).not.toContain('connector_slack_send_message');
  });
});

// Steal #6: MCP tools bypass the persona ALLOWLIST (their dynamic
// `mcp_<server>_<tool>` names are never in a persona's static tools[]) but must
// still honor the two safety rails — explicit denylist + read-only.
describe('filterMcpToolsForPersona — MCP persona safety rails', () => {
  const MCP_POOL = ['mcp_github_create_issue', 'mcp_slack_send', 'mcp_postgres_query'].map(tool);

  it('bypasses the allowlist: a narrow persona still gets MCP tools', () => {
    const out = filterMcpToolsForPersona(MCP_POOL, persona({ tools: ['chat_x'] })).map(t => t.name);
    expect(out).toEqual(['mcp_github_create_issue', 'mcp_slack_send', 'mcp_postgres_query']);
  });

  it('honors disallowedTools against MCP tool names', () => {
    const out = filterMcpToolsForPersona(MCP_POOL, persona({ disallowedTools: ['mcp_postgres_query'] })).map(t => t.name);
    expect(out).not.toContain('mcp_postgres_query');
    expect(out).toContain('mcp_github_create_issue');
  });

  it('grants a read-only persona NO MCP tools (unknown-capability external actions)', () => {
    const out = filterMcpToolsForPersona(MCP_POOL, persona({ isReadOnly: true }));
    expect(out).toEqual([]);
  });
});

const selectorTool = (name: string, description = `Use ${name.replaceAll('_', ' ')} for this task.`, padding = 0): ToolDefinition => ({
  name,
  description: `${description}${' x'.repeat(padding)}`,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: `Input for ${name}` },
    },
  },
  execute: async () => 'ok',
});

const SELECTOR_TOOL_NAMES = [
  'get_identity', 'get_awareness', 'search_memory', 'search_all_workspaces', 'save_memory',
  'query_knowledge', 'add_task', 'correct_knowledge', 'bash', 'read_file', 'write_file',
  'edit_file', 'search_files', 'search_content', 'web_search', 'web_fetch', 'multi_edit',
  'get_task_output', 'run_code', 'kill_task', 'create_plan', 'add_plan_step', 'execute_step',
  'show_plan', 'git_status', 'git_diff', 'git_log', 'git_commit', 'git_branch', 'git_stash',
  'git_push', 'git_pull', 'git_merge', 'git_pr', 'generate_docx', 'generate_xlsx',
  'generate_pptx', 'generate_pdf', 'list_skills', 'create_skill', 'delete_skill', 'read_skill',
  'search_skills', 'suggest_skill', 'acquire_capability', 'install_capability',
  'promote_skill', 'auto_extract_skills', 'retire_skills', 'create_schedule', 'list_schedules',
  'delete_schedule', 'trigger_schedule', 'perplexity_search', 'tavily_search', 'brave_search',
  'browser_navigate', 'browser_screenshot', 'browser_click', 'browser_fill', 'browser_evaluate',
  'browser_snapshot', 'lsp_diagnostics', 'lsp_definition', 'lsp_references', 'lsp_hover',
  'cli_discover', 'cli_execute', 'agent_insights', 'find_connector', 'list_connector_categories',
  'spawn_agent', 'list_agents', 'get_agent_result', 'compose_workflow', 'orchestrate_workflow',
  'list_harnesses', 'run_harness',
] as const;

describe('selectToolsForTurn - bounded per-turn model context', () => {
  const pool = SELECTOR_TOOL_NAMES.map(name => selectorTool(name));

  it('measures the exact OpenAI tool schema shape used by agent-loop', () => {
    const tools = [selectorTool('read_file'), selectorTool('run_code')];
    const expected = JSON.stringify(tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: { type: 'object', properties: {}, ...t.parameters },
      },
    }))).length;

    expect(measureOpenAiToolSchemaChars(tools)).toBe(expected);
  });

  it('enforces both hard limits, skips oversized candidates, and keeps deterministic order', () => {
    const candidates = [
      selectorTool('run_code', 'Run code to test and validate code.', 5_000),
      ...Array.from({ length: 30 }, (_, i) => selectorTool(`code_tool_${i}`, 'Run code tests and inspect implementation.', 120)),
    ];
    const first = selectToolsForTurn(candidates, { message: 'Run and test this code implementation' });
    const second = selectToolsForTurn(candidates, { message: 'Run and test this code implementation' });

    expect(first.tools.map(t => t.name)).toEqual(second.tools.map(t => t.name));
    expect(first.tools.map(t => t.name)).not.toContain('run_code');
    expect(first.tools.length).toBeLessThanOrEqual(DEFAULT_TURN_TOOL_LIMIT);
    expect(first.schemaChars).toBeLessThanOrEqual(DEFAULT_TURN_SCHEMA_CHAR_LIMIT);
    expect(measureOpenAiToolSchemaChars(first.tools)).toBe(first.schemaChars);
  });

  it('never serializes all 29 simultaneously relevant tools into one turn', () => {
    const candidates = Array.from({ length: 29 }, (_, index) =>
      selectorTool(`code_tool_${index}`, 'Run code tests and inspect this implementation.', 120));

    const selected = selectToolsForTurn(candidates, {
      message: 'Run code tests and inspect this implementation',
    });

    expect(selected.tools.length).toBeLessThanOrEqual(DEFAULT_TURN_TOOL_LIMIT);
    expect(selected.tools.length).toBeLessThan(candidates.length);
    expect(selected.omittedCount).toBe(candidates.length - selected.tools.length);
    expect(selected.schemaChars).toBeLessThanOrEqual(DEFAULT_TURN_SCHEMA_CHAR_LIMIT);
    expect(measureOpenAiToolSchemaChars(selected.tools)).toBe(selected.schemaChars);
  });

  it('deduplicates by name with the first eligible definition winning', () => {
    const native = selectorTool('read_file', 'Native read implementation');
    const shadow = selectorTool('read_file', 'Plugin shadow implementation');
    const selected = selectToolsForTurn([native, shadow], { message: 'Read the file' });

    expect(selected.tools).toHaveLength(1);
    expect(selected.tools[0]).toBe(native);
    expect(selected.omittedCount).toBe(1);
  });

  it('does not make casual chat tool-bearing, including dynamic plugin and MCP tools', () => {
    const candidates = [
      ...pool,
      selectorTool('plugin_slack_send_message', 'Send a Slack message'),
      selectorTool('mcp_github_create_issue', 'Create a GitHub issue'),
    ];
    const selected = selectToolsForTurn(candidates, {
      message: "Prove you're not just a ChatGPT wrapper. What can you concretely do?",
      preferredToolNames: ['bash', 'write_file'],
      externalToolNames: ['plugin_slack_send_message', 'mcp_github_create_issue'],
    });

    expect(selected.tools).toEqual([]);
    expect(selected.schemaChars).toBe(2);
  });

  it('keeps a self-contained finance calculation tool-free', () => {
    const financeTools = [
      selectorTool('generate_xlsx', 'Create a runway spreadsheet and financial model'),
      selectorTool('read_file', 'Read files containing financial inputs'),
      selectorTool('search_memory', 'Search saved financial data'),
      selectorTool('run_code', 'Calculate financial values with code'),
      selectorTool('create_schedule', 'Create schedules and recurring reminders'),
    ];
    const selected = selectToolsForTurn(financeTools, {
      message: 'Cash is 40000 dollars, monthly burn is 10000 dollars, and revenue is zero. Calculate runway in months, state the formula, name the biggest assumption, and give two actions that improve runway. Do not create files or schedules.',
      preferredToolNames: getPersona('finance-owner')?.tools ?? [],
    });

    expect(selected.tools).toEqual([]);
    expect(selected.schemaChars).toBe(2);
  });

  it('keeps positive capabilities while excluding a negated calculation capability', () => {
    const selected = selectToolsForTurn([
      selectorTool('run_code', 'Calculate financial values with code'),
      selectorTool('calculator', 'Calculate a numeric result'),
      selectorTool('generate_xlsx', 'Create a runway spreadsheet and financial model'),
      selectorTool('create_schedule', 'Create schedules and recurring reminders'),
    ], {
      message: 'Calculate 40000 divided by 10000. Do not use code or a calculator, but create a schedule with the result.',
    });

    expect(selected.tools.map(tool => tool.name)).toEqual(['create_schedule']);
  });

  it('resumes a positive capability after an and-conjoined negation', () => {
    const selected = selectToolsForTurn([
      selectorTool('run_code', 'Calculate financial values with code'),
      selectorTool('calculator', 'Calculate a numeric result'),
      selectorTool('create_schedule', 'Create schedules and recurring reminders'),
    ], {
      message: 'Calculate 40000 divided by 10000. Do not use code or a calculator, and create a schedule with the result.',
    });

    expect(selected.tools.map(tool => tool.name)).toEqual(['create_schedule']);
  });

  it('does not restore implicit calculation tools through delegated fallback', () => {
    const selected = selectToolsForTurn([
      selectorTool('run_code', 'Calculate financial values with code'),
      selectorTool('calculator', 'Calculate a numeric result'),
      selectorTool('generate_xlsx', 'Create a runway spreadsheet and financial model'),
    ], {
      message: 'Calculate 40000 divided by 10000 and check the result.',
      fallbackToEligible: true,
    });

    expect(selected.tools).toEqual([]);
    expect(selected.schemaChars).toBe(2);
  });

  it.each([
    'Calculate 40000 divided by 10000 without code or a calculator.',
    'Calculate 40000 divided by 10000 without the use of code.',
    'Calculate 40000 divided by 10000 without any tools.',
  ])('keeps noun-form without clauses from requesting calculation tools: %s', (message) => {
    const selected = selectToolsForTurn([
      selectorTool('run_code', 'Calculate financial values with code'),
      selectorTool('calculator', 'Calculate a numeric result'),
    ], {
      message,
    });

    expect(selected.tools).toEqual([]);
    expect(selected.schemaChars).toBe(2);
  });

  it('does not treat reference years as supplied current-data values', () => {
    const selected = selectToolsForTurn([
      selectorTool('web_search', 'Search the web for current information'),
      selectorTool('calculator', 'Calculate a numeric result'),
    ], {
      message: 'Calculate current inflation change between 2025 and 2026.',
    });

    expect(selected.tools.map(tool => tool.name)).toContain('web_search');
  });

  it('retains an explicitly requested calculation tool', () => {
    const selected = selectToolsForTurn([
      selectorTool('run_code', 'Calculate financial values with code'),
      selectorTool('calculator', 'Calculate a numeric result'),
    ], {
      message: 'Use code to calculate 40000 divided by 10000.',
    });

    expect(selected.tools.map(tool => tool.name)).toContain('run_code');
  });

  it('never drops an already-authorized mandatory calculation tool', () => {
    const selected = selectToolsForTurn([
      selectorTool('run_code', 'Calculate financial values with code'),
      selectorTool('calculator', 'Calculate a numeric result'),
    ], {
      message: 'Calculate 40000 divided by 10000.',
      mandatoryToolNames: ['run_code'],
    });

    expect(selected.tools.map(tool => tool.name)).toContain('run_code');
  });

  it('keeps an explicit external send capability attached to a calculation', () => {
    const selected = selectToolsForTurn([
      selectorTool('plugin_slack_send_message', 'Send a Slack message'),
      selectorTool('run_code', 'Calculate financial values with code'),
    ], {
      message: 'Calculate 40000 divided by 10000 and send the result to Slack.',
      externalToolNames: ['plugin_slack_send_message'],
    });

    expect(selected.tools.map(tool => tool.name)).toContain('plugin_slack_send_message');
  });

  it('selects an explicitly relevant external tool without exposing unrelated externals', () => {
    const candidates = [
      selectorTool('plugin_slack_send_message', 'Send a Slack message'),
      selectorTool('mcp_github_create_issue', 'Create a GitHub issue'),
    ];
    const selected = selectToolsForTurn(candidates, {
      message: 'Send a concise message to Slack',
      externalToolNames: candidates.map(t => t.name),
    });

    expect(selected.tools.map(t => t.name)).toEqual(['plugin_slack_send_message']);
  });

  it('lets current intent outrank recent continuity and caps continuity to four tools', () => {
    const selected = selectToolsForTurn(pool, {
      message: 'Create a runway workbook with sensitivity scenarios',
      recentMessages: [{ role: 'user', content: 'Draft a narrative report and memo' }],
      recentToolNames: ['web_search', 'web_fetch', 'git_status', 'generate_docx', 'write_file', 'edit_file'],
    });
    const names = selected.tools.map(t => t.name);

    expect(names).toContain('generate_xlsx');
    expect(names.indexOf('generate_xlsx')).toBeLessThan(names.indexOf('generate_docx'));
  });

  it('keeps mandatory tools only when already eligible and never re-adds absent tools', () => {
    const selected = selectToolsForTurn([selectorTool('read_file'), selectorTool('search_skills')], {
      message: 'Implement the requested change',
      mandatoryToolNames: ['search_skills', 'create_skill', 'blocked_tool'],
    });
    const names = selected.tools.map(t => t.name);

    expect(names).toContain('search_skills');
    expect(names).not.toContain('create_skill');
    expect(names).not.toContain('blocked_tool');
  });

  it.each([
    ['general-purpose', 'Create a product launch plan and a concise launch memo', ['create_plan', 'generate_docx']],
    ['researcher', 'Research the latest agent benchmarks and provide cited sources', ['web_search', 'web_fetch']],
    ['writer', 'Draft and export a polished customer memo as DOCX', ['generate_docx']],
    ['project-manager', 'Build a roadmap with dependencies and milestones', ['create_plan']],
    ['executive-assistant', 'Prepare a meeting brief from our previous notes', ['search_memory', 'generate_docx']],
    ['finance-owner', 'Create an XLSX runway workbook with sensitivity scenarios', ['generate_xlsx']],
    ['coder', 'Fix the failing TypeScript test, run it, and inspect diagnostics', ['search_files', 'run_code', 'lsp_diagnostics']],
    ['data-engineer', 'Validate this ETL pipeline and SQL transformation', ['run_code', 'read_file']],
    ['verifier', 'Verify this implementation and return a verdict with test evidence', ['git_diff', 'lsp_diagnostics']],
    ['coordinator', 'Delegate parallel research and writing, then synthesize the agents results', ['spawn_agent']],
  ])('retains critical tools for the %s persona scenario', (personaId, message, criticalTools) => {
    const selected = selectToolsForTurn(pool, {
      message,
      preferredToolNames: getPersona(personaId)?.tools ?? [],
    });
    const names = selected.tools.map(t => t.name);

    expect(criticalTools.some(name => names.includes(name)), `${personaId}: ${names.join(', ')}`).toBe(true);
    expect(selected.tools.length).toBeLessThanOrEqual(DEFAULT_TURN_TOOL_LIMIT);
    expect(selected.schemaChars).toBeLessThanOrEqual(DEFAULT_TURN_SCHEMA_CHAR_LIMIT);
  });

  it('refreshes cached ranking metadata when a tool definition changes', () => {
    const select = (
      tool: ToolDefinition,
      message = 'Fix the failing TypeScript test',
    ) => (
      selectToolsForTurn([tool], { message }).tools
    );
    const nameTool = selectorTool('dynamic_adapter', 'Forecast the weather.');
    expect(select(nameTool)).toEqual([]);
    nameTool.name = 'typescript_fix_helper';
    expect(select(nameTool, 'Use typescript_fix_helper')).toEqual([nameTool]);

    const descriptionTool = selectorTool('dynamic_adapter', 'Forecast the weather.');
    expect(select(descriptionTool)).toEqual([]);
    descriptionTool.description = 'Diagnose a failing TypeScript test.';
    expect(select(descriptionTool)).toEqual([descriptionTool]);

    const parametersTool = selectorTool('dynamic_adapter', 'Forecast the weather.');
    expect(select(parametersTool)).toEqual([]);
    parametersTool.parameters = {
      type: 'object',
      properties: {
        diagnostic: { type: 'string', description: 'TypeScript diagnostic' },
      },
    };
    expect(select(parametersTool)).toEqual([parametersTool]);

    const nestedParametersTool = selectorTool('dynamic_adapter', 'Forecast the weather.');
    expect(select(nestedParametersTool)).toEqual([]);
    const properties = nestedParametersTool.parameters.properties as Record<string, unknown>;
    properties.diagnostic = { type: 'string', description: 'TypeScript diagnostic' };
    expect(select(nestedParametersTool)).toEqual([nestedParametersTool]);
  });

  it('keeps the schema cap exact after an in-place parameter mutation', () => {
    const tool = selectorTool('read_file', 'Read a workspace file.');
    expect(selectToolsForTurn([tool], {
      message: 'Read the workspace file',
    }).tools).toEqual([tool]);

    tool.parameters.properties = {
      payload: {
        type: 'string',
        description: 'x'.repeat(DEFAULT_TURN_SCHEMA_CHAR_LIMIT),
      },
    };
    const selected = selectToolsForTurn([tool], {
      message: 'Read the workspace file',
    });

    expect(selected.tools).toEqual([]);
    expect(selected.schemaChars).toBe(2);
  });

  it('selects from a stable 78-tool pool within a 10ms p95 budget', () => {
    const messages = [
      'Fix the failing TypeScript test and inspect the git diff',
      'Research the latest benchmark and cite sources',
    ];
    for (const message of messages) {
      const warm = selectToolsForTurn(pool, {
        message,
        recentToolNames: ['read_file', 'search_files', 'git_diff'],
      });
      expect(warm.tools.length).toBeGreaterThan(0);
      expect(warm.tools.length).toBeLessThanOrEqual(DEFAULT_TURN_TOOL_LIMIT);
      expect(warm.schemaChars).toBeLessThanOrEqual(DEFAULT_TURN_SCHEMA_CHAR_LIMIT);
    }

    const durations: number[] = [];
    for (let i = 0; i < 120; i += 1) {
      const started = performance.now();
      const selected = selectToolsForTurn(pool, {
        message: messages[i % messages.length],
        recentToolNames: ['read_file', 'search_files', 'git_diff'],
      });
      durations.push(performance.now() - started);
      expect(selected.tools.length).toBeGreaterThan(0);
      expect(selected.tools.length).toBeLessThanOrEqual(DEFAULT_TURN_TOOL_LIMIT);
      expect(selected.schemaChars).toBeLessThanOrEqual(DEFAULT_TURN_SCHEMA_CHAR_LIMIT);
    }
    durations.sort((a, b) => a - b);
    const p95 = durations[Math.floor(durations.length * 0.95)] ?? Infinity;

    expect(p95).toBeLessThan(10);
  });
});
