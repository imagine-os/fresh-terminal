import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { applyGlossary, applyOverrides, localTagger, overrideKey, type Chip, type ChipOverride, type TagContext } from '@shared/chips';
import type { GlossaryTerm } from '@shared/ui';
import type { CursorSpec } from '@shared/themes';
import { useI18n } from '../i18n';
import { tagRemote, type RemoteTagResult } from '../lib/modelTagger';
import { Button } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';
import { IconMic, IconSend } from '../ui/icons';
import type { VoiceControls } from '../voice/useVoice';
import { ChipPopover, type ChipDecision, type ChipRecords } from './ChipPopover';
import { ChipText } from './ChipText';
import { ChipTray } from './ChipTray';
import { DraftPage } from './DraftPage';
import { wantsPage } from './format';
import { SuggestionStrip } from './SuggestionStrip';

interface Props {
  boxId: string;
  cursor: CursorSpec;
  themeId: string;
  /** Ask the model tagger tier on keystroke pause (on by default). */
  modelTagger?: boolean;
  /** The box's own records and glossary, for chips. */
  records: ChipRecords;
  glossary: GlossaryTerm[];
  /** A chip popover decision that should teach the box a word. */
  onTeach: (term: NonNullable<ChipDecision['teach']>) => void;
  hasBoxes: boolean;
  hasLines: boolean;
  busy: boolean;
  onSend: (text: string, chips: Chip[]) => void;
  /** Esc while a turn runs stops it (C-079). */
  onCancel?: () => void;
  /** Enter while a turn runs: say so instead of swallowing the key. */
  onBusyEnter?: () => void;
  onActivity?: () => void;
  voice: VoiceControls;
  voiceMode: 'toggle' | 'hold';
  voiceAvailable: boolean;
  /** Text arriving from a final voice transcript to append to the draft. */
  voiceAppend: string | null;
  onVoiceAppendConsumed: () => void;
  /** Starter prompts under the box (a tray switch since C-079). */
  showStarters?: boolean;
}

export interface ComposerHandle {
  focus: () => void;
}

/**
 * Typewriter composer. Anchored at the bottom of its region; grows upward as
 * you type (auto-height, capped by --composer-max). Enter sends, Shift+Enter
 * inserts a newline. A mirror layer paints chips and the theme cursor over
 * the real textarea, which keeps native editing, IME and accessibility.
 */
