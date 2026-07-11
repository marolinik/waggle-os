#!/usr/bin/env node
/** Bundle the copied OpenClaw handler into one npm-independent CommonJS file. */

import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entryPoint = path.resolve(process.argv[2] ?? path.join(packageRoot, 'dist', 'handler.js'));
const outfile = path.resolve(process.argv[3] ?? path.join(packageRoot, 'dist', 'handler.bundle.cjs'));
const importPath = entryPoint.split(path.sep).join('/');

// OpenClaw uses native import(file://...) for managed hooks. Its ~/.openclaw
// directory is not an ESM package, so a copied .js file must be loadable as
// CommonJS. Assigning the function directly to module.exports also makes the
// dynamic-import default export the handler function (not { default: fn }).
await build({
  stdin: {
    contents: `import handler from ${JSON.stringify(importPath)}; module.exports = handler;`,
    resolveDir: packageRoot,
    sourcefile: 'installed-handler-entry.js',
  },
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  legalComments: 'none',
  logLevel: 'info',
});
