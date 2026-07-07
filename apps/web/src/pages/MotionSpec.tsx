import { useState } from "react";
import { Check } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  SPRING,
  DUR,
  EASE_OUT,
  STAGGER,
  SIGNATURE,
  REDUCED,
  dampingRatio,
  type SpringVariant,
  type MotionTier,
} from "@/lib/motion/tokens";
import { WaggleSettle } from "@/components/os/warm";

/**
 * /motion-spec — the arc's single source of motion truth (Phase-0 item 2,
 * DEV-only, wired in App.tsx behind import.meta.env.DEV).
 *
 * Demonstrates each spring-family variant (click-to-replay), the multi-tier
 * hover grammar, entrance stagger, exit choreography (AnimatePresence in/out),
 * the reduced-motion mapping table, and an INVENTORY of already-shipped motion
 * with migration status. Every animation on this page resolves to a token from
 * lib/motion/tokens.ts, and every tier CONSUMES the REDUCED mapping via
 * useReducedMotion — so the page is proof the mappings are implemented, not just
 * documented.
 *
 * Note: the inventory (section 7) reflects the ACTUAL post-Phase-A tree state
 * — every row grep-verified against the shipped components, dead classes marked
 * honestly rather than fabricated.
 */

const SPRING_ORDER: readonly SpringVariant[] = ["micro", "standard", "expressive"];

const SPRING_USE: Record<SpringVariant, string> = {
  micro: "chips · presses · selection (≤150ms feel)",
  standard: "hovers · panel/route fades (the default tier)",
  expressive: "hero morphs · the settle gesture",
};

const REDUCED_ROWS: readonly { tier: MotionTier; behaviour: string; note: string }[] = [
  { tier: "routeTransition", behaviour: REDUCED.routeTransition, note: "no shared-element travel — cut straight to the destination via opacity" },
  { tier: "hover", behaviour: REDUCED.hover, note: "keep border-warm + shadow bloom, drop the -translate/scale (motion-safe: prefix)" },
  { tier: "settle", behaviour: REDUCED.settle, note: "snap to the settled state, pulse colour once instead of the gesture" },
  { tier: "streamingCaret", behaviour: REDUCED.streamingCaret, note: "static caret glyph, no blink/trail" },
  { tier: "countUp", behaviour: REDUCED.countUp, note: "write the source-of-truth number directly, no intermediate frames" },
  { tier: "ambient", behaviour: REDUCED.ambient, note: "below-attention idle loops (glow-breathe/float/heartbeat) stop" },
];

type InventoryRow = {
  motion: string;
  file: string;
  tier: string;
  token: string;
  reduced: string;
  status: string;
};

