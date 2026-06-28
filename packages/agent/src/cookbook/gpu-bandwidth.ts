/**
 * Memory-bandwidth lookup (GB/s) for the tok/s model. Clean-room port of the
 * *concept* in Odysseus `fit.py` GPU_BANDWIDTH / APPLE_BANDWIDTH_FIXED — scope-cut
 * to consumer NVIDIA (RTX 20/30/40/50), a handful of consumer AMD Radeon, and
 * Apple Silicon. Datacenter (H100/A100/MI300…) and Apple core-count binning are cut:
 * Waggle's HardwareInfo carries no gpu_cores, so Apple resolves to the conservative
 * tier (Odysseus's own fallback when cores are unknown). Substring match, longest
 * key first, so "4070 ti super" wins over "4070".
 * (AGPL-3.0: tables/control-flow re-authored from the math, no code copied.)
 */

const CONSUMER_GPU_BANDWIDTH: Readonly<Record<string, number>> = {
  // NVIDIA RTX 50
  '5090': 1792, '5080': 960, '5070 ti': 896, '5070': 672, '5060 ti': 448, '5060': 256,
  // NVIDIA RTX 40
  '4090': 1008, '4080 super': 736, '4080': 717, '4070 ti super': 672, '4070 ti': 504,
  '4070 super': 504, '4070': 504, '4060 ti': 288, '4060': 272,
  // NVIDIA RTX 30
  '3090 ti': 1008, '3090': 936, '3080 ti': 912, '3080': 760, '3070 ti': 608,
  '3070': 448, '3060 ti': 448, '3060': 360, '3050': 224,
  // NVIDIA RTX 20 / GTX 16 (older laptops)
  '2080 ti': 616, '2080': 448, '2070': 448, '2060': 336, '1660 ti': 288, '1650': 128,
  // AMD Radeon (consumer RDNA)
  '7900 xtx': 960, '7900 xt': 800, '7800 xt': 624, '7700 xt': 432, '7600': 288,
  '9070 xt': 624, '9070': 488, '6800 xt': 512, '6700 xt': 384, '6600': 224,
};

// Apple Silicon unified-memory bandwidth (GB/s). Conservative tier per family
// (no gpu_cores in HardwareInfo → cannot bin M*Max variants; pick the floor).
const APPLE_BANDWIDTH: Readonly<Record<string, number>> = {
  'm1 ultra': 800, 'm1 max': 400, 'm1 pro': 200, 'm1': 68,
  'm2 ultra': 800, 'm2 max': 400, 'm2 pro': 200, 'm2': 100,
  'm3 ultra': 800, 'm3 max': 300, 'm3 pro': 150, 'm3': 100,
  'm4 max': 410, 'm4 pro': 273, 'm4': 120,
};

const CONSUMER_KEYS = Object.keys(CONSUMER_GPU_BANDWIDTH).sort((a, b) => b.length - a.length);
const APPLE_KEYS = Object.keys(APPLE_BANDWIDTH).sort((a, b) => b.length - a.length);

/** Conservative fallback bandwidth by backend class when the GPU isn't in the table. */
export const FALLBACK_K: Readonly<Record<string, number>> = {
  cuda: 220, rocm: 180, metal: 150, cpu_x86: 70, cpu_arm: 90,
};

/** Resolve VRAM/unified-memory bandwidth from a GPU name. null = not found. */
export function lookupBandwidth(gpuName: string | null | undefined): number | null {
  if (!gpuName) return null;
  const gn = gpuName.toLowerCase();
  // Apple first (its names carry "apple", never collide with NVIDIA/AMD keys).
  if (gn.includes('apple')) {
    for (const key of APPLE_KEYS) if (gn.includes(key)) return APPLE_BANDWIDTH[key];
  }
  for (const key of CONSUMER_KEYS) if (gn.includes(key)) return CONSUMER_GPU_BANDWIDTH[key];
  return null;
}
