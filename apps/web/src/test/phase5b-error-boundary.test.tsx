import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// This monorepo nests React 18 under apps/web while hoisting React 19 at the
// root. `@testing-library/react` (built for React 19) mixes its react-dom/client
// copy with this app's React 18 and throws "A React Element from an older
// version of React was rendered." This is the same documented constraint that
// keeps ConnectorsApp / useDeveloperMode / TextBlock tests at the pure layer.
// To still exercise the *render-time* catch behaviour of the boundary (which has
// no pure function to extract), we render with React 18's own createRoot from
// THIS app's copy, keeping a single consistent React instance. lucide-react
// resolves the hoisted React copy, so its decorative icon is stubbed out.
vi.mock("lucide-react", () => ({
  AlertTriangle: (props: Record<string, unknown>) => <svg data-testid="alert-icon" {...props} />,
}));

import AppErrorBoundary from "@/components/os/ErrorBoundary";

/**
 * Phase 5b · R4-001 — top-level recoverable error boundary.
 *
 * App.tsx now wraps the route shell (Routes/Index + Desktop chrome + overlays)
 * in AppErrorBoundary. These tests prove the boundary catches a render throw and
 * shows a recoverable fallback instead of letting the whole app white-screen.
 */
const Boom = () => {
  throw new Error("render exploded");
};

describe("phase5b · AppErrorBoundary", () => {
  let container: HTMLDivElement;
  let root: Root;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    // React logs caught render errors to console.error; silence the expected noise.
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    consoleError.mockRestore();
  });

  it("renders the recoverable fallback when a child throws (no white screen)", () => {
    act(() => {
      root.render(
        <AppErrorBoundary appName="Waggle OS" onClose={() => {}}>
          <Boom />
        </AppErrorBoundary>,
      );
    });

    expect(container.textContent).toContain("Waggle OS encountered an error");
    expect(container.textContent).toContain("render exploded");
    expect(container.querySelector("button")?.textContent).toContain("Close Window");
  });

  it("renders children unchanged when nothing throws", () => {
    act(() => {
      root.render(
        <AppErrorBoundary appName="Waggle OS">
          <div>healthy child</div>
        </AppErrorBoundary>,
      );
    });

    expect(container.textContent).toContain("healthy child");
    expect(container.textContent).not.toContain("Waggle OS encountered an error");
  });
});
