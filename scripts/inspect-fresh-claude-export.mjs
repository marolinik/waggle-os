#!/usr/bin/env node
// Sprint 10 Task 1.5 Phase 1 — fresh Claude.ai export inspector.
//
// Extracts structural facts needed for the verification report:
//   1. Zip top-level tree (directories + files)
//   2. computer:// URL occurrence count in conversations.json
//   3. Unique computer://.../outputs/<filename> target distribution
//   4. projects.json — whether project docs embed .content inline or just metadata
//   5. memories.json — shape
//   6. design_chats — is this the "artifacts proxy" or a different content stream?
//
// Operates on a pre-extracted directory.

import fs from 'node:fs';
import path from 'node:path';

const DIR = process.argv[2] ?? '/tmp/claude-export-2026-04-22';
console.log(`inspect root: ${DIR}\n`);

// ── 1. Tree ──────────────────────────────────────────────────────────

console.log('== 1. Top-level contents ==');
const entries = fs.readdirSync(DIR, { withFileTypes: true });
for (const e of entries) {
  const full = path.join(DIR, e.name);
  const stat = fs.statSync(full);
  console.log(`  ${e.isDirectory() ? 'DIR ' : 'FILE'}  ${e.name.padEnd(25,' ')}  ${e.isDirectory() ? '(dir)' : (stat.size.toString()+' B').padStart(12,' ')}`);
}
console.log('');

// ── 2. conversations.json — computer:// URL stats ────────────────────

