/**
 * BenchmarkApp — Warm-Hive Benchmarks surface (screen 17). A pure-UI, ⌘K-only
 * showcase with two views behind a segmented toggle:
 *
 *  1) Capabilities — honest positioning vs the field (task agents vs Waggle's
 *     memory layer), an 11-row capability matrix with the Waggle column
 *     honey-highlighted. Deliberately credits competitors on "deep terminal
 *     coding" — it's a positioning view, not a lab benchmark.
 *  2) Memory SOTA — the one real head-to-head lab result: LoCoMo bars + stats.
 *
 * Static data only — no backend, no API, no props (default-export, zero-prop).
 * Source fidelity: docs/design_handoff_waggle_app/design-files/screens/benchmark.html
 */
import { useState } from 'react';
import { BarChart3, Info } from 'lucide-react';

// ───────────────────────────────────────────────────────────────────────────
// Benchmark figures — manually refreshed from the hive-mind benchmark,
// 2026-06-18 — do not fabricate. Numbers MUST match benchmark.html exactly.
// ───────────────────────────────────────────────────────────────────────────

/** A capability mark: yes (●) / partial (◐) / no (○). */
type Mark = 'Y' | 'P' | 'N';

/** Competitor columns, in matrix order after the honey Waggle column. */
const COMPETITORS = [
  { name: 'Claude Code', sub: 'CLI' },
  { name: 'Codex', sub: 'CLI' },
  { name: 'Cowork', sub: 'Anthropic' },
  { name: 'Hermes', sub: 'agent' },
  { name: 'Odysseus', sub: 'agent' },
] as const;

/** 11-row capability matrix. marks order: Waggle, then the 5 COMPETITORS. */
const CAPABILITY_MATRIX: ReadonlyArray<{ capability: string; marks: readonly Mark[] }> = [
  { capability: 'Persistent memory across sessions', marks: ['Y', 'P', 'N', 'P', 'P', 'P'] },
  { capability: 'Local-first & private by default', marks: ['Y', 'N', 'N', 'N', 'P', 'P'] },
  { capability: 'Any model — incl. small local models', marks: ['Y', 'N', 'N', 'N', 'P', 'P'] },
  { capability: 'Built for non-technical experts', marks: ['Y', 'N', 'N', 'P', 'N', 'N'] },
  { capability: 'Runs your existing coding agents', marks: ['Y', 'N', 'N', 'N', 'N', 'N'] },
  { capability: 'Self-evolving skills', marks: ['Y', 'N', 'N', 'N', 'P', 'N'] },
  { capability: 'Skills shared across agents/workspaces', marks: ['Y', 'P', 'P', 'N', 'P', 'N'] },
  { capability: 'Multi-agent swarm', marks: ['Y', 'P', 'N', 'P', 'P', 'Y'] },
  { capability: 'Native desktop app · Win + Mac', marks: ['Y', 'N', 'N', 'P', 'N', 'N'] },
  { capability: 'Audit-ready / EU AI Act', marks: ['Y', 'P', 'P', 'P', 'N', 'N'] },
  { capability: 'Deep coding in the terminal', marks: ['P', 'Y', 'Y', 'P', 'P', 'Y'] },
];

/** LoCoMo memory bars — value drives both the label and the bar width. */
const MEMORY_BARS: ReadonlyArray<{ name: string; note: string; value: number; us?: boolean }> = [
  { name: 'Waggle · Hive Mind', note: 'ours · local', value: 86.49, us: true },
  { name: 'Memori', note: 'prev. SOTA', value: 81.95 },
  { name: 'LangMem', note: 'corrected', value: 78.05 },
  { name: 'Mem0', note: 'baseline', value: 62.47 },
];

/** Stat chips beneath the bars. */
const MEMORY_STATS: ReadonlyArray<{ value: string; label: React.ReactNode }> = [
  { value: '+4.54', label: <>points over the prior best · <b className="text-foreground font-semibold">z = 4.64, p &lt; 10⁻⁵</b></> },
  { value: '92.27%', label: <>single-hop recall — <b className="text-foreground font-semibold">~1pt off the full-context ceiling</b></> },
  { value: '100%', label: <>local — warm recalls in <b className="text-foreground font-semibold">58–83 ms</b>, on-device</> },
];

// ───────────────────────────────────────────────────────────────────────────

type View = 'caps' | 'memory';

