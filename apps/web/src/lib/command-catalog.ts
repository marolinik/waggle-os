import type { ElementType } from "react";
import { BILLING_TIER_ORDER } from "@/lib/dock-tiers";
import {
  Home, MessageSquare, Brain, ListTodo, Library, UserCircle,
  Plus, Rocket, Settings, Sparkles,
  Network, Server, Plug, Store, Package, Shield, Clock, FolderOpen,
  Lock, Activity, History, BarChart3, Users, Radio,
  Gauge, Monitor, LayoutGrid, Eye,
} from "lucide-react";

/**
 * Curated ⌘K catalog (design ref: design-files/screens/ia.html).
 *
 * The command bar holds the depth the calm spine leaves out. Every entry is
 * **plain name + a mono technical subtitle** and routes to a REAL destination
 * (no dead links) or fires a known overlay action. Tier-gated entries (Approvals,
 * Team governance) drop below their billing rank. In Pro (power) tier a "★ Pinned"
 * group floats the power tools to the top.
 */

export type CatalogGroupKey = "pinned" | "jump" | "do" | "power";

export interface CatalogCommand {
  id: string;
  group: CatalogGroupKey;
  /** Plain-language name. */
  name: string;
  /** Mono technical subtitle (the jargon, surfaced quietly). */
  subtitle?: string;
  /** Extra search synonyms/aliases (not shown) so legacy terms still resolve. */
  keywords?: string;
  icon: ElementType;
  /** Route to navigate to (mutually exclusive with `action`). */
  to?: string;
  /** Overlay action key (handled by the integrator). */
  action?: "spawn";
  /** Keyboard hint shown on the right. */
  meta?: string;
  /** Minimum billing rank to show (FREE 0 · TRIAL 1 · TEAMS 2 · ENT 3). */
  minBillingRank?: number;
  /** Also floats into the Pro "★ Pinned" group. */
  pinned?: boolean;
}

export interface CatalogGroup {
  key: CatalogGroupKey;
  heading: string;
  items: CatalogCommand[];
}

export interface CatalogContext {
  /** Resolved chat route (active workspace chat tab, or fallback). */
  chatHref: string;
  /** Power/admin tier — shows the Pinned group. */
  isPro: boolean;
  /** Billing rank for tier gating. */
  billingRank: number;
}

const TEAMS_RANK = BILLING_TIER_ORDER.TEAMS;

