/**
 * PlatformApp — Warm-Hive "Platform & roadmap" showcase (screen 18).
 *
 * Three static, pure-UI showcase tabs behind a segmented toggle:
 *   1. Desktop (now) — a desktop-window mock with a macOS ↔ Windows title-bar
 *      toggle, a mini app inside, and the install spec tiles.
 *   2. Boot          — a STATIC boot-screen showcase (D6: NOT wired to the real
 *      AppShell / BootScreen — this is a marketing mock only).
 *   3. Coming next   — the surface roadmap as channel cards.
 *
 * No backend, no API, no props (⌘K-only surface). The standalone NotFound route
 * (pages/NotFound.tsx) is the real 404 — per D5 it is NOT a tab here.
 *
 * Warm tokens only (D21): honey via `primary` / `--honey-*`, neutrals via the
 * warm `--text*` / `--surface*` / `--line*` CSS vars (the warm-hive convention,
 * matching WorkspaceDesktopApp). No raw emerald/violet/amber/sky.
 */
import { useState, type ReactNode } from 'react';
import {
  Monitor, Puzzle, MessageCircle, Smartphone, Check, Loader2,
} from 'lucide-react';

type Tab = 'desktop' | 'boot' | 'roadmap';
type Os = 'mac' | 'win';

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'desktop', label: 'Desktop (now)' },
  { id: 'boot', label: 'Boot' },
  { id: 'roadmap', label: 'Coming next' },
];

interface Spec {
  value: string;
  label: string;
}
const SPECS: ReadonlyArray<Spec> = [
  { value: '~12 MB', label: 'Install size' },
  { value: 'Local', label: 'Data on your disk' },
  { value: 'Auto-update', label: 'Signed & notarized' },
  { value: 'Win · Mac', label: 'Linux soon' },
];

interface BootStep {
  text: string;
  state: 'done' | 'active' | 'pending';
}
const BOOT_STEPS: ReadonlyArray<BootStep> = [
  { text: 'Memory engine ready · 581 memories', state: 'done' },
  { text: 'Local model online · Qwen 2.5', state: 'done' },
  { text: 'Loading workspaces… 8 found', state: 'active' },
  { text: 'Restoring your last session', state: 'pending' },
];

type ChannelStatus = 'now' | 'beta' | 'next';
interface Channel {
  icon: typeof Monitor;
  title: string;
  blurb: string;
  platforms: ReadonlyArray<string>;
  status: ChannelStatus;
  statusLabel: string;
  /** Icon-tile tint — per-channel per design (platform.html:160-175): honey/work/intel-wash. */
  tint: string;
}
const CHANNELS: ReadonlyArray<Channel> = [
  {
    icon: Monitor,
    title: 'Desktop app',
    blurb: 'The full hive — native, local, fast.',
    platforms: ['macOS', 'Windows', 'Linux soon'],
    status: 'now',
    statusLabel: 'Available now',
    tint: 'var(--honey-wash)',
  },
  {
    icon: Puzzle,
    title: 'Browser extension',
    blurb: 'Capture context & recall memory anywhere on the web.',
    platforms: ['Chrome', 'Edge', 'Firefox'],
    status: 'beta',
    statusLabel: 'In beta',
    tint: 'var(--work-wash)',
  },
  {
    icon: MessageCircle,
    title: 'Messaging',
    blurb: 'Talk to your hive from where you already chat — same memory, same agents.',
    platforms: ['WhatsApp', 'Telegram', 'iMessage'],
    status: 'next',
    statusLabel: 'Coming next',
    tint: 'var(--honey-wash)',
  },
  {
    icon: Smartphone,
    title: 'Mobile',
    blurb: 'Your morning briefing and quick capture, in your pocket.',
    platforms: ['iOS', 'Android'],
    status: 'next',
    statusLabel: 'Coming next',
    tint: 'var(--intel-wash)',
  },
];

/** Warm status pill colors (D21 — sage / dusty-blue / honey via warm vars). */
const STATUS_STYLE: Record<ChannelStatus, string> = {
  now: 'text-[var(--healthy)] bg-[var(--healthy-wash)]',
  beta: 'text-[var(--work)] bg-[var(--work-wash)]',
  next: 'text-[var(--attention)] bg-[var(--honey-wash)]',
};
const STATUS_GLYPH: Record<ChannelStatus, string> = { now: '●', beta: '◐', next: '' };

