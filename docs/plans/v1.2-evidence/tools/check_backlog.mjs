// Mechanical check of the v1.2 backlog (handoff/backlog.csv + handoff/backlog-gates.csv + handoff/03-BACKLOG.md).
// Usage (from the repo root): node docs/plans/v1.2-evidence/tools/check_backlog.mjs [handoffDir] [--cards]
//   handoffDir = directory holding backlog.csv, backlog-gates.csv and 03-BACKLOG.md
//   (default: docs/handoff, i.e. ../../../handoff from this file). Read-only; writes nothing.
//   --cards    print the exact "Spremnost" line for every ticket (for editors) and exit 0.
// Checks: CSV shape; unique ids; every reference exists; list syntax; required gates; no cycle over
// technical_dependencies ∪ sequence_after ∪ ticket refs in merge_gates ∪ gate/event requirements;
// simulated tracker readiness (ready_to_start / ready_to_merge) in fixed scenarios; 03 cards and
// overview agree with the CSV. Exit code 1 on any FAIL. A pass proves consistency of the planning
// documents only; it says nothing about the application.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const DIR = args.find((a) => !a.startsWith('--')) ?? path.join(here, '..', '..', '..', 'handoff');
const CARDS_ONLY = args.includes('--cards');

const TICKET_HEADER = ['ticket_id', 'wave', 'milestone', 'title', 'technical_dependencies', 'sequence_after', 'start_gates', 'merge_gates', 'milestone_gate', 'resource_constraints', 'at_ids', 'prd_ids', 'frd_ids', 'adr', 'hotspot_files', 'estimate_classic_days', 'estimate_ai_days', 'owner_role', 'receipts_affected', 'status', 'notes'];
const GATE_HEADER = ['gate_id', 'kind', 'naziv', 'zatvara_se_kad', 'vlasnik', 'izvor', 'requires'];
const WAVES = new Set(['W0', 'W1', 'W2', 'W3', 'W3e', 'W4', 'W5', 'W6', 'W7', 'W8', 'WB', 'OSS', 'B1', 'B2', 'B3', 'INT']);
const KINDS = new Set(['odluka-osnivaca', 'ratifikacija', 'odobrenje', 'tsa-predlog', 'review', 'spoljna', 'nalaz', 'dogadjaj', 'resurs']);
const FREEZE = { G1: 'F1', G2: 'F2', G3: 'F3-SRC' };
const MS_ORDER = { G1: 1, G2: 2, G3: 3 };
const ID_RE = /^(W\d|W3e|WB|OSS|B\d)-PR\d+[a-z]?$|^INT-\d\d$/;
const RES_RE = /^(lane|hotspot|host|hw|budget|human):[a-z0-9-]+$/;
const MSG_RE = /^(start_after|merge_before):([A-Za-z0-9-]+)$/;

let failures = 0;
const fail = (msg) => { failures++; console.log(`FAIL ${msg}`); };
const ok = (msg) => console.log(`OK   ${msg}`);
const info = (msg) => console.log(`INFO ${msg}`);

function readText(file) {
  const buf = fs.readFileSync(path.join(DIR, file));
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) fail(`${file}: UTF-8 BOM`);
  // CRLF comes from the clone's core.autocrlf (git stores LF), so normalize it; a lone CR is still an error.
  const text = buf.toString('utf8').replace(/\r\n/g, '\n');
  if (text.includes('\r')) fail(`${file}: CR znak (očekuje se LF)`);
  if (!text.endsWith('\n')) fail(`${file}: nema završnog LF`);
  return text;
}
function parseCsv(s) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c !== '\r') f += c;
  }
  if (q) fail('CSV: nezatvoren navodnik');
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
function table(file, header) {
  const rows = parseCsv(readText(file));
  const h = rows[0] ?? [];
  if (h.join(',') !== header.join(',')) fail(`${file}: zaglavlje ${h.join(',')} ≠ ${header.join(',')}`);
  const out = [];
  rows.slice(1).forEach((r, i) => {
    if (r.length !== header.length) fail(`${file}: red ${i + 2} ima ${r.length} polja, očekuje se ${header.length}`);
    out.push(Object.fromEntries(header.map((k, j) => [k, r[j] ?? ''])));
  });
  return out;
}
function list(cell, where) {
  if (cell === '') return [];
  const items = cell.split(';');
  for (const it of items) if (it === '' || it !== it.trim()) fail(`${where}: loša lista „${cell}” (separator ; bez razmaka, bez praznih stavki)`);
  if (new Set(items).size !== items.length) fail(`${where}: duplikat u „${cell}”`);
  return items;
}

