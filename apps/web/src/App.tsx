import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ServiceProvider } from "@/providers/ServiceProvider";
import { InstallProvider } from "@/providers/InstallProvider";
import { ThemeProvider } from "@/providers/ThemeProvider";
import AppErrorBoundary from "@/components/os/ErrorBoundary";
import WaggleClerkProvider from "@/providers/WaggleClerkProvider";
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
  BenchmarkRoute,
  PlatformRoute,
  WorkspacesRoute,
  PaymentSuccessRoute,
  AuthRoute,
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
          {/* PR7b/D2(b): optional Clerk. With VITE_CLERK_PUBLISHABLE_KEY present, wraps
              the app in a themed, router-integrated ClerkProvider; without it, renders
              children untouched (fully accountless). Inside BrowserRouter so it can wire
              Clerk's routerPush/replace to useNavigate. */}
          <WaggleClerkProvider>
          <AppErrorBoundary appName="Waggle OS" onClose={() => window.location.reload()}>
            <Routes>
              {/* ── PR7b: /auth is the ONE pre-shell route — sibling OUTSIDE the
                  AppShell subtree (no sidebar / StatusBar / boot gate). Inherits the
                  warm tokens (ThemeProvider) + the top-level AppErrorBoundary above. ── */}
              <Route path="/auth" element={<AuthRoute />} />
              <Route path="/" element={<AppShell />}>
                {/* §3.3/§2.2: index lands on the salvaged route once, /home after. */}
                <Route index element={<IndexRedirect />} />
                {/* ── Work ── */}
                <Route path="home" element={<HomeRoute />} />
                {/* PR6c (D15): /workspaces → the full All-workspaces shelf (was a §9.7 redirect to Home). */}
                <Route path="workspaces" element={<WorkspacesRoute />} />
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
                {/* ── PR6a: ⌘K-only static surfaces ── */}
                <Route path="benchmarks" element={<BenchmarkRoute />} />
                <Route path="platform" element={<PlatformRoute />} />
                {/* ── PR7a: Stripe Checkout return URLs (checkout.ts:42-43) ── */}
                <Route path="payment-success" element={<PaymentSuccessRoute />} />
                <Route path="payment-cancelled" element={<Navigate to="/settings?tab=billing" replace />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </AppErrorBoundary>
          </WaggleClerkProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
    </InstallProvider>
    </ServiceProvider>
  </ThemeProvider>
);

export default App;
