/**
 * Logger stderr-routing tests.
 *
 * Reverse-ported from OSS hive-mind (oss-drift triage R1, 2026-06-11).
 * stdout is reserved for program data (MCP stdio transport in
 * hive-mind-mcp-server, CLI --json envelopes) — a library log line on
 * stdout corrupts machine consumers, so every level must land on stderr.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createCoreLogger, type CoreLogger } from '../src/logger.js';

describe('createCoreLogger', () => {
  afterEach(() => vi.restoreAllMocks());

  it('routes every level to stderr — never the stdout-bound console methods', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const logger: CoreLogger = createCoreLogger('test');
    logger.info('hello');
    logger.debug('dbg');
    logger.warn('careful');
    logger.error('boom');

    // None of the stdout-bound console methods may be used.
    expect(info).not.toHaveBeenCalled();
    expect(debug).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    // Diagnostics land on stderr (console.error / console.warn).
    expect(error).toHaveBeenCalledTimes(3); // info + debug + error
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('keeps the [waggle:tag] prefix on messages', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    createCoreLogger('embedding').info('probing');
    expect(error).toHaveBeenCalledWith('[waggle:embedding] probing');
  });

  it('passes structured data through as a second argument', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    createCoreLogger('pipeline').info('done', { frames: 5 });
    expect(error).toHaveBeenCalledWith('[waggle:pipeline] done', { frames: 5 });
  });
});
