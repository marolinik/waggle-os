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
export { AgentLearning, type LearnedBehavior, type PersonaEffectiveness, type LearningSnapshot } from './agent-learning.js';
export {
  TraceRecorder, truncate as truncateTraceText, scrubSecrets,
  type TraceHandle, type FinalizeOptions as TraceFinalizeOptions,
} from './trace-recorder.js';
export {
  EvalDatasetBuilder, detectSecrets, SECRET_PATTERN_NAMES,
  toJSONL as evalToJSONL, fromJSONL as evalFromJSONL,
  type EvalExample, type EvalExampleMetadata, type DatasetSplit,
  type BuildOptions as EvalBuildOptions, type JudgeVerdict,
} from './eval-dataset.js';
export {
  IterativeGEPA, paretoFront, scoreCandidate, aggregateScores,
  pickWinner, pickSample as pickGepaSample,
  type Candidate as GEPACandidate, type CandidateScore as GEPACandidateScore,
  type IterativeGEPAOptions, type GEPARunResult, type GEPAProgress,
  type ScoreCandidateOptions,
  type MutateArgs, type MutateFn, type MutationStrategy, type EvolutionTarget,
} from './iterative-optimizer.js';
export {
  runGates, DEFAULT_SIZE_LIMITS,
  checkNonEmpty, checkSize, checkGrowth,
  checkBalancedFences, checkNoPlaceholders, checkNoObviousTodos, checkRegression,
  type GateVerdict, type GateResult as EvolutionGateResult, type GateCheckResult,
  type SizeLimits, type GateOptions, type CheckInput as GateCheckInput,
} from './evolution-gates.js';
export {
  EvolveSchema,
  addOutputField, removeField, editFieldDescription,
  changeFieldType, addConstraint, removeConstraint,
  reorderFields, replaceOutputFields,
  schemaComplexity, aggregateSchemaScores, paretoFrontSchema,
  scoreSchemaCandidate, pickSchemaWinner,
  generateStructureMutations, generateOrderMutations, generateRefinementMutations,
  pickSample as pickSchemaSample,
  type Schema, type SchemaField, type FieldType, type FieldConstraint,
  type Mutation as SchemaMutation, type MutationKind as SchemaMutationKind,
  type SchemaCandidate, type SchemaCandidateScore, type SchemaExampleResult,
  type SchemaExecuteFn, type EvolveSchemaOptions, type EvolveSchemaResult,
  type EvolveSchemaProgress,
} from './evolve-schema.js';
export {
  ComposeEvolution, defaultFeedbackFilter, filterJudgeFeedback,
  stripStructuralLines, schemaExecutorFromInstructionRunner,
  type ComposeEvolutionOptions, type ComposeEvolutionResult,
  type ComposeProgress, type FeedbackFilter,
} from './compose-evolution.js';
export {
  EvolutionOrchestrator, eligibleForEvolution, summarizeRuns,
  type EvolutionOrchestratorDeps, type EvolutionOrchestratorOptions,
  type EvolutionAutoTriggerConfig, type OrchestratorRunResult,
  type OrchestratorOutcome, type EvolutionProgress,
  type SchemaBaselineInput,
} from './evolution-orchestrator.js';
export {
  deployPersonaOverride, rollbackPersonaOverride,
  deployBehavioralSpecOverride, rollbackBehavioralSpecOverride,
  loadBehavioralSpecOverrides, applyBehavioralSpecOverrides,
  BEHAVIORAL_SPEC_SECTIONS,
  type DeployResult, type DeployPersonaInput,
  type DeployBehavioralSpecInput, type BehavioralSpecOverride,
  type BehavioralSpecSection,
} from './evolution-deploy.js';
export {
  LLMJudge, DEFAULT_WEIGHTS, DEFAULT_RUBRIC,
  buildPrompt as buildJudgePrompt,
  parseJudgeResponse, computeLengthPenalty,
  type JudgeLLMCall, type JudgeInput, type JudgeScore, type JudgeOptions,
  type ParsedJudgeResponse,
} from './judge.js';
export {
  createAnthropicEvolutionLLM,
  buildJudgeLLMCall, buildGEPAMutateFn, buildSchemaExecuteFn,
  buildReflectiveMutationPrompt, buildSchemaFillPrompt,
  makeRunningJudge,
  retryWithBackoff, wrapWithRetry,
  isRetryableEvolutionError, computeRetryDelay,
  DEFAULT_RETRY_OPTIONS,
  type EvolutionLLM, type CreateAnthropicEvolutionLLMOptions,
  type BuildReflectiveMutationPromptArgs,
  type RetryOptions, type RetryInfo,
} from './evolution-llm-wiring.js';
export {
  createHarnessRun, advancePhase, getCurrentPhaseInstruction,
  canRetry, getRunSummary, harnessEvents,
  type WorkflowHarness, type HarnessPhase, type PhaseGate, type GateResult,
  type PhaseOutput, type HarnessCheckpoint, type HarnessRunState, type PhaseStatus,
  type HarnessPhaseStartEvent, type HarnessPhaseCompleteEvent,
  type HarnessPhaseFailEvent, type HarnessGatePassEvent, type HarnessGateFailEvent,
} from './workflow-harness.js';
export {
  HarnessTraceBridge,
  type HarnessTraceBridgeOptions, type HarnessTraceContext,
  type HarnessTraceContextResolver,
} from './harness-trace-bridge.js';
export {
  BUILTIN_HARNESSES, getHarnessById, matchHarness,
  researchVerifyHarness, codeReviewFixHarness, documentDraftHarness,
} from './builtin-harnesses.js';
export { FeedbackHandler } from './feedback-handler.js';
export { checkResponseQuality, type QualityIssue } from './quality-controller.js';
export { HookRegistry, type HookEvent, type HookContext, type HookResult, type HookActivityEntry, type HookFn } from './hooks.js';
export { loadHooksFromConfig } from './hook-loader.js';
export { Plan, type PlanStep } from './plan.js';
export { createPlanTools } from './plan-tools.js';
export { createGitTools } from './git-tools.js';
export { PermissionManager, READONLY_TOOLS } from './permissions.js';
export { filterToolsForContext, filterAvailableTools, filterOfflineTools, getOfflineCapableToolNames, type ToolContext, type ToolFilterConfig } from './tool-filter.js';
export {
  needsConfirmation, needsConfirmationWithAutonomy, isCriticalNeverAutopass,
  ConfirmationGate, getApprovalClass,
  type ConfirmationGateConfig, type ApprovalClass, type AutonomyLevel,
} from './confirmation.js';
export { createAuditTools } from './audit-tools.js';
export { createDocumentTools } from './document-tools.js';
export { createSpreadsheetTools } from './spreadsheet-tools.js';
export { createPresentationTools } from './presentation-tools.js';
export { createPdfTools } from './pdf-tools.js';
export { createInsightsTools, type InsightsDeps } from './insights-tools.js';
export { createConnectorSearchTools } from './connector-search.js';
export { createCrossWorkspaceTools, type CrossWorkspaceToolDeps } from './cross-workspace-tools.js';
export { extractEntitiesWithLLM, type LLMCallFn as EntityLLMCallFn } from './entity-extractor.js';
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
export {
  BEHAVIORAL_SPEC, COMPACTION_PROMPT, buildActiveBehavioralSpec,
  type BehavioralSpecSectionName,
} from './behavioral-spec.js';
export { FEATURE_FLAGS, isEnabled, type FeatureFlag } from './feature-flags.js';
export { WORKFLOW_TEMPLATES, listWorkflowTemplates, createResearchTeamTemplate, createReviewPairTemplate, createPlanExecuteTemplate, createTicketResolveTemplate, createContentPipelineTemplate } from './workflow-templates.js';
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
export { IterationBudget, type IterationBudgetConfig } from './iteration-budget.js';
export { captureInteraction, getRecentLogs, isWithinBudget, type CaptureInteractionInput } from './optimization-capture.js';
export { routeMessage, type RoutingDecision } from './smart-router.js';
export {
  compressConversation, estimateTokens, needsCompression,
  pruneToolResults, splitProtectedRegions, summarizeMiddle,
  createDefaultCompressionConfig,
  type CompressionConfig, type CompressionResult, type CompressibleMessage,
} from './context-compressor.js';
export {
  CredentialPool, loadCredentialPool, extractStatusCode,
  type CredentialEntry, type CredentialPoolConfig, type PoolStatus, type VaultLike,
} from './credential-pool.js';
export {
  shouldSuggestCapture,
  type CaptureCheckParams, type CaptureResult, type CaptureNotification,
} from './workflow-capture.js';
export {
  deliverCronResult, createDefaultDeliveryPreferences,
  type DeliveryChannel, type DeliveryPreferences, type DeliveryMessage, type DeliveryResult,
  type DeliveryConnector, type DeliveryConnectorRegistry, type InAppEmitter,
} from './cron-delivery-router.js';
export { detectCorrection, detectCorrectionsInHistory, type DetectedCorrection, type CorrectionDurability } from './correction-detector.js';
export { detectContradiction, type ContradictionResult } from './contradiction-detector.js';
export {
  recordCapabilityGap, analyzeAndRecordCorrection, recordWorkflowPattern,
  buildAwarenessSummary, formatAwarenessPrompt, markSummarySurfaced,
  type AwarenessSummary, type CapabilityGapSignal, type CorrectionSignal, type WorkflowPatternSignal,
} from './improvement-detector.js';
