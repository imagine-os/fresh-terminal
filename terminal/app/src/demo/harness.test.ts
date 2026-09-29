import { describe, expect, it } from 'vitest';
import { CHIP_KINDS, type Chip } from '@shared/chips';
import { tagLinks, tagRows } from '../tags-view/rows';
import { buildHarness, compile } from './harness';
import { findDemo } from './index';

describe('compile', () => {
  it('turns marked spans into chips with exact offsets and values', () => {
    const { text, chips } = compile('call {person:Mara} on {date:Monday|2026-03-02} about {money:$1,200}');
    expect(text).toBe('call Mara on Monday about $1,200');
    expect(chips.map((chip) => text.slice(chip.start, chip.end))).toEqual(['Mara', 'Monday', '$1,200']);
    expect(chips[1]?.value).toBe('2026-03-02');
    expect(chips.map((chip) => chip.kind)).toEqual(['person', 'date', 'money']);
  });
  it('groups list items when asked', () => {
    const { chips } = compile('{list:eggs}, {list:milk}', 'g1');
    expect(chips.every((chip) => chip.group === 'g1')).toBe(true);
  });
});

describe('buildHarness', () => {
  const demo = buildHarness();
  it('is deterministic', () => {
    expect(buildHarness().lines.map((line) => line.id + line.created_at)).toEqual(demo.lines.map((line) => line.id + line.created_at));
  });
  it('spans five stages and a year, with a reply after every line', () => {
    expect(demo.boxes).toHaveLength(5);
    const users = demo.lines.filter((line) => line.kind === 'user');
    expect(users).toHaveLength(300);
    expect(demo.lines.filter((line) => line.kind === 'assistant')).toHaveLength(300);
    const span = Math.max(...users.map((line) => line.created_at)) - Math.min(...users.map((line) => line.created_at));
    expect(span).toBeGreaterThan(350 * 86_400_000);
    for (const box of demo.boxes) expect(users.some((line) => line.box_id === box.id)).toBe(true);
  });
  it('keeps every chip offset honest', () => {
    for (const line of demo.lines.filter((candidate) => candidate.kind === 'user')) {
      for (const chip of JSON.parse(line.chips_json) as Chip[]) {
        expect(line.text.slice(chip.start, chip.end)).toBe(chip.text);
      }
    }
  });
  it('covers every tag kind and yields a dense graph', () => {
    const rows = tagRows(demo.lines, null);
    const kinds = new Set(rows.map((row) => row.kind));
    for (const kind of CHIP_KINDS) expect(kinds.has(kind)).toBe(true);
    expect(rows.length).toBeGreaterThan(150);
    const links = tagLinks(rows);
    expect(links.length).toBeGreaterThan(400);
    // Tags shared across stages: Dr. Okafor and Northwind Dental appear in Family too, Andrés Pinilla in Personal.
    expect(rows.find((row) => row.id === 'person:dr. okafor')?.stages.length).toBe(2);
    expect(rows.find((row) => row.id === 'person:andrés pinilla')?.stages.length).toBe(2);
  });
});

describe('findDemo', () => {
  it('finds demos case-insensitively and returns null otherwise', () => {
    expect(findDemo('Harness')?.name).toBe('harness');
    expect(findDemo('nope')).toBeNull();
  });
});
