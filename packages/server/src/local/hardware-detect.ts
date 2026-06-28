/**
 * Staged local hardware detection for the Cookbook local-model recommend engine.
 *
 * Clean-room TS re-implementation of the per-vendor probe KNOWLEDGE in Odysseus
 * hwfit/hardware.py (AGPL-3.0 — concepts only, no code copied, no binary bundled).
 *
 * Staged by vendor coverage of the Waggle desktop population:
 *   (1) NVIDIA  — nvidia-smi CSV parse, multi-GPU, driver-error vs no-GPU, WSL PATH holes,
 *                 unified-memory parts (Grace/DGX Spark report memory.total=[N/A]).
 *   (2) Apple   — arm64 Darwin: no discrete VRAM; budget a RAM fraction matching macOS
 *                 recommendedMaxWorkingSetSize defaults (0.67 / 0.75 / 0.80).
 *   (3) Basic   — os.* RAM/CPU floor; everything else (AMD / Windows-WMI / Intel) degrades here.
 *
 * Replaces the no-op detectHardwareBasic() that used to live in routes/local-inference.ts
 * (which hardcoded hasGpu:false). Lives server-side because it shells out to nvidia-smi.
 *
 * The staged tail (AMD sysfs, Windows WMI registry qwMemorySize 4GB-cap, container-visibility
 * warning, Apple GPU-core count) is intentionally NOT built — each is a fixed bug from the
 * upstream source, ported as knowledge not code.
 */

import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// ── Public shapes (mirror the old routes/local-inference.ts HardwareInfo, additive) ──

export interface GpuEntry {
  name: string;
  vramGb: number;
  backend: string; // 'cuda' | 'metal'
}

export interface HardwareInfo {
  totalRamGb: number;
  availableRamGb: number;
  cpuCores: number;
  cpuName: string;
  platform: string;
  hasGpu: boolean;
  gpuName: string | null;
  gpuVramGb: number | null;
  gpuCount: number;
  gpus: GpuEntry[];
  backend: string;
  /** Set when nvidia-smi exists but failed (driver/library mismatch). null otherwise. */
  gpuError: string | null;
  /** True when "VRAM" is carved from system RAM (Apple Silicon, Grace/DGX unified parts). */
  unifiedMemory: boolean;
}

/** Detected GPU before assembly (carries CUDA device index for future serve-path pinning). */
export interface DetectedGpu {
  index: number;
  name: string;
  vramGb: number;
}

/**
 * Injectable command runner. Returns combined stdout+stderr (trimmed) when the process produced
 * ANY output — even on a non-zero exit — so a driver-error message survives. Returns null only
 * when the binary could not run at all (ENOENT) or produced nothing. Tests inject a fake.
 */
export type CommandRunner = (command: string, args: readonly string[]) => Promise<string | null>;

