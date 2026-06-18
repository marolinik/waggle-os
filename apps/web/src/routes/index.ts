/**
 * UX Refactor v2.1 P1a — route wrapper barrel (conversion plan §5.1).
 *
 * One thin wrapper per §1.1 routed surface; each re-hosts Desktop.tsx's prop
 * plumbing and renders the existing screen component with byte-identical
 * props, inside SurfaceBoundary (the Desktop.tsx:556-558 AppErrorBoundary
 * relocation). Stage C registers these under the AppShell layout route:
 *
 *   /home                      HomeRoute
 *   /workspaces/:workspaceId/:tab?  WorkspaceRoute   (bare /workspaces → /home, §9.7)
 *   /memory/:mindScope?        MemoryRoute           (:mindScope reserved for P3/D2)
 *   /artifacts                 ArtifactsRoute
 *   /files                     FilesRoute
 *   /agents                    AgentsRoute
 *   /automations               AutomationsRoute
 *   /skills                    SkillsRoute
 *   /connectors                ConnectorsRoute
 *   /mcps                      McpsRoute
 *   /marketplace               MarketplaceRoute
 *   /launcher                  LauncherRoute
 *   /room                      RoomRoute
 *   /waggle-dance              WaggleDanceRoute
 *   /approvals                 ApprovalsRoute
 *   /team                      TeamRoute
 *   /settings                  SettingsRoute
 *   /settings/vault            VaultRoute
 *   /settings/profile          ProfileRoute
 *   /settings/mission-control  MissionControlRoute
 *   /settings/timeline         TimelineRoute
 *   /settings/events           EventsRoute
 *   /settings/usage            UsageRoute
 */
export { default as HomeRoute } from './HomeRoute';
export { default as WorkspaceRoute } from './WorkspaceRoute';
export { default as MemoryRoute } from './MemoryRoute';
export { default as ArtifactsRoute } from './ArtifactsRoute';
export { default as FilesRoute } from './FilesRoute';
export { default as AgentsRoute } from './AgentsRoute';
export { default as AutomationsRoute } from './AutomationsRoute';
export { default as SkillsRoute } from './SkillsRoute';
export { default as ConnectorsRoute } from './ConnectorsRoute';
export { default as McpsRoute } from './McpsRoute';
export { default as MarketplaceRoute } from './MarketplaceRoute';
export { default as LauncherRoute } from './LauncherRoute';
export { default as RoomRoute } from './RoomRoute';
export { default as WaggleDanceRoute } from './WaggleDanceRoute';
export { default as ApprovalsRoute } from './ApprovalsRoute';
export { default as TeamRoute } from './TeamRoute';
export { default as SettingsRoute } from './SettingsRoute';
export { default as VaultRoute } from './VaultRoute';
export { default as ProfileRoute } from './ProfileRoute';
export { default as MissionControlRoute } from './MissionControlRoute';
export { default as TimelineRoute } from './TimelineRoute';
export { default as EventsRoute } from './EventsRoute';
export { default as UsageRoute } from './UsageRoute';
// PR6a — ⌘K-only static surfaces (Benchmarks · Platform)
export { default as BenchmarkRoute } from './BenchmarkRoute';
export { default as PlatformRoute } from './PlatformRoute';
export { default as WorkspacesRoute } from './WorkspacesRoute';
