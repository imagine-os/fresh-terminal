import { describe, expect, it } from 'vitest';
import { STARTERS, STARTER_VERBS, findStarter, matchStarter, revealFor } from './index';

describe('starters', () => {
  it('seeds at least 12 valid records with unique ids', () => {
    expect(STARTERS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(STARTERS.map((starter) => starter.id)).size).toBe(STARTERS.length);
  });

  it('includes the required starters with their reveal patterns', () => {
    expect(findStarter('draw-dashboard')).toMatchObject({ expects: 'component', reveal: 'beam-horizontal' });
    expect(findStarter('draw-login')).toMatchObject({ reveal: 'beam-diagonal' });
    expect(findStarter('show-today')).toMatchObject({ expects: 'text' });
    expect(findStarter('make-page-notes')).toMatchObject({ expects: 'page', reveal: 'typewriter' });
    for (const id of ['list-boxes', 'switch-glass', 'set-sidebar', 'charge-nothing', 'verify-chain', 'speak-help', 'draw-plan-kanban', 'translate-es']) {
      expect(findStarter(id), id).toBeDefined();
    }
  });

  it('matches typed text loosely', () => {
    expect(matchStarter('draw a shadcn dashboard.')?.id).toBe('draw-dashboard');
    expect(matchStarter('Make a page called Notes')?.id).toBe('make-page-notes');
    expect(matchStarter('juggle')).toBeUndefined();
    expect(revealFor('Draw a login screen')).toBe('beam-diagonal');
    expect(revealFor('anything else')).toBe('typewriter');
  });

  it('collects the verb vocabulary', () => {
    expect(STARTER_VERBS).toEqual(expect.arrayContaining(['draw', 'show', 'make', 'list', 'switch', 'set', 'charge', 'verify', 'speak', 'translate']));
  });
});
