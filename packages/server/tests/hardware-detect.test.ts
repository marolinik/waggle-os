import { describe, it, expect } from 'vitest';
import {
  parseNvidiaSmi,
  detectNvidia,
  appleVramFraction,
  detectAppleSilicon,
  isAppleSilicon,
  detectHardware,
  type CommandRunner,
  type SystemProbe,
} from '../src/local/hardware-detect.js';

const baseSystem = (over: Partial<SystemProbe> = {}): SystemProbe => ({
  platform: 'linux',
  arch: 'x64',
  totalRamGb: 32,
  freeRamGb: 20,
  cpuCores: 16,
  cpuName: 'AMD Ryzen 9 5950X',
  ...over,
});

/** A runner that answers only for the bare 'nvidia-smi'/'nvidia-smi.exe' name. */
const runnerYielding = (out: string | null): CommandRunner =>
  async (command) =>
    command === 'nvidia-smi' || command === 'nvidia-smi.exe' ? out : null;

const runnerNever: CommandRunner = async () => null;

describe('parseNvidiaSmi', () => {
  it('parses a single discrete GPU (12282 MiB → 12.0 GB)', () => {
    const p = parseNvidiaSmi('NVIDIA GeForce RTX 4070, 12282\n');
    expect(p.driverError).toBeNull();
    expect(p.unified).toEqual([]);
    expect(p.discrete).toEqual([{ index: 0, name: 'NVIDIA GeForce RTX 4070', vramGb: 12.0 }]);
  });

  it('parses multi-GPU (2× RTX 3090, 24576 MiB each → 24.0 GB each)', () => {
    const p = parseNvidiaSmi('NVIDIA GeForce RTX 3090, 24576\nNVIDIA GeForce RTX 3090, 24576\n');
    expect(p.discrete).toHaveLength(2);
    expect(p.discrete[0]).toEqual({ index: 0, name: 'NVIDIA GeForce RTX 3090', vramGb: 24.0 });
    expect(p.discrete[1].index).toBe(1);
    expect(p.discrete[1].vramGb).toBe(24.0);
  });

  it('flags a driver/library mismatch as driverError, not a GPU', () => {
    const p = parseNvidiaSmi('Failed to initialize NVML: Driver/library version mismatch\n');
    expect(p.discrete).toEqual([]);
    expect(p.driverError).toBe('Failed to initialize NVML: Driver/library version mismatch');
  });

  it('treats a non-numeric memory.total ([N/A]) as a unified-memory part', () => {
    const p = parseNvidiaSmi('NVIDIA GB10, [N/A]\n');
    expect(p.discrete).toEqual([]);
    expect(p.unified).toEqual([{ index: 0, name: 'NVIDIA GB10' }]);
  });

  it('is safe on malformed/garbage output (no crash, no false GPU)', () => {
    const p = parseNvidiaSmi('garbage with no comma\n\n   \n,\n');
    expect(p.discrete).toEqual([]);
    expect(p.unified).toEqual([]);
    expect(p.driverError).toBeNull();
  });

  it('is safe on empty string', () => {
    expect(parseNvidiaSmi('')).toEqual({ discrete: [], unified: [], driverError: null });
  });
});

describe('detectNvidia', () => {
  it('resolves a single GPU from the bare nvidia-smi name', async () => {
    const res = await detectNvidia(runnerYielding('NVIDIA GeForce RTX 4070, 12282'), 'linux', 32);
    expect(res.gpus).toEqual([{ index: 0, name: 'NVIDIA GeForce RTX 4070', vramGb: 12.0 }]);
    expect(res.unifiedMemory).toBe(false);
    expect(res.driverError).toBeNull();
  });

  it('resolves a unified-memory part by reporting system RAM as its VRAM', async () => {
    const res = await detectNvidia(runnerYielding('NVIDIA GB10, [N/A]'), 'linux', 128);
    expect(res.unifiedMemory).toBe(true);
    expect(res.gpus).toEqual([{ index: 0, name: 'NVIDIA GB10', vramGb: 128.0 }]);
  });

  it('returns the driver error (and no GPUs) when nvidia-smi cannot reach the driver', async () => {
    const res = await detectNvidia(
      runnerYielding('Failed to initialize NVML: Driver/library version mismatch'), 'linux', 32);
    expect(res.gpus).toEqual([]);
    expect(res.driverError).toContain('NVML');
  });

  it('falls through every candidate to a clean no-GPU result when nvidia-smi is absent', async () => {
    const res = await detectNvidia(runnerNever, 'linux', 32);
    expect(res).toEqual({ gpus: [], driverError: null, unifiedMemory: false });
  });

  it('finds nvidia-smi on a WSL absolute-path candidate when the bare name misses', async () => {
    const wslRunner: CommandRunner = async (command) =>
      command === '/usr/lib/wsl/lib/nvidia-smi' ? 'NVIDIA RTX A6000, 49140' : null;
    const res = await detectNvidia(wslRunner, 'linux', 64);
    expect(res.gpus).toEqual([{ index: 0, name: 'NVIDIA RTX A6000', vramGb: 48.0 }]); // 49140/1024=47.98→48.0
  });
});