export function Composer({
  boxId,
  cursor,
  themeId,
  modelTagger = true,
  records,
  glossary,
  onTeach,
  hasBoxes,
  hasLines,
  busy,
  onSend,
  onActivity,
  voice,
  voiceMode,
  voiceAvailable,
  voiceAppend,
  onVoiceAppendConsumed,
  showStarters = false,
  onCancel,
  onBusyEnter,
}: Props) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  // The themed block cursor is drawn only while the caret sits at the end of the text;
  // anywhere else the browser's own caret shows, so moving backwards is visible.
  const [caretAtEnd, setCaretAtEnd] = useState(true);
  const trackCaret = (element: HTMLTextAreaElement) => setCaretAtEnd(element.selectionStart === element.value.length && element.selectionEnd === element.value.length);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // A final voice transcript lands in the draft, separated by a space.
  useEffect(() => {
    if (voiceAppend === null) {
      return;
    }
    setText((current) => (current.trim().length > 0 ? `${current.trimEnd()} ${voiceAppend}` : voiceAppend));
    onVoiceAppendConsumed();
    textareaRef.current?.focus();
  }, [voiceAppend, onVoiceAppendConsumed]);

  const context = useMemo<TagContext>(() => ({ pages: records.pages, nav: records.nav, themes: records.themes }), [records]);
  const localChips = useMemo<Chip[]>(() => localTagger.tag(text, context), [text, context]);
  const [remote, setRemote] = useState<RemoteTagResult | null>(null);
  const [overrides, setOverrides] = useState<Record<string, ChipOverride>>({});
  const [editing, setEditing] = useState<{ chip: Chip; anchor: HTMLElement } | null>(null);

  // Remote chips are only used for the exact text they were computed for.
  const chips = useMemo<Chip[]>(() => {
    const base = modelTagger && remote && remote.text === text ? remote.chips : localChips;
    return applyOverrides(applyGlossary(text, base, glossary), overrides);
  }, [modelTagger, remote, text, localChips, glossary, overrides]);

  useEffect(() => {
    if (!modelTagger || text.trim().length < 4) {
      setRemote(null);
      return;
    }
    // Every call is metered: wait for a pause at a word end, not after each keystroke (C-079).
    if (/[\p{L}\p{N}]$/u.test(text)) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void tagRemote(text, localChips, glossary, controller.signal, boxId).then((found) => {
        if (!controller.signal.aborted && found) {
          setRemote(found);
        }
      });
    }, 1200);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [text, modelTagger, localChips, glossary, boxId]);

  // "next" chips in replies insert a command into the draft.
  useEffect(() => {
    const onInsert = (event: Event) => {
      const detail = (event as CustomEvent<{ text: string }>).detail;
      if (detail?.text) {
        setText(detail.text);
        setOverrides({});
        textareaRef.current?.focus();
      }
    };
    window.addEventListener('ft:composer-insert', onInsert);
    return () => window.removeEventListener('ft:composer-insert', onInsert);
  }, []);

  const decide = (chip: Chip, decision: ChipDecision) => {
    setOverrides((current) => ({ ...current, [overrideKey(chip)]: decision.override }));
    if (decision.teach) {
      onTeach(decision.teach);
    }
    setEditing(null);
  };

  const resize = useCallback(() => {
    const element = textareaRef.current;
    if (element === null) {
      return;
    }
    element.style.height = '0px';
    element.style.height = `${element.scrollHeight}px`;
  }, []);

  useEffect(() => {
    resize();
  }, [text, resize]);

  useEffect(() => {
    setText('');
    textareaRef.current?.focus();
  }, [boxId]);


  const send = useCallback(() => {
    const trimmed = text.trim();
    if (trimmed.length === 0 || busy) {
      return;
    }
    // Chips go out as structured data; offsets are relative to the trimmed text.
    const offset = text.indexOf(trimmed);
    const sent = chips
      .map((chip) => ({ ...chip, start: chip.start - offset, end: chip.end - offset }))
      .filter((chip) => chip.start >= 0 && chip.end <= trimmed.length && trimmed.slice(chip.start, chip.end) === chip.text);
    onSend(trimmed, sent);
    setText('');
    setOverrides({});
    setRemote(null);
    textareaRef.current?.focus();
  }, [text, busy, onSend, chips]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (busy) {
        // Never swallow the key: say the last turn is still running (C-079).
        onBusyEnter?.();
        return;
      }
      send();
    }
    if (event.key === 'Escape' && busy && onCancel) {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  };

  const showSuggestions = showStarters && focused && text.trim().length === 0;
  // The blank in "____ turns voice on and off" is the real key on this machine (C-085).
  const voiceKey = `${/Mac|iPhone|iPad/.test(typeof navigator === 'undefined' ? '' : navigator.platform) ? 'Option' : 'Alt'}+V`;
  // Phones have no Alt, Shift+Enter or hover: the placeholder says only what is true there.
  const touch = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const placeholder = touch ? t('composer.placeholderTouch') : t('composer.placeholder', { key: voiceKey });

  return (
    <div className="composer" data-testid="composer">
      {wantsPage(text) ? (
        <DraftPage
          text={text}
          chips={chips}
          onJump={(offset) => {
            const element = textareaRef.current;
            if (!element) return;
            element.focus();
            element.setSelectionRange(offset, offset);
            trackCaret(element);
          }}
        />
      ) : null}
      <SuggestionStrip
        visible={showSuggestions}
        hasBoxes={hasBoxes}
        hasLines={hasLines}
        themeId={themeId}
        onPick={(picked) => {
          setText(picked);
          textareaRef.current?.focus();
        }}
      />
      <div className="composer-frame">
        <div className="composer-stack">
          <div className="composer-mirror" aria-hidden="true" data-testid="composer-mirror">
            {text.length > 0 ? <ChipText text={text} chips={chips} cursor={focused && !voice.interim && caretAtEnd} /> : null}
            {voice.interim ? (
              <span className="interim" data-testid="interim">
                {text.length > 0 ? ' ' : ''}
                {voice.interim}
                {focused ? <span className="cursor" /> : null}
              </span>
            ) : text.length === 0 && focused ? (
              <span className="cursor" />
            ) : null}
          </div>
          <textarea
            ref={textareaRef}
            className="composer-input"
            data-cursor-shape={cursor.shape}
            rows={1}
            value={text}
            placeholder={placeholder}
            aria-label={placeholder}
            style={{ caretColor: caretAtEnd ? 'transparent' : 'var(--fg)' }}
            spellCheck
            onChange={(event) => {
              setText(event.target.value);
              trackCaret(event.target);
              onActivity?.();
            }}
            onSelect={(event) => trackCaret(event.currentTarget)}
            onKeyUp={(event) => trackCaret(event.currentTarget)}
            onClick={(event) => trackCaret(event.currentTarget)}
            onKeyDown={onKeyDown}
            onFocus={() => {
              setFocused(true);
              onActivity?.();
            }}
            onBlur={() => setFocused(false)}
            autoFocus
          />
        </div>
        <div className="composer-tools">
          {voice.active ? <Waveform level={voice.level} state={voice.state} /> : null}
          {voiceAvailable ? (
            <Tooltip
              label={voice.active ? t('voice.stop') : voiceMode === 'hold' ? t('voice.hold') : t('voice.start')}
              shortcut="V"
              side="top"
              align="end"
            >
              <Button
                icon
                variant="ghost"
                className="mic"
                data-listening={voice.active}
                data-state={voice.state}
                aria-pressed={voice.active}
                aria-label={voice.active ? t('voice.stop') : t('voice.start')}
                onClick={voiceMode === 'toggle' ? voice.toggle : undefined}
                onPointerDown={voiceMode === 'hold' ? voice.start : undefined}
                onPointerUp={voiceMode === 'hold' ? voice.stop : undefined}
                onPointerCancel={voiceMode === 'hold' ? voice.stop : undefined}
                onKeyDown={
                  voiceMode === 'hold'
                    ? (event) => {
                        if (event.key === ' ' || event.key === 'Enter') {
                          event.preventDefault();
                          voice.start();
                        }
                      }
                    : undefined
                }
                onKeyUp={
                  voiceMode === 'hold'
                    ? (event) => {
                        if (event.key === ' ' || event.key === 'Enter') {
                          voice.stop();
                        }
                      }
                    : undefined
                }
                data-testid="mic"
              >
                <IconMic />
              </Button>
            </Tooltip>
          ) : (
            <Tooltip label={t('composer.micUnavailable')} side="top" align="end">
              <Button icon variant="ghost" className="mic" aria-label={t('composer.micUnavailable')} disabled data-testid="mic">
                <IconMic />
              </Button>
            </Tooltip>
          )}
          <Tooltip label={t('composer.send')} shortcut="↵" side="top" align="end">
            <Button icon variant="primary" aria-label={t('composer.send')} onClick={send} disabled={busy || text.trim().length === 0}>
              <IconSend />
            </Button>
          </Tooltip>
        </div>
      </div>
      <ChipTray chips={chips} onOpen={(chip, anchor) => setEditing({ chip, anchor })} />
      {editing ? (
        <ChipPopover
          chip={editing.chip}
          records={records}
          anchor={editing.anchor}
          onApply={(decision) => decide(editing.chip, decision)}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <audio ref={voice.audioRef} autoPlay data-testid="assistant-audio" />
    </div>
  );
}

function Waveform({ level, state }: { level: number; state: string }) {
  const bars = [0.4, 0.7, 1, 0.7, 0.4];
  return (
    <span className="wave" data-state={state} aria-hidden="true">
      {bars.map((weight, index) => (
        <span key={index} style={{ transform: `scaleY(${0.15 + Math.min(1, level * 2.2) * weight})` }} />
      ))}
    </span>
  );
}