export function buildCommandCatalog(ctx: CatalogContext): CatalogGroup[] {
  const { chatHref, isPro, billingRank } = ctx;

  const jump: CatalogCommand[] = [
    { id: "home", group: "jump", name: "Home", subtitle: "your daily briefing", icon: Home, to: "/home" },
    { id: "workspaces", group: "jump", name: "All workspaces", subtitle: "every workspace · grid", icon: LayoutGrid, to: "/workspaces" },
    { id: "chat", group: "jump", name: "Chat", subtitle: "the work surface", icon: MessageSquare, to: chatHref },
    { id: "memory", group: "jump", name: "Memory", subtitle: "what Waggle knows · provenance kept", icon: Brain, to: "/memory" },
    { id: "agents", group: "jump", name: "Agents", subtitle: "running · scheduled · finished", keywords: "tasks agent center", icon: ListTodo, to: "/agents" },
    { id: "library", group: "jump", name: "Library", subtitle: "artifacts · files · skills", icon: Library, to: "/artifacts" },
    { id: "profile", group: "jump", name: "Your profile", subtitle: "what Waggle knows about you", icon: UserCircle, to: "/settings/profile" },
  ];

  const doGroup: CatalogCommand[] = [
    { id: "start-task", group: "do", name: "Start a task", subtitle: "new agent run", icon: Plus, action: "spawn" },
    { id: "launch-agent", group: "do", name: "Launch a coding agent", subtitle: "Claude Code · Cursor · Codex — shares this hive", icon: Rocket, to: "/launcher" },
    { id: "watch-agent", group: "do", name: "Watch a coding agent live", subtitle: "Claude Code · Cursor · Codex — stream its output", keywords: "observe pty terminal live output tail", icon: Eye, to: "/launcher?watch=1" },
    { id: "settings", group: "do", name: "Settings", subtitle: "models · failover · permissions · plan", icon: Settings, to: "/settings" },
    { id: "upgrade", group: "do", name: "Upgrade to Team", subtitle: "plans · billing · invoices", icon: Sparkles, to: "/settings?tab=billing" },
  ];

  const power: CatalogCommand[] = [
    { id: "swarm", group: "power", name: "Run a team of agents", subtitle: "waggle-dance · swarm", icon: Network, to: "/waggle-dance", pinned: true },
    { id: "connect-mcp", group: "power", name: "Connect a tool", subtitle: "MCP servers", icon: Server, to: "/mcps" },
    { id: "connectors", group: "power", name: "Connectors", subtitle: "integrations", icon: Plug, to: "/connectors", pinned: true },
    { id: "marketplace", group: "power", name: "Add a capability", subtitle: "marketplace · skills, connectors, tools", icon: Store, to: "/marketplace" },
    { id: "skills", group: "power", name: "Skills", subtitle: "teach your agents new abilities", icon: Package, to: "/skills" },
    { id: "approvals", group: "power", name: "Approvals", subtitle: "pending agent actions", icon: Shield, to: "/approvals", minBillingRank: TEAMS_RANK, pinned: true },
    { id: "automations", group: "power", name: "Automations", subtitle: "scheduled jobs", icon: Clock, to: "/automations" },
    { id: "files", group: "power", name: "Files & storage", subtitle: "where this workspace lives", icon: FolderOpen, to: "/files" },
    { id: "room", group: "power", name: "Room", subtitle: "work alongside agents live", icon: Users, to: "/room" },
    { id: "vault", group: "power", name: "Secrets", subtitle: "encrypted vault", icon: Lock, to: "/settings/vault" },
    { id: "mission-control", group: "power", name: "Mission Control", subtitle: "system health", keywords: "cockpit connectors fleet status", icon: Activity, to: "/settings/mission-control" },
    { id: "timeline", group: "power", name: "Timeline", subtitle: "activity history", icon: History, to: "/settings/timeline" },
    { id: "events", group: "power", name: "Events & logs", subtitle: "live activity feed", icon: Radio, to: "/settings/events" },
    { id: "usage", group: "power", name: "Usage & cost", subtitle: "tokens · spend", icon: BarChart3, to: "/settings/usage" },
    { id: "benchmarks", group: "power", name: "Benchmarks", subtitle: "capabilities · memory SOTA", icon: Gauge, to: "/benchmarks" },
    { id: "platform", group: "power", name: "Platform & roadmap", subtitle: "desktop · what's coming", icon: Monitor, to: "/platform" },
    { id: "team", group: "power", name: "Team governance", subtitle: "rules · permissions · oversight", icon: Shield, to: "/team", minBillingRank: TEAMS_RANK },
  ];

  const gate = (items: CatalogCommand[]): CatalogCommand[] =>
    items.filter((i) => i.minBillingRank === undefined || billingRank >= i.minBillingRank);

  const groups: CatalogGroup[] = [];

  if (isPro) {
    const pinnedItems = [...jump, ...doGroup, ...power]
      .filter((i) => i.pinned && (i.minBillingRank === undefined || billingRank >= i.minBillingRank))
      .map((i) => ({ ...i, id: `pin-${i.id}`, group: "pinned" as const }));
    if (pinnedItems.length > 0) {
      groups.push({ key: "pinned", heading: "★ Pinned · Pro", items: pinnedItems });
    }
  }

  groups.push({ key: "jump", heading: "Jump to", items: gate(jump) });
  groups.push({ key: "do", heading: "Do", items: gate(doGroup) });
  groups.push({ key: "power", heading: "Power tools", items: gate(power) });

  return groups;
}