describe('appleVramFraction', () => {
  it('uses the macOS working-set tiers', () => {
    expect(appleVramFraction(8)).toBe(0.67);
    expect(appleVramFraction(16)).toBe(0.67);
    expect(appleVramFraction(32)).toBe(0.75);
    expect(appleVramFraction(64)).toBe(0.75);
    expect(appleVramFraction(128)).toBe(0.80);
  });
});

describe('detectAppleSilicon', () => {
  it('budgets 0.67 of RAM on a 16 GB M2 (→ 10.7 GB)', () => {
    const gpu = detectAppleSilicon(baseSystem({ platform: 'darwin', arch: 'arm64', totalRamGb: 16, cpuName: 'Apple M2' }));
    expect(gpu).toEqual({ index: 0, name: 'Apple M2', vramGb: 10.7 }); // 16*0.67=10.72→10.7
  });

  it('budgets 0.75 of RAM on a 64 GB M4 Max (→ 48.0 GB)', () => {
    const gpu = detectAppleSilicon(baseSystem({ platform: 'darwin', arch: 'arm64', totalRamGb: 64, cpuName: 'Apple M4 Max' }));
    expect(gpu?.vramGb).toBe(48.0);
  });

  it('returns null on an Intel Mac (x64 Darwin)', () => {
    expect(isAppleSilicon(baseSystem({ platform: 'darwin', arch: 'x64' }))).toBe(false);
    expect(detectAppleSilicon(baseSystem({ platform: 'darwin', arch: 'x64' }))).toBeNull();
  });
});

describe('detectHardware (orchestrator)', () => {
  it('Apple path: arm64 Darwin → metal, unified, no subprocess spawned', async () => {
    const spawned: string[] = [];
    const spy: CommandRunner = async (c) => { spawned.push(c); return null; };
    const hw = await detectHardware({
      run: spy,
      system: baseSystem({ platform: 'darwin', arch: 'arm64', totalRamGb: 16, freeRamGb: 9, cpuName: 'Apple M2' }),
    });
    expect(spawned).toEqual([]); // Macs never carry nvidia-smi — skip the spawn
    expect(hw.hasGpu).toBe(true);
    expect(hw.backend).toBe('metal');
    expect(hw.unifiedMemory).toBe(true);
    expect(hw.gpuVramGb).toBe(10.7);
    expect(hw.gpus).toEqual([{ name: 'Apple M2', vramGb: 10.7, backend: 'metal' }]);
  });

  it('NVIDIA path: single GPU → cuda, summed VRAM, gpuName set', async () => {
    const hw = await detectHardware({
      run: runnerYielding('NVIDIA GeForce RTX 4070, 12282'),
      system: baseSystem({ totalRamGb: 32, freeRamGb: 20 }),
    });
    expect(hw.hasGpu).toBe(true);
    expect(hw.backend).toBe('cuda');
    expect(hw.gpuName).toBe('NVIDIA GeForce RTX 4070');
    expect(hw.gpuVramGb).toBe(12.0);
    expect(hw.gpuCount).toBe(1);
    expect(hw.totalRamGb).toBe(32);
    expect(hw.gpuError).toBeNull();
  });

  it('NVIDIA multi-GPU: VRAM summed across the pool', async () => {
    const hw = await detectHardware({
      run: runnerYielding('NVIDIA GeForce RTX 3090, 24576\nNVIDIA GeForce RTX 3090, 24576'),
      system: baseSystem(),
    });
    expect(hw.gpuCount).toBe(2);
    expect(hw.gpuVramGb).toBe(48.0);
  });

  it('CPU fallback: nvidia-smi absent → hasGpu false, CPU backend', async () => {
    const hw = await detectHardware({ run: runnerNever, system: baseSystem({ arch: 'x64' }) });
    expect(hw.hasGpu).toBe(false);
    expect(hw.gpuName).toBeNull();
    expect(hw.gpus).toEqual([]);
    expect(hw.backend).toBe('CPU (x64)');
    expect(hw.gpuError).toBeNull();
  });

  it('CPU fallback carries the driver error string (driver mismatch, not "No GPU")', async () => {
    const hw = await detectHardware({
      run: runnerYielding('Failed to initialize NVML: Driver/library version mismatch'),
      system: baseSystem(),
    });
    expect(hw.hasGpu).toBe(false);
    expect(hw.gpuError).toContain('NVML');
  });
});
