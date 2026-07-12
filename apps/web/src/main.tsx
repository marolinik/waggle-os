// P1b D3: must be the FIRST import — arms the adapter's request-deferral gate
// before any other module in the import graph can evaluate (see boot-connect.ts).
import "./boot-connect";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyStoredThemeEarly } from "@/providers/ThemeProvider";

// Apply the persisted theme before first paint to avoid a flash of the wrong
// theme (warm graphite/dark default; warm paper for light).
applyStoredThemeEarly();

createRoot(document.getElementById("root")!).render(<App />);

// Initialize PostHog cloud analytics (DAY0-04).
// Non-blocking and lazy-loaded so analytics never bloats the startup bundle.
void import("@/lib/posthog")
  .then(({ initPostHog }) => initPostHog())
  .catch(() => {});