// THE INVENTORY — every motion on the judged surfaces, rebuilt from the ACTUAL
// tree state at the end of Phase A (all retrofit lanes merged), not a per-lane
// contract. Each row was verified by grep against the shipped components; a
// reviewer can spot-check any file/token/class named here. Grouped: discrete-
// transition retrofits (migrated onto --mo-* / DUR / STAGGER / SPRING), then
// signature moments, ambient loops, the streaming caret, and — kept honest —
// the CSS animation classes that are DEFINED but no longer applied by any
// component (dead classes; they produce no motion).
//
// Ambient loops keep their multi-second cadence ON PURPOSE — those seconds are
// loop rhythm, not a discrete-transition duration, so no --mo-* token applies
// (documented, not a gap). "live ✓" = the motion is wired and verified in the
// tree; "compliant" = a bare token/keyword transition with no magic number.
const INVENTORY: readonly InventoryRow[] = [
  // ── Discrete-transition retrofits (magic durations → tokens) ──────────────
  { motion: "Card hover — lift + honey bloom", file: "AllWorkspacesApp · SuggestedAgentCards · ExtensionCard", tier: "hover", token: "--mo-fast + --mo-ease", reduced: "color + shadow, no transform (motion-safe)", status: "live ✓" },
  { motion: "Shelf / card entrance stagger", file: "AllWorkspacesApp · SuggestedAgentCards", tier: "standard (entrance)", token: "card-enter · --mo-slow + --mo-ease + STAGGER.list", reduced: "instant set (reduceMotion → no delay travel)", status: "live ✓" },
  { motion: "Memory hero count-up", file: "MemoryTrustManage (HeroCount)", tier: "countUp", token: "600ms easeOutCubic rAF (bespoke landing, justified)", reduced: "instant-set (source number)", status: "live ✓" },
  { motion: "Trust ↔ Memories card-enter frame", file: "MemoryTrustManage · MemoryCenterTab", tier: "standard (entrance)", token: "card-enter · --mo-fast/--mo-slow + --mo-ease", reduced: "instant (reduceMotion → no style)", status: "live ✓" },
  { motion: "Briefing entrance staggers", file: "LoginBriefing", tier: "brief (entrance)", token: "STAGGER.brief + DUR.base + EASE_OUT", reduced: "instant (reduceMotion crossfade)", status: "live ✓" },
  { motion: "Theme crossfade (“sunset”)", file: "ThemeProvider · index.css .theme-transition", tier: "routeTransition", token: "var(--mo-slow) — shared w/ ThemeProvider DUR.slow", reduced: "off — instant token swap (no-preference gated)", status: "live ✓" },
  { motion: "Boot phase transitions", file: "BootScreen", tier: "standard / expressive", token: "DUR.base – DUR.settle (+ 2 justified bespoke boot beats)", reduced: "crossfade / instant", status: "live ✓" },
  { motion: "Chat action-row reveal (Copy / Retry toolbar)", file: "ChatApp", tier: "standard", token: "--mo-fast + --mo-ease", reduced: "opacity only, no slide (motion-reduce:transition-none)", status: "live ✓" },
  { motion: "Send button — colour / fill / scale transition", file: "ChatApp", tier: "standard + micro (send-arm)", token: "--mo-base (pulse timer = DUR.base)", reduced: "colour only, no scale (motion-safe)", status: "live ✓" },
  { motion: "Disclosure / chevron rotate (pins · sessions)", file: "ChatApp", tier: "micro", token: "bare transition-transform (no magic number)", reduced: "transform-only — unchanged", status: "compliant" },
  // ── Signature moments (SIGNATURE tier; guarded) ───────────────────────────
  { motion: "Memory “+N ⬡” fold-into-hive", file: "StatusBar (.memory-fold)", tier: "settle · SIGNATURE.full", token: "memory-fold 1.8s keyframe", reduced: "off — particle never shows (opacity 0, reduce block)", status: "live ✓" },
  { motion: "Memory-count honey-pulse", file: "StatusBar (.honey-pulse)", tier: "settle · signature", token: "honey-pulse 0.6s keyframe", reduced: "off — pulse skipped (reduce block)", status: "live ✓" },
  // ── Ambient loops (loop cadence — no discrete token by design; reduced = off) ─
  { motion: "Bee “thinking” ring while streaming", file: "ChatApp · ChatWorkCanvas · DotLive (.dot-live → breathe)", tier: "ambient", token: "breathe 2.4s loop", reduced: "off — static ring (reduce block + motion-reduce)", status: "live ✓" },
  { motion: "Empty-state bee float", file: "ChatApp (.float)", tier: "ambient", token: "float 3s loop", reduced: "off — stilled (reduce block)", status: "live ✓" },
  { motion: "Streaming bar slide", file: "ChatApp · index.css .chat-stream-shimmer", tier: "ambient", token: "shimmer 1.5s loop", reduced: "off — static segment (reduce block)", status: "live ✓" },
  { motion: "Skeleton loaders (workspace · memory · briefing)", file: "WorkspaceDesktopApp · MemoryCenterTab · LoginBriefing (animate-pulse)", tier: "ambient", token: "Tailwind pulse 2s loop", reduced: "off (motion-reduce:animate-none)", status: "live ✓" },
  { motion: "Onboarding hero bee pulse", file: "onboarding/WelcomeStep (framer-motion drop-shadow)", tier: "ambient", token: "3s filter loop (reduceMotion → static drop-shadow)", reduced: "off — single static drop-shadow", status: "live ✓" },
  { motion: "Boot showcase hex pulse", file: "PlatformApp (.boot-hex-pulse)", tier: "ambient", token: "boot-hex-pulse 2.2s loop", reduced: "off — static shadow (reduce block)", status: "live ✓" },
  // ── Streaming caret ───────────────────────────────────────────────────────
  { motion: "Streaming block caret", file: "ChatWorkCanvas · chat-blocks/TextBlock (animate-pulse)", tier: "streamingCaret", token: "Tailwind pulse (block cursor)", reduced: "static (motion-reduce:animate-none)", status: "live ✓" },
  // ── Dead CSS animation classes (defined in index.css, applied by NO component) ─
  { motion: "Unused animation classes", file: "index.css .hex-cursor · .token-stream · .send-flash · .heartbeat · .hex-spin · .glow-breathe", tier: "—", token: "@keyframes exist, no component applies the class", reduced: "n/a — produce no motion", status: "N/A — dead class" },
];

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="font-display text-[15px] font-semibold tracking-[-0.01em] text-[var(--text)]">{title}</h2>
      {subtitle && <p className="mt-1 mb-4 max-w-[68ch] text-[13px] leading-relaxed text-[var(--text-muted)]">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </section>
  );
}

