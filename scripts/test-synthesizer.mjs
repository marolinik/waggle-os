import { resolveSynthesizer } from '@waggle/wiki-compiler';

const s = await resolveSynthesizer();
console.log('Provider:', s.provider);
console.log('Model:', s.model);

if (s.provider !== 'echo') {
  console.log('\nTesting live synthesis...');
  const result = await s.synthesize('Summarize in 2 sentences: Waggle OS is an AI workspace platform with persistent memory built by Egzakta Group.');
  console.log('Output:', result.slice(0, 300));
} else {
  console.log('\nNo LLM available — echo mode.');
  console.log('Set ANTHROPIC_API_KEY or WAGGLE_OLLAMA_URL for real synthesis.');
}
