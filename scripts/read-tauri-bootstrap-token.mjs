#!/usr/bin/env node

import process from 'node:process';
import WebSocket from 'ws';

const DEFAULT_TIMEOUT_MS = 60_000;
const MIN_TOKEN_LENGTH = 32;
const MAX_TOKEN_LENGTH = 200;

function fail(message) {
  console.error(`tauri-bootstrap-token: ${message}`);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const options = {
    port: null,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    selfTest: false,
    allowLegacyUi: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--self-test') {
      options.selfTest = true;
      continue;
    }
    if (argument === '--allow-legacy-ui') {
      options.allowLegacyUi = true;
      continue;
    }
    if (argument === '--port' || argument === '--timeout-ms') {
      const value = argv[index + 1];
      index += 1;
      if (value === undefined) throw new Error(`${argument} requires a value`);
      if (argument === '--port') options.port = Number(value);
      else options.timeoutMs = Number(value);
      continue;
    }
    if (argument.startsWith('--port=')) options.port = Number(argument.slice(7));
    else if (argument.startsWith('--timeout-ms=')) options.timeoutMs = Number(argument.slice(13));
    else throw new Error(`unknown argument: ${argument}`);
  }
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) {
    throw new Error('port must be an integer between 1024 and 65535');
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1000 || options.timeoutMs > 300_000) {
    throw new Error('timeout-ms must be an integer between 1000 and 300000');
  }
  return options;
}

function isValidEndpoint(value) {
  return value !== null
    && typeof value === 'object'
    && Number.isInteger(value.port)
    && value.port > 0
    && value.port <= 65535
    && typeof value.instanceId === 'string'
    && value.instanceId.trim().length > 0
    && typeof value.bootstrapToken === 'string'
    && value.bootstrapToken.length >= MIN_TOKEN_LENGTH
    && value.bootstrapToken.length <= MAX_TOKEN_LENGTH;
}

function isValidDesktopRuntime(value, allowLegacyUi = false) {
  return isValidEndpoint(value)
    && value.uiReady === true
    && value.uiStartupState === (allowLegacyUi ? 'legacy-ready' : 'ready')
    && typeof value.uiPath === 'string'
    && value.uiPath.startsWith('/')
    && Number.isInteger(value.uiTextLength)
    && value.uiTextLength > 0;
}

async function fetchTargets(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) throw new Error(`WebView debug endpoint returned HTTP ${response.status}`);
  const targets = await response.json();
  if (!Array.isArray(targets)) throw new Error('WebView debug endpoint returned an invalid target list');
  return targets.filter((target) => target?.type === 'page' && typeof target.webSocketDebuggerUrl === 'string');
}

async function evaluateEnsureService(webSocketUrl, timeoutMs, allowLegacyUi) {
  const socket = new WebSocket(webSocketUrl);
  let nextId = 1;
  const pending = new Map();
  const timer = setTimeout(() => {
    for (const pendingRequest of pending.values()) pendingRequest.reject(new Error('CDP request timed out'));
    pending.clear();
    socket.close();
  }, timeoutMs);

  try {
    await new Promise((resolve, reject) => {
      const openTimer = setTimeout(() => reject(new Error('CDP WebSocket open timed out')), timeoutMs);
      socket.addEventListener('open', () => {
        clearTimeout(openTimer);
        resolve();
      }, { once: true });
      socket.addEventListener('error', () => {
        clearTimeout(openTimer);
        reject(new Error('CDP WebSocket connection failed'));
      }, { once: true });
    });

    socket.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error('Tauri IPC evaluation failed'));
      else request.resolve(message.result);
    });

    const result = await new Promise((resolve, reject) => {
      const id = nextId;
      nextId += 1;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: {
          awaitPromise: true,
          returnByValue: true,
          expression: `
            (async () => {
              const invoke = globalThis.__TAURI_INTERNALS__?.invoke;
              if (typeof invoke !== 'function') throw new Error('Tauri IPC is unavailable');
              const endpoint = await invoke('ensure_service');
              const deadline = Date.now() + 10_000;
              for (;;) {
                const root = document.getElementById('root');
                const startup = root?.querySelector('[data-waggle-startup]');
                const startupState = startup?.getAttribute('data-waggle-startup') ?? null;
                const readyState = root?.getAttribute('data-waggle-ui-ready') ?? null;
                const uiTextLength = root?.innerText?.trim().length ?? 0;
                const strictUiReady = Boolean(
                  root
                  && root.childElementCount > 0
                  && !startup
                  && readyState === 'ready'
                  && uiTextLength > 0
                );
                const legacyUiReady = Boolean(
                  root
                  && root.childElementCount > 0
                  && !startup
                  && uiTextLength > 0
                );
                const uiReady = ${allowLegacyUi ? 'legacyUiReady' : 'strictUiReady'};
                if (uiReady || startupState === 'failed' || Date.now() >= deadline) {
                  return {
                    ...endpoint,
                    uiPath: globalThis.location?.pathname ?? '',
                    uiReady,
                    uiStartupState: ${allowLegacyUi ? "uiReady ? 'legacy-ready' : (readyState ?? startupState)" : 'readyState ?? startupState'},
                    uiTextLength,
                  };
                }
                await new Promise((resolve) => setTimeout(resolve, 100));
              }
            })()
          `,
        },
      }));
    });
    const remote = result?.result?.value;
    if (!isValidEndpoint(remote)) throw new Error('Tauri returned an invalid service endpoint');
    if (!isValidDesktopRuntime(remote, allowLegacyUi)) {
      throw new Error('Waggle UI did not render its application shell');
    }
    return {
      bootstrapToken: remote.bootstrapToken,
      uiPath: remote.uiPath,
      uiReady: remote.uiReady,
      uiStartupState: remote.uiStartupState,
      uiTextLength: remote.uiTextLength,
    };
  } finally {
    clearTimeout(timer);
    socket.close();
  }
}

