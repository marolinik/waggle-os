export { Orchestrator, type OrchestratorConfig } from './orchestrator.js';
export { createMindTools, createToolUtilizationTracker, formatCombinedResult, type ToolDefinition, type MindToolDeps, type ToolUtilizationTracker, type ConfidenceLevel } from './tools.js';
export { createSystemTools } from './system-tools.js';
export {
  ModelRouter,
  createLiteLLMRouter,
  type ProviderConfig,
  type ProviderEntry,
  type ResolvedModel,
} from './model-router.js';
export {
  openaiChat,
  type ChatMessage,
  type ChatResponse,
} from './providers/openai-compat.js';
export { Workspace, type WorkspaceConfig } from './workspace.js';
export { runAgentLoop, type AgentLoopConfig, type AgentResponse, type AgentMessage } from './agent-loop.js';
export { createTeamTools, type TeamToolDeps } from './team-tools.js';
export { ensureIdentity, type IdentityConfig } from './auto-identity.js';
export { buildSelfAwareness, type AgentCapabilities } from './self-awareness.js';
export { loadSystemPrompt, loadSkills, type LoadedSkill } from './prompt-loader.js';
export { LoopGuard, type LoopGuardConfig } from './loop-guard.js';
export { scanForInjection, type ScanResult } from './injection-scanner.js';
export { CostTracker, DEFAULT_MODEL_PRICING, type ModelPricing, type UsageStats, type UsageEntry } from './cost-tracker.js';
export { extractEntities, type ExtractedEntity } from './entity-extractor.js';
export { CognifyPipeline, type CognifyConfig, type CognifyResult } from './cognify.js';
export { FeedbackHandler } from './feedback-handler.js';
export { checkResponseQuality, type QualityIssue } from './quality-controller.js';
export { HookRegistry, type HookEvent, type HookContext, type HookResult, type HookActivityEntry, type HookFn } from './hooks.js';
export { loadHooksFromConfig } from './hook-loader.js';
export { Plan, type PlanStep } from './plan.js';
export { createPlanTools } from './plan-tools.js';
export { createGitTools } from './git-tools.js';
export { PermissionManager, READONLY_TOOLS } from './permissions.js';
export { filterToolsForContext, filterOfflineTools, getOfflineCapableToolNames, type ToolContext, type ToolFilterConfig } from './tool-filter.js';
export { needsConfirmation, ConfirmationGate, getApprovalClass, type ConfirmationGateConfig, type ApprovalClass } from './confirmation.js';
export { createAuditTools } from './audit-tools.js';
export { createDocumentTools } from './document-tools.js';
export { createSkillTools, type SkillToolsDeps } from './skill-tools.js';
export { SkillRecommender, type SkillRecommendation, type SkillRecommenderDeps } from './skill-recommender.js';
export { createSubAgentTools, ROLE_TOOL_PRESETS, type SubAgentToolsDeps, type SubAgentDef, type SubAgentResult } from './subagent-tools.js';
export { MemoryLinker, type MemoryLink } from './memory-linker.js';
export { CapabilityRouter, type CapabilityRoute, type CapabilitySource, type CapabilityRouterDeps, type ConnectorInfo } from './capability-router.js';
export {
  searchCapabilities, validateInstallCandidate, loadStarterSkillsMeta,
  type CapabilityCandidate, type CapabilitySourceType, type CapabilityAvailability,
  type AcquisitionProposal, type InstallValidation, type SearchCapabilitiesInput,
  type MarketplaceCandidate,
} from './capability-acquisition.js';
export { McpServerInstance, McpRuntime, type McpServerConfig, type McpServerState, type McpToolInfo, type McpProcess, type SpawnFn } from './mcp/mcp-runtime.js';
export { SubagentOrchestrator, type WorkerState, type WorkerStatus, type WorkflowStep, type WorkflowTemplate, type OrchestratorConfig as SubagentOrchestratorConfig } from './subagent-orchestrator.js';
export { WORKFLOW_TEMPLATES, listWorkflowTemplates, createResearchTeamTemplate, createReviewPairTemplate, createPlanExecuteTemplate } from './workflow-templates.js';
export { loadCustomWorkflows, saveCustomWorkflow, deleteCustomWorkflow, listAllWorkflows } from './custom-workflows.js';
export { createWorkflowTools, type WorkflowToolsConfig } from './workflow-tools.js';
export { detectTaskShape, type TaskShape, type TaskShapeType, type TaskShapeSignal, type ComponentPhase } from './task-shape.js';
export {
  composeWorkflow, validateTemplate,
  type WorkflowPlan, type ExecutionMode, type PlanStep as ComposerPlanStep, type ComposerContext, type ValidationError,
} from './workflow-composer.js';
export { CommandRegistry, AGENT_LOOP_REROUTE_PREFIX, type CommandDefinition, type CommandContext } from './commands/command-registry.js';
export { registerWorkflowCommands } from './commands/workflow-commands.js';
export { registerMarketplaceCommands } from './commands/marketplace-commands.js';
export { createCronTools } from './cron-tools.js';
export {
  createKvarkTools, parseSearchResults,
  type KvarkClientLike, type KvarkToolsDeps, type KvarkSearchResponseLike,
  type KvarkAskResponseLike, type KvarkStructuredResult, type KvarkFeedbackResponseLike, type KvarkActionResponseLike,
} from './kvark-tools.js';
export { PERSONAS, getPersona, listPersonas, composePersonaPrompt, setPersonaDataDir, type AgentPersona } from './personas.js';
export { loadCustomPersonas, saveCustomPersona, deleteCustomPersona } from './custom-personas.js';
export { AgentMessageBus, type AgentMessage as BusAgentMessage } from './agent-message-bus.js';
export { createAgentCommsTools } from './agent-comms-tools.js';
export { createCliTools, type CliToolsConfig } from './cli-tools.js';
export { createSearchTools } from './search-tools.js';
export { createBrowserTools, closeBrowser } from './browser-tools.js';
export { createLspTools, stopLsp } from './lsp-tools.js';
export {
  assessTrust, resolveTrustSource, detectPermissions, classifyRisk, deriveApprovalClass, formatTrustSummary,
  type TrustAssessment, type TrustSource, type RiskLevel, type RiskFactor, type PermissionSummary,
  type AssessmentMode, type AssessTrustInput,
} from './trust-model.js';
export { parseSkillFrontmatter, type SkillFrontmatter } from './skill-frontmatter.js';
export { generateSkillMarkdown, type SkillTemplate } from './skill-creator.js';
export { BaseConnector, type WaggleConnector, type ConnectorAction, type ConnectorResult } from './connector-sdk.js';
export { ConnectorRegistry, type AuditLogger } from './connector-registry.js';
export {
  GitHubConnector, SlackConnector, JiraConnector, EmailConnector, GoogleCalendarConnector,
  DiscordConnector, LinearConnector, AsanaConnector, TrelloConnector, MondayConnector,
  NotionConnector, ConfluenceConnector, ObsidianConnector, HubSpotConnector, SalesforceConnector,
  PipedriveConnector, AirtableConnector, GitLabConnector, BitbucketConnector, DropboxConnector,
  PostgresConnector, GmailConnector, GoogleDocsConnector, GoogleDriveConnector, GoogleSheetsConnector,
  ComposioConnector, MSTeamsConnector, OutlookConnector, OneDriveConnector,
  // MOCK: Remove when real OAuth integrations are ready
  MockSlackConnector, MockTeamsConnector, MockDiscordConnector,
} from './connectors/index.js';
export { captureInteraction, getRecentLogs, isWithinBudget, type CaptureInteractionInput } from './optimization-capture.js';
export { detectCorrection, detectCorrectionsInHistory, type DetectedCorrection, type CorrectionDurability } from './correction-detector.js';
export { detectContradiction, type ContradictionResult } from './contradiction-detector.js';
export {
  recordCapabilityGap, analyzeAndRecordCorrection, recordWorkflowPattern,
  buildAwarenessSummary, formatAwarenessPrompt, markSummarySurfaced,
  type AwarenessSummary, type CapabilityGapSignal, type CorrectionSignal, type WorkflowPatternSignal,
} from './improvement-detector.js';
