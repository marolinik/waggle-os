import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TURN_SCHEMA_CHAR_LIMIT,
  DEFAULT_TURN_TOOL_LIMIT,
  filterAvailableTools,
  filterToolsForContext,
  measureOpenAiToolSchemaChars,
  selectToolsForTurn,
} from '../src/tool-filter.js';
import type { ToolDefinition } from '../src/tools.js';

function makeTool(name: string): ToolDefinition {
  return {
    name,
    description: `${name} tool`,
    parameters: {},
    execute: async () => ({ result: 'ok' }),
  };
}

const ALL_TOOLS: ToolDefinition[] = [
  // code tools
  makeTool('bash'),
  makeTool('read_file'),
  makeTool('write_file'),
  makeTool('edit_file'),
  makeTool('search_files'),
  makeTool('search_content'),
  makeTool('git_status'),
  makeTool('git_diff'),
  makeTool('git_log'),
  makeTool('git_commit'),
  // research tools (non-overlapping with code)
  makeTool('web_search'),
  makeTool('web_fetch'),
  makeTool('search_memory'),
  makeTool('get_identity'),
  makeTool('get_awareness'),
  makeTool('query_knowledge'),
  // other
  makeTool('save_memory'),
  makeTool('custom_tool'),
];

describe('filterToolsForContext', () => {
  it('general context returns all tools', () => {
    const result = filterToolsForContext(ALL_TOOLS, 'general');
    expect(result).toHaveLength(ALL_TOOLS.length);
    expect(result.map(t => t.name)).toEqual(ALL_TOOLS.map(t => t.name));
  });

  it('code context returns only code-related tools', () => {
    const result = filterToolsForContext(ALL_TOOLS, 'code');
    const names = result.map(t => t.name);
    expect(names).toEqual([
      'bash', 'read_file', 'write_file', 'edit_file', 'search_files', 'search_content',
      'git_status', 'git_diff', 'git_log', 'git_commit',
    ]);
  });

  it('research context excludes bash and git tools', () => {
    const result = filterToolsForContext(ALL_TOOLS, 'research');
    const names = result.map(t => t.name);
    expect(names).toEqual([
      'read_file', 'search_files', 'search_content',
      'web_search', 'web_fetch', 'search_memory', 'get_identity', 'get_awareness', 'query_knowledge',
    ]);
    expect(names).not.toContain('bash');
    expect(names).not.toContain('git_status');
    expect(names).not.toContain('git_diff');
    expect(names).not.toContain('git_log');
    expect(names).not.toContain('git_commit');
  });

  it('config.disabled_tools removes specific tools from result', () => {
    const result = filterToolsForContext(ALL_TOOLS, 'code', {
      disabled_tools: ['bash', 'git_commit'],
    });
    const names = result.map(t => t.name);
    expect(names).not.toContain('bash');
    expect(names).not.toContain('git_commit');
    expect(names).toContain('read_file');
    expect(names).toContain('git_status');
  });
});

