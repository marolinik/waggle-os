import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const playbook = readFileSync(
  new URL('../../docs/code-signing-pilot-and-launch.md', import.meta.url),
  'utf8',
);
const pilotScript = readFileSync(
  new URL('./sign-windows-pilot.ps1', import.meta.url),
  'utf8',
);
const macPilotScript = readFileSync(
  new URL('./sign-macos-adhoc.sh', import.meta.url),
  'utf8',
);

describe('internal pilot signing guidance', () => {
  it('routes Windows builds through the explicit pilot-signing override', () => {
    expect(playbook).toContain('npm run tauri:build:win:pilot-signed');
    expect(playbook).not.toMatch(/^npm run tauri:build:win$/m);
    expect(pilotScript).toContain(
      "Write-Host '  1. npm run tauri:build:win:pilot-signed'",
    );
    expect(pilotScript).not.toMatch(
      /Write-Host '[ ]{2}1\. npm run tauri:build:win'\s*$/m,
    );
    expect(pilotScript).not.toMatch(/Write-Host '[ ]+1\. cd app/);
  });

  it('does not claim an ordinary macOS build loads the signing override', () => {
    expect(playbook).toContain('macOS is deferred');
    expect(playbook).toContain('npm run tauri:sign:pilot:mac:adhoc');
    expect(playbook).not.toContain(
      'so every `npm run tauri:build:mac` produces an ad-hoc-signed `.app` automatically',
    );
    expect(playbook).not.toContain(
      'ships the macOS ad-hoc identity in the build-override config by default',
    );
    expect(macPilotScript).toContain(
      'Treat the input as unsigned until this script signs and verifies it.',
    );
    expect(macPilotScript).not.toContain('already passes');
  });
});
