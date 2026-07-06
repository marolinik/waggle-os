/**
 * ExtensionCard — one entry in the Warm-Hive Marketplace grid (PR4 Variation
 * A). Type-aware one-click verbs driven by the shared install store:
 *   package  → Add     (Adding…)    → Installed
 *   connector→ Connect (Signing in…)→ Connected   (token-paste / OAuth→Hub, D3)
 *   mcp      → Enable  (Enabling…)  → Enabled
 * Lifecycle, scan/trust and source all render as TEXT (a11y — never colour
 * alone). The destructive Remove direction is delegated to the parent so it
 * keeps its consequence dialog; install/connect/enable are one-click (§09).
 */
import { useState } from 'react';
import { Download, ExternalLink, Loader2, Plug, Trash2, Zap } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { Input } from '@/components/ui/input';
import type { Extension } from '@/lib/extension-catalog';
import { isTogglable } from '@/lib/install-store';
import { useInstallStore } from '@/providers/InstallProvider';
import BrandTile from '../connectors/BrandTile';
import { getBrandIdentity } from '../connectors/brand-identity';

/** Humanize raw registry slugs ("agent-skills" → "Agent Skills") for display.
 *  Curated names (mixed case, spaces, digits-first like "1Password") pass
 *  through untouched — only all-lowercase dash/underscore slugs transform. */
export function displayExtensionName(name: string): string {
  if (!/^[a-z0-9]+([-_][a-z0-9]+)*$/.test(name)) return name;
  return name
    .split(/[-_]/)
    .map(t => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t))
    .join(' ');
}

/** Scan outcomes with a real verdict. "not_scanned" is rendered separately as
 *  a NEUTRAL outline chip (round-4: unknown ≠ alarm — the amber chip made
 *  every unscanned entry read as a warning; "Scan failed" stays the alarm). */
const SCAN_LABELS: Record<string, { tone: 'healthy' | 'attention' | 'risk'; label: string }> = {
  passed: { tone: 'healthy', label: 'Scan passed' },
  failed: { tone: 'risk', label: 'Scan failed' },
};

const NOT_SCANNED_TOOLTIP =
  "This package hasn't been security-scanned yet — installs are recorded in the audit trail";

/** Which one-click verb a togglable extension shows, by kind/type. */
type ActionKey = 'package' | 'connector' | 'mcp';
const VERBS: Record<ActionKey, { idle: string; busy: string; installed: string; Icon: typeof Download }> = {
  package: { idle: 'Add', busy: 'Adding…', installed: 'Installed', Icon: Download },
  connector: { idle: 'Connect', busy: 'Signing in…', installed: 'Connected', Icon: Plug },
  mcp: { idle: 'Enable', busy: 'Enabling…', installed: 'Enabled', Icon: Zap },
};

function actionKey(ext: Extension): ActionKey | null {
  if (ext.kind === 'package') return 'package';
  if (ext.type === 'connector') return 'connector';
  if (ext.type === 'mcp') return 'mcp';
  return null;
}

/** FOUNDER CONSTRAINT (round-4): Add / Connect / Enable KEEP their distinct
 *  words (renaming declined) — instead the three verbs share ONE visual
 *  weight, so the action rail reads as a single system. Every primary action
 *  (verb button + inline token submit) uses this exact treatment. */
const PRIMARY_ACTION_CLASS =
  'flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg text-honey hover:bg-primary/10 group-hover:bg-primary/10 group-focus-within:bg-primary/10 transition-colors disabled:opacity-50';

/** ONE chip grammar (R10 / Wave-S Lane C) — TWO species, app-wide:
 *   FILLED  (category / type / trust / source form): line-soft border,
 *           surface-2 fill, muted 11px text — the quiet lozenge below.
 *   OUTLINE (status: Available / Installed / scan verdict): tone border+text
 *           via StatusBadge + the healthy install pill — never a filled tag.
 *  Keeping the two visually distinct stops the row carrying two competing
 *  lozenge styles for two different meanings. */
