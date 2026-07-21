import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  buildPersonaAcceptanceSeal,
  type PersonaAcceptanceSeal,
  type PersonaAcceptanceSealManifest,
} from '../tests/vision/persona-acceptance-seal';

function arg(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function renderMarkdown(seal: PersonaAcceptanceSeal): string {
  const rescored = seal.receipts.filter(receipt => receipt.scoreMode === 'derived-rescore').length;
  const rows = seal.receipts.map(receipt => (
    `| ${receipt.personaId} | ${receipt.repeat} | ${receipt.score} | ${receipt.scoreMode} | ${receipt.model ?? 'unknown'} | ${receipt.estimatedCostUsd} | ${receipt.sourceRevision.slice(0, 12)} | \`${receipt.artifactSha256.slice(0, 16)}\` |`
  ));
  const diagnosticRows = seal.diagnosticCostLedger.map(entry => (
    `| ${entry.id} | ${entry.amountUsd} | ${entry.evidence.replace(/\|/g, '\\|')} |`
  ));
  return [
    '# Waggle 10-Persona Paid Acceptance Seal',
    '',
    `- Status: **${seal.status.toUpperCase()}**`,
    `- Receipts: **${seal.completedReceiptCount}/${seal.expectedReceiptCount}**`,
    `- Threshold: **${seal.threshold}/100 for every receipt**`,
    `- Waggle-estimated accepted-run cost: **$${seal.acceptedEstimatedCostUsd}**`,
    `- Operator-recorded diagnostic cost (with evidence note): **$${seal.diagnosticRecordedCostUsd}**`,
    `- Total recorded spend: **$${seal.totalRecordedSpendUsd}**`,
    `- Manifest SHA-256: \`${seal.manifestSha256}\``,
    `- Derived rescoring disclosures: **${rescored}**`,
    '',
    '| Persona | Repeat | Score | Provenance | Model | Estimated cost USD | Source revision | Artifact SHA-256 |',
    '|---|---:|---:|---|---|---:|---|---|',
    ...rows,
    '',
    '## Diagnostic Cost Evidence',
    '',
    '| ID | Cost USD | Evidence |',
    '|---|---:|---|',
    ...(diagnosticRows.length > 0 ? diagnosticRows : ['| None | 0.000000 | No diagnostic spend recorded |']),
    '',
    'This report is generated only after exact 10 x 3 slot coverage passes live-provider health, transport, browser, persistence, isolation, current-scorer, and provenance checks.',
    '',
  ].join('\n');
}

const manifestArg = arg('--manifest');
const jsonArg = arg('--json');
const markdownArg = arg('--markdown');
if (!manifestArg || !jsonArg || !markdownArg) {
  console.error('Usage: npm run persona:seal -- --manifest <manifest.json> --json <seal.json> --markdown <report.md>');
  process.exitCode = 2;
} else {
  const manifestPath = resolve(manifestArg);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PersonaAcceptanceSealManifest;
  const seal = buildPersonaAcceptanceSeal(manifest);
  if (seal.status !== 'ready') {
    console.error(JSON.stringify(seal, null, 2));
    process.exitCode = 1;
  } else {
    const jsonPath = resolve(jsonArg);
    const markdownPath = resolve(markdownArg);
    mkdirSync(dirname(jsonPath), { recursive: true });
    mkdirSync(dirname(markdownPath), { recursive: true });
    writeFileSync(jsonPath, `${JSON.stringify(seal, null, 2)}\n`, 'utf8');
    writeFileSync(markdownPath, renderMarkdown(seal), 'utf8');
    console.log(JSON.stringify({ status: seal.status, jsonPath, markdownPath }, null, 2));
  }
}