// ---------- load ----------
const tickets = table('backlog.csv', TICKET_HEADER);
const gates = table('backlog-gates.csv', GATE_HEADER);
const T = new Map();
for (const t of tickets) {
  if (!ID_RE.test(t.ticket_id)) fail(`ticket_id „${t.ticket_id}” ne odgovara obrascu`);
  if (T.has(t.ticket_id)) fail(`duplikat ticket_id ${t.ticket_id}`);
  T.set(t.ticket_id, t);
}
const G = new Map();
for (const g of gates) {
  if (G.has(g.gate_id) || T.has(g.gate_id)) fail(`duplikat ili sudar ID-a u registru: ${g.gate_id}`);
  if (!KINDS.has(g.kind)) fail(`registar ${g.gate_id}: nepoznat kind „${g.kind}”`);
  if (g.kind === 'resurs' ? !RES_RE.test(g.gate_id) : RES_RE.test(g.gate_id)) fail(`registar ${g.gate_id}: ID i kind „${g.kind}” se ne slažu`);
  G.set(g.gate_id, g);
}
const isEvent = (id) => G.get(id)?.kind === 'dogadjaj';
const isGate = (id) => G.has(id) && !['dogadjaj', 'resurs'].includes(G.get(id).kind);
for (const g of gates) g.req = list(g.requires, `registar ${g.gate_id}.requires`);
for (const g of gates) for (const r of g.req) if (!T.has(r) && !G.has(r)) fail(`registar ${g.gate_id}.requires: nepostojeći ID ${r}`);

