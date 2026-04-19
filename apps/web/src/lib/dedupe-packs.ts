import type { SkillPack } from '@/lib/types';

/**
 * Stable key for pack identity — prefer id, fall back to name. Closes L-17 C4:
 * the Capabilities app concatenates skills, starter-pack, and capability-pack
 * catalogs, and the marketplace tab reads a fourth source. Without a dedup
 * step the same logical pack can surface twice under different sources.
 */
export function packKey(pack: SkillPack): string {
  return pack.id || pack.name || '';
}

/**
 * Deduplicate a list of SkillPacks by id||name, keeping the first occurrence.
 * Ordering matters — callers should concatenate the most-authoritative source
 * first (e.g., installed skills before catalog entries) so the "installed"
 * flag isn't lost to a catalog copy.
 */
export function dedupePacks(packs: SkillPack[]): SkillPack[] {
  const seen = new Set<string>();
  const result: SkillPack[] = [];
  for (const p of packs) {
    const key = packKey(p);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(p);
  }
  return result;
}
