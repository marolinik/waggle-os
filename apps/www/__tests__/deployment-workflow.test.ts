import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workflow = () =>
  readFileSync(
    join(process.cwd(), '..', '..', '.github', 'workflows', 'deploy-www.yml'),
    'utf8',
  );

describe('public-site deployment workflow', () => {
  it('deploys the dynamic Next app with Vercel instead of GitHub Pages static artifacts', () => {
    const source = workflow();

    expect(source).toContain('vercel pull');
    expect(source).toContain('vercel build');
    expect(source).toContain('vercel deploy --prebuilt --prod');
    expect(source).toContain('VERCEL_TOKEN');
    expect(source).toContain('VERCEL_ORG_ID');
    expect(source).toContain('VERCEL_PROJECT_ID');
    expect(source).not.toContain('upload-pages-artifact');
    expect(source).not.toContain('deploy-pages');
    expect(source).not.toContain('apps/www/dist');
  });
});
