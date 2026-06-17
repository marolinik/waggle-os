import { describe, it, expect } from 'vitest';
import { segmentText, type Segment } from './capability-request-parser';

const capOf = (segs: Segment[]) => segs.find((s): s is Extract<Segment, { kind: 'capability' }> => s.kind === 'capability');

describe('capability-request-parser', () => {
  it('parses a connector marker with id + authType (PR4 kind widening)', () => {
    const segs = segmentText(
      'You need Slack. <!--waggle:capability_request {"name":"Slack","source":"connector","kind":"connector","connectorId":"slack","authType":"bearer","reason":"to post updates"}--> done.',
    );
    expect(capOf(segs)?.request).toMatchObject({
      name: 'Slack', source: 'connector', kind: 'connector', connectorId: 'slack', authType: 'bearer', reason: 'to post updates',
    });
  });

  it('parses an mcp marker', () => {
    const segs = segmentText('<!--waggle:capability_request {"name":"postgres","source":"mcp","kind":"mcp"}-->');
    expect(capOf(segs)?.request).toMatchObject({ name: 'postgres', kind: 'mcp' });
  });

  it('still parses the legacy phrasing (no kind)', () => {
    const segs = segmentText('Run `install_capability` with name "pdf" and source "starter-pack" now.');
    const req = capOf(segs)?.request;
    expect(req).toMatchObject({ name: 'pdf', source: 'starter-pack' });
    expect(req?.kind).toBeUndefined();
  });

  it('returns plain text when there is no request', () => {
    expect(segmentText('just a normal message')).toEqual([{ kind: 'text', content: 'just a normal message' }]);
  });
});