const TAG_CHIP =
  'rounded-full border border-[var(--line-soft)] bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]';
/** FILLED species with a leading glyph — used for the multi-form source chips. */
const TAG_CHIP_GLYPH = `inline-flex items-center gap-1 ${TAG_CHIP}`;

/** User-language nouns for the dedup provenance forms (`ext.sources`) —
 *  registry jargon translated to what each form DOES for the user: a package
 *  installs a skill, an mcp row runs an MCP server (round-6 judge finding:
 *  "Connector + MCP + Package" reads as internals, not a benefit). */
const SOURCE_NOUNS: Record<string, string> = {
  connector: 'connector',
  mcp: 'MCP server',
  package: 'skill',
  pack: 'skill pack',
};

/** Glyph + short word per integration form — the multi-form row renders one
 *  FILLED glyph chip per form (all sharing one tooltip) instead of a single
 *  sentence chip (Wave-S Lane C: no sentence chips). */
const SOURCE_FORM_META: Record<string, { Icon: typeof Download; label: string }> = {
  connector: { Icon: Plug, label: 'connector' },
  mcp: { Icon: Zap, label: 'MCP' },
  package: { Icon: Download, label: 'skill' },
  pack: { Icon: Download, label: 'skill pack' },
};

/** "Works as connector & MCP server" — one human phrase for a multi-form
 *  integration, truthfully derived from the merged `ext.sources`. */
export function describeSourceForms(sources: string[]): string {
  const nouns = [...new Set(sources.map(s => SOURCE_NOUNS[s] ?? s))];
  if (nouns.length === 0) return '';
  const list = nouns.length === 1
    ? nouns[0]
    : `${nouns.slice(0, -1).join(', ')} & ${nouns[nouns.length - 1]}`;
  return `Works as ${list}`;
}

/** One metadata chip descriptor. Glyph chips (multi-form source markers) carry
 *  an Icon; the rest are plain FILLED lozenges — still the two Wave-S species. */
interface MetaChip {
  key: string;
  label: string;
  Icon?: typeof Download;
  capitalize?: boolean;
  sourceForm?: boolean;
}

/** Number of metadata chips shown before the rest fold into a "+N" chip. */
export const META_VISIBLE_CAP = 3;

/** Metadata budget (Wave T Lane B §2): one priority-ordered, deduped chip set —
 *  type, then the multi-form source glyphs (the differentiator), then category,
 *  trust, and the registry source. Deduped by label (case-insensitive) so a
 *  connector that also runs as an MCP no longer shows "connector" twice; the
 *  caller caps the result to META_VISIBLE_CAP + a "+N" overflow chip. */
export function buildMetaChips(ext: Extension): MetaChip[] {
  const raw: MetaChip[] = [{ key: 'type', label: ext.type }];
  if (ext.sources && ext.sources.length > 1) {
    for (const s of [...new Set(ext.sources)]) {
      const meta = SOURCE_FORM_META[s];
      raw.push({ key: `form-${s}`, label: meta?.label ?? s, Icon: meta?.Icon, sourceForm: true });
    }
  }
  if (ext.category) raw.push({ key: 'category', label: ext.category });
  if (ext.trust) raw.push({ key: 'trust', label: ext.trust, capitalize: true });
  if (ext.source) raw.push({ key: 'source', label: ext.source });

  const seen = new Set<string>();
  return raw.filter(c => {
    const n = c.label.trim().toLowerCase();
    if (seen.has(n)) return false;
    seen.add(n);
    return true;
  });
}

interface ExtensionCardProps {
  ext: Extension;
  /** Destructive uninstall — opens the parent's consequence dialog. */
  onRemove?: (ext: Extension) => void;
  /** Deep-link to a managing app (Hub) for OAuth connect + installed management. */
  onOpenIn?: (appId: string) => void;
}