/** Injectable OS snapshot so the Apple branch is testable off-Mac. */
export interface SystemProbe {
  platform: string; // os.platform()  e.g. 'darwin' | 'win32' | 'linux'
  arch: string;     // os.arch()      e.g. 'arm64' | 'x64'
  totalRamGb: number;
  freeRamGb: number;
  cpuCores: number;
  cpuName: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

const r1 = (n: number): number => Math.round(n * 10) / 10;

const NVIDIA_DRIVER_ERROR_MARKERS = [
  'nvml',
  'driver/library version mismatch',
  "couldn't communicate",
  'failed to initialize',
  'no devices were found',
] as const;

/** nvidia-smi binary candidates, OS-aware. TRUSTED ABSOLUTE PATHS FIRST, then the bare
 *  PATH-resolved name LAST — so a binary planted earlier in PATH (or the CWD on Windows)
 *  by a lower-privilege user can't take precedence over the real system binary. The bare
 *  name stays as a fallback to preserve discovery (incl. the WSL /usr/lib/wsl/lib hole). */
function nvidiaSmiCandidates(platform: string): readonly string[] {
  if (platform === 'win32') {
    return [
      'C:\\Windows\\System32\\nvidia-smi.exe',
      'C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe',
      'nvidia-smi.exe', // PATH fallback (last — never wins over a trusted absolute path)
    ];
  }
  return [
    '/usr/bin/nvidia-smi',
    '/usr/local/cuda/bin/nvidia-smi',
    '/usr/lib/wsl/lib/nvidia-smi', // WSL2: GPU stub lives here, often off non-interactive PATH
    'nvidia-smi', // PATH fallback (last)
  ];
}

const NVIDIA_SMI_ARGS = [
  '--query-gpu=name,memory.total',
  '--format=csv,noheader,nounits',
] as const;

// ── (1) NVIDIA ─────────────────────────────────────────────────────────────────────

export interface NvidiaParse {
  /** GPUs with a real numeric memory.total (MiB → GiB). */
  discrete: DetectedGpu[];
  /** Devices with a non-numeric memory.total ([N/A]) — unified-memory parts, VRAM resolved later. */
  unified: Array<{ index: number; name: string }>;
  /** First non-empty line when output looks like an NVML/driver error; null otherwise. */
  driverError: string | null;
}

/**
 * Pure parse of `nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits` output
 * (with stderr possibly merged in). `nounits` => memory.total is MiB. Row index = CUDA device index.
 */
export function parseNvidiaSmi(output: string): NvidiaParse {
  const text = (output ?? '').trim();
  if (!text) return { discrete: [], unified: [], driverError: null };

  // Driver-error disambiguation: nvidia-smi present but cannot talk to the driver (e.g. updated
  // without reboot). It prints an error + zero GPU rows — surface it instead of "No GPU".
  const low = text.toLowerCase();
  if (NVIDIA_DRIVER_ERROR_MARKERS.some((m) => low.includes(m))) {
    const firstLine = text.split('\n').map((l) => l.trim()).find((l) => l.length > 0);
    return { discrete: [], unified: [], driverError: (firstLine ?? 'NVIDIA driver error').slice(0, 140) };
  }

  const discrete: DetectedGpu[] = [];
  const unified: Array<{ index: number; name: string }> = [];
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const parts = lines[index].split(',').map((p) => p.trim());
    if (parts.length < 2) continue; // skip blanks / malformed single-field lines
    const [name, vramRaw] = parts;
    if (!name) continue;
    const vramMb = Number(vramRaw);
    if (Number.isFinite(vramMb) && vramMb > 0) {
      discrete.push({ index, name, vramGb: r1(vramMb / 1024) });
    } else {
      // Non-numeric memory.total ([N/A]/Not Supported): Grace Blackwell GB10 / DGX Spark share the
      // system LPDDR pool instead of discrete VRAM. Don't drop the device — flag it unified.
      unified.push({ index, name });
    }
  }
  return { discrete, unified, driverError: null };
}

export interface NvidiaResult {
  gpus: DetectedGpu[];
  driverError: string | null;
  unifiedMemory: boolean;
}

/**
 * Probe NVIDIA via the candidate PATH list. Stops at the first candidate that produces ANY output
 * (success rows OR a driver-error string); only a null (couldn't-run) advances to the next path —
 * that's the WSL fallback. `systemRamGb` resolves unified-memory parts' VRAM.
 */
export async function detectNvidia(
  run: CommandRunner,
  platform: string,
  systemRamGb: number,
): Promise<NvidiaResult> {
  for (const candidate of nvidiaSmiCandidates(platform)) {
    const out = await run(candidate, NVIDIA_SMI_ARGS);
    if (out == null) continue; // binary not on this path — try the next
    const parsed = parseNvidiaSmi(out);
    if (parsed.discrete.length > 0) {
      return { gpus: parsed.discrete, driverError: null, unifiedMemory: false };
    }
    if (parsed.unified.length > 0) {
      const vramGb = r1(systemRamGb);
      return {
        gpus: parsed.unified.map((u) => ({ index: u.index, name: u.name, vramGb })),
        driverError: null,
        unifiedMemory: true,
      };
    }
    // Responded but no usable rows (driver error or noise): stop probing further paths.
    return { gpus: [], driverError: parsed.driverError, unifiedMemory: false };
  }
  return { gpus: [], driverError: null, unifiedMemory: false };
}

// ── (2) Apple Silicon ───────────────────────────────────────────────────────────────

export function isAppleSilicon(system: SystemProbe): boolean {
  return system.platform === 'darwin' && system.arch === 'arm64';
}

/**
 * Usable GPU budget as a fraction of unified memory, tracking macOS recommendedMaxWorkingSetSize
 * defaults: small machines must keep more back for the OS + apps.
 *   ≤16 GB → 0.67 ; ≤64 GB → 0.75 ; else → 0.80
 */
export function appleVramFraction(totalRamGb: number): number {
  if (totalRamGb <= 16) return 0.67;
  if (totalRamGb <= 64) return 0.75;
  return 0.80;
}

