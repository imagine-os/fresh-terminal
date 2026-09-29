// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SKIN_LIBRARY, libraryToSkin, type SkinRun } from '@shared/skins';
import { I18nProvider } from '../i18n';
import { skinProps } from '../shell/Shell';
import { store } from '../store';
import { RefineBlock } from '../terminal/RefineBlock';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function run(boxId: string): SkinRun {
  const [brass, paper, wood] = SKIN_LIBRARY.slice(0, 3).map((material, index) => libraryToSkin(material!, 'sidebar', 'brass', `v${index}`, 1));
  return {
    id: 'run-test',
    box_id: boxId,
    request: 'skin the sidebar brass',
    material: 'brass',
    target: 'sidebar',
    path: 'library',
    path_source: 'jev',
    status: 'done',
    reason: 'plateau',
    error: null,
    spent_micro: 420,
    cap_micro: 30000,
    draft: null,
    rounds: [
      {
        round: 1,
        winner: 0,
        variants: [
          { skin: brass!, score: 4.2, note: 'brushed brass' },
          { skin: paper!, score: 1.5, note: 'paper' },
          { skin: wood!, score: 2.1, note: 'glass' },
        ],
      },
    ],
    applied: 'v0',
    started_at: 1,
    finished_at: 2,
  };
}

describe('skin runs in the transcript', () => {
  it('shows each round with the winner outlined, scores, the stop reason, and applies a picked variant', () => {
    const box = store.createBox('Skins');
    act(() => root.render(<I18nProvider lang="en"><RefineBlock run={run(box.id)} /></I18nProvider>));
    const round = host.querySelector('[data-testid="refine-round-1"]');
    const buttons = round?.querySelectorAll('button') ?? [];
    expect(buttons).toHaveLength(3);
    expect(buttons[0]?.getAttribute('data-winner')).toBe('true');
    expect(buttons[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(buttons[0]?.textContent).toContain('4.2');
    expect(host.querySelector('[data-testid="refine-done"]')?.textContent).toContain('no better version for two rounds');
    expect(host.querySelector('[data-testid="skin-stop"]')).toBeNull();
    act(() => (buttons[2] as HTMLButtonElement).click());
    expect(store.boxUi(box.id).skins.sidebar?.name).toBe('Frosted glass');
    expect(store.getSnapshot().edits.at(-1)?.summary).toContain("skinned the sidebar as 'Frosted glass'");
  });

  it('turns a skin into scoped tokens, layers and a veil on its region', () => {
    const skin = libraryToSkin(SKIN_LIBRARY[0]!, 'stage', 'brass', 's', 1);
    const props = skinProps(skin, {});
    expect(props['data-skinned']).toBe('stage');
    expect(props.style?.['--bg']).toBe('#2a1f0e');
    expect(props.style?.['--bg-elevated']).toBe('#2a1f0e');
    expect(props.style?.['--skin-layers']).toContain('linear-gradient');
    expect(props.style?.['--skin-veil']).toBe('45%');
    const image = skinProps({ ...skin, image: { ref: 'idb:abcd1234', title: 't', creator: 'c', license: 'CC0', license_url: '', source_url: '', provider: 'openverse' } }, { 'idb:abcd1234': 'blob:x' });
    expect(image.style?.['--skin-layers']).toMatch(/^url\("blob:x"\), repeating-linear-gradient/);
  });
});
