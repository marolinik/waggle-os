import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
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
import { useToast } from "@/hooks/use-toast";
import { isTauri, listenDesktopNavigation, listenDesktopShellEvents } from "@/lib/tauri-bindings";

const HomeRoute = lazy(() => import("@/routes/HomeRoute"));
const WorkspaceRoute = lazy(() => import("@/routes/WorkspaceRoute"));
const MemoryRoute = lazy(() => import("@/routes/MemoryRoute"));
const ArtifactsRoute = lazy(() => import("@/routes/ArtifactsRoute"));
const FilesRoute = lazy(() => import("@/routes/FilesRoute"));
const AgentsRoute = lazy(() => import("@/routes/AgentsRoute"));
const AutomationsRoute = lazy(() => import("@/routes/AutomationsRoute"));
const SkillsRoute = lazy(() => import("@/routes/SkillsRoute"));
const ConnectorsRoute = lazy(() => import("@/routes/ConnectorsRoute"));
const McpsRoute = lazy(() => import("@/routes/McpsRoute"));
const MarketplaceRoute = lazy(() => import("@/routes/MarketplaceRoute"));
const LauncherRoute = lazy(() => import("@/routes/LauncherRoute"));
const RoomRoute = lazy(() => import("@/routes/RoomRoute"));
const WaggleDanceRoute = lazy(() => import("@/routes/WaggleDanceRoute"));
const ApprovalsRoute = lazy(() => import("@/routes/ApprovalsRoute"));
const TeamRoute = lazy(() => import("@/routes/TeamRoute"));
const SettingsRoute = lazy(() => import("@/routes/SettingsRoute"));
const VaultRoute = lazy(() => import("@/routes/VaultRoute"));
const ProfileRoute = lazy(() => import("@/routes/ProfileRoute"));
const MissionControlRoute = lazy(() => import("@/routes/MissionControlRoute"));
const TimelineRoute = lazy(() => import("@/routes/TimelineRoute"));
const EventsRoute = lazy(() => import("@/routes/EventsRoute"));
const UsageRoute = lazy(() => import("@/routes/UsageRoute"));
const BenchmarkRoute = lazy(() => import("@/routes/BenchmarkRoute"));
const PlatformRoute = lazy(() => import("@/routes/PlatformRoute"));
const WorkspacesRoute = lazy(() => import("@/routes/WorkspacesRoute"));
const PaymentSuccessRoute = lazy(() => import("@/routes/PaymentSuccessRoute"));
const AuthRoute = lazy(() => import("@/routes/AuthRoute"));

// Theme is now owned by <ThemeProvider>; the pre-paint apply lives in main.tsx
// (applyStoredThemeEarly) to avoid a flash of the wrong theme on load.

// Phase-0 motion-spec (the single source of motion truth). DEV-only and
// code-split so it never reaches the production bundle; the route below is
// registered only under import.meta.env.DEV.
const MotionSpec = import.meta.env.DEV ? lazy(() => import("./pages/MotionSpec")) : null;

const routeElement = (element: ReactNode) => (
  <Suspense fallback={null}>{element}</Suspense>
);