const ExtensionCard = ({ ext, onRemove, onOpenIn }: ExtensionCardProps) => {
  const { isInstalled, isInstalling, install } = useInstallStore();
  const [showToken, setShowToken] = useState(false);
  const [token, setToken] = useState('');

  const scan = ext.scanStatus ? SCAN_LABELS[ext.scanStatus] : null;
  const key = actionKey(ext);
  // The store is authoritative for togglable kinds (so an install done in any
  // view reflects here); packs fall back to their loaded row. A deduped winner
  // resolves installed across its own id AND its absorbed alt forms (altIds),
  // so enabling the MCP twin elsewhere lights up the merged connector row too.
  const installed = isTogglable(ext)
    ? isInstalled(ext.id) || (ext.altIds ?? []).some(isInstalled)
    : ext.installed;
  const busy = isInstalling(ext.id);
  const verb = key ? VERBS[key] : null;
  const isOAuthConnector = ext.type === 'connector' && ext.authType === 'oauth2';
  // Connected connectors read alive at a glance: the BrandTile gets its
  // connected ring AND the row warms up (quiet honey left hairline + wash).
  const connectedRow = !!installed && ext.type === 'connector';
  // Metadata budget (Wave T Lane B §2): deduped, capped chip set + overflow.
  const metaChips = buildMetaChips(ext);
  const shownChips = metaChips.slice(0, META_VISIBLE_CAP);
  const overflowChips = metaChips.slice(META_VISIBLE_CAP);
  const firstSourceFormKey = shownChips.find(c => c.sourceForm)?.key;

  const runPrimary = async () => {
    if (ext.type === 'connector') {
      if (isOAuthConnector) { onOpenIn?.(ext.openIn?.appId ?? 'connectors'); return; }
      setShowToken(true);
      return;
    }
    await install(ext); // package (Add) / catalog mcp (Enable) — one-click
  };

  const submitToken = async () => {
    const outcome = await install(ext, { token: token.trim() });
    if (outcome.ok) { setShowToken(false); setToken(''); }
  };

  return (
    <div
      data-testid="extension-card"
      // Row hover tier (Wave T Lane B §3 · Wave V Lane C motion tier 2): rest
      // flat → hover/focus-within adds a motion-safe 2px lift + blooms the
      // elevation to the honey glow (--shadow-honey) and warms the border to
      // honey, 150ms ease-out. Reduced motion keeps the color tier (border +
      // bloom) and drops only the lift. `group` lets the primary action gain
      // full contrast on row hover (see PRIMARY_ACTION_CLASS).
      className={`group flex items-start gap-3 px-3 py-2.5 rounded-xl border bg-card transition-all duration-150 ease-out motion-safe:hover:-translate-y-0.5 motion-safe:focus-within:-translate-y-0.5 ${
        connectedRow
          // Rest elevation folded INTO the inset honey hairline (one combined
          // box-shadow — two shadow-* utilities on one element would collide).
          ? 'border-[var(--honey-line)] shadow-[inset_2px_0_0_0_var(--honey),var(--shadow-sm)] hover:shadow-[inset_2px_0_0_0_var(--honey),var(--shadow-honey)] focus-within:shadow-[inset_2px_0_0_0_var(--honey),var(--shadow-honey)] bg-gradient-to-r from-[var(--honey-wash)] to-transparent'
          : 'border-border/30 shadow-[var(--shadow-sm)] hover:border-[var(--honey-line)] hover:shadow-[var(--shadow-honey)] focus-within:border-[var(--honey-line)] focus-within:shadow-[var(--shadow-honey)]'
      }`}
    >
      {/* Brand identity tile (simple-icons mark or monogram) — no more
          one-generic-cube-for-everything (2026-07-06 judge finding). */}
      <BrandTile
        identity={getBrandIdentity(ext.id, ext.name, ext.category ?? '')}
        size={40}
        connected={!!installed && ext.type === 'connector'}
        className="mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-display font-medium text-foreground truncate">{displayExtensionName(ext.name)}</span>
          {installed ? (
            // Warm sage healthy grammar (--healthy / --healthy-wash) — the same
            // token agents/home chips use. NOT --sem-healthy (emerald), which
            // read as off-palette teal here (R10 Lane C, brand judge).
            <span
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
              style={{
                color: 'var(--healthy)',
                borderColor: 'color-mix(in srgb, var(--healthy) 35%, transparent)',
                backgroundColor: 'var(--healthy-wash)',
              }}
            >
              <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--healthy)' }} />
              {verb?.installed ?? 'Installed'}
            </span>
          ) : (
            <StatusBadge tone="neutral" label="Available" />
          )}
          {ext.scanStatus === 'not_scanned' ? (
            <span title={NOT_SCANNED_TOOLTIP}>
              {/* Neutral quiet chip — "pending", not a shield-warning (R10 kw). */}
              <StatusBadge tone="neutral" label="Safety scan pending" />
            </span>
          ) : scan ? (
            <StatusBadge tone={scan.tone} label={scan.label} />
          ) : null}
        </div>
        <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{ext.description}</p>
        {/* Metadata row (Wave T Lane B §2): the deduped chip set, capped at
            META_VISIBLE_CAP with a "+N" overflow chip (tooltip lists the rest).
            Two species only (Wave-S grammar): FILLED lozenge + FILLED glyph —
            the multi-form source glyphs keep ONE shared "Works as …" tooltip. */}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {shownChips.map(c => {
            const Icon = c.Icon;
            return (
              <span
                key={c.key}
                {...(c.key === firstSourceFormKey ? { 'data-testid': 'extension-sources' } : {})}
                className={Icon ? TAG_CHIP_GLYPH : (c.capitalize ? `${TAG_CHIP} capitalize` : TAG_CHIP)}
                title={c.sourceForm ? describeSourceForms(ext.sources ?? []) : undefined}
              >
                {Icon && <Icon className="w-3 h-3 shrink-0" aria-hidden />}
                {c.label}
              </span>
            );
          })}
          {overflowChips.length > 0 && (
            <span
              data-testid="extension-tags-overflow"
              className={TAG_CHIP}
              title={overflowChips.map(c => c.label).join(', ')}
            >
              +{overflowChips.length}
            </span>
          )}
        </div>

        {/* In-place connector token-paste (bearer/api_key/basic). OAuth never
            reaches here — it deep-links to the Hub above. */}
        {showToken && (
          <div className="flex items-center gap-1.5 mt-2">
            <Input
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="Paste API token — stored in your vault"
              data-testid="connector-token-input"
              className="flex-1 h-7 text-[11px]"
              autoFocus
            />
            <button
              onClick={() => void submitToken()}
              disabled={busy || token.trim() === ''}
              data-testid="connector-token-submit"
              className={PRIMARY_ACTION_CLASS}
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Connect'}
            </button>
            <button
              onClick={() => { setShowToken(false); setToken(''); }}
              data-testid="connector-token-cancel"
              className="px-2 py-1 text-[11px] rounded-lg text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      <div className="shrink-0">
        {!verb ? (
          // Browse-only (pack) — no install path exists. Label it so the
          // absent button reads as intentional, not broken.
          <span className="text-[11px] text-muted-foreground">Browse only</span>
        ) : installed ? (
          ext.kind === 'package' && onRemove ? (
            <button
              onClick={() => onRemove(ext)}
              className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="w-3 h-3" /> Remove
            </button>
          ) : ext.openIn && onOpenIn ? (
            // Installed connector/mcp — manage (incl. disconnect/disable) in the Hub.
            <button
              onClick={() => onOpenIn(ext.openIn!.appId)}
              className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            >
              <ExternalLink className="w-3 h-3" /> {ext.openIn.label}
            </button>
          ) : null
        ) : (
          // Not installed — the type-aware one-click verb.
          <button
            onClick={() => void runPrimary()}
            disabled={busy || showToken}
            data-testid={`extension-install-${ext.id}`}
            className={PRIMARY_ACTION_CLASS}
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <verb.Icon className="w-3 h-3" />}
            {busy ? verb.busy : verb.idle}
          </button>
        )}
      </div>
    </div>
  );
};

export default ExtensionCard;
