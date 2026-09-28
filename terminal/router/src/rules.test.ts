import { describe, expect, it } from 'vitest';
import { detectIntent, loadRules, resolveRoute } from './rules';

describe('route table', () => {
  const table = loadRules();

  it('detects an intent from a leading action verb', () => {
    expect(detectIntent('make a page called "Pricing"', table)).toBe('make');
    expect(detectIntent('  Schedule a call tomorrow', table)).toBe('schedule');
    expect(detectIntent('hello there', table)).toBe('chat');
  });

  it('resolves every rule to a known tier', () => {
    for (const rule of table.rules) {
      const resolved = resolveRoute(rule.intent, table);
      expect(resolved.model.length).toBeGreaterThan(0);
      expect(resolved.permission).toBe(rule.permission);
      expect(resolved.marginBasisPoints).toBe(rule.margin_bp);
    }
  });

  it('falls back to the default rule for an unknown intent', () => {
    const resolved = resolveRoute('juggle', table);
    expect(resolved.intent).toBe(table.default);
  });

  it('marks the JEV tier pending until a model id is configured', () => {
    const pending = resolveRoute('tag', table);
    expect(pending.tier).toBe('jev');
    expect(pending.pending).toBe(true);

    const configured = resolveRoute('tag', table, { jevModel: 'some-provider/some-model' });
    expect(configured.pending).toBe(false);
    expect(configured.model).toBe('some-provider/some-model');
  });

  it('lets the default model be overridden without touching the table', () => {
    const resolved = resolveRoute('chat', table, { defaultModel: 'provider/fast-model' });
    expect(resolved.model).toBe('provider/fast-model');
  });
});
