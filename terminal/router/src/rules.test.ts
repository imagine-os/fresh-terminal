import { describe, expect, it } from 'vitest';
import { allowedModels, detectIntent, isAllowedModel, loadRules, resolveRoute } from './rules';

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

  it('has a live Jev decisions tier and a tagger tier that never answer the user', () => {
    expect(table.tiers.jev).toMatchObject({ kind: 'decisions', model: 'typesafe/jev-1.13' });
    expect(table.tiers.tagger).toMatchObject({ kind: 'tagger', model: 'google/gemini-2.5-flash-lite' });
    const tag = resolveRoute('tag', table);
    expect(tag.kind).toBe('tagger');
    expect(tag.pending).toBe(false);
    expect(allowedModels(table)).not.toContain('typesafe/jev-1.13');
    expect(allowedModels(table)).not.toContain('google/gemini-2.5-flash-lite');
  });

  it('defaults the fast tier to claude-haiku-4.5 and keeps openrouter/auto as an explicit option only', () => {
    expect(resolveRoute('chat', table).model).toBe('anthropic/claude-haiku-4.5');
    for (const [name, tier] of Object.entries(table.tiers)) {
      if (tier.status !== 'pending') {
        expect(tier.model, name).not.toBe('openrouter/auto');
      }
    }
    expect(allowedModels(table)).toContain('openrouter/auto');
  });

  it('honours an allowed requested model and ignores an unlisted one', () => {
    expect(isAllowedModel('openrouter/auto', table)).toBe(true);
    expect(isAllowedModel('typesafe/jev-1.13', table)).toBe(false);
    expect(isAllowedModel('evil/model', table)).toBe(false);
    expect(resolveRoute('chat', table, { requestedModel: 'openrouter/auto' }).model).toBe('openrouter/auto');
    expect(resolveRoute('chat', table, { requestedModel: 'evil/model' }).model).toBe('anthropic/claude-haiku-4.5');
  });

  it('lets the default model be overridden without touching the table', () => {
    const resolved = resolveRoute('chat', table, { defaultModel: 'provider/fast-model' });
    expect(resolved.model).toBe('provider/fast-model');
  });
});
