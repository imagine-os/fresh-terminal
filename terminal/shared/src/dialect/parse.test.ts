import { describe, expect, it } from 'vitest';
import { mergeDialect, parseDialect, printDialect } from './parse';
import { defaultSpecText } from './types';

describe('parseDialect', () => {
  it('parses the canonical sidebar sentence', () => {
    const { spec, issues } = parseDialect(
      'Left sidebar: rail on laptop, full on desk and wall, hidden on phone.',
    );
    expect(spec.regions.leftSidebar.behaviour).toEqual({
      phone: 'hidden',
      tablet: 'full',
      laptop: 'rail',
      desk: 'full',
      wall: 'full',
    });
    expect(issues.map((issue) => issue.message)).toEqual([
      'No behaviour given for tablet; using "full"',
    ]);
  });

  it('parses "everywhere" and extra words', () => {
    const { spec, issues } = parseDialect('Stage: full everywhere; fills; roomy; body; glass.');
    expect(issues).toEqual([]);
    expect(spec.regions.stage.behaviour.phone).toBe('full');
    expect(spec.regions.stage.behaviour.wall).toBe('full');
    expect(spec.regions.stage.fit).toBe('fills');
    expect(spec.regions.stage.spacing).toBe('roomy');
    expect(spec.regions.stage.type).toBe('body');
    expect(spec.regions.stage.material).toBe('glass');
  });

  it('parses a bare behaviour as everywhere', () => {
    const { spec } = parseDialect('Right sidebar: hidden.');
    expect(spec.regions.rightSidebar.behaviour.desk).toBe('hidden');
  });

  it('parses global spacing and material', () => {
    const { spec, issues } = parseDialect('Spacing: airy.\nMaterial: paper.');
    expect(issues).toEqual([]);
    expect(spec.spacing).toBe('airy');
    expect(spec.material).toBe('paper');
  });

  it('reports unknown words instead of guessing', () => {
    const { issues } = parseDialect('Left sidebar: sparkly on laptop; wobbly.\nAttic: full.');
    const messages = issues.map((issue) => issue.message);
    expect(messages).toContain('Unknown behaviour "sparkly"');
    expect(messages).toContain('Unknown word "wobbly"');
    expect(messages).toContain('Unknown region "Attic"');
  });

  it('parses the default spec without issues', () => {
    const { spec, issues } = parseDialect(defaultSpecText);
    expect(issues).toEqual([]);
    expect(spec.regions.leftSidebar.behaviour).toEqual({
      phone: 'hidden',
      tablet: 'hidden',
      laptop: 'full',
      desk: 'full',
      wall: 'full',
    });
    expect(spec.regions.topBar.fit).toBe('pinsTop');
    expect(spec.regions.bottomBar.fit).toBe('pinsBottom');
  });

  it('round-trips through printDialect', () => {
    const first = parseDialect(defaultSpecText).spec;
    const printed = printDialect(first);
    const second = parseDialect(printed);
    expect(second.issues).toEqual([]);
    expect(second.spec).toEqual(first);
  });

  it('accepts sentences on one line separated by full stops', () => {
    const { spec } = parseDialect('Top bar: hidden on phone. Bottom bar: full everywhere.');
    expect(spec.regions.topBar.behaviour.phone).toBe('hidden');
    expect(spec.regions.bottomBar.behaviour.phone).toBe('full');
  });
});

describe('mergeDialect', () => {
  it('changes only the mentioned size: "rail on laptop" leaves desk and phone alone', () => {
    const { spec, issues } = mergeDialect(defaultSpecText, 'Left sidebar: rail on laptop.');
    expect(issues).toEqual([]);
    expect(spec.regions.leftSidebar.behaviour).toEqual({ phone: 'hidden', tablet: 'hidden', laptop: 'rail', desk: 'full', wall: 'full' });
    expect(spec.regions.topBar).toEqual(parseDialect(defaultSpecText).spec.regions.topBar);
  });

  it('accepts the bare word "sidebar" and global words', () => {
    const { spec } = mergeDialect(defaultSpecText, 'Sidebar: hidden everywhere. Spacing: airy.');
    expect(spec.regions.leftSidebar.behaviour.desk).toBe('hidden');
    expect(spec.spacing).toBe('airy');
    expect(spec.material).toBe('flat');
  });

  it('reports unknown words and keeps the text round-trippable', () => {
    const bad = mergeDialect(defaultSpecText, 'Left sidebar: wobbly on laptop.');
    expect(bad.issues.map((issue) => issue.message)).toContain('Unknown behaviour "wobbly"');
    const good = mergeDialect(defaultSpecText, 'Stage: glass.');
    expect(parseDialect(good.text).spec).toEqual(good.spec);
  });
});