/** Build the Apple-Silicon GPU entry. Returns null if not arm64 Darwin or RAM unreadable. */
export function detectAppleSilicon(system: SystemProbe): DetectedGpu | null {
  if (!isAppleSilicon(system)) return null;
  if (!(system.totalRamGb > 0)) return null;
  const vramGb = r1(system.totalRamGb * appleVramFraction(system.totalRamGb));
  // brand from cpuName (e.g. "Apple M4 Max" — the Pro/Max/Ultra variant the fit table keys on).
  const name = system.cpuName && system.cpuName.trim() ? system.cpuName.trim() : 'Apple Silicon';
  return { index: 0, name, vramGb };
}

// ── (3) Basic floor + assembly ───────────────────────────────────────────────────────

function cpuFloor(system: SystemProbe): HardwareInfo {
  const appleish = system.cpuName?.includes('Apple') ?? false;
  return {
    totalRamGb: r1(system.totalRamGb),
    availableRamGb: r1(system.freeRamGb),
    cpuCores: system.cpuCores,
    cpuName: system.cpuName || 'Unknown',
    platform: `${system.platform} ${system.arch}`,
    hasGpu: false,
    gpuName: null,
    gpuVramGb: null,
    gpuCount: 0,
    gpus: [],
    backend: appleish ? 'Metal (Apple Silicon)' : `CPU (${system.arch})`,
    gpuError: null,
    unifiedMemory: false,
  };
}

function assembleGpu(
  system: SystemProbe,
  gpus: DetectedGpu[],
  backend: string,
  unifiedMemory: boolean,
): HardwareInfo {
  const totalVram = r1(gpus.reduce((sum, g) => sum + g.vramGb, 0));
  return {
    ...cpuFloor(system),
    hasGpu: true,
    gpuName: gpus[0].name,
    gpuVramGb: totalVram,
    gpuCount: gpus.length,
    gpus: gpus.map((g) => ({ name: g.name, vramGb: g.vramGb, backend })),
    backend,
    gpuError: null,
    unifiedMemory,
  };
}

// ── Default runtime adapters (NOT used by tests) ──────────────────────────────────────

const defaultRunner: CommandRunner = async (command, args) => {
  try {
    const { stdout, stderr } = await execFileAsync(command, [...args], {
      timeout: 8000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    const out = `${stdout}${stderr}`.trim();
    return out.length > 0 ? out : null;
  } catch (err: unknown) {
    // Non-zero exit (e.g. driver mismatch) still carries the message on stdout/stderr — surface it
    // so detectNvidia can report a driver error instead of a misleading "No GPU". A true ENOENT
    // has neither => null => CPU fallback.
    const e = err as { stdout?: unknown; stderr?: unknown };
    const stdout = typeof e.stdout === 'string' ? e.stdout : '';
    const stderr = typeof e.stderr === 'string' ? e.stderr : '';
    const out = `${stdout}${stderr}`.trim();
    return out.length > 0 ? out : null;
  }
};

export function readSystemProbe(): SystemProbe {
  const cpus = os.cpus();
  return {
    platform: os.platform(),
    arch: os.arch(),
    totalRamGb: os.totalmem() / 1024 ** 3,
    freeRamGb: os.freemem() / 1024 ** 3,
    cpuCores: cpus.length,
    cpuName: cpus[0]?.model ?? 'Unknown',
  };
}

// ── Orchestrator ──────────────────────────────────────────────────────────────────────

export interface DetectHardwareDeps {
  run?: CommandRunner;
  system?: SystemProbe;
}

/**
 * Staged detection. Apple Silicon resolves locally (Macs never carry nvidia-smi, so skip the spawn);
 * otherwise probe NVIDIA; otherwise CPU floor (carrying any driver-error string).
 */
export async function detectHardware(deps: DetectHardwareDeps = {}): Promise<HardwareInfo> {
  const system = deps.system ?? readSystemProbe();
  const run = deps.run ?? defaultRunner;

  if (isAppleSilicon(system)) {
    const apple = detectAppleSilicon(system);
    if (apple) return assembleGpu(system, [apple], 'metal', true);
    // arm64 Darwin but RAM unreadable — fall through to CPU floor.
  }

  const nvidia = await detectNvidia(run, system.platform, system.totalRamGb);
  if (nvidia.gpus.length > 0) {
    return assembleGpu(system, nvidia.gpus, 'cuda', nvidia.unifiedMemory);
  }

  // STAGED TAIL would slot here: detectAmd(run) → detectWindowsWmi(run) before the floor.
  const floor = cpuFloor(system);
  return { ...floor, gpuError: nvidia.driverError };
}
