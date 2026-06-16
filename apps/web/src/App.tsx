import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ServiceProvider } from "@/providers/ServiceProvider";
import { InstallProvider } from "@/providers/InstallProvider";
import { ThemeProvider } from "@/providers/ThemeProvider";
import AppErrorBoundary from "@/components/os/ErrorBoundary";
import AppShell, { IndexRedirect } from "@/components/os/AppShell";
import NotFound from "./pages/NotFound.tsx";
import {
  HomeRoute,
  WorkspaceRoute,
  MemoryRoute,
  ArtifactsRoute,
  FilesRoute,
  AgentsRoute,
  AutomationsRoute,
  SkillsRoute,
  ConnectorsRoute,
  McpsRoute,
  MarketplaceRoute,
  LauncherRoute,
  RoomRoute,
  WaggleDanceRoute,
  ApprovalsRoute,
  TeamRoute,
  SettingsRoute,
  VaultRoute,
  ProfileRoute,
  MissionControlRoute,
  TimelineRoute,
  EventsRoute,
  UsageRoute,
} from "@/routes";

// Theme is now owned by <ThemeProvider>; the pre-paint apply lives in main.tsx
// (applyStoredThemeEarly) to avoid a flash of the wrong theme on load.

const queryClient = new QueryClient();

/**
 * Root application component — UX Refactor v2.1 P1a (conversion plan §1.1):
 * `/` mounts the AppShell layout route (BootScreen gate + onboarding takeover
 * + left nav + StatusBar + overlays + ChatHost); every screen is a child
 * route rendered into the shell's single canvas via the §5.1 wrappers.
 */
const App = () => (
  <ThemeProvider>
    <ServiceProvider>
    <InstallProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppErrorBoundary appName="Waggle OS" onClose={() => window.location.reload()}>
            <Routes>
              <Route path="/" element={<AppShell />}>
                {/* §3.3/§2.2: index lands on the salvaged route once, /home after. */}
                <Route index element={<IndexRedirect />} />
                {/* ── Work ── */}
                <Route path="home" element={<HomeRoute />} />
                {/* §9.7: bare /workspaces → Home (Home IS the workspace selector). */}
                <Route path="workspaces" element={<Navigate to="/home" replace />} />
                <Route path="workspaces/:workspaceId/:tab?" element={<WorkspaceRoute />} />
                <Route path="memory/:mindScope?" element={<MemoryRoute />} />
                <Route path="artifacts" element={<ArtifactsRoute />} />
                <Route path="files" element={<FilesRoute />} />
                {/* ── Intelligence ── */}
                <Route path="agents" element={<AgentsRoute />} />
                <Route path="automations" element={<AutomationsRoute />} />
                <Route path="skills" element={<SkillsRoute />} />
                <Route path="room" element={<RoomRoute />} />
                <Route path="waggle-dance" element={<WaggleDanceRoute />} />
                <Route path="approvals" element={<ApprovalsRoute />} />
                {/* ── Extend ── */}
                <Route path="connectors" element={<ConnectorsRoute />} />
                <Route path="mcps" element={<McpsRoute />} />
                <Route path="marketplace" element={<MarketplaceRoute />} />
                <Route path="launcher" element={<LauncherRoute />} />
                {/* ── Team (route registered; nav tier-hidden below TEAMS, D5) ── */}
                <Route path="team" element={<TeamRoute />} />
                {/* ── System (§9.4: System surfaces nest under /settings/*) ── */}
                <Route path="settings" element={<SettingsRoute />} />
                <Route path="settings/vault" element={<VaultRoute />} />
                <Route path="settings/profile" element={<ProfileRoute />} />
                <Route path="settings/mission-control" element={<MissionControlRoute />} />
                <Route path="settings/timeline" element={<TimelineRoute />} />
                <Route path="settings/events" element={<EventsRoute />} />
                <Route path="settings/usage" element={<UsageRoute />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </AppErrorBoundary>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
    </InstallProvider>
    </ServiceProvider>
  </ThemeProvider>
);

export default App;