async function resolveToken(port, timeoutMs, allowLegacyUi) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'WebView target not ready';
  while (Date.now() < deadline) {
    try {
      const targets = await fetchTargets(port);
      for (const target of targets) {
        try {
          return await evaluateEnsureService(
            target.webSocketDebuggerUrl,
            Math.min(15_000, deadline - Date.now()),
            allowLegacyUi,
          );
        } catch (error) {
          lastError = error instanceof Error ? error.message : 'CDP evaluation failed';
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'WebView debug endpoint unavailable';
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(lastError);
}

async function main() {
  if (process.argv.includes('--self-test')) {
    if (typeof WebSocket !== 'function') throw new Error('WebSocket client is unavailable');
    const valid = 'a'.repeat(MIN_TOKEN_LENGTH);
    if (!isValidEndpoint({ port: 3333, instanceId: 'test-instance', bootstrapToken: valid })) {
      throw new Error('valid endpoint fixture rejected');
    }
    if (isValidEndpoint({ port: 3333, instanceId: 'test-instance', bootstrapToken: 'short' })) {
      throw new Error('short token fixture accepted');
    }
    const validRuntime = {
      port: 3333,
      instanceId: 'test-instance',
      bootstrapToken: valid,
      uiPath: '/home',
      uiReady: true,
      uiStartupState: 'ready',
      uiTextLength: 10,
    };
    if (!isValidDesktopRuntime(validRuntime)) throw new Error('valid desktop runtime rejected');
    if (isValidDesktopRuntime({ ...validRuntime, uiReady: false })) {
      throw new Error('blank desktop runtime accepted');
    }
    if (isValidDesktopRuntime({ ...validRuntime, uiTextLength: 0 })) {
      throw new Error('empty desktop runtime accepted');
    }
    if (isValidDesktopRuntime({ ...validRuntime, uiStartupState: 'loading' })) {
      throw new Error('loading desktop runtime accepted');
    }
    if (isValidDesktopRuntime({ ...validRuntime, uiStartupState: 'failed' })) {
      throw new Error('failed desktop runtime accepted');
    }
    if (!isValidDesktopRuntime({ ...validRuntime, uiStartupState: 'legacy-ready' }, true)) {
      throw new Error('valid legacy desktop runtime rejected');
    }
    if (isValidDesktopRuntime({ ...validRuntime, uiReady: false, uiStartupState: 'legacy-ready' }, true)) {
      throw new Error('blank legacy desktop runtime accepted');
    }
    console.log(JSON.stringify({ pass: true, cases: 9 }));
    return;
  }
  const options = parseArgs(process.argv.slice(2));
  const runtime = await resolveToken(options.port, options.timeoutMs, options.allowLegacyUi);
  console.log(JSON.stringify(runtime));
}

main().catch((error) => fail(error instanceof Error ? error.message : 'unknown failure'));