// ---------- per-ticket fields ----------
for (const t of tickets) {
  const w = `${t.ticket_id}`;
  if (!WAVES.has(t.wave)) fail(`${w}: nepoznat wave „${t.wave}”`);
  if (!MS_ORDER[t.milestone]) fail(`${w}: nepoznat milestone „${t.milestone}”`);
  if (!t.title || !t.owner_role || !t.status) fail(`${w}: prazno title/owner_role/status`);
  t.tech = list(t.technical_dependencies, `${w}.technical_dependencies`);
  t.seq = list(t.sequence_after, `${w}.sequence_after`);
  t.sg = list(t.start_gates, `${w}.start_gates`);
  t.mg = list(t.merge_gates, `${w}.merge_gates`);
  t.ms = list(t.milestone_gate, `${w}.milestone_gate`);
  t.res = list(t.resource_constraints, `${w}.resource_constraints`);
  for (const d of [...t.tech, ...t.seq]) {
    if (!T.has(d)) { fail(`${w}: zavisnost/redosled na nepostojeći tiket ${d}`); continue; }
    if (d === t.ticket_id) fail(`${w}: referiše sam sebe`);
    if (MS_ORDER[T.get(d).milestone] > MS_ORDER[t.milestone]) fail(`${w} (${t.milestone}) zavisi od kasnijeg ${d} (${T.get(d).milestone})`);
  }
  for (const d of t.seq) if (t.tech.includes(d)) fail(`${w}: ${d} je i u technical_dependencies i u sequence_after`);
  for (const s of t.sg) if (!isGate(s)) fail(`${w}.start_gates: ${s} nije kapija iz registra`);
  t.mgTickets = t.mg.filter((m) => T.has(m));
  for (const m of t.mg) if (!isGate(m) && !T.has(m)) fail(`${w}.merge_gates: ${m} nije kapija iz registra ni tiket`);
  for (const m of t.mgTickets) if (t.tech.includes(m) || t.seq.includes(m) || m === t.ticket_id) fail(`${w}.merge_gates: ${m} je već tehnička zavisnost/redosled ili sam tiket`);
  t.startAfter = []; t.mergeBefore = [];
  for (const m of t.ms) {
    const x = m.match(MSG_RE);
    if (!x || !isEvent(x[2])) { fail(`${w}.milestone_gate: „${m}” (očekuje se start_after:|merge_before: + događaj iz registra)`); continue; }
    (x[1] === 'start_after' ? t.startAfter : t.mergeBefore).push(x[2]);
  }
  for (const r of t.res) if (!RES_RE.test(r) || G.get(r)?.kind !== 'resurs') fail(`${w}.resource_constraints: ${r} nije resurs iz registra`);
  for (const req of ['PLAN-APPROVAL', 'ROLE-ASSIGN']) if (!t.sg.includes(req)) fail(`${w}: start_gates bez ${req}`);
  if (t.ticket_id !== 'INT-01' && !t.mg.includes('MERGE-AUTH')) fail(`${w}: merge_gates bez MERGE-AUTH`);
  if (t.wave !== 'INT' && !t.mergeBefore.includes(FREEZE[t.milestone])) fail(`${w}: milestone_gate bez merge_before:${FREEZE[t.milestone]}`);
  for (const e of t.startAfter) if (t.mergeBefore.includes(e)) fail(`${w}: isti događaj ${e} i u start_after i u merge_before`);
}
const fmt = (xs) => (xs.length ? xs.join(', ') : '—');
const cardLine = (t) => `- **Spremnost (iz backlog.csv):** tehničke: ${fmt(t.tech)} · posle: ${fmt(t.seq)} · start: ${fmt(t.sg)} · merge: ${fmt(t.mg)} · milestone: ${fmt(t.ms)} · resursi: ${fmt(t.res)}`;
if (CARDS_ONLY) {
  for (const t of tickets) console.log(`${t.ticket_id}\t${cardLine(t)}`);
  process.exit(failures ? 1 : 0);
}
ok(`oblik i reference: ${tickets.length} redova, ${gates.length} unosa registra`);
const byMs = {}; for (const t of tickets) byMs[t.milestone] = (byMs[t.milestone] ?? 0) + 1;
info(`po kontrolnoj tački: ${Object.entries(byMs).map(([k, v]) => `${k} ${v}`).join(', ')}; INT ${tickets.filter((t) => t.wave === 'INT').length}`);

// ---------- cycle check (tickets + gates + events) ----------
const edges = new Map(); // node -> successors ("must happen before")
const edge = (a, b) => { if (!edges.has(a)) edges.set(a, new Set()); edges.get(a).add(b); };
for (const t of tickets) {
  for (const d of [...t.tech, ...t.seq, ...t.mgTickets]) edge(d, t.ticket_id);
  for (const s of [...t.sg, ...t.mg]) if (G.has(s)) edge(s, t.ticket_id);
  for (const e of t.startAfter) edge(e, t.ticket_id);
  for (const e of t.mergeBefore) edge(t.ticket_id, e);
}
for (const g of gates) for (const r of g.req) edge(r, g.gate_id);
{
  const state = new Map(); const stack = [];
  let cycles = 0;
  const visit = (n) => {
    state.set(n, 1); stack.push(n);
    for (const m of edges.get(n) ?? []) {
      if (state.get(m) === 1) { cycles++; fail(`ciklus: ${[...stack.slice(stack.indexOf(m)), m].join(' → ')}`); }
      else if (!state.get(m)) visit(m);
    }
    stack.pop(); state.set(n, 2);
  };
  for (const n of [...T.keys(), ...G.keys()]) if (!state.get(n)) visit(n);
  if (!cycles) ok('nema ciklusa (technical_dependencies ∪ sequence_after ∪ merge_gates ∪ kapije ∪ događaji)');
}

