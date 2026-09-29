// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../i18n';
import { CostLabel } from '../terminal/CostLabel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('the markup on the reply line (C-103)', () => {
  it('shows the price, and the markup in words when there is one', () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    act(() => root.render(<I18nProvider lang="en"><CostLabel meta={{ cost_micro: 11_000, markup_micro: 1_000 }} /></I18nProvider>));
    const label = host.querySelector('[data-testid="reply-markup"]');
    expect(label?.textContent).toBe('$0.0110 (incl. $0.0010 markup, 10%)');
    expect(label?.getAttribute('title')).toContain('Model cost $0.0100 + $0.0010 markup');
    // Pay what you want (C-105): the reply line names the rate the person chose.
    act(() => root.render(<I18nProvider lang="en"><CostLabel meta={{ cost_micro: 12_500, markup_micro: 2_500, markup_bp: 2500 }} /></I18nProvider>));
    expect(host.querySelector('[data-testid="reply-markup"]')?.textContent).toBe('$0.0125 (incl. $0.0025 markup, 25%)');
    act(() => root.render(<I18nProvider lang="en"><CostLabel meta={{ cost_micro: 10_000 }} /></I18nProvider>));
    expect(host.querySelector('[data-testid="reply-markup"]')).toBeNull();
    expect(host.textContent).toBe('$0.0100');
    act(() => root.unmount());
  });
});
