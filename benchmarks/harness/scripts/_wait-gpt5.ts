import { createBeamOpenAiClient, OPENAI_PRICING, loadDotEnv } from '../src/beam-openai-client.js';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  loadDotEnv();
  const judge = createBeamOpenAiClient({ model: 'gpt-5', pricing: OPENAI_PRICING['gpt-5'], timeoutMs: 120_000, maxRetries: 0 });
  for (let i = 1; i <= 12; i++) {
    const r = await judge.chat({ system: 'Return only JSON.', user: 'Return JSON: {"score": 1.0, "reason": "ok"}', jsonMode: true, maxTokens: 200 });
    const ok = !r.failureMode && r.text.trim().length > 0;
    console.log(`probe ${i}: failureMode=${r.failureMode} textLen=${r.text.length} -> ${ok ? 'READY' : 'still limited'}`);
    if (ok) { console.log('GPT5_READY'); return; }
    await sleep(20_000);
  }
  console.log('GPT5_STILL_LIMITED after ~4min');
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