// ---------- readiness simulation ----------
// closedGates: set of gate ids closed by decision; held: gate/event ids forced open; declined: gates whose "ne" makes tickets ODLOŽENO.
function simulate({ closeAll = false, closed = [], held = [], declined = [], legacy = false }) {
  const status = new Map(); const started = new Map(); const done = new Map(); const evClosed = new Map(); const gClosed = new Map();
  const deferred = new Set(tickets.filter((t) => t.sg.some((s) => declined.includes(s))).map((t) => t.ticket_id));
  for (const t of tickets) status.set(t.ticket_id, deferred.has(t.ticket_id) ? 'ODLOZENO' : 'TODO');
  const isClosed = (id) => (T.has(id) ? status.get(id) === 'DONE' || status.get(id) === 'ODLOZENO' : isEvent(id) ? evClosed.has(id) : gClosed.has(id));
  let step = 0; let clock = 0; let changed = true; const at = new Map(); const mark = (id) => at.set(id, ++clock);
  const decisionOpen = (g) => held.includes(g.gate_id) || (!closeAll && !closed.includes(g.gate_id));
  while (changed && step < 10000) {
    changed = false; step++;
    for (const g of gates) {
      if (g.kind === 'resurs' || gClosed.has(g.gate_id) || evClosed.has(g.gate_id)) continue;
      if (g.kind === 'dogadjaj') {
        if (held.includes(g.gate_id)) continue;
        const need = [...g.req, ...tickets.filter((t) => t.mergeBefore.includes(g.gate_id)).map((t) => t.ticket_id)];
        if (need.every(isClosed)) { evClosed.set(g.gate_id, step); mark(g.gate_id); changed = true; }
      } else if (!decisionOpen(g) && !declined.includes(g.gate_id) && g.req.every(isClosed)) { gClosed.set(g.gate_id, step); mark(g.gate_id); changed = true; }
      else if (declined.includes(g.gate_id) && !held.includes(g.gate_id) && g.req.every(isClosed)) { gClosed.set(g.gate_id, step); mark(g.gate_id); changed = true; }
    }
    const readyStart = (t) => legacy ? t.tech.every(isClosed) : [...t.sg, ...t.startAfter, ...t.tech, ...t.seq].every(isClosed);
    const readyMerge = (t) => legacy ? true : readyStart(t) && [...t.mg].every(isClosed);
    for (const t of tickets) {
      const id = t.ticket_id; const s = status.get(id);
      if (s === 'TODO' && readyStart(t)) { status.set(id, 'STARTED'); started.set(id, step); mark(`start:${id}`); changed = true; }
      else if (s === 'STARTED' && started.get(id) < step && readyMerge(t)) { status.set(id, 'DONE'); done.set(id, step); mark(id); changed = true; }
    }
  }
  return { status, started, done, evClosed, gClosed, deferred, at };
}
const expect = (cond, msg) => (cond ? ok(msg) : fail(msg));
const neverStarted = (sim, ids) => ids.every((id) => !sim.started.has(id));

