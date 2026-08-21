import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(root, 'vendor', 'pptxgenjs');
const agentDist = path.join(root, 'packages', 'agent', 'dist');
const targetRoot = path.join(agentDist, 'vendor', 'pptxgenjs');

const manifest = JSON.parse(await readFile(path.join(sourceRoot, 'package.json'), 'utf8'));
if (manifest.name !== 'pptxgenjs' || manifest.version !== '4.0.1-waggle.0') {
  throw new Error(
    `Refusing to stage unexpected PPTX runtime ${String(manifest.name)}@${String(manifest.version)}`,
  );
}

const builtEntry = path.join(agentDist, 'presentation-tools.js');
if (!(await stat(builtEntry)).isFile()) {
  throw new Error(`Agent build output is missing: ${builtEntry}`);
}

const sourceImport = "import PptxGenJS from 'pptxgenjs';";
const stagedImport = "import PptxGenJS from './vendor/pptxgenjs/dist/pptxgen.cjs.js';";
const builtSource = await readFile(builtEntry, 'utf8');
if (!builtSource.includes(sourceImport)) {
  throw new Error(`Agent PPTX import is not recognized: ${builtEntry}`);
}

await rm(targetRoot, { recursive: true, force: true });
await mkdir(path.join(targetRoot, 'dist'), { recursive: true });
await copyFile(path.join(sourceRoot, 'LICENSE'), path.join(targetRoot, 'LICENSE'));
await copyFile(path.join(sourceRoot, 'package.json'), path.join(targetRoot, 'package.json'));
await copyFile(
  path.join(sourceRoot, 'dist', 'pptxgen.cjs.js'),
  path.join(targetRoot, 'dist', 'pptxgen.cjs.js'),
);
await writeFile(builtEntry, builtSource.replace(sourceImport, stagedImport), 'utf8');
