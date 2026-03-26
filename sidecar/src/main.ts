import { createInterface } from 'readline';
import { MindDB } from '@waggle/core';
import { RpcHandler, type JsonRpcRequest } from './rpc-handler.js';
import { WeaverScheduler } from './weaver-scheduler.js';
import path from 'path';
import os from 'os';
import fs from 'fs';

const mindPath = process.env.WAGGLE_MIND_PATH ??
  path.join(os.homedir(), '.waggle', 'default.mind');

// Ensure directory exists
const dir = path.dirname(mindPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new MindDB(mindPath);
const handler = new RpcHandler(db);
const weaver = new WeaverScheduler(db);
weaver.start();

const rl = createInterface({ input: process.stdin });

rl.on('line', async (line) => {
  try {
    const request = JSON.parse(line) as JsonRpcRequest;
    const response = await handler.handle(request);
    process.stdout.write(JSON.stringify(response) + '\n');
  } catch (err) {
    const errorResponse = {
      jsonrpc: '2.0',
      error: { code: -32700, message: 'Parse error' },
      id: null,
    };
    process.stdout.write(JSON.stringify(errorResponse) + '\n');
  }
});

process.on('SIGTERM', () => {
  weaver.stop();
  db.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  weaver.stop();
  db.close();
  process.exit(0);
});

// Signal ready
process.stderr.write('waggle-sidecar:ready\n');
