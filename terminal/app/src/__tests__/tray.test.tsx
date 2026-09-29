// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../i18n';
import { Tray, type Tool } from '../shell/Tray';
import { ToastProvider } from '../ui/Toast';

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

describe('tools tray', () => {
  it('hides tools behind the tray, pins one back to the bar and unpins it', () => {
    const clicks: string[] = [];
    const tools: Tool[] = [
      { id: 'box.new', label: 'New box', icon: <span>+</span>, onClick: () => clicks.push('new'), shortcut: 'N' },
      { id: 'theme.cycle', label: 'Theme', icon: <span>◐</span>, onClick: () => clicks.push('theme') },
    ];
    let pinned: string[] = [];
    const draw = () =>
      act(() =>
        root.render(
          <I18nProvider lang="en">
            <ToastProvider>
              <Tray tools={tools} pinned={pinned} onPinned={(ids) => { pinned = ids; draw(); }} nav={[]} onNavigate={() => {}} />
            </ToastProvider>
          </I18nProvider>,
        ),
      );
    draw();
    // Nothing on the bar until pinned.
    expect(host.querySelector('[data-testid="topbar-pins"]')?.querySelectorAll('[data-tool]')).toHaveLength(0);
    expect(host.querySelector('[data-testid="tray"]')).toBeNull();
    act(() => host.querySelector<HTMLElement>('[data-testid="tray-toggle"]')?.click());
    expect(host.querySelector('[data-testid="tray"]')).not.toBeNull();
    expect(host.querySelectorAll('.tray-tool')).toHaveLength(2);
    act(() => host.querySelector<HTMLElement>('[data-testid="pin-box.new"]')?.click());
    expect(pinned).toEqual(['box.new']);
    const onBar = host.querySelector('[data-testid="topbar-pins"] [data-tool="box.new"]');
    expect(onBar).not.toBeNull();
    act(() => (onBar as HTMLElement).click());
    expect(clicks).toEqual(['new']);
    act(() => host.querySelector<HTMLElement>('[data-testid="pin-box.new"]')?.click());
    expect(pinned).toEqual([]);
    // Escape closes the tray.
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(host.querySelector('[data-testid="tray"]')).toBeNull();
  });
});
