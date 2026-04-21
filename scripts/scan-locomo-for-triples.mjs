#!/usr/bin/env node
// Sprint 10 Task 2.2 (A+B scan helper) — conv content inspector.
//
// For each target conv, extracts facts needed to finalize drafts:
//   conv-30 : find 5+ hobbies with D-refs                → Draft #5
//   conv-44 : find single-date activity signup + 2-anchor
//             relative-year claim                          → Drafts #1 + #2
//   conv-43 : verify absence of instruments for chosen
//             character                                     → Draft #3
//   conv-48 : verify absence of universities                → Draft #4
//
// Operates on benchmarks/data/locomo10.json. Output is a markdown
// summary we can paste into the verification note + use to populate
// the triples JSON.

import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('benchmarks/data/locomo10.json', 'utf-8'));

function getConv(sampleId) {
  const d = data.find(x => x.sample_id === sampleId);
  if (!d) throw new Error(`${sampleId} missing`);
  return d;
}

function collectTurns(conv) {
  const c = conv.conversation;
  const turns = [];
  const sessionDates = {};
  for (const key of Object.keys(c)) {
    const m = key.match(/^session_(\d+)$/);
    if (m && Array.isArray(c[key])) {
      const sessNum = Number(m[1]);
      sessionDates[sessNum] = c[`session_${sessNum}_date_time`] ?? '(no date)';
      for (const t of c[key]) {
        turns.push({
          session: sessNum,
          dateTime: sessionDates[sessNum],
          speaker: t.speaker,
          dia_id: t.dia_id,
          text: t.text ?? '',
        });
      }
    }
  }
  return { turns, sessionDates };
}

function grepTurns(turns, regex, max = 15) {
  const out = [];
  for (const t of turns) if (regex.test(t.text)) { out.push(t); if (out.length >= max) break; }
  return out;
}

function formatHit(t) {
  const txt = t.text.replace(/\s+/g, ' ').slice(0, 180);
  return `  ${t.dia_id} [S${t.session} ${t.dateTime}] ${t.speaker}: ${txt}`;
}

// ── conv-30 : hobbies enumeration ─────────────────────────────────────

{
  const conv = getConv('conv-30');
  const { turns } = collectTurns(conv);
  console.log('\n=== CONV-30 (Jon/Gina) — Draft #5 hobbies scan ===');
  console.log(`total turns: ${turns.length}`);
  // Look at ONE protagonist — Jon — for a unified "hobbies" subject.
  const jonTurns = turns.filter(t => t.speaker === 'Jon');
  console.log(`Jon turns: ${jonTurns.length}`);
  // Scan for activity keywords
  const activityPatterns = [
    /\b(hobby|hobbies|love(d)?|enjoy|fun|passion|into)\b/i,
    /\b(hike|hiking|climb|ski|biking|bike|run|running|jog|yoga|meditat)/i,
    /\b(paint|draw|sketch|photograph|photo)/i,
    /\b(read|book|novel|cook|bake|garden)/i,
    /\b(game|gaming|play|music|guitar|piano|sing)/i,
    /\b(travel|trip|visit|explore)/i,
    /\b(craft|build|make|create|DIY)/i,
    /\b(watch|movie|film|show|sport|football|basket)/i,
    /\b(fishing|camping|outdoor|boat|sail)/i,
  ];
  const activityTurns = jonTurns.filter(t => activityPatterns.some(p => p.test(t.text)));
  console.log(`Jon turns mentioning an activity keyword: ${activityTurns.length}`);
  // Also scan Gina turns to identify what she observes Jon doing
  const ginaAboutJon = turns.filter(t => t.speaker === 'Gina' && /\byou\b|\bJon\b/i.test(t.text) && activityPatterns.some(p => p.test(t.text)));
  console.log(`Gina turns referring to Jon doing an activity: ${ginaAboutJon.length}`);
  console.log('First 15 Jon activity turns:');
  for (const t of activityTurns.slice(0, 15)) console.log(formatHit(t));

  // Also check the qa array for the "destress" question and similar:
  console.log('\nHobby-adjacent QAs from conv-30.qa:');
  const hobbyQAs = conv.qa.filter(q => /hobby|hobbies|enjoy|destress|fun|pastime|activities/i.test(q.question));
  for (const q of hobbyQAs) {
    console.log(`  Q: ${q.question}\n    A: ${q.answer}\n    evidence: ${(q.evidence || []).join(', ')} (category ${q.category})`);
  }
}

