import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initPostHog } from "@/lib/posthog";

// Initialize PostHog cloud analytics (DAY0-04).
// Non-blocking — PostHog init failure must not prevent app boot.
initPostHog().catch(() => {});

createRoot(document.getElementById("root")!).render(<App />);