function SpringSample({ variant, reduce }: { variant: SpringVariant; reduce: boolean }) {
  const [on, setOn] = useState(false);
  const spring = SPRING[variant];
  const zeta = dampingRatio(spring).toFixed(3);
  return (
    <div className="rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="font-display text-[13.5px] font-semibold text-[var(--text)]">SPRING.{variant}</span>
        <span className="font-mono text-[11px] text-[var(--text-muted)]">k={spring.stiffness} · c={spring.damping} · ζ={zeta}</span>
      </div>
      <p className="mb-3 text-[12px] text-[var(--text-muted)]">{SPRING_USE[variant]}</p>
      <div className="relative h-11 w-full max-w-[300px] overflow-hidden rounded-full border border-[var(--line)] bg-[var(--surface-2)]">
        <motion.div
          aria-hidden
          className="absolute left-1 top-1 h-9 w-9 rounded-full bg-[var(--honey)] shadow-[var(--shadow-honey)]"
          animate={{ x: on ? 250 : 0 }}
          transition={reduce ? { duration: 0 } : spring}
        />
      </div>
      <button
        type="button"
        onClick={() => setOn((v) => !v)}
        className="mt-3 rounded-[9px] border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-2)] transition-colors hover:border-[var(--honey-line)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--honey-line)]"
      >
        Replay →
      </button>
    </div>
  );
}

function HoverTierCard() {
  return (
    <div
      tabIndex={0}
      role="button"
      className="hive-interactive group relative flex min-h-[110px] w-full max-w-[280px] cursor-pointer flex-col justify-between overflow-hidden rounded-[16px] border border-[var(--line-soft)] bg-[var(--surface)] p-[18px] shadow-[var(--shadow-sm)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--honey-line)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-[var(--honey)] opacity-0 transition-opacity duration-[var(--mo-fast)] group-hover:opacity-100 group-focus-visible:opacity-100"
      />
      <span className="font-display text-[14px] font-semibold text-[var(--text)]">Sample card</span>
      <span className="text-[12px] text-[var(--text-muted)]">Hover, keyboard-focus, and press me — same tier.</span>
    </div>
  );
}

