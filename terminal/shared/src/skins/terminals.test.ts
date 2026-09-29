import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SEED_THEMES } from '../themes';
import { LIBRARY_TERMINALS, findMaterial } from './terminals';

const html = readFileSync(resolve(__dirname, '../../../app/public/pages/library.html'), 'utf8');

describe('library terminals', () => {
  it('maps every library entry to a built theme and an existing material', () => {
    const ids = [...html.matchAll(/\{ id: '([a-z-]+)', n: \d+/g)].map((match) => match[1]);
    expect(ids).toHaveLength(17);
    expect(LIBRARY_TERMINALS.map((terminal) => terminal.id).sort()).toEqual([...ids].sort());
    for (const terminal of LIBRARY_TERMINALS) {
      expect(SEED_THEMES.some((theme) => theme.id === terminal.theme)).toBe(true);
      if (terminal.skin) expect(findMaterial(terminal.skin)).not.toBeNull();
      if (!terminal.built) expect(terminal.notWired).toBeTruthy();
    }
  });

  it('the page opens the same theme and skin as the app expects, with relative links', () => {
    for (const terminal of LIBRARY_TERMINALS) {
      const line = new RegExp(`'${terminal.id}': \\{ theme: '${terminal.theme}', skin: ${terminal.skin ? `'${terminal.skin}'` : 'null'} \\}`);
      expect(html).toMatch(line);
    }
    expect(html).toContain("return '../box/new?theme='");
    expect(html).not.toContain("'/box/new?theme='");
  });
});
