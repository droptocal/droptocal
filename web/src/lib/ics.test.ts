import { describe, expect, it } from 'vitest';
import { buildIcs, settled } from './ics';
import type { EventDraft } from './types';

const event = (over: Partial<EventDraft> = {}): EventDraft => ({
  id: 'x',
  title: 'Jazz',
  startDate: '2026-10-16',
  startTime: '20:00',
  endDate: '',
  endTime: '',
  allDay: false,
  location: '',
  timezone: '',
  rrule: '',
  description: '',
  url: '',
  sourceText: '',
  confidence: 1,
  notes: '',
  ...over,
});

/** The calendar's lines with folding undone. */
const lines = (ics: string) => ics.replace(/\r\n /g, '').split('\r\n');

describe('buildIcs', () => {
  it('escapes the characters RFC 5545 reserves in text', () => {
    const out = lines(buildIcs([event({ title: 'Jazz; Blues, Soul', description: 'Doors 19:00\nC:\\ok' })]));
    expect(out).toContain('SUMMARY:Jazz\\; Blues\\, Soul');
    expect(out).toContain('DESCRIPTION:Doors 19:00\\nC:\\\\ok');
  });

  it('writes a floating time without a zone', () => {
    const out = lines(buildIcs([event()]));
    expect(out).toContain('DTSTART:20261016T200000');
    expect(out).toContain('DTEND:20261016T220000');
  });

  it('writes a zoned time as UTC', () => {
    const out = lines(buildIcs([event({ timezone: 'Europe/Zurich' })]));
    expect(out).toContain('DTSTART:20261016T180000Z');
  });

  it('ends an all-day event the day after, exclusively', () => {
    const out = lines(buildIcs([event({ allDay: true, startTime: '' })]));
    expect(out).toContain('DTSTART;VALUE=DATE:20261016');
    expect(out).toContain('DTEND;VALUE=DATE:20261017');
  });

  it('folds long lines at 75 octets', () => {
    const ics = buildIcs([event({ description: 'ä'.repeat(200) })]);
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});

describe('settled', () => {
  it('makes an event with no start time all day', () => {
    expect(settled(event({ allDay: false, startTime: '' })).allDay).toBe(true);
    const out = lines(buildIcs([settled(event({ allDay: false, startTime: '' }))]));
    expect(out).toContain('DTSTART;VALUE=DATE:20261016');
  });

  it('leaves a timed event alone', () => {
    const timed = event();
    expect(settled(timed)).toBe(timed);
  });
});