function PlatformApp() {
  const [tab, setTab] = useState<Tab>('desktop');
  const [os, setOs] = useState<Os>('mac');

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {/* Controls — segmented toggle */}
      <div className="flex flex-none items-center gap-3.5 border-b border-[var(--line-soft)] px-5 py-2.5">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-[var(--text-dim)]">
          Platform &amp; roadmap
        </span>
        <div role="tablist" aria-label="Platform showcase" className="inline-flex gap-[3px] rounded-[10px] border border-[var(--line-soft)] bg-[var(--surface-2)] p-[3px]">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap rounded-[7px] px-3 py-1.5 text-xs font-semibold transition-colors ${
                tab === t.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-[var(--text-muted)] hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stage */}
      <div className="relative min-h-0 flex-1 overflow-auto">
        {tab === 'desktop' && <DesktopView os={os} onOsChange={setOs} />}
        {tab === 'boot' && <BootView />}
        {tab === 'roadmap' && <RoadmapView />}
      </div>
    </div>
  );
}

interface SectionHeadProps {
  eyebrow: string;
  title: ReactNode;
  blurb: ReactNode;
}
function SectionHead({ eyebrow, title, blurb }: SectionHeadProps) {
  return (
    <div className="mb-6 text-center">
      <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-primary">{eyebrow}</div>
      <h1 className="mb-2.5 font-display text-[28px] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
      <p className="mx-auto max-w-[54ch] text-[15px] leading-relaxed text-[var(--text-muted)]">{blurb}</p>
    </div>
  );
}