describe('filterAvailableTools', () => {
  it('includes tools without checkAvailability', () => {
    const tools = [makeTool('bash'), makeTool('web_search')];
    const result = filterAvailableTools(tools);
    expect(result).toHaveLength(2);
  });

  it('includes tools where checkAvailability returns true', () => {
    const tool: ToolDefinition = {
      ...makeTool('browser'),
      checkAvailability: () => true,
    };
    const result = filterAvailableTools([tool]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('browser');
  });

  it('excludes tools where checkAvailability returns false', () => {
    const tool: ToolDefinition = {
      ...makeTool('browser'),
      checkAvailability: () => false,
    };
    const result = filterAvailableTools([tool]);
    expect(result).toHaveLength(0);
  });

  it('excludes tools where checkAvailability throws', () => {
    const tool: ToolDefinition = {
      ...makeTool('broken_tool'),
      checkAvailability: () => { throw new Error('Connection lost'); },
    };
    const result = filterAvailableTools([tool]);
    expect(result).toHaveLength(0);
  });

  it('handles mixed tools correctly', () => {
    const tools: ToolDefinition[] = [
      makeTool('always_on'),
      { ...makeTool('browser'), checkAvailability: () => true },
      { ...makeTool('git'), checkAvailability: () => false },
      { ...makeTool('broken'), checkAvailability: () => { throw new Error(); } },
    ];
    const result = filterAvailableTools(tools);
    const names = result.map(t => t.name);
    expect(names).toEqual(['always_on', 'browser']);
  });

  it('returns empty array when all tools are unavailable', () => {
    const tools: ToolDefinition[] = [
      { ...makeTool('a'), checkAvailability: () => false },
      { ...makeTool('b'), checkAvailability: () => false },
    ];
    expect(filterAvailableTools(tools)).toHaveLength(0);
  });
});

describe('selectToolsForTurn', () => {
  it('measures the exact tool schema shape sent by the agent loop', () => {
    const tools = [makeTool('read_file'), makeTool('run_code')];
    const expected = JSON.stringify(tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: { type: 'object', properties: {}, ...tool.parameters },
      },
    }))).length;

    expect(measureOpenAiToolSchemaChars(tools)).toBe(expected);
  });

  it('never sends all 29 relevant tools and skips a schema that exceeds the budget', () => {
    const candidates = [
      {
        ...makeTool('run_code'),
        description: `Run code tests and inspect this implementation.${' x'.repeat(5_000)}`,
      },
      ...Array.from({ length: 29 }, (_, index) => ({
        ...makeTool(`code_tool_${index}`),
        description: `Run code tests and inspect this implementation.${' x'.repeat(120)}`,
      })),
    ];
    const selected = selectToolsForTurn(candidates, {
      message: 'Run code tests and inspect this implementation',
    });

    expect(selected.tools.map((tool) => tool.name)).not.toContain('run_code');
    expect(selected.tools.length).toBeLessThanOrEqual(DEFAULT_TURN_TOOL_LIMIT);
    expect(selected.tools.length).toBeLessThan(29);
    expect(selected.schemaChars).toBeLessThanOrEqual(DEFAULT_TURN_SCHEMA_CHAR_LIMIT);
    expect(measureOpenAiToolSchemaChars(selected.tools)).toBe(selected.schemaChars);
  });

  it('narrows one explicit file create-and-read-back task to the two required tools', () => {
    const candidates = [
      makeTool('bash'),
      makeTool('search_files'),
      makeTool('search_content'),
      makeTool('read_file'),
      makeTool('run_code'),
      makeTool('lsp_diagnostics'),
      makeTool('git_diff'),
      makeTool('git_status'),
      makeTool('edit_file'),
      makeTool('multi_edit'),
      makeTool('write_file'),
      makeTool('generate_docx'),
      makeTool('generate_pdf'),
      makeTool('search_memory'),
      makeTool('search_skills'),
      makeTool('create_skill'),
      makeTool('spawn_agent'),
    ];
    const selected = selectToolsForTurn(candidates, {
      message: 'Create file named pm-write-read-1788105943.txt in this workspace containing exactly single line QWEN_WRITE_READ_OK. Then verify saved file by reading it and respond with exactly QWEN_WRITE_READ_OK.',
    });

    expect(selected.tools.map(tool => tool.name)).toEqual(['write_file', 'read_file']);
    expect(selected.schemaChars).toBe(measureOpenAiToolSchemaChars(selected.tools));
    expect(selected.omittedCount).toBe(candidates.length - 2);
  });

  it('keeps the document generator available for an explicit regenerate follow-up', () => {
    const candidates = [
      makeTool('generate_docx'),
      makeTool('generate_pdf'),
      makeTool('read_file'),
      makeTool('search_memory'),
    ];
    const selected = selectToolsForTurn(candidates, {
      message: 'Regenerate PM-Launch-Brief.docx with the same one-page launch brief content.',
    });

    expect(selected.tools.map(tool => tool.name)).toContain('generate_docx');

    const bounded = selectToolsForTurn(candidates, {
      message: 'Regenerate PM-Launch-Brief.docx with the same one-page launch brief content so it is refreshed in the workspace Library. Do not create any other file.',
    });
    expect(bounded.tools.map(tool => tool.name)).toContain('generate_docx');
  });

  it.each([
    ['Create Launch-Brief.docx as a polished Word document.', 'generate_docx'],
    ['Create Launch-Brief.pdf as a polished PDF.', 'generate_pdf'],
    ['Create Launch-Scorecard.xlsx as an Excel workbook.', 'generate_xlsx'],
    ['Create Launch-Review.pptx as a PowerPoint presentation.', 'generate_pptx'],
  ])('uses the specialized binary generator instead of text file writers: %s', (message, expectedTool) => {
    const selected = selectToolsForTurn([
      makeTool('generate_docx'),
      makeTool('generate_pdf'),
      makeTool('generate_xlsx'),
      makeTool('generate_pptx'),
      makeTool('write_file'),
      makeTool('edit_file'),
      makeTool('multi_edit'),
      makeTool('read_file'),
      makeTool('search_memory'),
    ], { message, recentToolNames: ['write_file', 'edit_file'] });
    const names = selected.tools.map(tool => tool.name);

    expect(names).toContain(expectedTool);
    expect(names).not.toContain('write_file');
    expect(names).not.toContain('edit_file');
    expect(names).not.toContain('multi_edit');
  });

  it.each([
    'Create two files named first.txt and second.txt containing exactly single line OK. Then verify them by reading them and respond with exactly OK.',
    'Create file named first.txt in this workspace containing exactly single line OK. Then verify second.txt by reading it and respond with exactly OK.',
    'Do not create file named task.txt containing exactly single line OK. Then verify saved file by reading it and respond with exactly OK.',
    '"Create file named task.txt containing exactly single line OK. Then verify saved file by reading it and respond with exactly OK."',
    'Create file named "../escape.txt" containing exactly single line OK. Then verify saved file by reading it and respond with exactly OK.',
    'Create file named "CON.txt" containing exactly single line OK. Then verify saved file by reading it and respond with exactly OK.',
    'Create file named "task.txt " containing exactly single line OK. Then verify saved file by reading it and respond with exactly OK.',
    'Create file named "COM¹.txt" containing exactly single line OK. Then verify saved file by reading it and respond with exactly OK.',
    'Create file named "LPT²" containing exactly single line OK. Then verify saved file by reading it and respond with exactly OK.',
    'Create file named "CONIN$" containing exactly single line OK. Then verify saved file by reading it and respond with exactly OK.',
    'Create file named "CONOUT$" containing exactly single line OK. Then verify saved file by reading it and respond with exactly OK.',
    `Create file named "${'a'.repeat(241)}" containing exactly single line OK. Then verify saved file by reading it and respond with exactly OK.`,
    'Create file named task.txt containing exactly single line OK. Then verify saved file by reading it and respond with exactly DIFFERENT.',
  ])('does not apply the bounded round-trip subset to an ambiguous or unsafe request: %s', (message) => {
    const selected = selectToolsForTurn([
      makeTool('write_file'),
      makeTool('read_file'),
      makeTool('bash'),
      makeTool('run_code'),
      makeTool('generate_docx'),
      makeTool('edit_file'),
    ], { message });

    expect(selected.tools.map(tool => tool.name)).not.toEqual(['write_file', 'read_file']);
  });

  it.each([
    [
      'Create file named task.txt in this workspace containing exactly single line OK. Then run tests.',
      'run_code',
    ],
    [
      'Create file named report.docx in this workspace containing exactly single line OK. Then verify saved file by reading it and respond with exactly OK.',
      'generate_docx',
    ],
    [
      'Edit existing file named task.txt to contain exactly single line OK. Then verify saved file by reading it and respond with exactly OK.',
      'edit_file',
    ],
  ])('retains the required broader workflow for: %s', (message, requiredTool) => {
    const selected = selectToolsForTurn([
      makeTool('write_file'),
      makeTool('read_file'),
      makeTool('run_code'),
      makeTool('generate_docx'),
      makeTool('edit_file'),
    ], { message });

    expect(selected.tools.map(tool => tool.name)).toContain(requiredTool);
  });

  it('fails closed when the bounded round-trip tools or budget are unavailable', () => {
    const message = 'Create file named task.txt containing exactly single line OK. Then verify saved file by reading it and respond with exactly OK.';
    const expectClosed = (result: ReturnType<typeof selectToolsForTurn>, eligibleCount: number) => {
      expect(result).toEqual({ tools: [], schemaChars: 2, omittedCount: eligibleCount });
    };

    expectClosed(selectToolsForTurn([makeTool('write_file')], { message }), 1);
    expectClosed(selectToolsForTurn([makeTool('read_file')], { message }), 1);
    expectClosed(selectToolsForTurn([makeTool('write_file'), makeTool('read_file')], {
      message,
      maxTools: 1,
    }), 2);
    expectClosed(selectToolsForTurn([makeTool('write_file'), makeTool('read_file')], {
      message,
      maxSchemaChars: 2,
    }), 2);
    const withUnrelatedMandatory = selectToolsForTurn([
      makeTool('write_file'),
      makeTool('read_file'),
      makeTool('create_skill'),
    ], {
      message,
      mandatoryToolNames: ['create_skill'],
    });
    expect(withUnrelatedMandatory.tools.map(tool => tool.name)).toContain('create_skill');
  });

  it('offers a bounded non-external fallback only when delegated execution requests it', () => {
    const candidates = [
      makeTool('read_file'),
      makeTool('write_file'),
      makeTool('mcp_unknown_action'),
    ];
    const conversational = selectToolsForTurn(candidates, { message: 'Handle it' });
    const delegated = selectToolsForTurn(candidates, {
      message: 'Handle it',
      fallbackToEligible: true,
      externalToolNames: ['mcp_unknown_action'],
    });

    expect(conversational.tools).toEqual([]);
    expect(delegated.tools.map((tool) => tool.name)).toEqual(['read_file', 'write_file']);
    expect(delegated.schemaChars).toBeLessThanOrEqual(DEFAULT_TURN_SCHEMA_CHAR_LIMIT);
  });

  it('selects workspace discovery tools for an explicit repository exploration request', () => {
    const candidates = [
      makeTool('bash'),
      makeTool('read_file'),
      makeTool('search_files'),
      makeTool('search_content'),
      makeTool('git_status'),
      makeTool('git_log'),
      makeTool('run_code'),
      makeTool('edit_file'),
      makeTool('write_file'),
    ];
    const selected = selectToolsForTurn(candidates, {
      message: 'Explore the repo and lets see what it actually does',
    });

    expect(selected.tools.map((tool) => tool.name)).toEqual([
      'search_files',
      'search_content',
      'read_file',
      'git_status',
      'git_log',
    ]);
  });

  it.each([
    'Explore the code and tell me what it does',
    'Explore this TypeScript project',
    'Explore the repository code and explain what it does',
    'Inspect the repo code without changing anything',
    'Explore the test code and explain its purpose',
    'Please, explore the repo',
    'Could we explore the repo?',
  ])('keeps repository exploration wording read-only: %s', (message) => {
    const candidates = [
      makeTool('bash'),
      makeTool('read_file'),
      makeTool('search_files'),
      makeTool('search_content'),
      makeTool('git_status'),
      makeTool('git_log'),
      makeTool('git_diff'),
      makeTool('lsp_diagnostics'),
      makeTool('run_code'),
      makeTool('edit_file'),
      makeTool('multi_edit'),
      makeTool('write_file'),
    ];
    const selected = selectToolsForTurn(candidates, { message });

    expect(selected.tools.map((tool) => tool.name)).toEqual([
      'search_files',
      'search_content',
      'read_file',
      'git_status',
      'git_log',
    ]);
  });

  it('preserves explicit read-only code-diff diagnostics outside repository exploration', () => {
    const selected = selectToolsForTurn([
      makeTool('read_file'),
      makeTool('git_diff'),
      makeTool('lsp_diagnostics'),
    ], {
      message: 'Inspect the code diff',
    });

    expect(selected.tools.map((tool) => tool.name)).toContain('git_diff');
  });

  it.each([
    'Create a project plan',
    'Create a workspace schedule',
  ])('does not attach repository discovery tools to unrelated work: %s', (message) => {
    const selected = selectToolsForTurn([
      makeTool('search_files'),
      makeTool('search_content'),
      makeTool('read_file'),
      makeTool('git_status'),
      makeTool('git_log'),
      makeTool('create_plan'),
      makeTool('create_schedule'),
    ], { message });

    expect(selected.tools.map((tool) => tool.name)).not.toEqual(expect.arrayContaining([
      'search_files',
      'search_content',
      'read_file',
      'git_status',
      'git_log',
    ]));
  });

  it('does not widen a fresh repository exploration from an older mutation turn', () => {
    const candidates = [
      makeTool('bash'),
      makeTool('read_file'),
      makeTool('search_files'),
      makeTool('search_content'),
      makeTool('git_status'),
      makeTool('git_log'),
      makeTool('run_code'),
      makeTool('edit_file'),
      makeTool('write_file'),
    ];
    const selected = selectToolsForTurn(candidates, {
      message: 'Explore the repo and lets see what it actually does',
      recentMessages: [
        { role: 'user', content: 'Use bash to edit and write files' },
        { role: 'assistant', content: 'The previous mutation turn completed.' },
      ],
      recentToolNames: ['bash', 'edit_file', 'write_file', 'run_code'],
    });

    expect(selected.tools.map((tool) => tool.name)).toEqual([
      'search_files',
      'search_content',
      'read_file',
      'git_status',
      'git_log',
    ]);
  });

  it.each([
    'try now',
    'Please try now',
    'Can you try now?',
    'try again',
    'retry',
    'same again',
  ])('treats a directive-position continuation as the failed workspace-tool attempt: %s', (message) => {
    const candidates = [
      makeTool('bash'),
      makeTool('read_file'),
      makeTool('search_files'),
      makeTool('search_content'),
      makeTool('git_status'),
      makeTool('git_log'),
      makeTool('run_code'),
      makeTool('edit_file'),
      makeTool('write_file'),
    ];
    const selected = selectToolsForTurn(candidates, {
      message,
      recentMessages: [
        { role: 'user', content: 'Explore the repo and lets see what it actually does' },
        { role: 'assistant', content: 'No tools are serialized: no bash, read_file, or search_files.' },
      ],
    });

    expect(selected.tools.map((tool) => tool.name)).toEqual([
      'search_files',
      'search_content',
      'read_file',
      'git_status',
      'git_log',
    ]);
  });

  it('recovers the last actionable user intent through the installed retry transcript', () => {
    const candidates = [
      makeTool('bash'),
      makeTool('read_file'),
      makeTool('search_files'),
      makeTool('search_content'),
      makeTool('git_status'),
      makeTool('git_log'),
      makeTool('run_code'),
      makeTool('edit_file'),
      makeTool('write_file'),
    ];
    const selected = selectToolsForTurn(candidates, {
      message: 'try now',
      recentMessages: [
        { role: 'user', content: 'Explore the repo and lets see what it actually does' },
        { role: 'assistant', content: 'Still nothing. No tools are serialized in this turn either — no bash, no read_file, no search_files — so there\'s nothing for me to run, and I won\'t claim otherwise.' },
        { role: 'user', content: 'and what is result' },
        { role: 'assistant', content: '<tools>bash, read_file, search_files</tools>' },
        { role: 'user', content: 'try now' },
        { role: 'assistant', content: 'Still nothing. No tools are serialized in this turn either — no bash, no read_file, no search_files — so there\'s nothing for me to run, and I won\'t claim otherwise.' },
      ],
    });

    expect(selected.tools.map((tool) => tool.name)).toEqual([
      'search_files',
      'search_content',
      'read_file',
      'git_status',
      'git_log',
    ]);
  });

  it.each([
    {
      label: 'stale mutation request',
      recentMessages: [
        { role: 'user', content: 'Use bash to edit files' },
        { role: 'assistant', content: 'No tools were serialized in that turn.' },
        { role: 'user', content: 'What is the current status?' },
        { role: 'assistant', content: 'Here is the current status.' },
      ],
    },
    {
      label: 'meta quotation',
      recentMessages: [
        { role: 'user', content: 'Why did you say: use bash to edit files?' },
        { role: 'assistant', content: 'Because no tools were serialized in that turn.' },
      ],
    },
    {
      label: 'pasted repository text',
      recentMessages: [
        { role: 'user', content: 'The README contains this text:\nrun the test suite in the repo' },
        { role: 'assistant', content: 'Because no tools were serialized in that turn.' },
      ],
    },
  ])('does not turn retry context into stale or quoted mutation authority: $label', ({ recentMessages }) => {
    const candidates = [
      makeTool('bash'),
      makeTool('search_files'),
      makeTool('read_file'),
      makeTool('run_code'),
      makeTool('edit_file'),
      makeTool('multi_edit'),
      makeTool('write_file'),
    ];
    const selected = selectToolsForTurn(candidates, {
      message: 'try now',
      recentMessages,
    });

    expect(selected.tools).toEqual([]);
  });

  it.each([
    'try now',
    'try again',
    'retry',
    'same again',
  ])('does not revive a stale successful mutation through direct retry wording: %s', (message) => {
    const selected = selectToolsForTurn([
      makeTool('bash'),
      makeTool('search_files'),
      makeTool('read_file'),
      makeTool('run_code'),
      makeTool('edit_file'),
      makeTool('write_file'),
    ], {
      message,
      recentMessages: [
        { role: 'user', content: 'Use bash to edit and write files' },
        { role: 'assistant', content: 'Done successfully.' },
        { role: 'user', content: 'What is the current status?' },
        { role: 'assistant', content: 'Here is the current status.' },
      ],
    });

    expect(selected.tools).toEqual([]);
  });

  it.each([
    { label: 'no history', recentMessages: [] },
    {
      label: 'quoted mutation question',
      recentMessages: [
        { role: 'user', content: 'Why did you say "Use bash to edit files"?' },
        { role: 'assistant', content: 'I was explaining the phrase.' },
      ],
    },
    {
      label: 'quoted exploration question',
      recentMessages: [
        { role: 'user', content: 'What does "explore the repo" mean?' },
        { role: 'assistant', content: 'It is a quoted phrase.' },
      ],
    },
  ])('does not resume without a prior actionable user directive: $label', ({ recentMessages }) => {
    const candidates = [
      makeTool('bash'),
      makeTool('read_file'),
      makeTool('search_files'),
      makeTool('search_content'),
      makeTool('git_status'),
      makeTool('git_log'),
      makeTool('edit_file'),
    ];
    const selected = selectToolsForTurn(candidates, {
      message: 'try now',
      recentMessages,
    });

    expect(selected.tools).toEqual([]);
  });

  it.each([
    'What does "try now" mean?',
    'What does "retry" mean?',
    'What does "try again" mean?',
  ])('does not treat a quoted continuation phrase as a tool directive: %s', (message) => {
    const candidates = [makeTool('read_file'), makeTool('search_files')];
    const selected = selectToolsForTurn(candidates, {
      message,
      recentMessages: [
        { role: 'user', content: 'Explore the repo and lets see what it actually does' },
      ],
    });

    expect(selected.tools).toEqual([]);
  });

  it('does not serialize workspace tools when repository exploration is negated', () => {
    const candidates = [
      makeTool('bash'),
      makeTool('read_file'),
      makeTool('search_files'),
    ];
    const selected = selectToolsForTurn(candidates, {
      message: "Don't explore the repo; explain the limitation instead.",
    });

    expect(selected.tools).toEqual([]);
  });

  it('does not resume recent workspace tools when try now is negated', () => {
    const candidates = [
      makeTool('bash'),
      makeTool('read_file'),
      makeTool('search_files'),
    ];
    const selected = selectToolsForTurn(candidates, {
      message: "Don't try now; just explain what is blocked.",
      fallbackToEligible: true,
      recentMessages: [
        { role: 'user', content: 'Explore the repo and lets see what it actually does' },
        { role: 'assistant', content: 'No tools are serialized: no bash, read_file, or search_files.' },
      ],
    });

    expect(selected.tools).toEqual([]);
  });

  it.each([
    'We should not try now; explain what is blocked.',
    'I am not ready to try now; explain what is blocked.',
    'We cannot try now; explain what is blocked.',
    'Do not retry; explain what is blocked.',
  ])('does not resume recent workspace tools through modal negation: %s', (message) => {
    const candidates = [
      makeTool('bash'),
      makeTool('read_file'),
      makeTool('search_files'),
    ];
    const selected = selectToolsForTurn(candidates, {
      message,
      fallbackToEligible: true,
      recentMessages: [
        { role: 'user', content: 'Explore the repo and lets see what it actually does' },
        { role: 'assistant', content: 'No tools are serialized: no bash, read_file, or search_files.' },
      ],
    });

    expect(selected.tools).toEqual([]);
  });

  it('resumes only the positive repository clause after a negated continuation', () => {
    const candidates = [
      makeTool('bash'),
      makeTool('read_file'),
      makeTool('search_files'),
      makeTool('search_content'),
      makeTool('git_status'),
      makeTool('git_log'),
      makeTool('run_code'),
      makeTool('edit_file'),
      makeTool('write_file'),
    ];
    const selected = selectToolsForTurn(candidates, {
      message: 'I cannot try now, but inspect the repo',
    });

    expect(selected.tools.map((tool) => tool.name)).toEqual([
      'search_files',
      'search_content',
      'read_file',
      'git_status',
      'git_log',
    ]);
  });

  it.each([
    'Explore the repo; there is no need to run the test suite.',
    "Explore the repo; I don't want to run the test suite.",
    'Explore the repo; you are not allowed to run the test suite.',
    "Explore the repo; we aren't going to run the test suite.",
    "Explore the repo; I don't need to run the test suite.",
    'Explore the repo because I have no intention to run the test suite.',
    'Explore the repo; I decided not to run the test suite.',
    'Explore the repo; I refuse to run the test suite.',
    "Explore the repo; we don't plan to run the test suite.",
    'Explore the repo; the goal is not to run the test suite.',
    'Explore the repo; run no tests.',
    'Explore the repo; run zero tests.',
    'Explore the repo; run nothing.',
    'Explore the repo; edit no files.',
    'Explore the repo; write nothing.',
    'Explore the repo; commit nothing.',
    'Explore the repo; run none of the tests.',
    'Explore the repo; edit none of the files.',
    'Explore the repo; run 0 tests.',
    'Explore the repo; edit 0 files.',
    'Explore the repo; run not one test.',
    'Explore the repo; write not a single file.',
    'Explore the repo; run neither unit nor integration tests.',
  ])('keeps repository exploration read-only across richer execution negation: %s', (message) => {
    const candidates = [
      makeTool('bash'),
      makeTool('read_file'),
      makeTool('search_files'),
      makeTool('search_content'),
      makeTool('git_status'),
      makeTool('git_log'),
      makeTool('run_code'),
      makeTool('edit_file'),
      makeTool('write_file'),
    ];
    const selected = selectToolsForTurn(candidates, { message });

    expect(selected.tools.map((tool) => tool.name)).toEqual([
      'search_files',
      'search_content',
      'read_file',
      'git_status',
      'git_log',
    ]);
  });

  it.each([
    'Fix no tools serialized error in the repo',
    'Debug no output from the server',
    'Implement zero trust architecture in the repo',
    'Create zero trust policy file',
  ])('preserves legitimate no-error and zero-trust action wording: %s', (message) => {
    const selected = selectToolsForTurn([
      makeTool('bash'),
      makeTool('search_files'),
      makeTool('read_file'),
      makeTool('run_code'),
      makeTool('edit_file'),
      makeTool('write_file'),
    ], { message });

    expect(selected.tools.length).toBeGreaterThan(0);
  });

  it('does not turn quoted repository text in the current request into execution authority', () => {
    const candidates = [
      makeTool('bash'),
      makeTool('read_file'),
      makeTool('search_files'),
      makeTool('search_content'),
      makeTool('git_status'),
      makeTool('git_log'),
      makeTool('run_code'),
      makeTool('edit_file'),
      makeTool('write_file'),
    ];
    const messages = [
      'Explore the repo. Why does README say: run tests?',
      'README says: Explore the repo to run tests',
      'The README contains:\nExplore the repo to run tests',
      'Explore the repo. Why does README say: Explore the repo to run tests?',
      'Explore the repo. README says: use bash to edit files',
      'Explore the repo. According to README, run tests is the documented command.',
      'Explore the repo. In the docs, run tests appears as an example.',
      'Explore the repo. The phrase, edit files, appears in README.',
      'What is the difference between build and run tests?',
      'Why does README mention build and run tests?',
      'The docs mention edit and write files as capabilities.',
      'README says then run tests is the next heading.',
    ];

    for (const message of messages) {
      const selected = selectToolsForTurn(candidates, { message });
      expect(selected.tools.map((tool) => tool.name)).not.toEqual(expect.arrayContaining([
        'bash',
        'run_code',
        'edit_file',
        'write_file',
      ]));
    }
  });

  it.each([
    'What does "bash" mean?',
    'The assistant wrote: use bash',
    'Pasted error: search_files unavailable',
    'The docs mention run_code',
  ])('does not serialize an exact tool name outside a direct action: %s', (message) => {
    const selected = selectToolsForTurn([
      makeTool('bash'),
      makeTool('search_files'),
      makeTool('run_code'),
    ], { message });

    expect(selected.tools).toEqual([]);
  });

  it.each([
    { message: 'Use bash', expected: 'bash' },
    { message: 'Please call search_files', expected: 'search_files' },
  ])('preserves an exact tool name in a direct action: $message', ({ message, expected }) => {
    const selected = selectToolsForTurn([
      makeTool('bash'),
      makeTool('search_files'),
      makeTool('run_code'),
    ], { message });

    expect(selected.tools.map((tool) => tool.name)).toContain(expected);
  });

  it.each([
    {
      message: 'Do not use saved memory. Delegate a review of current workspace files only.',
      expected: 'spawn_agent',
    },
    {
      message: 'Do not use saved memory. Use orchestrate_workflow to review current workspace files. Correlation: PRIVATE_WORKFLOW_TASK_20260808.',
      expected: 'orchestrate_workflow',
    },
  ])('preserves a direct action after a bounded earlier clause: $message', ({ message, expected }) => {
    const selected = selectToolsForTurn([
      makeTool('spawn_agent'),
      makeTool('orchestrate_workflow'),
      makeTool('bash'),
      makeTool('read_file'),
    ], { message });

    expect(selected.tools.map((tool) => tool.name)).toContain(expected);
  });

  it.each([
    'The assistant wrote. Use bash',
    'The README says. Run tests in the repo',
    'Do not use saved memory. The assistant wrote. Use bash',
    'Do not use saved memory. The README says. Run tests in the repo',
    '... Use bash',
    '? Run tests in the repo',
  ])('does not treat a later attributed sentence as direct authority: %s', (message) => {
    const selected = selectToolsForTurn([
      makeTool('bash'),
      makeTool('run_code'),
      makeTool('read_file'),
    ], { message });

    expect(selected.tools).toEqual([]);
  });

  it.each([
    'try now',
    'try again',
    'retry',
  ])('allows an adjacent failed mutation retry with direct user authority: %s', (message) => {
    const selected = selectToolsForTurn([
      makeTool('bash'),
      makeTool('search_files'),
      makeTool('read_file'),
      makeTool('edit_file'),
      makeTool('write_file'),
    ], {
      message,
      recentMessages: [
        { role: 'user', content: 'Use bash to edit files' },
        { role: 'assistant', content: 'No tools were serialized in that turn.' },
      ],
    });

    expect(selected.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      'bash',
      'edit_file',
    ]));
  });

  it('keeps execution tools for an explicit repository test request', () => {
    const candidates = [
      makeTool('bash'),
      makeTool('read_file'),
      makeTool('search_files'),
      makeTool('run_code'),
      makeTool('edit_file'),
      makeTool('write_file'),
    ];
    const selected = selectToolsForTurn(candidates, {
      message: 'Run tests in the repo',
    });
    const explicitBash = selectToolsForTurn(candidates, {
      message: 'Use bash to run tests in the repo',
    });
    const exploratoryExecution = selectToolsForTurn(candidates, {
      message: 'Explore the repo and run tests',
    });
    const infinitiveExecution = selectToolsForTurn(candidates, {
      message: 'Explore the repo to run tests',
    });
    const commaExecution = selectToolsForTurn(candidates, {
      message: 'Explore the repo, run tests',
    });
    const boundedExecution = selectToolsForTurn(candidates, {
      message: 'Explore the repo; run no more than 2 tests',
    });

    expect(selected.tools.map((tool) => tool.name)).toContain('run_code');
    expect(explicitBash.tools.map((tool) => tool.name)).toContain('bash');
    expect(exploratoryExecution.tools.map((tool) => tool.name)).toContain('run_code');
    expect(infinitiveExecution.tools.map((tool) => tool.name)).toContain('run_code');
    expect(commaExecution.tools.map((tool) => tool.name)).toContain('run_code');
    expect(boundedExecution.tools.map((tool) => tool.name)).toContain('run_code');
  });

  it.each([
    'Explore the repo and then run tests',
    'Explore the repo; then run tests',
    'Explore the repo. Then run tests',
    'Go ahead and run tests',
    'Please go ahead and run tests',
    'I would like you to run tests',
    'Would you be able to run tests?',
    'Can you help me run tests?',
    'Could you take a look at the repo and run tests?',
  ])('keeps common anchored direct execution wording: %s', (message) => {
    const selected = selectToolsForTurn([
      makeTool('bash'),
      makeTool('search_files'),
      makeTool('read_file'),
      makeTool('run_code'),
      makeTool('edit_file'),
      makeTool('write_file'),
    ], { message });

    expect(selected.tools.map((tool) => tool.name)).toContain('run_code');
  });

  it('keeps a semantically retrieved external tool without name-token overlap', () => {
    const semanticallyMatched = {
      ...makeTool('mcp_x7f9'),
      description: 'Publish an incident bulletin to a team channel',
    };
    const selected = selectToolsForTurn([semanticallyMatched], {
      message: 'Send teammates an outage update',
      externalToolNames: [semanticallyMatched.name],
      retrievedToolNames: [semanticallyMatched.name, 'denied_tool_not_in_eligible_pool'],
    });

    expect(selected.tools.map(tool => tool.name)).toEqual([semanticallyMatched.name]);
    expect(selected.tools.map(tool => tool.name)).not.toContain('denied_tool_not_in_eligible_pool');
    expect(selected.tools.length).toBeLessThanOrEqual(DEFAULT_TURN_TOOL_LIMIT);
    expect(selected.schemaChars).toBeLessThanOrEqual(DEFAULT_TURN_SCHEMA_CHAR_LIMIT);
  });

  it('does not make casual chat tool-bearing from a weak semantic match', () => {
    const external = makeTool('mcp_x7f9');
    const selected = selectToolsForTurn([external], {
      message: 'Thanks for the help',
      externalToolNames: [external.name],
      retrievedToolNames: [external.name],
    });

    expect(selected.tools).toEqual([]);
  });
});
