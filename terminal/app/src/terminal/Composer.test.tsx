// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import { Composer, LOCAL_DEMOS } from './Composer';
import { matchLocalCommand } from './localCommands';
import { localTagger } from '@shared/chips';
import { THEME_VOID } from '@shared/themes';
import { tagRemote } from '../lib/modelTagger';
vi.mock('../lib/modelTagger', () => ({ tagRemote: vi.fn(async () => null) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
let sent: ReturnType<typeof vi.fn>;
const no = () => {};
const voice = { state: 'idle' as const, level: 0, interim: '', muted: false, active: false, start: no, stop: no, toggle: no, setMuted: no, audioRef: no };
const records = { pages: [], nav: [], themes: [] };
const glossary: [] = [];
function draw(extra: Partial<ComponentProps<typeof Composer>> = {}) {
  const props = {boxId: 'a',cursor: THEME_VOID.cursor,themeId: 'void',records,glossary,onTeach:no,hasBoxes:false,hasLines:false,busy:false,onSend:sent,voice,voiceMode:'toggle' as const,voiceAvailable:false,voiceAppend:null,onVoiceAppendConsumed:no,...extra};
  act(() => root.render(<I18nProvider lang="en"><Composer key={props.boxId} {...props}/></I18nProvider>));
}
function click(text: string) { const el = [...host.querySelectorAll('button')].find(el => el.textContent === text || el.getAttribute('aria-label') === text); if (!el) throw new Error(`Missing ${text}`); act(() => el.click()); }
function type(value: string) { const el=host.querySelector('textarea')!; act(() => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(el,value); el.dispatchEvent(new Event('input',{bubbles:true})); }); }
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); host=document.createElement('div'); document.body.append(host); root=createRoot(host); sent=vi.fn(); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); });
describe('recoverable prompt demo', () => {
  it('all demo prompts are deterministic local commands', () => {
    for(const text of LOCAL_DEMOS) {
      const result=matchLocalCommand(text,localTagger.tag(text),{boxes:[],lang:'en',dialectText:'',actionIntents:[]});
      expect(result).not.toBeNull();
      expect(result?.kind).not.toBe('text');
    }
  });
  it('demo choice fills editable chips without sending or paid tagging', async () => {
    vi.useFakeTimers(); draw(); click('Try a no-cost demo'); click(LOCAL_DEMOS[0]!);
    expect(host.querySelector('textarea')?.value).toBe(LOCAL_DEMOS[0]);
    expect(host.querySelector('[data-testid="chip-tray"]')).not.toBeNull();
    expect(sent).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(tagRemote).not.toHaveBeenCalled();
    expect(host.textContent).toContain('no AI credits');
    click('Send');
    expect(sent).toHaveBeenCalledTimes(1);
    expect(host.querySelector('textarea')?.value).toBe('');
    expect(JSON.parse(localStorage.getItem('fresh-terminal.draft.a')!)).toBe('');
  });
  it('keeps starter choices reachable after textarea blur', () => {
    draw({showStarters:true}); const first=host.querySelector<HTMLButtonElement>('.suggestions button')!;
    act(() => first.focus()); expect(document.activeElement).toBe(first);
    act(() => first.click()); expect(host.querySelector('textarea')?.value).toBe(first.textContent);
    expect(sent).not.toHaveBeenCalled();
  });
  it('restores each box draft after remount and never mixes boxes', () => {
    draw(); type('Draft one'); draw({boxId:'b'}); expect(host.querySelector('textarea')?.value).toBe(''); type('Draft two'); draw(); expect(host.querySelector('textarea')?.value).toBe('Draft one');
  });
  it('keeps the prompt when submission is rejected by an in-flight lock', () => {
    sent.mockReturnValue(false); draw(); type('Show today'); click('Send'); expect(host.querySelector('textarea')?.value).toBe('Show today');
  });
  it('keeps next draft while running and exposes an accessible Stop', () => {
    const stop=vi.fn(); draw({busy:true,onCancel:stop}); type('Next draft'); click('Stop'); expect(stop).toHaveBeenCalledOnce(); expect(host.querySelector('textarea')?.value).toBe('Next draft'); expect(host.querySelector<HTMLButtonElement>('[aria-label="Send"]')?.disabled).toBe(true);
  });
  it('recovery inserts once and preserves a newer draft', () => {
    draw({runState:'error'}); type('New work');
    for(let i=0;i<2;i++) act(() => window.dispatchEvent(new CustomEvent('ft:composer-insert',{detail:{text:'Original prompt'}})));
    expect(host.querySelector('textarea')?.value).toBe('New work\nOriginal prompt');
  });
});
