/**
 * M-42 / P21 regression — Timeline event-type vocabulary alignment.
 *
 * Guards against drift between the UI event-type mapping and the
 * server-side AuditEventType union declared in
 * packages/server/src/local/routes/events.ts. Every canonical type the
 * server emits must have a human-readable label and an icon/colour
 * entry, otherwise Timeline rows render as raw snake-case with no
 * visual hierarchy.
 */
import { describe, it, expect } from 'vitest';
import {
  EVENT_ICONS,
  EVENT_COLORS,
  iconForEvent,
  colorForEvent,
  describeEvent,
  DEFAULT_EVENT_ICON,
  DEFAULT_EVENT_COLOR,
} from './timeline-events';

/**
 * Must mirror the server-side AuditEventType union. If a new type is
 * added server-side, this list (and the helper maps) must be updated
 * together — otherwise the new type shows up as raw text.
 */
const CANONICAL_SERVER_EVENT_TYPES = [
  'tool_call',
  'tool_result',
  'memory_write',
  'memory_delete',
  'workspace_create',
  'workspace_update',
  'workspace_delete',
  'session_start',
  'session_end',
  'approval_requested',
  'approval_granted',
  'approval_denied',
  'approval_auto',
  'export',
  'cron_trigger',
] as const;

describe('Timeline event mapping — canonical type coverage', () => {
  it.each(CANONICAL_SERVER_EVENT_TYPES)(
    'has an icon entry for %s',
    (type) => {
      expect(EVENT_ICONS).toHaveProperty(type);
    },
  );

  it.each(CANONICAL_SERVER_EVENT_TYPES)(
    'has a colour entry for %s',
    (type) => {
      expect(EVENT_COLORS).toHaveProperty(type);
    },
  );

  it.each(CANONICAL_SERVER_EVENT_TYPES)(
    'describes %s with something other than the raw type string',
    (type) => {
      const desc = describeEvent({ eventType: type } as never);
      expect(desc).not.toBe(type);
      expect(desc).not.toBe(type.replace(/_/g, ' '));
      expect(desc.length).toBeGreaterThan(0);
    },
  );
});

describe('describeEvent — specific cases', () => {
  it('tool_call includes toolName when present', () => {
    expect(describeEvent({ eventType: 'tool_call', toolName: 'read_file' } as never)).toBe('Used read_file');
  });

  it('tool_call falls back to "Tool call" without a toolName', () => {
    expect(describeEvent({ eventType: 'tool_call' } as never)).toBe('Tool call');
  });

  it('approval variants include the tool name', () => {
    expect(describeEvent({ eventType: 'approval_granted', toolName: 'write_file' } as never)).toBe('Approved: write_file');
    expect(describeEvent({ eventType: 'approval_denied', toolName: 'delete' } as never)).toBe('Denied: delete');
    expect(describeEvent({ eventType: 'approval_auto', toolName: 'read_file' } as never)).toBe('Auto-approved: read_file');
    expect(describeEvent({ eventType: 'approval_requested', toolName: 'write_file' } as never)).toBe('Approval requested: write_file');
  });

  it('maps memory_write and legacy memory_save to the same label', () => {
    expect(describeEvent({ eventType: 'memory_write' } as never)).toBe('Saved memory');
    expect(describeEvent({ eventType: 'memory_save' } as never)).toBe('Saved memory');
  });

  it('falls back to space-separated type for truly unknown events', () => {
    expect(describeEvent({ eventType: 'future_event_type' } as never)).toBe('future event type');
  });
});

describe('iconForEvent / colorForEvent', () => {
  it('returns the mapped icon for a canonical event', () => {
    expect(iconForEvent('memory_write')).toBe(EVENT_ICONS.memory_write);
  });

  it('returns the mapped colour for a canonical event', () => {
    expect(colorForEvent('approval_granted')).toBe(EVENT_COLORS.approval_granted);
  });

  it('falls back to the default icon for an unknown type', () => {
    expect(iconForEvent('never_emitted_type')).toBe(DEFAULT_EVENT_ICON);
  });

  it('falls back to the default colour for an unknown type', () => {
    expect(colorForEvent('never_emitted_type')).toBe(DEFAULT_EVENT_COLOR);
  });
});