// S1: nothing decided -> nothing may start
{
  const s = simulate({});
  expect(s.started.size === 0, 'S1 sve kapije otvorene: nijedan tiket nije ready_to_start');
}
// S2: only what is needed to start the integration branch; merge authority open
{
  const s = simulate({ closed: ['PLAN-APPROVAL', 'ROLE-ASSIGN', 'TSA-09', 'Q00-h'] });
  expect(s.status.get('INT-01') === 'DONE' && s.status.get('W0-PR0') === 'STARTED' && [...s.started.keys()].length === 2,
    'S2 bez MERGE-AUTH: INT-01 završen, W0-PR0 sme da počne (priprema u grani) ali nije ready_to_merge; ništa drugo ne počinje');
}
// S3: everything decided, events happen naturally -> no deadlock, ordering invariants hold
{
  const s = simulate({ closeAll: true });
  const notDone = tickets.filter((t) => s.status.get(t.ticket_id) !== 'DONE').map((t) => t.ticket_id);
  const evOpen = gates.filter((g) => g.kind === 'dogadjaj' && !s.evClosed.has(g.gate_id)).map((g) => g.gate_id);
  expect(notDone.length === 0 && evOpen.length === 0, `S3 sve odluke donete: svi tiketi završeni, svi događaji zatvoreni${notDone.length || evOpen.length ? ` (nije: ${[...notDone, ...evOpen].join(', ')})` : ''}`);
  let bad = 0;
  const when = (id) => s.at.get(id);
  for (const t of tickets) {
    const st = s.at.get(`start:${t.ticket_id}`); const dn = s.at.get(t.ticket_id);
    if (st !== undefined) for (const d of [...t.tech, ...t.seq, ...t.sg, ...t.startAfter]) if (!(when(d) < st)) { bad++; fail(`S3 redosled: ${t.ticket_id} počeo pre zatvaranja ${d}`); }
    if (dn !== undefined) for (const d of [...t.mg]) if (!(when(d) < dn)) { bad++; fail(`S3 redosled: ${t.ticket_id} merge-ovan pre zatvaranja ${d}`); }
    for (const e of t.mergeBefore) { const ev = s.at.get(e); if (ev !== undefined && !(dn < ev)) { bad++; fail(`S3 redosled: događaj ${e} zatvoren pre merge-a ${t.ticket_id}`); } }
  }
  expect(bad === 0, 'S3 nijedan tiket ne počinje pre svojih technical_dependencies, sequence_after, kapija starta i start_after događaja; nijedan merge pre kapija merge-a; nijedan freeze pre merge-a svojih tiketa');
}
// S4: F2 held open while everything else is decided -> B3 must not become ready although B2-PR2 is merged
{
  const s = simulate({ closeAll: true, held: ['F2'] });
  expect(s.status.get('B2-PR2') === 'DONE' && neverStarted(s, ['B3-PR1', 'B3-PR2']),
    'S4 F2 nije zatvoren: B2-PR2 merge-ovan, a B3-PR1 i B3-PR2 nisu ready_to_start');
  const g3 = tickets.filter((t) => t.milestone === 'G3').map((t) => t.ticket_id);
  expect(neverStarted(s, g3), 'S4 F2 nije zatvoren: nijedan G3 tiket nije počeo');
}
// S5: ODB-02 undecided -> W3e-PR9a..e never start and F3 cannot close
{
  const s = simulate({ closeAll: true, held: ['ODB-02'] });
  const pr9 = tickets.filter((t) => t.sg.includes('ODB-02')).map((t) => t.ticket_id);
  expect(pr9.length === 5 && neverStarted(s, pr9) && !s.evClosed.has('F3-SRC'), 'S5 ODB-02 nije odlučen: W3e-PR9a..e ne počinju, F3-SRC se ne zatvara');
}
// S6: ODB-02 = "ne" -> W3e-PR9a..e ODLOŽENO, rest completes
{
  const s = simulate({ closeAll: true, declined: ['ODB-02'] });
  const rest = tickets.filter((t) => !s.deferred.has(t.ticket_id) && s.status.get(t.ticket_id) !== 'DONE');
  expect(s.deferred.size === 5 && rest.length === 0 && s.evClosed.has('F3'), 'S6 ODB-02 = ne: W3e-PR9a..e ODLOŽENO, ostali tiketi i F3 se završavaju');
}
// S7: RAT-02 held -> W1-PR2 may be prepared in its branch but not merged; W1-PR3 does not start
{
  const s = simulate({ closeAll: true, held: ['RAT-02'] });
  expect(s.status.get('W1-PR2') === 'STARTED' && !s.started.has('W1-PR3'), 'S7 RAT-02 otvoren: W1-PR2 ready_to_start (priprema u grani), nije ready_to_merge; W1-PR3 ne počinje');
}
// S8: DQ-09 held -> B3-PR1 may be drafted after F2 but not merged (pre-registration hash), B3-RUN does not happen
{
  const s = simulate({ closeAll: true, held: ['DQ-09'] });
  expect(!s.evClosed.has('F2') && neverStarted(s, ['B3-PR1']), 'S8 DQ-09 otvoren: F2 se ne zatvara, B3-PR1 ne počinje');
}
// S9 (informativno): stari model (samo depends_on) pušta B3-PR1 odmah posle B2-PR2
{
  const s = simulate({ closeAll: true, held: ['F2'], legacy: true });
  info(`S9 stari model bez tipizovanih polja: B3-PR1 ${s.started.has('B3-PR1') ? 'bi bio ready_to_start pre F2 (nalaz H-06 potvrđen)' : 'ne bi bio ready pre F2'}`);
}