// ── conv-44 : temporal-scope scans ────────────────────────────────────

{
  const conv = getConv('conv-44');
  const { turns } = collectTurns(conv);
  console.log('\n=== CONV-44 (Audrey/Andrew) — Draft #1 + #2 temporal scan ===');

  // Draft #1: single-date signup/activity QA
  console.log('\nSingle-anchor temporal QAs (looking for explicit dates, e.g. "X signed up for Y"):');
  const singleDateQAs = conv.qa.filter(q =>
    /\bwhen\b/i.test(q.question) &&
    /\b(2022|2023|2024|january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(q.answer || '') &&
    Array.isArray(q.evidence) && q.evidence.length === 1
  );
  for (const q of singleDateQAs.slice(0, 10)) {
    console.log(`  Q: ${q.question}\n    A: ${q.answer}\n    evidence: ${q.evidence.join(', ')} (category ${q.category})`);
  }

  // Draft #2: multi-anchor relative-year arithmetic
  console.log('\nTwo-anchor temporal arithmetic QAs:');
  const relQAs = conv.qa.filter(q =>
    /\byear\b/i.test(q.question) &&
    Array.isArray(q.evidence) && q.evidence.length >= 2
  );
  for (const q of relQAs.slice(0, 10)) {
    console.log(`  Q: ${q.question}\n    A: ${q.answer}\n    evidence: ${q.evidence.join(', ')} (category ${q.category})`);
  }

  // Also scan for "years ago" relative phrasing in dialogue
  const yearsAgoHits = grepTurns(turns, /\b\d+\s*years?\s*ago\b/i, 10);
  console.log('\n"N years ago" hits in dialogue:');
  for (const h of yearsAgoHits) console.log(formatHit(h));
}

// ── conv-43 : instrument absence check ────────────────────────────────

{
  const conv = getConv('conv-43');
  const { turns } = collectTurns(conv);
  console.log('\n=== CONV-43 (Tim/John) — Draft #3 null-instrument check ===');
  const instrumentRegex = /\b(guitar|piano|drum|drums|violin|bass|saxophone|trumpet|flute|cello|keyboard|ukulele|accordion|harp|oboe|clarinet|mandolin|banjo|sing|singer|vocal|band|orchestra|music lesson|played? .* (song|tune))\b/i;
  const hits = grepTurns(turns, instrumentRegex, 20);
  console.log(`total instrument-keyword hits: ${hits.length}`);
  for (const h of hits.slice(0, 10)) console.log(formatHit(h));

  // Identify which speakers are relevant
  console.log('\nSpeakers that DO appear (verifying Tim + John):');
  const speakers = new Set(turns.map(t => t.speaker));
  console.log('  speakers:', [...speakers].join(', '));
}

// ── conv-48 : university absence check ────────────────────────────────

{
  const conv = getConv('conv-48');
  const { turns } = collectTurns(conv);
  console.log('\n=== CONV-48 (Deborah/Jolene) — Draft #4 null-university check ===');
  const uniRegex = /\b(university|universities|college|campus|alma mater|degree|graduate school|grad school|masters?|master's|phd|bachelor|b\.?sc|b\.?a\.|m\.?s\.?c|m\.?a\.|dropout|undergrad|freshman|sophomore|junior|senior year|majoring|major in|minor in|professor|lecturer|dean)\b/i;
  const hits = grepTurns(turns, uniRegex, 20);
  console.log(`total uni-keyword hits: ${hits.length}`);
  for (const h of hits.slice(0, 10)) console.log(formatHit(h));

  console.log('\nSpeakers:');
  const speakers = new Set(turns.map(t => t.speaker));
  console.log('  speakers:', [...speakers].join(', '));
}
