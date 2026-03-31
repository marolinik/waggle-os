#!/usr/bin/env node
/**
 * Copies platform-specific native modules to app/src-tauri/resources/native/
 * so they are bundled alongside service.js in the Tauri app.
 *
 * Run after build-sidecar.mjs, before `tauri build`.
 * Auto-detects platform from TARGET_ARCH env or process.platform + process.arch.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const nativeDir = path.join(root, 'app', 'src-tauri', 'resources', 'native');

const platform = process.platform;
const arch = process.env.TARGET_ARCH || process.arch;

console.log(`[bundle-native-deps] Platform: ${platform}-${arch}`);

// Ensure output directory
fs.mkdirSync(nativeDir, { recursive: true });
fs.mkdirSync(path.join(nativeDir, 'onnxruntime'), { recursive: true });

let totalFiles = 0;
let totalBytes = 0;

function copyFile(src, destName) {
  const srcPath = path.join(root, src);
  const destPath = path.join(nativeDir, destName);

  if (!fs.existsSync(srcPath)) {
    console.warn(`[bundle-native-deps] WARNING: ${src} not found — skipping`);
    return false;
  }

  fs.copyFileSync(srcPath, destPath);
  const size = fs.statSync(destPath).size;
  totalBytes += size;
  totalFiles++;
  console.log(`  ${destName} (${(size / 1024 / 1024).toFixed(1)} MB)`);
  return true;
}

function copyDir(srcDir, destSubDir) {
  const srcPath = path.join(root, srcDir);
  if (!fs.existsSync(srcPath)) {
    console.warn(`[bundle-native-deps] WARNING: ${srcDir} not found — skipping`);
    return;
  }

  const destPath = path.join(nativeDir, destSubDir);
  fs.mkdirSync(destPath, { recursive: true });

  for (const file of fs.readdirSync(srcPath)) {
    const fullSrc = path.join(srcPath, file);
    const stat = fs.statSync(fullSrc);
    if (stat.isFile()) {
      const destFile = path.join(destPath, file);
      fs.copyFileSync(fullSrc, destFile);
      totalBytes += stat.size;
      totalFiles++;
      console.log(`  ${destSubDir}/${file} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
    }
  }
}

// 1. better-sqlite3
console.log('[bundle-native-deps] better-sqlite3:');
copyFile('node_modules/better-sqlite3/build/Release/better_sqlite3.node', 'better_sqlite3.node');

// 2. sqlite-vec
console.log('[bundle-native-deps] sqlite-vec:');
const vecOs = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'darwin' : 'linux';
const vecArch = arch === 'arm64' ? 'aarch64' : 'x64';
const vecExt = platform === 'win32' ? 'dll' : platform === 'darwin' ? 'dylib' : 'so';
copyFile(
  `node_modules/sqlite-vec-${vecOs}-${vecArch}/vec0.${vecExt}`,
  `vec0.${vecExt}`,
);

// 3. onnxruntime-node (multiple files — binding + shared libraries)
console.log('[bundle-native-deps] onnxruntime-node:');
const ortOs = platform === 'win32' ? 'win32' : platform === 'darwin' ? 'darwin' : 'linux';
const ortDir = `node_modules/onnxruntime-node/bin/napi-v3/${ortOs}/${arch}`;
copyDir(ortDir, 'onnxruntime');

console.log(`[bundle-native-deps] Copied ${totalFiles} files (${(totalBytes / 1024 / 1024).toFixed(1)} MB total) to resources/native/`);