// ---------- 03-BACKLOG.md consistency ----------
{
  const md = readText('03-BACKLOG.md').split('\n');
  let bad = 0;
  for (const t of tickets) {
    const idx = md.map((l, i) => [l, i]).filter(([l]) => new RegExp(`^#{3,4} ${t.ticket_id.replace(/[-]/g, '\\-')} — `).test(l)).map(([, i]) => i);
    if (idx.length !== 1) { bad++; fail(`03: kartica ${t.ticket_id} nađena ${idx.length} puta`); continue; }
    const level = md[idx[0]].match(/^#+/)[0].length;
    let end = md.length;
    for (let i = idx[0] + 1; i < md.length; i++) { const m = md[i].match(/^(#+) /); if (m && m[1].length <= level) { end = i; break; } }
    const section = md.slice(idx[0] + 1, end);
    const lines = section.filter((l) => l.startsWith('- **Spremnost (iz backlog.csv):**'));
    if (lines.length !== 1 || lines[0] !== cardLine(t)) { bad++; fail(`03: kartica ${t.ticket_id} — red Spremnost ne odgovara CSV-u`); }
    if (section.some((l) => l.includes('**Zavisi od:**') || l.includes('**Kapija:**'))) { bad++; fail(`03: kartica ${t.ticket_id} još nosi „Zavisi od”/„Kapija” (polja su u redu Spremnost)`); }
  }
  const ov = md.slice(md.indexOf('<!-- GEN:OVERVIEW:BEGIN -->'), md.indexOf('<!-- GEN:OVERVIEW:END -->'));
  if (!ov.length) { bad++; fail('03: nema GEN:OVERVIEW bloka'); }
  for (const t of tickets) {
    const row = ov.find((l) => l.startsWith(`| ${t.ticket_id} |`));
    if (!row) { bad++; fail(`03 pregled: nema reda ${t.ticket_id}`); continue; }
    const cells = row.split('|').map((c) => c.trim());
    if (cells[4] !== fmt(t.tech)) { bad++; fail(`03 pregled ${t.ticket_id}: „${cells[4]}” ≠ technical_dependencies „${fmt(t.tech)}”`); }
  }
  if (!ov.some((l) => /^\| Tiket \| G \| Naslov \| Tehničke zavisnosti \|/.test(l))) { bad++; fail('03 pregled: zaglavlje bez kolone „Tehničke zavisnosti”'); }
  if (!bad) ok(`03-BACKLOG.md: ${tickets.length} kartica i redova pregleda odgovara CSV-u`);
}

console.log(failures ? `\n${failures} FAIL` : '\nsve provere prošle (dokumentacija, ne aplikacija)');
process.exit(failures ? 1 : 0);
