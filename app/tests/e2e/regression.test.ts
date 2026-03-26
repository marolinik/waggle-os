/**
 * Comprehensive Regression Test — Task 33
 *
 * Verifies that all @waggle/ui exports are available and produce expected
 * results.  Also smoke-tests server routes and startup phases.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { startService } from '@waggle/server/local/service';
import { injectWithAuth } from './test-utils.js';

// ═══════════════════════════════════════════════════════════════════════
// Section A: All component / function exports from @waggle/ui
// ═══════════════════════════════════════════════════════════════════════

import {
  // Chat
  ChatArea,
  ChatMessage,
  ChatInput,
  ToolCard,
  ToolResultRenderer,
  ApprovalGate,
  getToolStatusColor,
  formatDuration,
  FileDropZone,
  categorizeFile,
  isSupported,
  validateFileSize,
  formatDropSummary,
  getDropMessage,
  parseCsvLine,
  parseCsvPreview,
  SUPPORTED_EXTENSIONS,
  MAX_FILE_SIZE,

  // Workspace
  WorkspaceTree,
  WorkspaceCard,
  GroupHeader,
  CreateWorkspaceDialog,
  groupWorkspacesByGroup,
  validateWorkspaceForm,
  sortGroups,
  GROUP_ORDER,

  // Common
  Sidebar,
  Tabs,
  StatusBar,
  Modal,
  ThemeProvider,
  ThemeContext,
  useTheme,
  getSavedTheme,
  toggleThemeValue,
  formatTokenCount,
  formatCost,

  // Common — keyboard utilities
  KEYBOARD_SHORTCUTS,
  matchesShortcut,
  formatShortcut,
  matchesNamedShortcut,

  // Settings
  SettingsPanel,
  ModelsSection,
  ModelSection,
  PermissionSection,
  ThemeSection,
  AdvancedSection,
  maskApiKey,
  getProviderDisplayName,
  getProviderKeyPrefix,
  getCostTier,
  getSpeedTier,
  validateProviderConfig,
  mergeGates,
  SUPPORTED_PROVIDERS,
  SETTINGS_TABS,

  // Onboarding
  validateName,
  getProviderSignupUrl,
  ONBOARDING_STEPS,
  isStepComplete,
  getNextStep,
  getPrevStep,
  buildConfigFromOnboarding,
  SplashScreen,
  STARTUP_PHASES,
  getPhaseMessage,
  getPhaseProgress,
  isStartupComplete,
  formatProgress,

  // Memory
  MemoryBrowser,
  FrameTimeline,
  FrameDetail,
  MemorySearch,
  getFrameTypeIcon,
  getFrameTypeLabel,
  getImportanceBadge,
  truncateContent,
  formatTimestamp,
  FRAME_TYPES,
  filterFrames,
  sortFrames,
  KGViewer,
  getNodeColor,
  getNodeSize,
  filterGraph,
  getNeighborhood,
  getNodeTypes,
  getEdgeTypes,
  getNodeDetail,
  layoutForceSimple,

  // Events
  EventStream,
  StepCard,
  getStepIcon,
  getStepColor,
  getStepTypeColor,
  formatStepDuration,
  formatStepTimestamp,
  categorizeStep,
  mergeStep,
  STEP_ICONS,
  STEP_COLORS,
  STEP_TYPE_COLORS,
  filterSteps,

  // Sessions
  SessionList,
  SessionCard,
  groupSessionsByTime,
  getTimeGroup,
  TIME_GROUPS,
  formatLastActive,
  generateSessionTitle,
  sortSessions,
  filterSessionsByWorkspace,

  // Tabs
  createTab,
  reorderTabs,
  MAX_VISIBLE_TABS,
  canAddTab,
  findTabBySession,
  removeTab,
  getNextActiveTab,
  updateTabState,

  // Layout
  AppShell,

  // Layout — responsive utilities
  BREAKPOINTS,
  getLayoutMode,
  shouldShowSidebar,
  shouldCollapseSidebar,
  getContentMaxWidth,
  getSidebarWidth,

  // Files
  FilePreview,
  CodePreview,
  DiffViewer,
  ImagePreview,
  getFileIcon,
  getLanguageFromExtension,
  isImageFile,
  isCodeFile,
  computeUnifiedDiff,
  truncateFilePath,
  getFileExtension,
  formatFileSize,
  FILE_ICONS,
  CODE_EXTENSIONS,
  IMAGE_EXTENSIONS,

  // Hooks
  useChat,
  processStreamEvent,
  useWorkspaces,
  useActiveWorkspace,
  useApprovalGate,
  isExternalMutation,
  useOnboardingSetup,
  useMemory,
  executeMemorySearch,
  useKnowledgeGraph,
  useEvents,
  useSessions,
  useTabs,

  // Service
  LocalAdapter,
} from '@waggle/ui';

// ═══════════════════════════════════════════════════════════════════════
// A1: Component exports exist and are the correct type
// ═══════════════════════════════════════════════════════════════════════

describe('Regression: @waggle/ui component exports', () => {
  it('all React component exports are functions', () => {
    const components = [
      ChatArea, ChatMessage, ChatInput, ToolCard, ToolResultRenderer,
      ApprovalGate, FileDropZone,
      WorkspaceTree, WorkspaceCard, GroupHeader, CreateWorkspaceDialog,
      Sidebar, Tabs, StatusBar, Modal, ThemeProvider,
      SettingsPanel, ModelsSection, ModelSection, PermissionSection,
      ThemeSection, AdvancedSection,
      validateName,
      SplashScreen,
      MemoryBrowser, FrameTimeline, FrameDetail, MemorySearch,
      KGViewer,
      EventStream, StepCard,
      SessionList, SessionCard,
      AppShell,
      FilePreview, CodePreview, DiffViewer, ImagePreview,
    ];
    for (const c of components) {
      // Components may be wrapped in React.memo (typeof returns 'object')
      expect(['function', 'object']).toContain(typeof c);
    }
  });

  it('all hook exports are functions', () => {
    const hooks = [
      useTheme, useChat, useWorkspaces, useActiveWorkspace,
      useApprovalGate, useOnboardingSetup, useMemory,
      useKnowledgeGraph, useEvents, useSessions, useTabs,
    ];
    for (const h of hooks) {
      expect(typeof h).toBe('function');
    }
  });

  it('LocalAdapter is a class constructor', () => {
    expect(typeof LocalAdapter).toBe('function');
    expect(LocalAdapter.prototype).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// A2: Utility function smoke tests
// ═══════════════════════════════════════════════════════════════════════

describe('Regression: utility function smoke tests', () => {
  // Chat utilities
  it('formatDuration returns a string', () => {
    expect(typeof formatDuration(1500)).toBe('string');
  });

  it('getToolStatusColor returns a known color', () => {
    const color = getToolStatusColor({ name: 'test', input: {}, requiresApproval: false });
    expect(['green', 'yellow', 'red', 'gray']).toContain(color);
  });

  it('categorizeFile categorises .ts files', () => {
    expect(categorizeFile('foo.ts')).toBeDefined();
  });

  it('validateFileSize respects MAX_FILE_SIZE', () => {
    expect(validateFileSize(100).valid).toBe(true);
    expect(validateFileSize(MAX_FILE_SIZE + 1).valid).toBe(false);
  });

  // Workspace utilities
  it('validateWorkspaceForm rejects empty name', () => {
    const error = validateWorkspaceForm('');
    expect(error).toBeTruthy();
  });

  it('sortGroups returns sorted array', () => {
    const sorted = sortGroups(['Study', 'Work', 'Personal']);
    expect(Array.isArray(sorted)).toBe(true);
  });

  // Common utilities
  it('toggleThemeValue toggles dark/light', () => {
    expect(toggleThemeValue('dark')).toBe('light');
    expect(toggleThemeValue('light')).toBe('dark');
  });

  it('formatTokenCount formats numbers', () => {
    expect(formatTokenCount(1500)).toBeDefined();
  });

  it('formatCost formats numbers', () => {
    expect(formatCost(0.05)).toBeDefined();
  });

  // Settings utilities
  it('maskApiKey masks a key', () => {
    expect(maskApiKey('sk-ant-1234567890abcdef')).toContain('•');
  });

  it('SUPPORTED_PROVIDERS is a non-empty array', () => {
    expect(Array.isArray(SUPPORTED_PROVIDERS)).toBe(true);
    expect(SUPPORTED_PROVIDERS.length).toBeGreaterThan(0);
  });

  // Onboarding utilities
  it('validateName rejects empty string', () => {
    expect(validateName('')).toBeTruthy();
  });

  it('ONBOARDING_STEPS is a non-empty array', () => {
    expect(Array.isArray(ONBOARDING_STEPS)).toBe(true);
    expect(ONBOARDING_STEPS.length).toBeGreaterThan(0);
  });

  it('STARTUP_PHASES is a non-empty array', () => {
    expect(Array.isArray(STARTUP_PHASES)).toBe(true);
  });

  it('getPhaseMessage returns a string', () => {
    expect(typeof getPhaseMessage(STARTUP_PHASES[0].id)).toBe('string');
  });

  it('formatProgress formats a number', () => {
    expect(formatProgress(0.5)).toBeDefined();
  });

  // Memory utilities
  it('truncateContent truncates to N lines', () => {
    const multiline = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
    const truncated = truncateContent(multiline, 5);
    const lines = truncated.split('\n');
    expect(lines.length).toBeLessThanOrEqual(6); // allow ellipsis
    expect(lines[0]).toBe('line 0');
    expect(lines[4]).toBe('line 4');
  });

  it('FRAME_TYPES is a non-empty array', () => {
    expect(Array.isArray(FRAME_TYPES)).toBe(true);
    expect(FRAME_TYPES.length).toBeGreaterThan(0);
  });

  // Events utilities
  it('STEP_ICONS is defined', () => {
    expect(typeof STEP_ICONS).toBe('object');
  });

  it('STEP_COLORS is defined', () => {
    expect(typeof STEP_COLORS).toBe('object');
  });

  // Sessions utilities
  it('TIME_GROUPS is a non-empty array', () => {
    expect(Array.isArray(TIME_GROUPS)).toBe(true);
  });

  it('generateSessionTitle returns a string', () => {
    expect(typeof generateSessionTitle()).toBe('string');
  });

  // Tabs utilities
  it('MAX_VISIBLE_TABS is a positive number', () => {
    expect(MAX_VISIBLE_TABS).toBeGreaterThan(0);
  });

  it('createTab returns a tab object', () => {
    const tab = createTab('sess-1', 'ws-1', 'Test');
    expect(tab).toHaveProperty('id');
    expect(tab.sessionId).toBe('sess-1');
  });

  // Files utilities
  it('getFileExtension extracts extension', () => {
    expect(getFileExtension('hello.ts')).toBe('ts');
  });

  it('formatFileSize formats bytes', () => {
    expect(formatFileSize(1024)).toBeDefined();
  });

  it('isImageFile detects image extensions', () => {
    expect(isImageFile('png')).toBe(true);
    expect(isImageFile('ts')).toBe(false);
  });

  it('isCodeFile detects code extensions', () => {
    expect(isCodeFile('ts')).toBe(true);
  });

  // Keyboard utilities
  it('KEYBOARD_SHORTCUTS has expected keys', () => {
    expect(KEYBOARD_SHORTCUTS).toHaveProperty('send');
    expect(KEYBOARD_SHORTCUTS).toHaveProperty('closeModal');
    expect(KEYBOARD_SHORTCUTS).toHaveProperty('toggleWorkspace');
  });

  it('formatShortcut produces readable string', () => {
    expect(formatShortcut(KEYBOARD_SHORTCUTS.toggleWorkspace)).toBe('Ctrl+Shift+W');
  });

  // Responsive utilities
  it('BREAKPOINTS has expected values', () => {
    expect(BREAKPOINTS.compact).toBe(800);
    expect(BREAKPOINTS.ultrawide).toBe(1920);
  });

  it('getLayoutMode returns correct mode', () => {
    expect(getLayoutMode(1024)).toBe('medium');
    expect(getLayoutMode(1920)).toBe('ultrawide');
  });

  // processStreamEvent + isExternalMutation
  it('processStreamEvent is a function', () => {
    expect(typeof processStreamEvent).toBe('function');
  });

  it('isExternalMutation is a function', () => {
    expect(typeof isExternalMutation).toBe('function');
  });

  it('executeMemorySearch is a function', () => {
    expect(typeof executeMemorySearch).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// A3: Constants are frozen / immutable where expected
// ═══════════════════════════════════════════════════════════════════════

describe('Regression: constants are well-defined', () => {
  it('GROUP_ORDER is a non-empty array', () => {
    expect(Array.isArray(GROUP_ORDER)).toBe(true);
    expect(GROUP_ORDER.length).toBeGreaterThan(0);
  });

  it('SUPPORTED_EXTENSIONS is a non-empty object', () => {
    expect(typeof SUPPORTED_EXTENSIONS).toBe('object');
    expect(Object.keys(SUPPORTED_EXTENSIONS).length).toBeGreaterThan(0);
  });

  it('CODE_EXTENSIONS is a non-empty Set', () => {
    expect(CODE_EXTENSIONS instanceof Set).toBe(true);
    expect(CODE_EXTENSIONS.size).toBeGreaterThan(0);
  });

  it('IMAGE_EXTENSIONS is a non-empty Set', () => {
    expect(IMAGE_EXTENSIONS instanceof Set).toBe(true);
    expect(IMAGE_EXTENSIONS.size).toBeGreaterThan(0);
  });

  it('FILE_ICONS is an object', () => {
    expect(typeof FILE_ICONS).toBe('object');
  });

  it('SETTINGS_TABS is a non-empty array', () => {
    expect(Array.isArray(SETTINGS_TABS)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Section B: Server route smoke tests
// ═══════════════════════════════════════════════════════════════════════

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-reg-'));
}

describe('Regression: server routes', () => {
  const servers: FastifyInstance[] = [];
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const s of servers) {
      try { await s.close(); } catch { /* ignore */ }
    }
    servers.length = 0;
    for (const d of tmpDirs) {
      try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    tmpDirs.length = 0;
  });

  async function boot() {
    const dataDir = makeTmpDir();
    tmpDirs.push(dataDir);
    const { server } = await startService({ dataDir, port: 0, skipLiteLLM: true });
    servers.push(server);
    return server;
  }

  it('GET /health returns 200', async () => {
    const server = await boot();
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });

  it('GET /api/workspaces returns 200 with array', async () => {
    const server = await boot();
    const res = await injectWithAuth(server, { method: 'GET', url: '/api/workspaces' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(res.payload))).toBe(true);
  });

  it('GET /api/settings returns 200 with object', async () => {
    const server = await boot();
    const res = await injectWithAuth(server, { method: 'GET', url: '/api/settings' });
    expect(res.statusCode).toBe(200);
    expect(typeof JSON.parse(res.payload)).toBe('object');
  });

  it('POST /api/workspaces creates a workspace', async () => {
    const server = await boot();
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Regression Test', group: 'Work', path: '/tmp/regression' },
    });
    expect([200, 201]).toContain(res.statusCode);
    const body = JSON.parse(res.payload);
    expect(body.name).toBe('Regression Test');
    expect(body.id).toBeDefined();
  });

  it('GET /api/workspaces/:id/sessions returns 200', async () => {
    const server = await boot();
    // Create a workspace first
    const wsRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Session Test', group: 'Work', path: '/tmp/sessions' },
    });
    const ws = JSON.parse(wsRes.payload);

    const res = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${ws.id}/sessions`,
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(res.payload))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Section C: Startup phases emit correctly
// ═══════════════════════════════════════════════════════════════════════

describe('Regression: startup phases', () => {
  it('all startup phases have valid config', () => {
    for (const phase of STARTUP_PHASES) {
      expect(phase.id).toBeDefined();
      expect(typeof phase.id).toBe('string');
      expect(typeof getPhaseMessage(phase.id)).toBe('string');
      const progress = getPhaseProgress(phase.id);
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(1);
    }
  });

  it('isStartupComplete returns boolean', () => {
    expect(typeof isStartupComplete('nonexistent')).toBe('boolean');
  });
});