interface DesktopViewProps {
  os: Os;
  onOsChange: (os: Os) => void;
}
function DesktopView({ os, onOsChange }: DesktopViewProps) {
  return (
    <div role="tabpanel" aria-label="Desktop (now)" className="mx-auto max-w-[920px] px-8 pb-14 pt-7">
      <SectionHead
        eyebrow="Ships now · Tauri"
        title={<>A real <em className="not-italic text-primary">desktop app.</em></>}
        blurb={
          <>
            Waggle ships as a native app for <b className="text-[var(--text-2)]">Windows &amp; macOS</b> — built on
            Tauri, so it&rsquo;s tiny, fast, and truly local. Your hive lives on your disk; the app just opens a
            window onto it.
          </>
        }
      />

      <div className="mx-auto max-w-[760px]">
        {/* OS toggle */}
        <div role="group" aria-label="Operating system" className="mb-4 flex justify-center gap-1.5">
          {(['mac', 'win'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={os === value}
              onClick={() => onOsChange(value)}
              className={`rounded-[9px] border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                os === value
                  ? 'border-[var(--honey-line)] bg-[var(--honey-wash)] text-primary'
                  : 'border-[var(--line-soft)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-foreground'
              }`}
            >
              {value === 'mac' ? 'macOS' : 'Windows'}
            </button>
          ))}
        </div>

        {/* Window mock */}
        <div className="overflow-hidden rounded-xl border border-[var(--line-strong)] bg-[var(--bg-2)] shadow-[var(--shadow-lg)]">
          <div
            className={`flex h-[38px] items-center gap-2 border-b border-[var(--line-soft)] bg-[var(--surface)] px-3.5 ${
              os === 'win' ? 'flex-row-reverse' : ''
            }`}
          >
            {os === 'mac' ? (
              <div className="flex gap-2" aria-hidden>
                <span className="size-3 rounded-full bg-[#ec6a5e]" />
                <span className="size-3 rounded-full bg-[#f4bf4f]" />
                <span className="size-3 rounded-full bg-[#61c554]" />
              </div>
            ) : (
              <div className="flex" aria-hidden>
                <span className="grid h-[38px] w-[30px] place-items-center text-xs text-[var(--text-muted)]">&#8213;</span>
                <span className="grid h-[38px] w-[30px] place-items-center text-xs text-[var(--text-muted)]">&#9634;</span>
                <span className="grid h-[38px] w-[30px] place-items-center text-xs text-[var(--text-muted)]">&#10005;</span>
              </div>
            )}
            <div className="flex-1 text-center font-mono text-xs text-[var(--text-dim)]">Waggle</div>
          </div>

          <div className="flex sm:h-[300px]">
            {/* Mini sidebar */}
            <div className="w-[120px] flex-none border-r border-[var(--line-soft)] bg-[var(--bg-2)] px-2 py-3.5" aria-hidden>
              {[
                { label: 'Home', on: true },
                { label: 'Chat', on: false },
                { label: 'Memory', on: false },
                { label: 'Agents', on: false },
                { label: 'Library', on: false },
              ].map((item) => (
                <div
                  key={item.label}
                  className={`mb-0.5 flex items-center gap-2 rounded-lg px-2.5 py-[7px] text-xs ${
                    item.on ? 'bg-[var(--honey-wash)] text-foreground' : 'text-[var(--text-2)]'
                  }`}
                >
                  <span className={`size-[13px] rounded ${item.on ? 'bg-primary' : 'bg-[var(--surface-3)]'}`} />
                  {item.label}
                </div>
              ))}
            </div>
            {/* Mini main */}
            <div className="flex-1 bg-background p-[22px]" aria-hidden>
              <div className="font-mono text-[10px] tracking-[0.08em] text-primary">FRIDAY · 8:42</div>
              <h3 className="mb-3.5 mt-2 font-display text-xl font-semibold tracking-[-0.02em]">Good morning, Mara.</h3>
              <div className="mb-2.5 h-[9px] rounded bg-[var(--surface-2)]" />
              <div className="mb-2.5 h-[9px] rounded bg-[var(--surface-2)]" />
              <div className="mb-2.5 h-[9px] w-3/5 rounded bg-[var(--surface-2)]" />
            </div>
          </div>
        </div>
      </div>

      {/* Spec tiles */}
      <div className="mt-[22px] grid grid-cols-2 gap-3 md:grid-cols-4">
        {SPECS.map((s) => (
          <div key={s.label} className="rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--surface)] p-4 text-center">
            <div className="text-base font-bold tracking-[-0.01em]">{s.value}</div>
            <div className="mt-1.5 text-[11px] text-[var(--text-muted)]">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BootView() {
  return (
    <div role="tabpanel" aria-label="Boot" className="mx-auto max-w-[920px] px-8 pb-14 pt-7">
      <div className="flex min-h-[440px] flex-col items-center justify-center text-center">
        <div
          className="boot-hex-pulse mb-6 grid h-20 w-[72px] place-items-center text-[30px] font-extrabold text-[#1a1407]"
          style={{
            background: 'linear-gradient(150deg, var(--honey-bright), var(--honey-deep))',
            clipPath: 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)',
          }}
          aria-hidden
        >
          W
        </div>
        <h1 className="mb-2 whitespace-nowrap font-display text-2xl font-semibold tracking-[-0.02em]">
          Warming the hive…
        </h1>
        <div className="mb-6 font-mono text-xs text-[var(--text-dim)]">waggle · v1.0 · local</div>

        <ul className="grid w-[300px] gap-2 text-left">
          {BOOT_STEPS.map((step) => (
            <li
              key={step.text}
              className={`flex items-center gap-2.5 text-[13px] ${
                step.state === 'pending' ? 'text-[var(--text-dim)]' : 'text-[var(--text-2)]'
              }`}
            >
              <span className="flex size-4 flex-none items-center justify-center" aria-hidden>
                {step.state === 'done' && <Check className="size-4 text-[var(--healthy)]" strokeWidth={2.4} />}
                {step.state === 'active' && <Loader2 className="size-[13px] animate-spin text-primary" />}
              </span>
              {step.text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function RoadmapView() {
  return (
    <div role="tabpanel" aria-label="Coming next" className="mx-auto max-w-[920px] px-8 pb-14 pt-7">
      <SectionHead
        eyebrow="Where Waggle goes"
        title={<>One hive, <em className="not-italic text-primary">everywhere you work.</em></>}
        blurb="Your memory is the constant; the surfaces multiply. Desktop today — your phone and your messaging apps next."
      />
      <div className="grid gap-3">
        {CHANNELS.map((ch) => {
          const Icon = ch.icon;
          return (
            <div
              key={ch.title}
              className={`flex items-center gap-4 rounded-[var(--r-lg)] border bg-[var(--surface)] px-5 py-4 ${
                ch.status === 'now' ? 'border-[var(--honey-line)]' : 'border-[var(--line-soft)]'
              }`}
            >
              <div className="grid size-11 flex-none place-items-center rounded-[var(--r)]" style={{ background: ch.tint }}>
                <Icon className="size-[22px] text-primary" strokeWidth={1.7} aria-hidden />
              </div>
              <div className="flex-1">
                <b className="text-[15.5px] font-semibold">{ch.title}</b>
                <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{ch.blurb}</p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {ch.platforms.map((p) => (
                    <span
                      key={p}
                      className="rounded-md border border-[var(--line-soft)] px-2 py-0.5 font-mono text-[10.5px] text-[var(--text-dim)]"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
              <span className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[11.5px] font-semibold ${STATUS_STYLE[ch.status]}`}>
                {STATUS_GLYPH[ch.status] && <span aria-hidden>{STATUS_GLYPH[ch.status]} </span>}
                {ch.statusLabel}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default PlatformApp;