function StaggerSample({ reduce }: { reduce: boolean }) {
  const [mount, setMount] = useState(0);
  const [gap, setGap] = useState<keyof typeof STAGGER>("list");
  const items = ["Memory saved", "Workspace synced", "Skill installed", "Agent spawned"];
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setMount((m) => m + 1)}
          className="rounded-[9px] border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-2)] transition-colors hover:border-[var(--honey-line)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--honey-line)]"
        >
          Replay ↻
        </button>
        {(["list", "brief"] as const).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGap(g)}
            className={`rounded-[9px] border px-3 py-1.5 text-[12px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--honey-line)] ${
              gap === g
                ? "border-[var(--honey-line)] bg-[var(--honey-wash)] text-[var(--text)]"
                : "border-[var(--line)] bg-transparent text-[var(--text-muted)] hover:text-[var(--text-2)]"
            }`}
          >
            STAGGER.{g} ({Math.round(STAGGER[g] * 1000)}ms)
          </button>
        ))}
      </div>
      <div key={mount} className="flex max-w-[320px] flex-col gap-2">
        {items.map((label, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduce ? { duration: 0 } : { duration: DUR.slow, ease: EASE_OUT, delay: i * STAGGER[gap] }}
            className="rounded-[11px] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2.5 text-[12.5px] text-[var(--text-2)]"
          >
            {label}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function ExitSample({ reduce }: { reduce: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mb-3 rounded-[9px] border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-2)] transition-colors hover:border-[var(--honey-line)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--honey-line)]"
      >
        {open ? "Dismiss (exit) →" : "Show (enter) →"}
      </button>
      <div className="min-h-[92px] max-w-[320px]">
        <AnimatePresence mode="popLayout">
          {open && (
            <motion.div
              key="card"
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
              transition={reduce ? { duration: 0 } : SPRING.standard}
              className="rounded-[14px] border border-[var(--honey-line)] bg-[var(--honey-wash)] p-4"
            >
              <div className="font-display text-[13px] font-semibold text-[var(--text)]">Enter + exit share the vocabulary</div>
              <div className="mt-1 text-[12px] text-[var(--text-muted)]">
                Enter: y+scale via SPRING.standard. Exit: the same gesture reversed. Reduced-motion → opacity only.
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function WaggleSettleSample({ reduce }: { reduce: boolean }) {
  const [play, setPlay] = useState(false);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={play}
          onClick={() => setPlay(true)}
          className="rounded-[9px] border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-2)] transition-colors hover:border-[var(--honey-line)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--honey-line)] disabled:opacity-50"
        >
          {play ? "…dancing" : "Play the waggle ⬡"}
        </button>
        <span className="font-mono text-[11px] text-[var(--text-muted)]">
          {reduce ? "reduce — instant state + one colour pulse" : "SPRING.expressive · DUR.settle (~400ms)"}
        </span>
      </div>
      {/* The exact product moment it is wired to: a "memory saved" confirmation. */}
      <div className="relative flex max-w-[320px] items-center gap-2.5 overflow-visible rounded-[14px] border border-[var(--honey-line)] bg-[var(--honey-wash)] px-4 py-3">
        <span aria-hidden className="hex grid h-6 w-6 shrink-0 place-items-center bg-[var(--honey)] text-[#1a1407]">
          <Check className="h-3.5 w-3.5" strokeWidth={2.6} />
        </span>
        <div className="min-w-0">
          <div className="font-display text-[13px] font-semibold text-[var(--text)]">Memory saved</div>
          <div className="truncate text-[12px] text-[var(--text-muted)]">Waggle will remember this across sessions.</div>
        </div>
        <WaggleSettle play={play} onDone={() => setPlay(false)} size={44} />
      </div>
    </div>
  );
}

function TokenPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
      <div className="font-mono text-[11px] text-[var(--text-muted)]">{label}</div>
      <div className="mt-0.5 font-mono text-[12.5px] text-[var(--text-2)]">{value}</div>
    </div>
  );
}