const VIEW_LABELS: Record<View, React.ReactNode> = {
  caps: <><b className="text-foreground font-semibold">Capabilities</b> — where Waggle sits vs the field</>,
  memory: <><b className="text-foreground font-semibold">Memory SOTA</b> — the one head-to-head lab result</>,
};

const MARK_GLYPH: Record<Mark, string> = { Y: '●', P: '◐', N: '○' };

/** Colour a mark by kind. The Waggle (first) column reads honey. */
function markClass(mark: Mark, isUs: boolean): string {
  if (isUs && mark === 'Y') return 'font-bold';
  if (mark === 'Y') return '';
  if (mark === 'P') return '';
  return 'opacity-60';
}

function markStyle(mark: Mark, isUs: boolean): React.CSSProperties {
  if (isUs) return { color: 'var(--honey)' };
  if (mark === 'Y') return { color: 'var(--healthy)' };
  if (mark === 'P') return { color: 'var(--attention)' };
  return { color: 'var(--text-2)' };
}

/** One disclaimer/caveat block — shared between the two views. */
function Disclaimer({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mt-4 flex items-start gap-3 rounded-xl px-4 py-3.5"
      style={{ background: 'var(--bg-2)', border: '1px solid var(--line-soft)' }}
    >
      <Info className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--text-muted, hsl(var(--muted-foreground)))' }} />
      <p className="text-xs leading-relaxed text-muted-foreground m-0">{children}</p>
    </div>
  );
}

const BenchmarkApp = () => {
  const [view, setView] = useState<View>('caps');

  return (
    <div className="flex flex-col h-full">
      {/* Controls bar — segmented toggle + live view label */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border/40 shrink-0">
        <BarChart3 className="w-5 h-5" style={{ color: 'var(--honey)' }} />
        <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground hidden sm:inline">
          Benchmarks · view
        </span>
        <div
          role="tablist"
          aria-label="Benchmark view"
          className="inline-flex gap-1 p-[3px] rounded-[10px]"
          style={{ background: 'var(--secondary, hsl(var(--secondary)))', border: '1px solid var(--line-soft)' }}
        >
          {(['caps', 'memory'] as View[]).map(v => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`text-[12.5px] font-display font-semibold px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${
                view === v ? '' : 'text-muted-foreground hover:text-foreground'
              }`}
              style={view === v ? { background: 'var(--honey)', color: '#1a1407' } : undefined}
            >
              {v === 'caps' ? 'vs competitors' : 'Memory SOTA'}
            </button>
          ))}
        </div>
        <span className="text-[12.5px] text-muted-foreground ml-1 hidden md:inline">{VIEW_LABELS[view]}</span>
      </div>

      {/* Stage */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="max-w-[1000px] mx-auto px-8 py-7 pb-16">
          {view === 'caps' ? <CapabilitiesView /> : <MemorySotaView />}
        </div>
      </div>
    </div>
  );
};