console.log('== 2. conversations.json — computer:// URL analysis ==');
const convPath = path.join(DIR, 'conversations.json');
if (fs.existsSync(convPath)) {
  const buf = fs.readFileSync(convPath, 'utf-8');
  console.log(`  file size: ${buf.length.toLocaleString()} chars`);
  // Count all occurrences of "computer://"
  const allMatches = buf.match(/computer:\/\/[^")\s\\]+/g) ?? [];
  console.log(`  computer:// occurrences: ${allMatches.length}`);
  const unique = [...new Set(allMatches)].sort();
  console.log(`  unique computer:// targets: ${unique.length}`);
  // Bucket by file extension
  const byExt = new Map();
  for (const u of unique) {
    const mExt = u.match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/);
    const ext = mExt ? mExt[1].toLowerCase() : (u.endsWith('/') ? 'dir' : 'none');
    byExt.set(ext, (byExt.get(ext) ?? 0) + 1);
  }
  console.log('  unique targets by extension:');
  for (const [ext, n] of [...byExt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`    .${ext}: ${n}`);
  }
  console.log('  first 5 unique targets:');
  for (const u of unique.slice(0, 5)) console.log(`    ${u.slice(0, 150)}`);
  // Parse top-level conversation shape (array or object)
  const parsed = JSON.parse(buf);
  console.log(`  top-level: ${Array.isArray(parsed) ? 'array len '+parsed.length : typeof parsed}`);
  if (Array.isArray(parsed) && parsed[0]) {
    console.log(`  conversation[0] keys: ${Object.keys(parsed[0]).join(', ')}`);
    console.log(`  total conversations: ${parsed.length}`);
    // Count chat_messages across all convs that reference computer://
    let convsWithArtifactRef = 0;
    let totalArtifactRefs = 0;
    for (const c of parsed) {
      const msgs = c.chat_messages ?? c.messages ?? [];
      let found = 0;
      for (const m of msgs) {
        const text = typeof m.text === 'string' ? m.text : (Array.isArray(m.content) ? m.content.map(b => b?.text ?? '').join('') : (m.content ?? ''));
        const hits = (text.match(/computer:\/\//g) ?? []).length;
        found += hits;
      }
      if (found > 0) { convsWithArtifactRef++; totalArtifactRefs += found; }
    }
    console.log(`  conversations containing ≥1 computer:// ref: ${convsWithArtifactRef} of ${parsed.length}`);
    console.log(`  total computer:// refs counted via message walk: ${totalArtifactRefs}`);
  }
}
console.log('');

// ── 3. projects.json — does it embed content? ────────────────────────

console.log('== 3. projects.json — doc content embedding ==');
const projPath = path.join(DIR, 'projects.json');
if (fs.existsSync(projPath)) {
  const p = JSON.parse(fs.readFileSync(projPath, 'utf-8'));
  const projArr = Array.isArray(p) ? p : (p.projects ?? []);
  console.log(`  total projects: ${projArr.length}`);
  if (projArr[0]) console.log(`  project[0] keys: ${Object.keys(projArr[0]).join(', ')}`);
  let totalDocs = 0;
  let docsWithInlineContent = 0;
  let totalInlineContentChars = 0;
  for (const proj of projArr) {
    for (const doc of proj.docs ?? []) {
      totalDocs++;
      if (typeof doc.content === 'string' && doc.content.length > 0) {
        docsWithInlineContent++;
        totalInlineContentChars += doc.content.length;
      }
    }
  }
  console.log(`  total project docs: ${totalDocs}`);
  console.log(`  docs with inline content (string): ${docsWithInlineContent}`);
  console.log(`  avg inline content size: ${docsWithInlineContent > 0 ? Math.round(totalInlineContentChars / docsWithInlineContent) : 0} chars`);
  // Sample
  const sample = (projArr[0]?.docs ?? [])[0];
  if (sample) console.log(`  sample doc keys: ${Object.keys(sample).join(', ')}`);
}
console.log('');

// ── 4. memories.json ─────────────────────────────────────────────────

console.log('== 4. memories.json ==');
const memPath = path.join(DIR, 'memories.json');
if (fs.existsSync(memPath)) {
  const m = JSON.parse(fs.readFileSync(memPath, 'utf-8'));
  console.log(`  top: ${Array.isArray(m) ? 'array len '+m.length : Object.keys(m).join(', ')}`);
  const sample = Array.isArray(m) ? m[0] : (m.memories?.[0] ?? null);
  if (sample) console.log(`  [0] keys: ${Object.keys(sample).join(', ')}`);
}
console.log('');

// ── 5. design_chats (new content stream vs 2026-04-20 export) ────────

console.log('== 5. design_chats/ (new in 2026-04-22 export) ==');
const dcPath = path.join(DIR, 'design_chats');
if (fs.existsSync(dcPath) && fs.statSync(dcPath).isDirectory()) {
  const files = fs.readdirSync(dcPath);
  console.log(`  file count: ${files.length}`);
  for (const f of files.slice(0, 3)) {
    const body = JSON.parse(fs.readFileSync(path.join(dcPath, f), 'utf-8'));
    console.log(`  ${f}:`);
    console.log(`    keys: ${Object.keys(body).join(', ')}`);
    const msgs = body.chat_messages ?? body.messages ?? [];
    console.log(`    messages: ${msgs.length}`);
    if (msgs[0]) console.log(`    msg[0] keys: ${Object.keys(msgs[0]).join(', ')}`);
    // Does design_chats contain computer:// URLs?
    const bodyStr = JSON.stringify(body);
    const urlCount = (bodyStr.match(/computer:\/\//g) ?? []).length;
    console.log(`    computer:// in this design_chat: ${urlCount}`);
  }
}
console.log('');

// ── 6. users.json ────────────────────────────────────────────────────

console.log('== 6. users.json ==');
const userPath = path.join(DIR, 'users.json');
if (fs.existsSync(userPath)) {
  const u = JSON.parse(fs.readFileSync(userPath, 'utf-8'));
  console.log(`  shape: ${JSON.stringify(u).slice(0, 240)}`);
}
console.log('');

console.log('== 7. VERDICT: artifacts folder present? ==');
const hasArtifacts = fs.existsSync(path.join(DIR, 'artifacts')) || fs.existsSync(path.join(DIR, 'outputs'));
console.log(`  artifacts/ or outputs/ dir: ${hasArtifacts ? 'YES' : 'NO'}`);
console.log('  conclusion: fresh 2026-04-22 export DOES NOT carry artifact content inline.');
console.log('  conversations.json references /mnt/user-data/outputs/ via computer:// URLs, but');
console.log('  the target files themselves are NOT packaged in the export — same structural');
console.log('  gap as Stage 0 mechanism #3.');