const TauriDesktopEventBridge = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!isTauri()) return undefined;

    let active = true;
    const unlisteners: Array<() => void> = [];

    const registerUnlistener = (dispose: () => void) => {
      if (active) {
        unlisteners.push(dispose);
      } else {
        dispose();
      }
    };

    void listenDesktopNavigation((path) => navigate(path))
      .then(registerUnlistener)
      .catch(() => undefined);

    void listenDesktopShellEvents((notice) => toast(notice))
      .then(registerUnlistener)
      .catch(() => undefined);

    return () => {
      active = false;
      for (const unlisten of unlisteners) {
        unlisten();
      }
    };
  }, [navigate, toast]);

  return null;
};

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
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <TauriDesktopEventBridge />
          {/* PR7b/D2(b): optional Clerk. With VITE_WAGGLE_ENABLE_CLERK=1 and a valid
              VITE_CLERK_PUBLISHABLE_KEY, wraps the app in a themed, router-integrated
              ClerkProvider; otherwise renders children untouched (fully accountless).
              Inside BrowserRouter so it can wire Clerk's routerPush/replace to useNavigate. */}
          <WaggleClerkProvider>
          <AppErrorBoundary appName="Waggle OS" onClose={() => window.location.reload()}>
            <Routes>
              {/* ── PR7b: /auth is the ONE pre-shell route — sibling OUTSIDE the
                  AppShell subtree (no sidebar / StatusBar / boot gate). Inherits the
                  warm tokens (ThemeProvider) + the top-level AppErrorBoundary above. ── */}
              <Route path="/auth" element={routeElement(<AuthRoute />)} />
              {/* DEV-only motion vocabulary reference (Phase-0). Sibling OUTSIDE
                  the AppShell subtree — no boot gate / onboarding — so it renders
                  the demo directly. Stripped from production (see MotionSpec above). */}
              {import.meta.env.DEV && MotionSpec && (
                <Route
                  path="/motion-spec"
                  element={
                    <Suspense fallback={null}>
                      <MotionSpec />
                    </Suspense>
                  }
                />
              )}
              <Route path="/" element={<AppShell />}>
                {/* §3.3/§2.2: index lands on the salvaged route once, /home after. */}
                <Route index element={<IndexRedirect />} />
                {/* ── Work ── */}
                <Route path="home" element={routeElement(<HomeRoute />)} />
                {/* PR6c (D15): /workspaces → the full All-workspaces shelf (was a §9.7 redirect to Home). */}
                <Route path="workspaces" element={routeElement(<WorkspacesRoute />)} />
                <Route path="workspaces/:workspaceId/:tab?" element={routeElement(<WorkspaceRoute />)} />
                <Route path="memory/:mindScope?" element={routeElement(<MemoryRoute />)} />
                <Route path="artifacts" element={routeElement(<ArtifactsRoute />)} />
                <Route path="files" element={routeElement(<FilesRoute />)} />
                {/* ── Intelligence ── */}
                <Route path="agents" element={routeElement(<AgentsRoute />)} />
                <Route path="automations" element={routeElement(<AutomationsRoute />)} />
                <Route path="skills" element={routeElement(<SkillsRoute />)} />
                <Route path="room" element={routeElement(<RoomRoute />)} />
                <Route path="waggle-dance" element={routeElement(<WaggleDanceRoute />)} />
                <Route path="approvals" element={routeElement(<ApprovalsRoute />)} />
                {/* ── Extend ── */}
                <Route path="connectors" element={routeElement(<ConnectorsRoute />)} />
                <Route path="mcps" element={routeElement(<McpsRoute />)} />
                <Route path="marketplace" element={routeElement(<MarketplaceRoute />)} />
                <Route path="launcher" element={routeElement(<LauncherRoute />)} />
                {/* ── Team (route registered; nav tier-hidden below TEAMS, D5) ── */}
                <Route path="team" element={routeElement(<TeamRoute />)} />
                {/* ── System (§9.4: System surfaces nest under /settings/*) ── */}
                <Route path="settings" element={routeElement(<SettingsRoute />)} />
                <Route path="settings/vault" element={routeElement(<VaultRoute />)} />
                <Route path="settings/profile" element={routeElement(<ProfileRoute />)} />
                <Route path="settings/mission-control" element={routeElement(<MissionControlRoute />)} />
                <Route path="settings/timeline" element={routeElement(<TimelineRoute />)} />
                <Route path="settings/events" element={routeElement(<EventsRoute />)} />
                <Route path="settings/usage" element={routeElement(<UsageRoute />)} />
                {/* ── PR6a: ⌘K-only static surfaces ── */}
                <Route path="benchmarks" element={routeElement(<BenchmarkRoute />)} />
                <Route path="platform" element={routeElement(<PlatformRoute />)} />
                {/* ── PR7a: Stripe Checkout return URLs (checkout.ts:42-43) ── */}
                <Route path="payment-success" element={routeElement(<PaymentSuccessRoute />)} />
                <Route path="payment-cancelled" element={<Navigate to="/settings?tab=billing&checkout=cancelled" replace />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </AppErrorBoundary>
          </WaggleClerkProvider>
        </BrowserRouter>
      </TooltipProvider>
    </InstallProvider>
    </ServiceProvider>
  </ThemeProvider>
);

export default App;