function CapabilitiesView() {
  return (
    <div role="tabpanel" aria-label="Capabilities">
      <header className="mb-6">
        <div
          className="font-mono text-[11px] uppercase tracking-[0.14em] mb-3 flex items-center gap-2.5"
          style={{ color: 'var(--honey)' }}
        >
          <span className="inline-block w-5 h-px" style={{ background: 'var(--honey-line)' }} aria-hidden="true" />
          How we&apos;re different
        </div>
        <h1 className="text-[28px] font-display font-semibold tracking-tight leading-tight m-0 mb-2.5 text-foreground">
          They automate tasks. <em className="not-italic" style={{ color: 'var(--honey)' }}>Waggle remembers you.</em>
        </h1>
        <p className="text-[15px] text-muted-foreground leading-relaxed m-0 max-w-[64ch]">
          The strong agents today are <b className="text-foreground font-medium">terminal coding tools</b> for engineers.
          Waggle plays a different game: a <b className="text-foreground font-medium">persistent, local-first memory layer</b> for
          knowledge workers that even <b className="text-foreground font-medium">runs those agents inside it</b>. Here&apos;s the
          honest lay of the land.
        </p>
      </header>

      {/* Two framing cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-7">
        <article
          className="p-5 rounded-2xl"
          style={{ background: 'var(--card, hsl(var(--card)))', border: '1px solid var(--line-soft)' }}
        >
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] mb-2.5 text-muted-foreground">The field</div>
          <h3 className="text-lg font-display font-semibold tracking-tight m-0 mb-2 text-foreground">Task agents</h3>
          <p className="m-0 text-[13px] text-muted-foreground leading-relaxed">
            Powerful, mostly terminal-based, model-locked, and built for developers. Each session starts fresh; the
            intelligence lives in the model, not in a memory of you.
          </p>
          <div className="mt-3 text-[11.5px] text-muted-foreground/80">
            <b className="text-foreground/90 font-medium">Claude Code · Codex · Claude Cowork · Hermes · Odysseus</b>
          </div>
        </article>

        <article
          className="p-5 rounded-2xl"
          style={{
            border: '1px solid var(--honey-line)',
            background: 'linear-gradient(155deg, var(--secondary, hsl(var(--secondary))), var(--card, hsl(var(--card))))',
          }}
        >
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] mb-2.5" style={{ color: 'var(--honey)' }}>
            Our category
          </div>
          <h3 className="text-lg font-display font-semibold tracking-tight m-0 mb-2 text-foreground">
            A memory layer + workspace
          </h3>
          <p className="m-0 text-[13px] text-muted-foreground leading-relaxed">
            Knows you and your work across every session, runs on any model (even local), is built for non-technical
            experts — and can launch the task agents into its shared memory.
          </p>
          <div className="mt-3 text-[11.5px] text-muted-foreground/80">
            <b className="text-foreground/90 font-medium">Waggle</b> — complements them, doesn&apos;t compete head-on
          </div>
        </article>
      </div>

      {/* Capability matrix */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: 'var(--card, hsl(var(--card)))', border: '1px solid var(--line-soft)' }}
      >
        <table className="w-full border-collapse">
          <caption className="sr-only">Capability comparison: Waggle versus task agents</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="text-left text-[13px] font-semibold p-3 w-[32%] text-foreground"
                style={{ borderBottom: '1px solid var(--line-soft)', background: 'var(--secondary, hsl(var(--secondary)))' }}
              >
                Capability
              </th>
              <th
                scope="col"
                className="text-center text-[11.5px] font-semibold p-3"
                style={{
                  color: 'var(--honey)',
                  borderBottom: '1px solid var(--line-soft)',
                  background: 'color-mix(in srgb, var(--honey) 7%, transparent)',
                }}
              >
                Waggle
              </th>
              {COMPETITORS.map(c => (
                <th
                  key={c.name}
                  scope="col"
                  className="text-center text-[11.5px] font-semibold p-3 text-foreground/90"
                  style={{ borderBottom: '1px solid var(--line-soft)', background: 'var(--secondary, hsl(var(--secondary)))' }}
                >
                  <span className="whitespace-nowrap">{c.name}</span>
                  <span className="block font-mono font-normal text-[9.5px] mt-0.5 text-muted-foreground/70">{c.sub}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CAPABILITY_MATRIX.map((row, rowIdx) => {
              const isLast = rowIdx === CAPABILITY_MATRIX.length - 1;
              return (
                <tr key={row.capability}>
                  <th
                    scope="row"
                    className="text-left text-[13px] font-normal p-3 w-[32%]"
                    style={{ borderBottom: '1px solid var(--line-soft)', color: 'var(--text-2)' }}
                  >
                    {row.capability}
                  </th>
                  {row.marks.map((mark, colIdx) => {
                    const isUs = colIdx === 0;
                    return (
                      <td
                        key={colIdx}
                        className="text-center p-3"
                        aria-label={mark === 'Y' ? 'Yes' : mark === 'P' ? 'Partial' : 'No'}
                        style={{
                          borderBottom: isUs && isLast ? '1px solid var(--honey-line)' : '1px solid var(--line-soft)',
                          ...(isUs
                            ? {
                                background: 'color-mix(in srgb, var(--honey) 7%, transparent)',
                                borderLeft: '1px solid var(--honey-line)',
                                borderRight: '1px solid var(--honey-line)',
                              }
                            : {}),
                        }}
                      >
                        <span
                          className={`inline-grid place-items-center w-[22px] h-[22px] text-[13px] ${markClass(mark, isUs)}`}
                          style={markStyle(mark, isUs)}
                        >
                          {MARK_GLYPH[mark]}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-4 text-[12.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span style={{ color: 'var(--healthy)' }}>●</span>Yes
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span style={{ color: 'var(--attention)' }}>◐</span>Partial / limited
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span style={{ color: 'var(--text-2)' }}>○</span>No / not the focus
        </span>
      </div>

      <Disclaimer>
        <b className="text-foreground/90 font-medium">This is a positioning view, not a lab benchmark</b> — capabilities as
        understood June 2026, focused on the dimensions Waggle is built around. Coding agents are genuinely excellent at
        deep code work (the last row), which is exactly why Waggle <b className="text-foreground/90 font-medium">launches them</b>{' '}
        rather than replacing them. The one head-to-head lab result is the memory benchmark → see &ldquo;Memory SOTA&rdquo;.
      </Disclaimer>
    </div>
  );
}

function MemorySotaView() {
  const maxValue = Math.max(...MEMORY_BARS.map(b => b.value));

  return (
    <div role="tabpanel" aria-label="Memory SOTA">
      <header className="mb-6">
        <div
          className="font-mono text-[11px] uppercase tracking-[0.14em] mb-3 flex items-center gap-2.5"
          style={{ color: 'var(--honey)' }}
        >
          <span className="inline-block w-5 h-px" style={{ background: 'var(--honey-line)' }} aria-hidden="true" />
          State of the art · LoCoMo · June 2026
        </div>
        <h1 className="text-[28px] font-display font-semibold tracking-tight leading-tight m-0 mb-2.5 text-foreground">
          The best long-term memory <em className="not-italic" style={{ color: 'var(--honey)' }}>on record.</em>
        </h1>
        <p className="text-[15px] text-muted-foreground leading-relaxed m-0 max-w-[64ch]">
          On <b className="text-foreground font-medium">LoCoMo</b> — the standard test for long-term conversational memory —
          Waggle&apos;s open-source substrate scores <b className="text-foreground font-medium">86.49%</b>, a new state of the
          art, measured under the prior leader&apos;s own protocol and judge.
        </p>
      </header>

      {/* LoCoMo bars */}
      <div className="grid gap-3 mt-2">
        {MEMORY_BARS.map(bar => (
          <div
            key={bar.name}
            className="grid items-center gap-4"
            style={{ gridTemplateColumns: '180px 1fr 64px' }}
          >
            <div className="text-[13.5px] font-semibold text-right leading-tight text-foreground">
              {bar.name}
              <small className="block font-normal font-mono text-[10.5px] mt-0.5 text-muted-foreground/70">{bar.note}</small>
            </div>
            <div
              className="h-[34px] rounded-[9px] overflow-hidden"
              role="img"
              aria-label={`${bar.name}: ${bar.value} percent`}
              style={{ background: 'var(--card, hsl(var(--card)))', border: '1px solid var(--line-soft)' }}
            >
              <div
                className="h-full rounded-l-lg"
                style={{
                  width: `${(bar.value / maxValue) * 100}%`,
                  ...(bar.us
                    ? {
                        background: 'linear-gradient(90deg, var(--honey-deep), var(--honey-bright))',
                        boxShadow: 'var(--shadow-honey)',
                      }
                    : { background: 'var(--muted, hsl(var(--muted)))' }),
                }}
              />
            </div>
            <div
              className="font-mono text-sm font-semibold"
              style={{ color: bar.us ? 'var(--honey)' : 'var(--text-2)' }}
            >
              {bar.value}
            </div>
          </div>
        ))}
      </div>

      {/* Stat chips */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 my-6">
        {MEMORY_STATS.map((stat, i) => (
          <div
            key={i}
            className="p-5 rounded-2xl"
            style={{ background: 'var(--card, hsl(var(--card)))', border: '1px solid var(--line-soft)' }}
          >
            <div className="text-[32px] font-display font-extrabold tracking-tight" style={{ color: 'var(--honey)' }}>
              {stat.value}
            </div>
            <div className="text-[13px] text-muted-foreground mt-1.5">{stat.label}</div>
          </div>
        ))}
      </div>

      <Disclaimer>
        <b className="text-foreground/90 font-medium">LoCoMo</b>, N = 1,540, GPT-4.1-mini as answerer &amp; judge — the prior
        SOTA&apos;s exact published protocol, reproduced in-harness to 0.03 points before comparison. The intelligence lives in
        the <b className="text-foreground/90 font-medium">memory layer, not the model</b>, so it travels onto a small local
        model too. Honest caveat: higher token use per question than the leanest systems; efficiency work underway.
        Reproducible offline:{' '}
        <span className="font-mono" style={{ color: 'var(--text-2)' }}>github.com/marolinik/hive-mind</span>.
      </Disclaimer>
    </div>
  );
}

export default BenchmarkApp;
