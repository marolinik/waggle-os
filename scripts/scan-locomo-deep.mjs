#!/usr/bin/env node
// Deeper conv scan — per-speaker activity enumeration + multi-anchor QA.

import fs from 'node:fs';
const data = JSON.parse(fs.readFileSync('benchmarks/data/locomo10.json','utf-8'));
const getConv = id => data.find(x => x.sample_id === id);
function collectTurns(conv) {
  const c = conv.conversation;
  const turns = [];
  for (const key of Object.keys(c)) {
    const m = key.match(/^session_(\d+)$/);
    if (m && Array.isArray(c[key])) {
      for (const t of c[key]) turns.push({ session: +m[1], dateTime: c[`session_${m[1]}_date_time`] ?? '', speaker: t.speaker, dia_id: t.dia_id, text: t.text ?? '' });
    }
  }
  return turns;
}

// ── CONV-30 — identify distinct hobby/activity anchors per speaker ────
{
  const conv = getConv('conv-30');
  const turns = collectTurns(conv);
  console.log('\n=== CONV-30 hobby enumeration ===');
  // For each speaker, bucket key content words
  const THEMES = [
    ['dance', /\bdanc(e|ing|er|es)\b|contemporary|ballroom|choreograph|studio/i],
    ['music', /\b(music|song|sing|vocal|concert|gig|band|album|playlist|guitar|piano|drum)\b/i],
    ['cook/bake', /\b(cook|baking|bake|recipe|kitchen|dinner|meal|chef|bbq)\b/i],
    ['travel', /\b(travel|trip|vacation|holiday|flight|road trip|visit)\b/i],
    ['read/write', /\b(read|book|novel|journal|writ(e|ing)|blog|author|poet)\b/i],
    ['outdoor', /\b(hike|hiking|camp|camping|fish|fishing|outdoor|mountain|trail|park)\b/i],
    ['sport/fitness', /\b(run|running|gym|yoga|workout|sport|basketball|football|soccer|tennis|climb)\b/i],
    ['art/craft', /\b(paint|painting|draw|drawing|sketch|craft|diy|sew|sewing|knit|pottery|photo)\b/i],
    ['games/tech', /\b(video game|gaming|playstation|xbox|nintendo|pc gam|code|coding|program)\b/i],
    ['garden/pet', /\b(garden|plant|flower|veg|pet|dog|cat|animal)\b/i],
    ['movie/tv', /\b(movie|film|cinema|tv show|netflix|series|watch)\b/i],
    ['volunteer/social', /\b(volunteer|community|charity|help(ing) (others)|give back)\b/i],
    ['business/entrepreneur', /\b(business|startup|entrepreneur|launch.*(store|studio|company)|open.*(studio|store))\b/i],
  ];
  for (const speaker of ['Jon','Gina']) {
    const ts = turns.filter(t => t.speaker === speaker);
    console.log(`\n-- ${speaker} (${ts.length} turns) --`);
    for (const [label, re] of THEMES) {
      const hits = ts.filter(t => re.test(t.text));
      if (hits.length > 0) {
        console.log(`  ${label}: ${hits.length} turns  refs=[${hits.slice(0,5).map(h => h.dia_id).join(',')}${hits.length > 5 ? ',…' : ''}]`);
      }
    }
  }
  // Also print multi-hobby-flavored QAs
  console.log('\nconv-30 qa entries with 3+ evidence IDs (multi-anchor):');
  const multi = conv.qa.filter(q => Array.isArray(q.evidence) && q.evidence.length >= 3);
  for (const q of multi.slice(0,10)) console.log(`  Q: ${q.question}\n    A: ${q.answer}\n    evidence(${q.evidence.length}): ${q.evidence.join(', ')} (cat ${q.category})`);
}

// ── CONV-44 — find a multi-anchor temporal arithmetic QA ───────────────
{
  const conv = getConv('conv-44');
  console.log('\n=== CONV-44 multi-anchor temporal QAs ===');
  const two = conv.qa.filter(q => /\b(year|month|date|when|how long|how many years)\b/i.test(q.question) && Array.isArray(q.evidence) && q.evidence.length >= 2);
  for (const q of two.slice(0,15)) console.log(`  Q: ${q.question}\n    A: ${q.answer}\n    evidence(${q.evidence.length}): ${q.evidence.join(', ')} (cat ${q.category})`);
}

// ── CONV-43 — John-specific instrument check ───────────────────────────
{
  const conv = getConv('conv-43');
  const turns = collectTurns(conv);
  console.log('\n=== CONV-43 John-only instrument scan ===');
  const johnTurns = turns.filter(t => t.speaker === 'John');
  const instR = /\b(guitar|piano|drum|drums|violin|bass|saxophone|trumpet|flute|cello|keyboard|ukulele|banjo|sing|singer|vocalist|rap|rhythm|play.*music|musician)\b/i;
  const johnMusic = johnTurns.filter(t => instR.test(t.text));
  console.log(`John turns mentioning instrument/music: ${johnMusic.length} of ${johnTurns.length}`);
  for (const h of johnMusic.slice(0,10)) console.log(`  ${h.dia_id} [${h.speaker}] ${h.text.slice(0,180)}`);
  // Any QA where answer names John's instrument?
  console.log('\nqa entries naming John and music:');
  const musicQA = conv.qa.filter(q => /\b(John)\b/i.test(q.question) && /\b(instrument|music|piano|guitar|violin|drum|sing|play)\b/i.test(q.question));
  for (const q of musicQA.slice(0,10)) console.log(`  Q: ${q.question}\n    A: ${q.answer}\n    evidence: ${(q.evidence||[]).join(', ')}`);
}

// ── CONV-48 — Deborah-specific university check ────────────────────────
{
  const conv = getConv('conv-48');
  const turns = collectTurns(conv);
  console.log('\n=== CONV-48 Deborah-only university scan ===');
  const dTurns = turns.filter(t => t.speaker === 'Deborah');
  const uniR = /\b(university|college|campus|alma mater|degree|phd|bachelor|master|undergrad|postgrad|school of|faculty|professor|dean|academic|tuition)\b/i;
  const dHits = dTurns.filter(t => uniR.test(t.text));
  console.log(`Deborah turns mentioning uni/college: ${dHits.length} of ${dTurns.length}`);
  for (const h of dHits.slice(0,10)) console.log(`  ${h.dia_id} ${h.text.slice(0,180)}`);
  // Check whether QA entries ask about Deborah's education
  const eduQA = conv.qa.filter(q => /\b(Deborah|she|her)\b/i.test(q.question) && /\b(study|college|university|school|degree|education|attend)\b/i.test(q.question));
  console.log('\nqa entries about Deborah + education:');
  for (const q of eduQA.slice(0,10)) console.log(`  Q: ${q.question}\n    A: ${q.answer}\n    evidence: ${(q.evidence||[]).join(', ')}`);
}