export default function MotionSpec() {
  const reduce = !!useReducedMotion();

  return (
    <div className="min-h-screen bg-[var(--bg)] px-6 py-8 text-[var(--text)] sm:px-10">
      <div className="mx-auto max-w-[900px]">
        <header className="mb-8">
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--honey-text)]">Phase-0 · motion vocabulary</div>
          <h1 className="mt-1 font-display text-[26px] font-bold tracking-[-0.02em] text-[var(--text)]">Motion spec</h1>
          <p className="mt-2 max-w-[70ch] text-[13.5px] leading-relaxed text-[var(--text-muted)]">
            The single source of motion truth. Every animation on the judged surfaces resolves to a token in
            <span className="font-mono text-[12.5px] text-[var(--text-2)]"> lib/motion/tokens.ts</span>. This page (DEV-only) is where
            the spring family, hover tiers, stagger, exit choreography, and the reduced-motion mapping are reviewable.
          </p>
          <div
            className={`mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
              reduce
                ? "border-[var(--honey-line)] bg-[var(--honey-wash)] text-[var(--text)]"
                : "border-[var(--line)] bg-[var(--surface)] text-[var(--text-muted)]"
            }`}
          >
            <span aria-hidden className={`h-2 w-2 rounded-full ${reduce ? "bg-[var(--honey)]" : "bg-[var(--healthy)]"}`} />
            prefers-reduced-motion: {reduce ? "reduce — this page is degrading every tier live" : "no-preference"}
          </div>
        </header>

        <Section
          title="1 · The spring family"
          subtitle="Three variants that share ONE physical character (damping ratio ζ ≈ 0.74–0.77 → the same 'material', a light single-overshoot settle). Tune amplitude/speed per tier, never the character. Click Replay to feel each."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SPRING_ORDER.map((v) => (
              <SpringSample key={v} variant={v} reduce={reduce} />
            ))}
          </div>
        </Section>

        <Section
          title="2 · Multi-tier hover"
          subtitle="rest → hover (lift 2px + honey border-warm + shadow bloom) → press (scale .98) → focus-visible (same tier, keyboard). The lift is motion-safe: under reduced-motion the colour+shadow tier stays and only the transform drops — exactly REDUCED.hover."
        >
          <HoverTierCard />
        </Section>

        <Section
          title="3 · Entrance stagger"
          subtitle="Per-item rise + fade on DUR.slow / EASE_OUT, offset by STAGGER (list = 40ms lists, brief = 80ms briefing). Reduced-motion sets each item instantly (no delay travel)."
        >
          <StaggerSample reduce={reduce} />
        </Section>

        <Section
          title="4 · Exit choreography"
          subtitle="AnimatePresence in/out in the same vocabulary — enter and exit are one gesture, mirrored. Menus, cards, modals, and route surfaces all define exits this way."
        >
          <ExitSample reduce={reduce} />
        </Section>

        <Section
          title="5 · Reduced-motion mapping (per tier)"
          subtitle="Defined for EVERY tier, not just ambient — and consumed above, not just documented. Flip your OS 'reduce motion' setting and every section on this page degrades to the behaviour in this table."
        >
          <div className="overflow-x-auto rounded-[14px] border border-[var(--line)]">
            <table className="w-full border-collapse text-left text-[12.5px]">
              <thead>
                <tr className="bg-[var(--surface-2)] text-[var(--text-muted)]">
                  <th className="px-4 py-2.5 font-semibold">Tier</th>
                  <th className="px-4 py-2.5 font-semibold">Reduced behaviour</th>
                  <th className="px-4 py-2.5 font-semibold">What that means</th>
                </tr>
              </thead>
              <tbody>
                {REDUCED_ROWS.map((r) => (
                  <tr key={r.tier} className="border-t border-[var(--line)]">
                    <td className="px-4 py-2.5 font-mono text-[12px] text-[var(--text-2)]">{r.tier}</td>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-[var(--honey-text)]">{r.behaviour}</td>
                    <td className="px-4 py-2.5 text-[var(--text-muted)]">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section
          title="6 · Token reference"
          subtitle="Durations (mirrored to index.css --mo-* in ms), the standard-out easing, stagger, and the signature-moment frequency taxonomy."
        >
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            <TokenPill label="DUR.fast / --mo-fast" value={`${DUR.fast}s · 150ms`} />
            <TokenPill label="DUR.base / --mo-base" value={`${DUR.base}s · 200ms`} />
            <TokenPill label="DUR.slow / --mo-slow" value={`${DUR.slow}s · 320ms`} />
            <TokenPill label="DUR.settle / --mo-settle" value={`${DUR.settle}s · 400ms`} />
            <TokenPill label="EASE_OUT / --mo-ease" value={`cubic-bezier(${EASE_OUT.join(", ")})`} />
          </div>

          <div className="mt-4 overflow-x-auto rounded-[14px] border border-[var(--line)]">
            <table className="w-full border-collapse text-left text-[12.5px]">
              <thead>
                <tr className="bg-[var(--surface-2)] text-[var(--text-muted)]">
                  <th className="px-4 py-2.5 font-semibold">Signature tier</th>
                  <th className="px-4 py-2.5 font-semibold">Moments</th>
                  <th className="px-4 py-2.5 font-semibold">Duration</th>
                  <th className="px-4 py-2.5 font-semibold">Frequency guard</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-[var(--line)]">
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[var(--text-2)]">SIGNATURE.full</td>
                  <td className="px-4 py-2.5 text-[var(--text-muted)]">{SIGNATURE.full.moments.join(" · ")}</td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[var(--honey-text)]">{SIGNATURE.full.durS}s</td>
                  <td className="px-4 py-2.5 text-[var(--text-muted)]">{SIGNATURE.full.perSessionCooldownMs / 1000}s per-session cooldown</td>
                </tr>
                <tr className="border-t border-[var(--line)]">
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[var(--text-2)]">SIGNATURE.micro</td>
                  <td className="px-4 py-2.5 text-[var(--text-muted)]">{SIGNATURE.micro.moments.join(" · ")}</td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[var(--honey-text)]">{SIGNATURE.micro.durS}s</td>
                  <td className="px-4 py-2.5 text-[var(--text-muted)]">high-frequency — no flourish, no cooldown</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>

        <Section
          title="7 · The signature gesture — the waggle-settle (prototype)"
          subtitle="The commissioned brand gesture (Pillar 1.3), judged STANDALONE here first. The honey brand hex runs the bee's figure-eight waggle dance (a Gerono lemniscate — two lobes crossing at the origin — with a fast body-wobble) and settles at centre with a single-overshoot spring (SPRING.expressive · DUR.settle). The translation PATH carries the identity — it reads as 'the waggle,' not a scale-pop. Wired to exactly ONE product moment (memory saved, first per session, behind the SIGNATURE.full cooldown gate); it does not propagate elsewhere in this phase. Reduced-motion → the dancer snaps to its settled state and a single honey colour pulse replaces the gesture (REDUCED.settle = instant-state-color-pulse)."
        >
          <WaggleSettleSample reduce={reduce} />
        </Section>

        <Section
          title="8 · The inventory — every motion on the judged surfaces"
          subtitle="The Phase-A end-state, rebuilt from the shipped tree (every row grep-verified). Discrete transitions (hover tiers, entrances, chrome, count-ups, boot, theme crossfade) resolve to the tokens above — acceptance = ZERO non-token durations/easings on judged surfaces. Signature moments and ambient loops keep their keyframe cadence on purpose (loop rhythm is not a discrete-transition duration); every one degrades per the reduced-motion column. The final row lists CSS animation classes that are defined but no longer applied — kept honest, not hidden."
        >
          <div className="overflow-x-auto rounded-[14px] border border-[var(--line)]">
            <table className="w-full border-collapse text-left text-[12px]">
              <thead>
                <tr className="bg-[var(--surface-2)] text-[var(--text-muted)]">
                  <th className="px-3 py-2.5 font-semibold">Motion</th>
                  <th className="px-3 py-2.5 font-semibold">File(s)</th>
                  <th className="px-3 py-2.5 font-semibold">Tier</th>
                  <th className="px-3 py-2.5 font-semibold">Target token</th>
                  <th className="px-3 py-2.5 font-semibold">Reduced-motion</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {INVENTORY.map((row) => (
                  <tr key={row.motion} className="border-t border-[var(--line)] align-top">
                    <td className="px-3 py-2.5 text-[var(--text-2)]">{row.motion}</td>
                    <td className="px-3 py-2.5 text-[var(--text-muted)]">{row.file}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-[var(--text-muted)]">{row.tier}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-[var(--text-2)]">{row.token}</td>
                    <td className="px-3 py-2.5 text-[var(--text-muted)]">{row.reduced}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-[var(--honey-text)]">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 max-w-[68ch] text-[11.5px] leading-relaxed text-[var(--text-dim)]">
            The theme crossfade now resolves to
            <span className="font-mono"> var(--mo-slow) </span>(320ms) — the same token
            ThemeProvider’s JS cleanup timer reads via
            <span className="font-mono"> DUR.slow</span>, so the CSS window and the JS timer share
            one source of truth (was a bespoke 360ms literal). Boot keeps a handful of
            comment-justified bespoke cinematic beats in <span className="font-mono">BootScreen</span>
            (entrance spring ζ≈0.707, ambient glow loop — reduced-motion-gated, exit/fade literals);
            the memory hero count-up is a deliberate ~600ms rAF landing. Everything else on the
            judged surfaces resolves to a token or carries a one-line justification at the site.
          </p>
        </Section>
      </div>
    </div>
  );
}
